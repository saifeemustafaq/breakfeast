import "server-only";
import { z } from "zod";
import { parse } from "@/lib/api/http";
import { writeAudit } from "@/lib/auth/audit";
import { ApiError, validationError } from "@/lib/auth/errors";
import { assertReauth, reauthValidUntil, type AdminAuth } from "@/lib/auth/guards";
import { checkAdminPassword, hashPassword, verifyPassword } from "@/lib/auth/passwords";
import { assertNotRateLimited, clearRecentFailures, recordFailure } from "@/lib/auth/rate-limit";
import { clearSessionCookie, markAllRevoked, revokeSession } from "@/lib/auth/sessions";
import { collections } from "@/lib/db";

export const adminActor = (auth: AdminAuth) => ({ type: "admin" as const, id: auth.admin._id, label: auth.admin.adminId });

const passwordField = z.string({ error: "Enter your password." }).min(1, "Enter your password.");

const reauthBody = z.object({ password: passwordField });

const changePasswordBody = z
  .object({
    newPassword: z.unknown(),
    currentPassword: passwordField,
  })
  .superRefine((data, ctx) => {
    const problem = checkAdminPassword(data.newPassword);
    if (problem) ctx.addIssue({ code: "custom", message: problem, path: ["newPassword"] });
  });

export async function logoutAdmin(auth: AdminAuth) {
  await revokeSession("admin", auth.session._id, "logout", auth.admin.adminId);
  await clearSessionCookie("admin");
  await writeAudit({
    actor: adminActor(auth),
    action: "admin.logout",
    target: adminActor(auth),
    ip: auth.ctx.ip,
    requestId: auth.ctx.requestId,
  });
}

/** Wrong passwords here count toward the same login limits, so reauth can't be brute forced. */
async function checkOwnPassword(auth: AdminAuth, password: unknown, field: string) {
  if (typeof password !== "string" || !password) throw validationError({ [field]: "Enter your password." });
  await assertNotRateLimited("admin", auth.admin.adminId, auth.ctx.ip);
  if (!(await verifyPassword(password, auth.admin.passwordHash))) {
    await recordFailure("admin", auth.admin.adminId, auth.ctx.ip);
    throw new ApiError("INVALID_CREDENTIALS", "That password is incorrect.", {
      fields: { [field]: "That password is incorrect." },
    });
  }
  await clearRecentFailures("admin", auth.admin.adminId);
}

export async function reauthAdmin(auth: AdminAuth, body: Record<string, unknown>) {
  const { password } = parse(reauthBody, body);
  await checkOwnPassword(auth, password, "password");
  const c = await collections();
  const now = new Date();
  await c.adminSessions.updateOne({ _id: auth.session._id }, { $set: { reauthAt: now } });
  await writeAudit({
    actor: adminActor(auth),
    action: "admin.reauth",
    target: adminActor(auth),
    ip: auth.ctx.ip,
    requestId: auth.ctx.requestId,
  });
  const until = reauthValidUntil({ ...auth.session, reauthAt: now });
  if (!until) throw new ApiError("INTERNAL", "Something went wrong. Try again.");
  return { reauthValidUntil: until.toISOString() };
}

export async function changeAdminPassword(auth: AdminAuth, body: Record<string, unknown>) {
  assertReauth(auth.session);
  const input = parse(changePasswordBody, body);
  if (typeof input.newPassword !== "string") throw validationError({ newPassword: "Enter a password." });
  await checkOwnPassword(auth, input.currentPassword, "currentPassword");
  const c = await collections();
  const now = new Date();
  await c.admins.updateOne(
    { _id: auth.admin._id },
    {
      $set: { passwordHash: await hashPassword(input.newPassword), passwordUpdatedAt: now, updatedAt: now },
      $inc: { authVersion: 1 },
    },
  );
  await markAllRevoked("admin", auth.admin._id, "password_changed", auth.admin.adminId);
  await clearSessionCookie("admin");
  await writeAudit({
    actor: adminActor(auth),
    action: "admin.password_changed",
    target: adminActor(auth),
    ip: auth.ctx.ip,
    requestId: auth.ctx.requestId,
  });
}
