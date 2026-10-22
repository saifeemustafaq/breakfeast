import "server-only";
import { collections } from "@/lib/db";
import type { AdminDoc, SessionDoc, UserDoc } from "@/lib/schema";
import { applyTimedResume } from "./account-state";
import { writeAudit } from "./audit";
import { ACCOUNT_MESSAGES, ApiError, validationError } from "./errors";
import { normalizeAdminId, normalizeLoginId } from "./identifiers";
import { dummyVerify, verifyPassword } from "./passwords";
import { assertNotRateLimited, clearRecentFailures, recordFailure } from "./rate-limit";
import type { RequestContext } from "./request";
import { createSession } from "./sessions";

const invalid = (label: string) => new ApiError("INVALID_CREDENTIALS", `That ${label} or password is incorrect.`);

export type LoginOutcome =
  | { ok: true; user: UserDoc; session: SessionDoc }
  | { ok: false; error: ApiError; user: UserDoc | null; loginIdAttempted: string | null };

/**
 * Verifies a user's credentials and issues a session. Returns the failure (instead of throwing)
 * so monitoring can record the attempt before the response is sent.
 */
export async function loginUser(
  body: Record<string, unknown>,
  ctx: RequestContext,
  deviceId: string | null,
  deviceLabel?: string,
): Promise<LoginOutcome> {
  const id = normalizeLoginId(body.loginId);
  const password = typeof body.password === "string" ? body.password : "";
  if (!id.ok || !password) {
    throw validationError({
      ...(!id.ok ? { loginId: id.error } : {}),
      ...(!password ? { password: "Enter your password." } : {}),
    });
  }
  const normalized = id.value.normalized;
  await assertNotRateLimited("user", normalized, ctx.ip);

  const c = await collections();
  const found = await c.users.findOne({ loginIdNormalized: normalized });
  const verified = found ? await verifyPassword(password, found.passwordHash) : await dummyVerify(password);
  if (!found || !verified) {
    await recordFailure("user", normalized, ctx.ip);
    return { ok: false, error: invalid("Login ID"), user: found, loginIdAttempted: normalized };
  }

  const user = await applyTimedResume(found);
  if (user.status === "paused") {
    return { ok: false, error: new ApiError("ACCOUNT_PAUSED", ACCOUNT_MESSAGES.paused), user, loginIdAttempted: normalized };
  }
  if (user.status === "disabled") {
    return { ok: false, error: new ApiError("ACCOUNT_DISABLED", ACCOUNT_MESSAGES.disabled), user, loginIdAttempted: normalized };
  }

  await clearRecentFailures("user", normalized);
  const session = await createSession("user", user, ctx, { deviceId, deviceLabel });
  const now = new Date();
  await c.users.updateOne({ _id: user._id }, { $set: { lastLoginAt: now, lastSeenAt: now } });
  return { ok: true, user: { ...user, lastLoginAt: now, lastSeenAt: now }, session };
}

export async function loginAdmin(body: Record<string, unknown>, ctx: RequestContext): Promise<AdminDoc> {
  const id = normalizeAdminId(body.adminId);
  const password = typeof body.password === "string" ? body.password : "";
  if (!id.ok || !password) {
    throw validationError({
      ...(!id.ok ? { adminId: "Enter your Admin ID." } : {}),
      ...(!password ? { password: "Enter your password." } : {}),
    });
  }
  const adminId = id.value;
  await assertNotRateLimited("admin", adminId, ctx.ip);

  const c = await collections();
  const admin = await c.admins.findOne({ adminId });
  const verified = admin ? await verifyPassword(password, admin.passwordHash) : await dummyVerify(password);
  const fail = async (error: ApiError, reason: string) => {
    await writeAudit({
      actor: { type: "admin", id: null, label: adminId },
      action: "admin.login_failed",
      target: admin ? { type: "admin", id: admin._id, label: admin.adminId } : null,
      result: "failure",
      changes: { reason: { from: null, to: reason } },
      ip: ctx.ip,
      requestId: ctx.requestId,
    });
    throw error;
  };
  if (!admin || !verified) {
    await recordFailure("admin", adminId, ctx.ip);
    return fail(invalid("Admin ID"), "invalid_credentials");
  }
  if (admin.status !== "active") {
    return fail(new ApiError("ACCOUNT_DISABLED", "This admin account is disabled."), "disabled");
  }

  await clearRecentFailures("admin", adminId);
  await createSession("admin", admin, ctx);
  const now = new Date();
  await c.admins.updateOne({ _id: admin._id }, { $set: { lastLoginAt: now } });
  await writeAudit({
    actor: { type: "admin", id: admin._id, label: admin.adminId },
    action: "admin.login",
    target: { type: "admin", id: admin._id, label: admin.adminId },
    ip: ctx.ip,
    requestId: ctx.requestId,
  });
  return admin;
}
