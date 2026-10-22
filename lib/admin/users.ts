import "server-only";
import { ObjectId, type Filter, type Sort } from "mongodb";
import { after } from "next/server";
import { z } from "zod";
import { beforeCursor, decodeCursor, paginate } from "@/lib/api/cursor";
import { parse } from "@/lib/api/http";
import { applyTimedResume } from "@/lib/auth/account-state";
import { writeAudit } from "@/lib/auth/audit";
import { authConfig, DAY } from "@/lib/auth/config";
import { ApiError, notFound, validationError } from "@/lib/auth/errors";
import type { AdminAuth } from "@/lib/auth/guards";
import { assertReauth } from "@/lib/auth/guards";
import { normalizeLoginId } from "@/lib/auth/identifiers";
import { checkUserPassword, generateUserPassword, hashPassword } from "@/lib/auth/passwords";
import { clearAllFailures } from "@/lib/auth/rate-limit";
import { markAllRevoked, revokeSession } from "@/lib/auth/sessions";
import { collections, isDuplicateKey, withTransaction } from "@/lib/db";
import { recordAccess } from "@/lib/monitoring/access";
import { type AuditDoc, type RevokeReason, type SessionDoc, type UserDoc } from "@/lib/schema";
import { adminActor } from "./auth";
import { toAuditRow, toSessionRow, toUserDetail, toUserSummary, type UserStats } from "./serialize";

const DUPLICATE_LOGIN_ID = "That Login ID is already taken.";

const EMPTY_STATS: UserStats = { activeSessions: 0, flagCount24h: 0, householdSize: 1 };

const statsForUser = (stats: Map<string, UserStats>, id: string) => stats.get(id) ?? EMPTY_STATS;

type AuditDocWithId = AuditDoc & { _id: ObjectId };

const paginateAudit = (rows: AuditDoc[], limit: number) =>
  paginate(rows as AuditDocWithId[], limit, (a) => a.at);
const userTarget = (u: UserDoc) => ({ type: "user" as const, id: u._id, label: u.name });

/** Applies every due timed resume so counts and lists reflect reality. */
export async function resumeDuePauses(now = new Date()) {
  const c = await collections();
  const due = await c.users.find({ status: "paused", pausedUntil: { $lte: now } }).limit(200).toArray();
  for (const user of due) await applyTimedResume(user, now);
}

async function statsFor(users: UserDoc[]): Promise<Map<string, UserStats>> {
  const out = new Map<string, UserStats>();
  if (!users.length) return out;
  const c = await collections();
  const now = new Date();
  const ids = users.map((u) => u._id);
  const householdIds = [...new Set(users.map((u) => u.householdId.toHexString()))].map((h) => new ObjectId(h));

  const [sessions, flags, households] = await Promise.all([
    c.userSessions
      .aggregate<{ _id: { p: ObjectId; v: number }; n: number }>([
        { $match: { principalId: { $in: ids }, revokedAt: null, expiresAt: { $gt: now } } },
        { $group: { _id: { p: "$principalId", v: "$authVersion" }, n: { $sum: 1 } } },
      ])
      .toArray(),
    c.accessEvents
      .aggregate<{ _id: ObjectId; n: number }>([
        {
          $match: {
            userId: { $in: ids },
            at: { $gte: new Date(now.getTime() - DAY) },
            "flags.0": { $exists: true },
          },
        },
        { $group: { _id: "$userId", n: { $sum: 1 } } },
      ])
      .toArray(),
    c.users
      .aggregate<{ _id: ObjectId; n: number }>([
        { $match: { householdId: { $in: householdIds } } },
        { $group: { _id: "$householdId", n: { $sum: 1 } } },
      ])
      .toArray(),
  ]);

  const householdSize = new Map(households.map((h) => [h._id.toHexString(), h.n]));
  const flagCount = new Map(flags.map((f) => [f._id.toHexString(), f.n]));
  for (const u of users) {
    const key = u._id.toHexString();
    const activeSessions = sessions
      .filter((s) => s._id.p.equals(u._id) && s._id.v === u.authVersion)
      .reduce((n, s) => n + s.n, 0);
    out.set(key, {
      activeSessions,
      flagCount24h: flagCount.get(key) ?? 0,
      householdSize: householdSize.get(u.householdId.toHexString()) ?? 1,
    });
  }
  return out;
}

