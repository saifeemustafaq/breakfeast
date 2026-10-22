import "server-only";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { authConfig } from "@/lib/auth/config";
import { isUuid } from "@/lib/monitoring/trace";

export async function readDeviceId() {
  const value = (await cookies()).get(authConfig.cookies.device)?.value;
  return value && isUuid(value) ? value : null;
}

/**
 * Returns the device id, issuing one if missing. Server-set and HttpOnly because Safari caps
 * script-written storage at 7 days, which would make returning devices look new.
 * Only callable where cookies can be set (route handlers and Server Actions).
 */
export async function ensureDeviceId() {
  const existing = await readDeviceId();
  if (existing) return existing;
  const id = randomUUID();
  (await cookies()).set(authConfig.cookies.device, id, {
    httpOnly: true,
    secure: authConfig.isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: authConfig.deviceCookieMaxAgeSec,
  });
  return id;
}
