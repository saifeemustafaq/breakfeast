import "server-only";
import { io } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { collections, isStorageError } from "@/lib/db";
import type { AdminDoc, SessionDoc, UserDoc } from "@/lib/schema";
import { applyTimedResume } from "./account-state";
import { authConfig } from "./config";
import { ApiError, SESSION_END_MESSAGES, STORAGE_MESSAGE, type SessionEndReason } from "./errors";
import { assertSameOrigin, requestContext, type RequestContext } from "./request";
import { expiryFrom, hashToken, readSessionToken, sessionCollection, type SessionKind } from "./sessions";

export type UserAuth = { user: UserDoc; session: SessionDoc; ctx: RequestContext };
export type AdminAuth = { admin: AdminDoc; session: SessionDoc; ctx: RequestContext };

const ended = (reason: SessionEndReason) =>
  new ApiError("SESSION_ENDED", SESSION_END_MESSAGES[reason], { reason });

async function authenticate(kind: SessionKind, ctx: RequestContext) {
  const token = await readSessionToken(kind);
  if (!token) throw new ApiError("UNAUTHENTICATED", "Sign in to continue.");
  const sessions = await sessionCollection(kind);
  const session = await sessions.findOne({ tokenHash: hashToken(token) });
  if (!session) throw ended("expired");
  const now = new Date();
  const c = await collections();
  let principal: UserDoc | AdminDoc | null =
    kind === "user"
      ? await c.users.findOne({ _id: session.principalId })
      : await c.admins.findOne({ _id: session.principalId });
  if (!principal) throw ended("revoked");
  if (kind === "user") principal = await applyTimedResume(principal as UserDoc, now);

  // Account state is checked before revocation so a paused user sees why they were signed out.
  if (principal.status === "paused") throw ended("paused");
  if (principal.status === "disabled") throw ended("disabled");
  if (session.revokedAt || session.authVersion !== principal.authVersion) throw ended("revoked");
  if (now >= session.expiresAt || now >= session.absoluteExpiresAt) throw ended("expired");

  if (!ctx.backgroundPoll && now.getTime() - session.lastSeenAt.getTime() >= authConfig.lastSeenThrottleMs) {
    const expiry = expiryFrom(kind, now, session.absoluteExpiresAt);
    await sessions.updateOne({ _id: session._id }, { $set: { lastSeenAt: now, ip: ctx.ip, ...expiry } });
    if (kind === "user") await c.users.updateOne({ _id: principal._id }, { $set: { lastSeenAt: now } });
    Object.assign(session, { lastSeenAt: now, ip: ctx.ip, ...expiry });
    if (kind === "user") (principal as UserDoc).lastSeenAt = now;
  }
  return { principal, session };
}

async function guarded<T>(fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (isStorageError(error)) {
      throw new ApiError("STORAGE_UNAVAILABLE", STORAGE_MESSAGE);
    }
    throw error;
  }
}

/** For route handlers: throws ApiError, which the route wrapper turns into JSON. */
/** requestContext() mints a random request id, which cacheComponents only allows after io(). */
async function currentContext(): Promise<RequestContext> {
  const h = await headers();
  await io();
  return requestContext(h);
}

export async function requireUser(ctx?: RequestContext): Promise<UserAuth> {
  const context = ctx ?? (await currentContext());
  return guarded(async () => {
    const { principal, session } = await authenticate("user", context);
    return { user: principal as UserDoc, session, ctx: context };
  });
}

export async function requireAdmin(ctx?: RequestContext): Promise<AdminAuth> {
  const context = ctx ?? (await currentContext());
  return guarded(async () => {
    const { principal, session } = await authenticate("admin", context);
    return { admin: principal as AdminDoc, session, ctx: context };
  });
}

function loginRedirect(error: unknown, base: string, next?: string): never {
  if (error instanceof ApiError && (error.code === "UNAUTHENTICATED" || error.code === "SESSION_ENDED")) {
    const params = new URLSearchParams();
    if (error.extra.reason) params.set("reason", error.extra.reason);
    if (next) params.set("next", next);
    const qs = params.toString();
    redirect(qs ? `${base}?${qs}` : base);
  }
  throw error;
}

/** For pages: redirects to /login with ?reason= on failure. Deduplicated per request. */
export const requireUserPage = cache(async (): Promise<UserAuth> => {
  try {
    return await requireUser();
  } catch (error) {
    loginRedirect(error, authConfig.userLoginPath);
  }
});

/** For server actions: same-origin check, then the user guard. */
export async function requireUserAction(): Promise<UserAuth> {
  const h = await headers();
  assertSameOrigin(h);
  try {
    return await requireUser(await currentContext());
  } catch (error) {
    loginRedirect(error, authConfig.userLoginPath);
  }
}

export const getAdminPage = cache(async (): Promise<AdminAuth | null> => {
  try {
    return await requireAdmin();
  } catch (error) {
    if (error instanceof ApiError && (error.code === "UNAUTHENTICATED" || error.code === "SESSION_ENDED")) {
      return null;
    }
    throw error;
  }
});

export async function requireAdminPage(next: string): Promise<AdminAuth> {
  try {
    return await requireAdmin();
  } catch (error) {
    loginRedirect(error, authConfig.adminBasePath, next);
  }
}

export function isReauthValid(session: SessionDoc, now = new Date()) {
  return !!session.reauthAt && now.getTime() - session.reauthAt.getTime() < authConfig.reauthWindowMs;
}

export function reauthValidUntil(session: SessionDoc) {
  return session.reauthAt ? new Date(session.reauthAt.getTime() + authConfig.reauthWindowMs) : null;
}

export function assertReauth(session: SessionDoc) {
  if (!isReauthValid(session)) {
    throw new ApiError("REAUTH_REQUIRED", "Confirm your password to continue.");
  }
}
