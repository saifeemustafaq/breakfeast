import "server-only";
import type { AccessEventDoc, ActivityEventDoc, AuditDoc, DeviceDoc, SessionDoc, UserDoc } from "@/lib/schema";
import { authConfig } from "@/lib/auth/config";
import { sessionStatus } from "@/lib/auth/sessions";

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export type UserSummary = {
  id: string;
  name: string;
  loginId: string;
  status: UserDoc["status"];
  createdAt: string;
  lastLoginAt: string | null;
  lastSeenAt: string | null;
  activeSessions: number;
  flagCount24h: number;
  householdId: string;
  householdSize: number;
};

export type UserDetail = UserSummary & {
  notes: string;
  details: Record<string, unknown>;
  pauseReason: string | null;
  pausedUntil: string | null;
  createdBy: string;
  updatedAt: string;
  passwordUpdatedAt: string;
};

export type UserStats = { activeSessions: number; flagCount24h: number; householdSize: number };

export function toUserSummary(u: UserDoc, stats: UserStats): UserSummary {
  return {
    id: u._id.toHexString(),
    name: u.name,
    loginId: u.loginId,
    status: u.status,
    createdAt: u.createdAt.toISOString(),
    lastLoginAt: iso(u.lastLoginAt),
    lastSeenAt: iso(u.lastSeenAt),
    activeSessions: stats.activeSessions,
    flagCount24h: stats.flagCount24h,
    householdId: u.householdId.toHexString(),
    householdSize: stats.householdSize,
  };
}

export function toUserDetail(u: UserDoc, stats: UserStats): UserDetail {
  return {
    ...toUserSummary(u, stats),
    notes: u.notes,
    details: u.details ?? {},
    pauseReason: u.pauseReason,
    pausedUntil: iso(u.pausedUntil),
    createdBy: u.createdBy,
    updatedAt: u.updatedAt.toISOString(),
    passwordUpdatedAt: u.passwordUpdatedAt.toISOString(),
  };
}

export type SessionRow = {
  id: string;
  deviceLabel: string;
  ip: string;
  city: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  status: "active" | "revoked" | "expired";
  revokedAt: string | null;
  revokeReason: string | null;
};

export function toSessionRow(s: SessionDoc, principalAuthVersion: number, city: string | null): SessionRow {
  return {
    id: s._id.toHexString(),
    deviceLabel: s.deviceLabel,
    ip: s.ip,
    city,
    createdAt: s.createdAt.toISOString(),
    lastSeenAt: s.lastSeenAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
    status: sessionStatus(s, principalAuthVersion),
    revokedAt: iso(s.revokedAt),
    revokeReason: s.revokeReason ?? (s.authVersion !== principalAuthVersion ? "revoke_all" : null),
  };
}

export type AuditRow = {
  id: string;
  at: string;
  actorType: AuditDoc["actorType"];
  actorLabel: string;
  action: string;
  targetType: AuditDoc["targetType"];
  targetId: string | null;
  targetLabel: string | null;
  result: AuditDoc["result"];
  changes: AuditDoc["changes"];
};

export function toAuditRow(a: AuditDoc & { _id: NonNullable<AuditDoc["_id"]> }): AuditRow {
  return {
    id: a._id.toHexString(),
    at: a.at.toISOString(),
    actorType: a.actorType,
    actorLabel: a.actorLabel,
    action: a.action,
    targetType: a.targetType,
    targetId: a.targetId ? a.targetId.toHexString() : null,
    targetLabel: a.targetLabel,
    result: a.result,
    changes: a.changes ?? {},
  };
}

export type DeviceRow = {
  id: string;
  label: string;
  fingerprint: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  lastIp: string;
  lastCity: string | null;
  lastCountry: string | null;
  accessCount: number;
  isNew: boolean;
};

export function toDeviceRow(d: DeviceDoc, now = Date.now()): DeviceRow {
  return {
    id: d._id.toHexString(),
    label: d.label,
    fingerprint: d.fingerprint ? d.fingerprint.slice(0, 12) : null,
    firstSeenAt: d.firstSeenAt.toISOString(),
    lastSeenAt: d.lastSeenAt.toISOString(),
    lastIp: d.lastIp,
    lastCity: d.lastCity,
    lastCountry: d.lastCountry,
    accessCount: d.accessCount,
    isNew: now - d.firstSeenAt.getTime() < authConfig.newDeviceMs,
  };
}

export type AccessRow = {
  id: string;
  at: string;
  kind: AccessEventDoc["kind"];
  userId: string | null;
  userName: string | null;
  loginIdAttempted: string | null;
  sessionId: string | null;
  ip: string;
  city: string | null;
  region: string | null;
  country: string | null;
  isp: string | null;
  gps: AccessEventDoc["gps"];
  map: { url: string; source: "gps" | "ip" } | null;
  deviceLabel: string;
  ua: AccessEventDoc["ua"];
  client: AccessEventDoc["client"];
  flags: AccessEventDoc["flags"];
};

const mapsUrl = (lat: number | null | undefined, lon: number | null | undefined) =>
  lat != null && lon != null ? `https://www.google.com/maps?q=${lat},${lon}` : null;

export function toAccessRow(e: AccessEventDoc, userName: string | null): AccessRow {
  const gpsUrl = mapsUrl(e.gps?.lat, e.gps?.lon);
  const ipUrl = mapsUrl(e.ipGeo?.lat, e.ipGeo?.lon);
  return {
    id: e._id.toHexString(),
    at: e.at.toISOString(),
    kind: e.kind,
    userId: e.userId ? e.userId.toHexString() : null,
    userName,
    loginIdAttempted: e.loginIdAttempted,
    sessionId: e.sessionId ? e.sessionId.toHexString() : null,
    ip: e.ip,
    city: e.ipGeo?.city ?? null,
    region: e.ipGeo?.region ?? null,
    country: e.ipGeo?.country ?? null,
    isp: e.ipGeo?.isp ?? null,
    gps: e.gps,
    map: gpsUrl ? { url: gpsUrl, source: "gps" } : ipUrl ? { url: ipUrl, source: "ip" } : null,
    deviceLabel: e.deviceLabel,
    ua: e.ua,
    client: e.client,
    flags: e.flags,
  };
}

export type ActivityRow = {
  id: string;
  userId: string;
  userName: string | null;
  sessionId: string;
  deviceLabel: string | null;
  pageLoadId: string;
  seq: number;
  clientAt: string;
  receivedAt: string;
  type: ActivityEventDoc["type"];
  name: string;
  target: string | null;
  data: Record<string, unknown> | null;
  path: string;
};

export function toActivityRow(
  e: ActivityEventDoc & { _id: NonNullable<ActivityEventDoc["_id"]> },
  names: { userName: string | null; deviceLabel: string | null },
): ActivityRow {
  return {
    id: e._id.toHexString(),
    userId: e.userId.toHexString(),
    userName: names.userName,
    sessionId: e.sessionId.toHexString(),
    deviceLabel: names.deviceLabel,
    pageLoadId: e.pageLoadId,
    seq: e.seq,
    clientAt: e.clientAt.toISOString(),
    receivedAt: e.receivedAt.toISOString(),
    type: e.type,
    name: e.name,
    target: e.target,
    data: e.data,
    path: e.path,
  };
}
