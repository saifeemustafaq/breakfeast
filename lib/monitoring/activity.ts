import "server-only";
import { z } from "zod";
import { parse } from "@/lib/api/http";
import { authConfig } from "@/lib/auth/config";
import { ApiError } from "@/lib/auth/errors";
import { requireUser, type UserAuth } from "@/lib/auth/guards";
import type { RequestContext } from "@/lib/auth/request";
import { collections } from "@/lib/db";
import { ACTIVITY_TYPES, type ActivityEventDoc } from "@/lib/schema";
import { redactData, redactEmails } from "@/lib/monitoring/redact";
import { isUuid, TRACE_HEADERS, UUID_RE } from "@/lib/monitoring/trace";

const cleanString = (s: unknown, max: number) => (typeof s === "string" ? redactEmails(s).slice(0, max) : null);

/** Redacted, size-capped event data. Oversized data is replaced by a marker rather than truncated mid-structure. */
export function sanitizeData(data: unknown): Record<string, unknown> | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const cleaned = redactData(data) as Record<string, unknown>;
  return Buffer.byteLength(JSON.stringify(cleaned), "utf8") > authConfig.activity.maxDataBytes ? { truncated: true } : cleaned;
}

const ingestBody = z.object({
  pageLoadId: z.string().regex(UUID_RE, { error: "Invalid page load id." }),
  events: z.array(z.unknown()).max(authConfig.activity.maxEvents, { error: "Too many events in one batch." }),
});

function clampClientAt(value: unknown, receivedAt: Date) {
  const t = typeof value === "number" && Number.isFinite(value) ? value : NaN;
  const { pastMs, futureMs } = authConfig.activity;
  const now = receivedAt.getTime();
  return t >= now - pastMs && t <= now + futureMs ? new Date(t) : receivedAt;
}

/** POST /api/activity. Identity comes from the session, never from the client. */
export async function ingestActivity(body: Record<string, unknown>, ctx: RequestContext) {
  const { user, session } = await requireUser(ctx);
  const { pageLoadId, events } = parse(ingestBody, body);
  const receivedAt = new Date();
  const docs: ActivityEventDoc[] = [];
  for (const raw of events) {
    if (typeof raw !== "object" || raw === null) continue;
    const e = raw as Record<string, unknown>;
    const type = ACTIVITY_TYPES.find((t) => t === e.type);
    const name = cleanString(e.name, 120)?.trim();
    if (!type || !name) continue;
    docs.push({
      userId: user._id,
      sessionId: session._id,
      deviceId: session.deviceId,
      pageLoadId,
      seq: typeof e.seq === "number" && Number.isInteger(e.seq) && e.seq >= 0 ? e.seq : 0,
      clientAt: clampClientAt(e.clientAt, receivedAt),
      receivedAt,
      type,
      name,
      target: cleanString(e.target, 200),
      data: sanitizeData(e.data),
      path: cleanString(e.path, 300) ?? "",
    });
  }
  if (docs.length) {
    const c = await collections();
    await c.activityEvents.insertMany(docs, { ordered: false });
  }
  return { stored: docs.length };
}

export type ActionTrace = { pageLoadId: string; seq: number; path: string };

export function traceFrom(h: Headers): ActionTrace | null {
  const pageLoadId = h.get(TRACE_HEADERS.pageLoadId) ?? "";
  const seq = Number(h.get(TRACE_HEADERS.seq));
  if (!isUuid(pageLoadId) || !Number.isInteger(seq) || seq < 0) return null;
  return { pageLoadId, seq, path: (h.get(TRACE_HEADERS.path) ?? "").slice(0, 300) };
}

/** A business event recorded by a Server Action. Never throws. */
export async function recordWorkflow(auth: UserAuth, trace: ActionTrace | null, name: string, data: unknown) {
  try {
    const c = await collections();
    const now = new Date();
    await c.activityEvents.insertOne({
      userId: auth.user._id,
      sessionId: auth.session._id,
      deviceId: auth.session.deviceId,
      // Without the client's trace headers the event still lands on the timeline, in its own group.
      pageLoadId: trace?.pageLoadId ?? `server-${auth.session._id.toHexString()}`,
      seq: trace?.seq ?? 0,
      clientAt: now,
      receivedAt: now,
      type: "workflow",
      name,
      target: null,
      data: sanitizeData(data),
      path: trace?.path ?? "",
    });
  } catch (error) {
    console.error(`[${auth.ctx.requestId}] Could not record ${name}`, error instanceof ApiError ? error.message : error);
  }
}