export async function summarize(users: UserDoc[]) {
  const stats = await statsFor(users);
  return users.map((u) => toUserSummary(u, statsForUser(stats, u._id.toHexString())));
}

export async function detail(user: UserDoc) {
  const stats = await statsFor([user]);
  return toUserDetail(user, statsForUser(stats, user._id.toHexString()));
}

export async function loadUser(id: ObjectId) {
  const c = await collections();
  const user = await c.users.findOne({ _id: id });
  if (!user) throw notFound("That user");
  return applyTimedResume(user);
}

export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(["all", "active", "paused", "disabled"]).optional(),
  sort: z.enum(["createdAt", "name", "lastLoginAt", "lastSeenAt"]).optional(),
  order: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(authConfig.usersPage.maxSize).optional(),
});

export async function listUsers(query: Record<string, string>) {
  const q = parse(listQuery, query);
  await resumeDuePauses();
  const c = await collections();
  const filter: Filter<UserDoc> = {};
  if (q.status && q.status !== "all") filter.status = q.status;
  if (q.q) {
    const text = new RegExp(escapeRegex(q.q), "i");
    const digits = q.q.replace(/\D/g, "");
    filter.$or = [{ name: text }, { loginId: text }, ...(digits ? [{ loginIdNormalized: new RegExp(digits) }] : [])];
  }
  const sortField = q.sort ?? "createdAt";
  const dir = (q.order ?? (sortField === "name" ? "asc" : "desc")) === "asc" ? 1 : -1;
  const sort: Sort = { [sortField]: dir, _id: dir };
  const page = q.page ?? 1;
  const pageSize = q.pageSize ?? authConfig.usersPage.defaultSize;

  const [rows, total] = await Promise.all([
    c.users
      .find(filter, { collation: { locale: "en", strength: 2 } })
      .sort(sort)
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
    c.users.countDocuments(filter),
  ]);
  return { data: await summarize(rows), page, pageSize, total };
}

const passwordInput = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("generate") }),
  z.object({ mode: z.literal("manual"), value: z.string() }),
]);

function resolvePassword(input: unknown) {
  const parsed = passwordInput.safeParse(input);
  if (!parsed.success) throw validationError({ password: "Choose Generate or enter a password." });
  if (parsed.data.mode === "generate") return generateUserPassword();
  const error = checkUserPassword(parsed.data.value);
  if (error) throw validationError({ password: error });
  return parsed.data.value;
}

const nameSchema = z
  .string({ error: "Enter a display name." })
  .trim()
  .min(1, "Enter a display name.")
  .max(100, "Display names are at most 100 characters.");
const notesSchema = z.string().max(2000, "Notes are at most 2000 characters.");

const createSchema = z.object({
  name: nameSchema,
  loginId: z.unknown(),
  notes: notesSchema.optional(),
  status: z.enum(["active", "paused"]).optional(),
  password: z.unknown(),
});

export async function createUser(body: Record<string, unknown>, auth: AdminAuth) {
  const fields: Record<string, string> = {};
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) fields[String(issue.path[0] ?? "_")] ??= issue.message;
  }
  const loginId = normalizeLoginId(body.loginId);
  if (!loginId.ok) fields.loginId = loginId.error;
  let password: string | null = null;
  try {
    password = resolvePassword(body.password);
  } catch (error) {
    if (error instanceof ApiError && error.extra.fields) Object.assign(fields, error.extra.fields);
    else throw error;
  }
  if (Object.keys(fields).length || !parsed.success || !loginId.ok || !password) throw validationError(fields);

  const now = new Date();
  const status = parsed.data.status ?? "active";
  const householdId = new ObjectId();
  const user: UserDoc = {
    _id: new ObjectId(),
    name: parsed.data.name,
    loginId: loginId.value.display,
    loginIdNormalized: loginId.value.normalized,
    loginIdType: loginId.value.type,
    notes: parsed.data.notes ?? "",
    details: {},
    status,
    pauseReason: null,
    pausedUntil: null,
    pausedAt: status === "paused" ? now : null,
    pausedBy: status === "paused" ? auth.admin.adminId : null,
    passwordHash: await hashPassword(password),
    authVersion: 1,
    createdAt: now,
    updatedAt: now,
    passwordUpdatedAt: now,
    createdBy: auth.admin.adminId,
    lastLoginAt: null,
    lastSeenAt: null,
    householdId,
  };
  await withTransaction(async (c, session) => {
    await c.households.insertOne({ _id: householdId, createdAt: now, updatedAt: now }, { session });
    try {
      await c.users.insertOne(user, { session });
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new ApiError("CONFLICT", DUPLICATE_LOGIN_ID, { fields: { loginId: DUPLICATE_LOGIN_ID } });
      }
      throw error;
    }
  });
  await writeAudit({
    actor: adminActor(auth),
    action: "user.created",
    target: userTarget(user),
    changes: {
      name: { from: null, to: user.name },
      loginId: { from: null, to: user.loginId },
      status: { from: null, to: user.status },
    },
    ip: auth.ctx.ip,
    requestId: auth.ctx.requestId,
  });
  return { user: await detail(user), issuedPassword: password };
}

