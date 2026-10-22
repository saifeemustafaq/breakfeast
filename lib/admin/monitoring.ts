import "server-only";
import { ObjectId, type Filter } from "mongodb";
import { z } from "zod";
import { beforeCursor, decodeCursor, paginate } from "@/lib/api/cursor";
import { parse } from "@/lib/api/http";
import { authConfig, DAY } from "@/lib/auth/config";
import { collections } from "@/lib/db";
import { ACCESS_KINDS, ACTIVITY_TYPES, FLAGS, type AccessEventDoc, type ActivityEventDoc } from "@/lib/schema";
import { toAccessRow, toActivityRow, toDeviceRow } from "./serialize";
import { escapeRegex, loadUser } from "./users";

type StoredActivity = ActivityEventDoc & { _id: ObjectId };

const objectIdString = z.string().regex(/^[a-f0-9]{24}$/i, { error: "Invalid ID." });
const isoDate = z.iso.datetime({ offset: true });

async function userNames(ids: (ObjectId | null)[]) {
  const unique = [...new Set(ids.filter((id): id is ObjectId => !!id).map((id) => id.toHexString()))];
  if (!unique.length) return new Map<string, string>();
  const c = await collections();
  const users = await c.users
    .find({ _id: { $in: unique.map((id) => new ObjectId(id)) } }, { projection: { name: 1 } })
    .toArray();
  return new Map(users.map((u) => [u._id.toHexString(), u.name]));
}

async function sessionLabels(ids: ObjectId[]) {
  const unique = [...new Set(ids.map((id) => id.toHexString()))];
  if (!unique.length) return new Map<string, string>();
  const c = await collections();
  const sessions = await c.userSessions
    .find({ _id: { $in: unique.map((id) => new ObjectId(id)) } }, { projection: { deviceLabel: 1 } })
    .toArray();
  return new Map(sessions.map((s) => [s._id.toHexString(), s.deviceLabel]));
}

async function accessRows(events: AccessEventDoc[]) {
  const names = await userNames(events.map((e) => e.userId));
  return events.map((e) => toAccessRow(e, e.userId ? (names.get(e.userId.toHexString()) ?? null) : null));
}

async function activityRows(events: StoredActivity[]) {
  const [names, labels] = await Promise.all([
    userNames(events.map((e) => e.userId)),
    sessionLabels(events.map((e) => e.sessionId)),
  ]);
  return events.map((e) =>
    toActivityRow(e, {
      userName: names.get(e.userId.toHexString()) ?? null,
      deviceLabel: labels.get(e.sessionId.toHexString()) ?? null,
    }),
  );
}

/** GET /api/admin/users/:id/devices */
export async function listDevices(userId: ObjectId, cursorRaw: string | null) {
  await loadUser(userId);
  const c = await collections();
  const limit = authConfig.historyPageSize;
  const rows = await c.devices
    .find({ userId, ...beforeCursor("lastSeenAt", decodeCursor(cursorRaw)) })
    .sort({ lastSeenAt: -1, _id: -1 })
    .limit(limit + 1)
    .toArray();
  const { page, nextCursor } = paginate(rows, limit, (d) => d.lastSeenAt);
  const now = Date.now();
  return { data: page.map((d) => toDeviceRow(d, now)), nextCursor };
}

const accessQuery = z.object({
  kind: z.enum(ACCESS_KINDS).optional(),
  flagged: z.enum(["true", "false"]).optional(),
  cursor: z.string().optional(),
});

/** GET /api/admin/users/:id/access */
export async function listAccess(userId: ObjectId, query: Record<string, string>) {
  const q = parse(accessQuery, query);
  await loadUser(userId);
  const c = await collections();
  const filter: Filter<AccessEventDoc> = { userId };
  if (q.kind) filter.kind = q.kind;
  if (q.flagged === "true") filter["flags.0"] = { $exists: true };
  const limit = authConfig.historyPageSize;
  const rows = await c.accessEvents
    .find({ $and: [filter, beforeCursor<AccessEventDoc>("at", decodeCursor(q.cursor))] })
    .sort({ at: -1, _id: -1 })
    .limit(limit + 1)
    .toArray();
  const { page, nextCursor } = paginate(rows, limit, (e) => e.at);
  return { data: await accessRows(page), nextCursor };
}

