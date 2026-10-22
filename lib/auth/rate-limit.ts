import "server-only";
import { collections } from "@/lib/db";
import { DAY, SEC } from "@/lib/time";
import { authConfig } from "./config";
import { ApiError } from "./errors";

type Scope = "user" | "admin";

const idBucket = (scope: Scope, normalized: string) => `id:${scope}:${normalized}`;
const ipBucket = (ip: string) => `ip:${ip}`;

async function windowState(bucket: string, windowMs: number, now: Date) {
  const c = await collections();
  const since = new Date(now.getTime() - windowMs);
  const count = await c.authAttempts.countDocuments({ bucket, at: { $gte: since } });
  if (count === 0) return { count, retryAfterSec: 0 };
  const oldest = await c.authAttempts.findOne({ bucket, at: { $gte: since } }, { sort: { at: 1 } });
  const retryAfterMs = oldest ? oldest.at.getTime() + windowMs - now.getTime() : windowMs;
  return { count, retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / SEC)) };
}

/** Throws RATE_LIMITED before any password work. Never locks the account permanently. */
export async function assertNotRateLimited(scope: Scope, normalized: string, ip: string, now = new Date()) {
  const { idShort, idLong, ipShort } = authConfig.rateLimits;
  const checks = [
    { bucket: idBucket(scope, normalized), ...idShort },
    { bucket: idBucket(scope, normalized), ...idLong },
    ...(ip !== "unknown" ? [{ bucket: ipBucket(ip), ...ipShort }] : []),
  ];
  for (const check of checks) {
    const state = await windowState(check.bucket, check.windowMs, now);
    if (state.count >= check.max) {
      throw new ApiError("RATE_LIMITED", "Too many sign-in attempts. Wait a few minutes and try again.", {
        retryAfterSec: state.retryAfterSec,
      });
    }
  }
}

export async function recordFailure(scope: Scope, normalized: string, ip: string, now = new Date()) {
  const c = await collections();
  const expiresAt = new Date(now.getTime() + DAY);
  const docs = [{ bucket: idBucket(scope, normalized), at: now, expiresAt }];
  if (ip !== "unknown") docs.push({ bucket: ipBucket(ip), at: now, expiresAt });
  await c.authAttempts.insertMany(docs);
}

/** After a successful sign-in, forget this identifier's recent failures. */
export async function clearRecentFailures(scope: Scope, normalized: string, now = new Date()) {
  const c = await collections();
  const since = new Date(now.getTime() - authConfig.rateLimits.idShort.windowMs);
  await c.authAttempts.deleteMany({ bucket: idBucket(scope, normalized), at: { $gte: since } });
}

/** After a password reset, let the person sign in at once. */
export async function clearAllFailures(scope: Scope, normalized: string) {
  const c = await collections();
  await c.authAttempts.deleteMany({ bucket: idBucket(scope, normalized) });
}

export async function recentFailureCount(scope: Scope, normalized: string, windowMs: number, now = new Date()) {
  const c = await collections();
  return c.authAttempts.countDocuments({
    bucket: idBucket(scope, normalized),
    at: { $gte: new Date(now.getTime() - windowMs) },
  });
}