const updateSchema = z.object({
  expectedUpdatedAt: z.iso.datetime({ error: "Reload and try again." }),
  name: nameSchema.optional(),
  loginId: z.unknown().optional(),
  notes: notesSchema.optional(),
});

export async function updateUser(id: ObjectId, body: Record<string, unknown>, auth: AdminAuth) {
  const input = parse(updateSchema, body);
  const user = await loadUser(id);
  const set: Partial<UserDoc> = {};
  const changes: Record<string, { from: unknown; to: unknown }> = {};

  if (input.name !== undefined && input.name !== user.name) {
    set.name = input.name;
    changes.name = { from: user.name, to: input.name };
  }
  if (input.loginId !== undefined) {
    const loginId = normalizeLoginId(input.loginId);
    if (!loginId.ok) throw validationError({ loginId: loginId.error });
    if (loginId.value.normalized !== user.loginIdNormalized) {
      set.loginId = loginId.value.display;
      set.loginIdNormalized = loginId.value.normalized;
      changes.loginId = { from: user.loginId, to: loginId.value.display };
    }
  }
  if (input.notes !== undefined && input.notes !== user.notes) {
    set.notes = input.notes;
    changes.notes = { from: "(hidden)", to: "(hidden)" };
  }

  const expected = new Date(input.expectedUpdatedAt);
  if (expected.getTime() !== user.updatedAt.getTime()) throw staleConflict();
  if (!Object.keys(set).length) return detail(user);

  set.updatedAt = new Date();
  const c = await collections();
  let updated: UserDoc | null;
  try {
    updated = await c.users.findOneAndUpdate(
      { _id: id, updatedAt: user.updatedAt },
      { $set: set },
      { returnDocument: "after" },
    );
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw new ApiError("CONFLICT", DUPLICATE_LOGIN_ID, { fields: { loginId: DUPLICATE_LOGIN_ID } });
    }
    throw error;
  }
  if (!updated) throw staleConflict();
  await writeAudit({
    actor: adminActor(auth),
    action: "user.updated",
    target: userTarget(updated),
    changes,
    ip: auth.ctx.ip,
    requestId: auth.ctx.requestId,
  });
  return detail(updated);
}

const staleConflict = () =>
  new ApiError("CONFLICT", "This user was changed by someone else. Reload to see the latest details.");

export async function resetUserPassword(id: ObjectId, body: Record<string, unknown>, auth: AdminAuth) {
  assertReauth(auth.session);
  const user = await loadUser(id);
  const password = resolvePassword(body);
  const c = await collections();
  const now = new Date();
  const updated = await c.users.findOneAndUpdate(
    { _id: id },
    { $set: { passwordHash: await hashPassword(password), passwordUpdatedAt: now, updatedAt: now }, $inc: { authVersion: 1 } },
    { returnDocument: "after" },
  );
  if (!updated) throw notFound("That user");
  const sessionsRevoked = await markAllRevoked("user", id, "password_reset", auth.admin.adminId);
  await clearAllFailures("user", user.loginIdNormalized);
  await writeAudit({
    actor: adminActor(auth),
    action: "user.password_reset",
    target: userTarget(user),
    changes: { sessions: { from: sessionsRevoked, to: 0 } },
    ip: auth.ctx.ip,
    requestId: auth.ctx.requestId,
  });
  return { issuedPassword: password, sessionsRevoked };
}

