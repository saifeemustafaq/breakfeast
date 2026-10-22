import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { ObjectId, type Collection } from "mongodb";
import { cookies } from "next/headers";
import { collections } from "@/lib/db";
import { deviceLabel, parseUa } from "@/lib/monitoring/ua";
import type { RevokeReason, SessionDoc } from "@/lib/schema";
import { SEC } from "@/lib/time";
import { authConfig } from "./config";
import type { RequestContext } from "./request";

export type SessionKind = "user" | "admin";

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function sessionCollection(kind: SessionKind): Promise<Collection<SessionDoc>> {
  const c = await collections();
  return kind === "user" ? c.userSessions : c.adminSessions;
}

const lifetimes = (kind: SessionKind) => (kind === "user" ? authConfig.userSession : authConfig.adminSession);
const cookieName = (kind: SessionKind) => (kind === "user" ? authConfig.cookies.user : authConfig.cookies.admin);

export function expiryFrom(kind: SessionKind, lastSeenAt: Date, absoluteExpiresAt: Date) {
  const idle = new Date(Math.min(lastSeenAt.getTime() + lifetimes(kind).idleMs, absoluteExpiresAt.getTime()));
  return { idleExpiresAt: idle, expiresAt: idle };
}

export async function createSession(
  kind: SessionKind,
  principal: { _id: ObjectId; authVersion: number },
  ctx: RequestContext,
  opts: { deviceId?: string | null; deviceLabel?: string } = {},
) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const absoluteExpiresAt = new Date(now.getTime() + lifetimes(kind).maxMs);
  const doc: SessionDoc = {
    _id: new ObjectId(),
    tokenHash: hashToken(token),
    principalId: principal._id,
    authVersion: principal.authVersion,
    createdAt: now,
    lastSeenAt: now,
    absoluteExpiresAt,
    ...expiryFrom(kind, now, absoluteExpiresAt),
    revokedAt: null,
    revokedBy: null,
    revokeReason: null,
    deviceId: opts.deviceId ?? null,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    deviceLabel: opts.deviceLabel ?? deviceLabel(parseUa(ctx.userAgent)),
    reauthAt: kind === "admin" ? now : null,
  };
  const sessions = await sessionCollection(kind);
  await sessions.insertOne(doc);

  (await cookies()).set(cookieName(kind), token, {
    httpOnly: true,
    secure: authConfig.isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(lifetimes(kind).maxMs / SEC),
  });
  return doc;
}

export async function readSessionToken(kind: SessionKind) {
  return (await cookies()).get(cookieName(kind))?.value ?? null;
}

export async function clearSessionCookie(kind: SessionKind) {
  (await cookies()).delete(cookieName(kind));
}

export async function revokeSession(kind: SessionKind, sessionId: ObjectId, reason: RevokeReason, by: string) {
  const sessions = await sessionCollection(kind);
  const result = await sessions.updateOne(
    { _id: sessionId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedBy: by, revokeReason: reason } },
  );
  return result.modifiedCount;
}

/** Marks every open session for display; `authVersion` is what actually invalidates them. */
export async function markAllRevoked(kind: SessionKind, principalId: ObjectId, reason: RevokeReason, by: string) {
  const sessions = await sessionCollection(kind);
  const result = await sessions.updateMany(
    { principalId, revokedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { revokedAt: new Date(), revokedBy: by, revokeReason: reason } },
  );
  return result.modifiedCount;
}

export function sessionStatus(s: SessionDoc, principalAuthVersion: number, now = new Date()) {
  if (s.revokedAt || s.authVersion !== principalAuthVersion) return "revoked" as const;
  if (s.expiresAt <= now) return "expired" as const;
  return "active" as const;
}
