import "server-only";
import { after } from "next/server";
import { collections } from "@/lib/db";
import { labelFor, recordAccess } from "@/lib/monitoring/access";
import { ensureDeviceId, readDeviceId } from "@/lib/monitoring/device-cookie";
import { sanitizeDevice } from "@/lib/monitoring/payload";
import { requireUser } from "./guards";
import { loginUser } from "./login";
import type { RequestContext } from "./request";
import { clearSessionCookie, hashToken, readSessionToken, revokeSession } from "./sessions";

/** POST /api/auth/login: verifies credentials, issues session and device cookies, records the attempt. */
export async function signInUser(body: Record<string, unknown>, ctx: RequestContext) {
  const device = sanitizeDevice(body.device);
  const deviceId = await ensureDeviceId();
  const label = labelFor(ctx.userAgent, device.client);
  const outcome = await loginUser(body, ctx, deviceId, label);
  after(() =>
    recordAccess({
      kind: outcome.ok ? "login_success" : "login_failure",
      requestId: ctx.requestId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      user: outcome.user,
      loginIdAttempted: outcome.ok ? null : outcome.loginIdAttempted,
      sessionId: outcome.ok ? outcome.session._id : null,
      deviceId,
      device,
      deviceLabel: label,
    }),
  );
  if (!outcome.ok) throw outcome.error;
  const { user } = outcome;
  return { user: { id: user._id.toHexString(), name: user.name, loginId: user.loginId } };
}

/** POST /api/auth/app-open: one row per full page load of the app, where shared sessions show up. */
export async function recordAppOpen(body: Record<string, unknown>, ctx: RequestContext) {
  const { user, session } = await requireUser(ctx);
  const device = sanitizeDevice(body.device);
  const deviceId = await ensureDeviceId();
  if (!session.deviceId) {
    // Sessions from before device cookies existed adopt the first device they're seen on.
    const c = await collections();
    await c.userSessions.updateOne({ _id: session._id, deviceId: null }, { $set: { deviceId } });
  }
  after(() =>
    recordAccess({
      kind: "app_open",
      requestId: ctx.requestId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      user,
      sessionId: session._id,
      sessionDeviceId: session.deviceId ?? deviceId,
      deviceId,
      device,
    }),
  );
}

/** Revokes the current user session on the server (if any), clears the cookie and records the logout. */
export async function signOutUser(ctx: RequestContext) {
  const token = await readSessionToken("user");
  if (token) {
    const c = await collections();
    const session = await c.userSessions.findOne({ tokenHash: hashToken(token) });
    if (session) {
      await revokeSession("user", session._id, "logout", "user");
      const [user, deviceId] = await Promise.all([c.users.findOne({ _id: session.principalId }), readDeviceId()]);
      after(() =>
        recordAccess({
          kind: "logout",
          requestId: ctx.requestId,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
          user,
          sessionId: session._id,
          deviceId,
          deviceLabel: session.deviceLabel,
        }),
      );
    }
  }
  await clearSessionCookie("user");
}