const pauseSchema = z.object({
  reason: z.string().trim().max(200, "Reasons are at most 200 characters.").optional().nullable(),
  until: z.iso.datetime({ offset: true, error: "Choose a valid date and time." }).optional().nullable(),
});

type Transition = {
  action: string;
  from: UserDoc["status"][];
  to: UserDoc["status"];
  invalid: string;
  revoke?: RevokeReason;
};

const TRANSITIONS = {
  pause: { action: "user.paused", from: ["active"], to: "paused", invalid: "Only active users can be paused.", revoke: "paused" },
  resume: { action: "user.resumed", from: ["paused"], to: "active", invalid: "Only paused users can be resumed." },
  deactivate: {
    action: "user.deactivated",
    from: ["active", "paused"],
    to: "disabled",
    invalid: "This user is already deactivated.",
    revoke: "deactivated",
  },
  activate: { action: "user.activated", from: ["disabled"], to: "active", invalid: "Only deactivated users can be activated." },
} satisfies Record<string, Transition>;

export async function changeState(
  id: ObjectId,
  kind: keyof typeof TRANSITIONS,
  body: Record<string, unknown>,
  auth: AdminAuth,
) {
  const t: Transition = TRANSITIONS[kind];
  const user = await loadUser(id);
  const now = new Date();
  const set: Partial<UserDoc> = { status: t.to, updatedAt: now };
  const changes: Record<string, { from: unknown; to: unknown }> = { status: { from: user.status, to: t.to } };

  if (kind === "pause") {
    const input = parse(pauseSchema, body);
    const until = input.until ? new Date(input.until) : null;
    if (until && until <= now) throw validationError({ until: "Choose a time in the future." });
    Object.assign(set, {
      pauseReason: input.reason || null,
      pausedUntil: until,
      pausedAt: now,
      pausedBy: auth.admin.adminId,
    });
    if (input.reason) changes.pauseReason = { from: null, to: input.reason };
    if (until) changes.pausedUntil = { from: null, to: until.toISOString() };
  } else {
    Object.assign(set, { pauseReason: null, pausedUntil: null, pausedAt: null, pausedBy: null });
  }

  const c = await collections();
  const updated = await c.users.findOneAndUpdate(
    { _id: id, status: { $in: t.from } },
    { $set: set, ...(t.revoke ? { $inc: { authVersion: 1 } } : {}) },
    { returnDocument: "after" },
  );
  if (!updated) throw new ApiError("INVALID_TRANSITION", t.invalid);
  if (t.revoke) await markAllRevoked("user", id, t.revoke, auth.admin.adminId);
  await writeAudit({
    actor: adminActor(auth),
    action: t.action,
    target: userTarget(updated),
    changes,
    ip: auth.ctx.ip,
    requestId: auth.ctx.requestId,
  });
  return detail(updated);
}

/** The access event describes the revoked session (its IP and device), not the admin's request. */
const recordRevocation = (user: UserDoc, session: SessionDoc, auth: AdminAuth) =>
  recordAccess({
    kind: "session_revoked",
    requestId: auth.ctx.requestId,
    ip: session.ip,
    userAgent: session.userAgent,
    user,
    sessionId: session._id,
    deviceId: session.deviceId,
    deviceLabel: session.deviceLabel,
  });

export async function revokeAllSessions(id: ObjectId, auth: AdminAuth) {
  const user = await loadUser(id);
  const c = await collections();
  const open = await c.userSessions
    .find({ principalId: id, revokedAt: null, authVersion: user.authVersion, expiresAt: { $gt: new Date() } })
    .limit(100)
    .toArray();
  await c.users.updateOne({ _id: id }, { $inc: { authVersion: 1 } });
  const revoked = await markAllRevoked("user", id, "revoke_all", auth.admin.adminId);
  after(async () => {
    for (const session of open) await recordRevocation(user, session, auth);
  });
  await writeAudit({
    actor: adminActor(auth),
    action: "session.revoked_all",
    target: userTarget(user),
    changes: { sessions: { from: revoked, to: 0 } },
    ip: auth.ctx.ip,
    requestId: auth.ctx.requestId,
  });
  return { revoked };
}