const activityQuery = z.object({
  sessionId: objectIdString.optional(),
  pageLoadId: z.string().max(80).optional(),
  type: z.enum(ACTIVITY_TYPES).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  q: z.string().trim().max(100).optional(),
  cursor: z.string().optional(),
});

/** GET /api/admin/users/:id/activity. Newest first; the client groups rows by page load. */
export async function listActivity(userId: ObjectId, query: Record<string, string>) {
  const q = parse(activityQuery, query);
  await loadUser(userId);
  const c = await collections();
  const filter: Filter<ActivityEventDoc> = { userId };
  if (q.sessionId) filter.sessionId = new ObjectId(q.sessionId);
  if (q.pageLoadId) filter.pageLoadId = q.pageLoadId;
  if (q.type) filter.type = q.type;
  if (q.from || q.to) {
    filter.clientAt = { ...(q.from ? { $gte: new Date(q.from) } : {}), ...(q.to ? { $lte: new Date(q.to) } : {}) };
  }
  if (q.q) {
    const pattern = new RegExp(escapeRegex(q.q), "i");
    filter.$or = [{ name: pattern }, { target: pattern }];
  }
  const limit = authConfig.activityPageSize;
  const rows = await c.activityEvents
    .find({ $and: [filter, beforeCursor<ActivityEventDoc>("clientAt", decodeCursor(q.cursor))] })
    .sort({ clientAt: -1, _id: -1 })
    .limit(limit + 1)
    .toArray();
  const { page, nextCursor } = paginate(rows, limit, (e) => e.clientAt);
  return { data: await activityRows(page), nextCursor };
}

const feedQuery = z.object({ since: isoDate.optional() });

/**
 * GET /api/admin/feed. Reads from `since` minus an overlap, because events are written
 * slightly after they're stamped; the client de-duplicates by id.
 */
export async function feed(query: Record<string, string>) {
  const q = parse(feedQuery, query);
  const now = new Date();
  const { overlapMs, maxRows } = authConfig.feed;
  const from = q.since ? new Date(new Date(q.since).getTime() - overlapMs) : null;
  const c = await collections();
  const [activity, access] = await Promise.all([
    c.activityEvents
      .find(from ? { receivedAt: { $gte: from } } : {})
      .sort({ receivedAt: -1, _id: -1 })
      .limit(maxRows)
      .toArray(),
    c.accessEvents
      .find(from ? { at: { $gte: from } } : {})
      .sort({ at: -1, _id: -1 })
      .limit(maxRows)
      .toArray(),
  ]);
  const [activityData, accessData] = await Promise.all([activityRows(activity), accessRows(access)]);
  return { now: now.toISOString(), activity: activityData, access: accessData };
}

const alertsQuery = z.object({
  flag: z.enum(FLAGS).optional(),
  cursor: z.string().optional(),
  countOnly: z.literal("1").optional(),
});

/** GET /api/admin/alerts: flagged access events across all users. */
export async function listAlerts(query: Record<string, string>) {
  const q = parse(alertsQuery, query);
  const c = await collections();
  const last24h = () => c.accessEvents.countDocuments({ "flags.0": { $exists: true }, at: { $gte: new Date(Date.now() - DAY) } });
  if (q.countOnly) return { data: [], nextCursor: null, last24h: await last24h() };
  const filter: Filter<AccessEventDoc> = q.flag ? { flags: q.flag } : { "flags.0": { $exists: true } };
  const limit = authConfig.historyPageSize;
  const [rows, count] = await Promise.all([
    c.accessEvents
      .find({ $and: [filter, beforeCursor<AccessEventDoc>("at", decodeCursor(q.cursor))] })
      .sort({ at: -1, _id: -1 })
      .limit(limit + 1)
      .toArray(),
    last24h(),
  ]);
  const { page, nextCursor } = paginate(rows, limit, (e) => e.at);
  return { data: await accessRows(page), nextCursor, last24h: count };
}