export async function revokeOneSession(id: ObjectId, sessionId: ObjectId, auth: AdminAuth) {
  const user = await loadUser(id);
  const c = await collections();
  const session = await c.userSessions.findOne({ _id: sessionId, principalId: id });
  if (!session || session.revokedAt || session.authVersion !== user.authVersion || session.expiresAt <= new Date()) {
    throw notFound("That active session");
  }
  const revoked = await revokeSession("user", sessionId, "admin", auth.admin.adminId);
  after(() => recordRevocation(user, session, auth));
  await writeAudit({
    actor: adminActor(auth),
    action: "session.revoked",
    target: userTarget(user),
    changes: { session: { from: session.deviceLabel, to: "revoked" } },
    ip: auth.ctx.ip,
    requestId: auth.ctx.requestId,
  });
  return { revoked, session };
}

export async function listSessions(id: ObjectId, cursorRaw: string | null) {
  const user = await loadUser(id);
  const c = await collections();
  const limit = authConfig.historyPageSize;
  const cursor = decodeCursor(cursorRaw);
  const rows = await c.userSessions
    .find({ principalId: id, ...beforeCursor("lastSeenAt", cursor) })
    .sort({ lastSeenAt: -1, _id: -1 })
    .limit(limit + 1)
    .toArray();
  const { page, nextCursor } = paginate(rows, limit, (s) => s.lastSeenAt);
  const cities = new Map<string, string | null>();
  if (page.length) {
    const events = await c.accessEvents
      .aggregate<{ _id: ObjectId; city: string | null }>([
        { $match: { sessionId: { $in: page.map((s) => s._id) }, "ipGeo.city": { $type: "string" } } },
        { $sort: { at: -1 } },
        { $group: { _id: "$sessionId", city: { $first: "$ipGeo.city" } } },
      ])
      .toArray();
    for (const e of events) cities.set(e._id.toHexString(), e.city);
  }
  return {
    data: page.map((s) => toSessionRow(s, user.authVersion, cities.get(s._id.toHexString()) ?? null)),
    nextCursor,
  };
}

const auditQuery = z.object({
  actor: z.string().trim().max(64).optional(),
  action: z.string().trim().max(64).optional(),
  targetId: z.string().regex(/^[a-f0-9]{24}$/i, "Invalid ID.").optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  cursor: z.string().optional(),
});

export async function listAudit(query: Record<string, string>, forcedTarget?: ObjectId) {
  const q = parse(auditQuery, query);
  const c = await collections();
  const filter: Record<string, unknown> = {};
  if (q.actor) filter.actorLabel = q.actor.toLowerCase();
  if (q.action) filter.action = q.action;
  if (forcedTarget) filter.targetId = forcedTarget;
  else if (q.targetId) filter.targetId = new ObjectId(q.targetId);
  if (q.from || q.to) {
    filter.at = { ...(q.from ? { $gte: new Date(q.from) } : {}), ...(q.to ? { $lte: new Date(q.to) } : {}) };
  }
  const cursor = decodeCursor(q.cursor);
  const limit = authConfig.historyPageSize;
  const where = cursor ? { $and: [filter, beforeCursor("at", cursor)] } : filter;
  const rows = await c.audit
    .find(where)
    .sort({ at: -1, _id: -1 })
    .limit(limit + 1)
    .toArray();
  const { page, nextCursor } = paginateAudit(rows, limit);
  return { data: page.map(toAuditRow), nextCursor };
}

export async function overview() {
  await resumeDuePauses();
  const c = await collections();
  const now = Date.now();
  const [total, active, paused, disabled, activeNow, alerts24h, recentAudit, recentUsers] = await Promise.all([
    c.users.countDocuments({}),
    c.users.countDocuments({ status: "active" }),
    c.users.countDocuments({ status: "paused" }),
    c.users.countDocuments({ status: "disabled" }),
    c.users.countDocuments({ lastSeenAt: { $gte: new Date(now - authConfig.activeNowMs) } }),
    c.accessEvents.countDocuments({
      at: { $gte: new Date(now - DAY) },
      "flags.0": { $exists: true },
    }),
    c.audit.find({}).sort({ at: -1, _id: -1 }).limit(10).toArray(),
    c.users.find({}).sort({ createdAt: -1 }).limit(5).toArray(),
  ]);
  return {
    counts: { total, active, paused, disabled, activeNow, alerts24h },
    recentAudit: recentAudit.map((a) => toAuditRow(a as AuditDocWithId)),
    recentUsers: await summarize(recentUsers),
  };
}
