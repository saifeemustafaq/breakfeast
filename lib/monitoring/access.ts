import "server-only";
import { ObjectId } from "mongodb";
import { authConfig } from "@/lib/auth/config";
import { collections, type Collections } from "@/lib/db";
import type { AccessKind, ClientInfo, UserDoc } from "@/lib/schema";
import { computeFlags } from "./flags";
import { lookupIpGeo } from "./geo";
import type { SanitizedDevice } from "./payload";
import { deviceLabel, parseUa } from "./ua";

const NO_DEVICE: SanitizedDevice = { fingerprint: null, gps: null, client: null };
const SUCCESSFUL: AccessKind[] = ["login_success", "app_open"];

/** Short GPU name from a WebGL renderer string, e.g. "Apple M2" or "NVIDIA GeForce RTX 3060". */
function gpuName(renderer: string | null) {
  if (!renderer) return null;
  const inner = renderer.replace(/^ANGLE \((.*)\)$/, "$1");
  const match = inner.match(/(Apple M\d\w*( (Pro|Max|Ultra))?|Apple GPU|NVIDIA [^,(]+|AMD [^,(]+|Radeon[^,(]+|Intel[^,(]+|Mali[^,(]+|Adreno[^,(]+)/);
  return (match?.[0] ?? inner.split(",")[1] ?? inner).trim().slice(0, 60) || null;
}

/** "Chrome 131 on macOS 15 · Apple M2": the user agent refined by client hints and the GPU. */
export function labelFor(userAgent: string, client: ClientInfo | null) {
  return deviceLabel(parseUa(userAgent), {
    osVersion: client?.hints.platformVersion,
    model: client?.hints.model,
    gpu: gpuName(client?.hardware.gpuRenderer ?? null),
  });
}

export type AccessInput = {
  kind: AccessKind;
  requestId: string;
  ip: string;
  userAgent: string;
  user: UserDoc | null;
  loginIdAttempted?: string | null;
  sessionId?: ObjectId | null;
  /** The device the session was created on (app opens), for the "session used on another browser" flag. */
  sessionDeviceId?: string | null;
  deviceId: string | null;
  device?: SanitizedDevice;
  deviceLabel?: string;
};

async function history(c: Collections, user: UserDoc, sessionId: ObjectId | null, now: Date) {
  const since = new Date(now.getTime() - authConfig.sharing.concurrentWindowMs);
  const [devices, countries, previous, sessions, recentFailures] = await Promise.all([
    c.devices.find({ userId: user._id }, { projection: { deviceId: 1, fingerprint: 1 } }).limit(200).toArray(),
    c.accessEvents.distinct("ipGeo.countryCode", {
      userId: user._id,
      kind: { $in: SUCCESSFUL },
      "ipGeo.countryCode": { $type: "string" },
    }),
    c.accessEvents.findOne({ userId: user._id, kind: { $in: SUCCESSFUL } }, { sort: { at: -1 }, projection: { at: 1, ipGeo: 1, gps: 1 } }),
    c.userSessions
      .find({
        principalId: user._id,
        ...(sessionId ? { _id: { $ne: sessionId } } : {}),
        revokedAt: null,
        authVersion: user.authVersion,
        expiresAt: { $gt: now },
        lastSeenAt: { $gte: since },
      })
      .project<{ deviceId: string | null }>({ deviceId: 1 })
      .limit(50)
      .toArray(),
    c.accessEvents.countDocuments({
      kind: "login_failure",
      loginIdAttempted: user.loginIdNormalized,
      at: { $gte: new Date(now.getTime() - authConfig.rateLimits.idShort.windowMs) },
    }),
  ]);
  const fingerprintOf = new Map(devices.map((d) => [d.deviceId, d.fingerprint]));
  return {
    devices,
    countries: countries.filter((x): x is string => typeof x === "string"),
    previous: previous ? { at: previous.at, ipGeo: previous.ipGeo, gps: previous.gps } : null,
    otherSessions: sessions.map((s) => ({ deviceId: s.deviceId, fingerprint: s.deviceId ? fingerprintOf.get(s.deviceId) ?? null : null })),
    recentFailures,
  };
}

/**
 * Writes an access event (and, for successful accesses, the device row). Flags are computed
 * against history before either is written. Never throws: monitoring must not break sign-in.
 */
export async function recordAccess(input: AccessInput) {
  try {
    const c = await collections();
    const now = new Date();
    const device = input.device ?? NO_DEVICE;
    const ipGeo = await lookupIpGeo(input.ip);
    const label = input.deviceLabel ?? labelFor(input.userAgent, device.client);
    const successful = SUCCESSFUL.includes(input.kind) && !!input.user;

    const flags =
      successful && input.user
        ? computeFlags({
            kind: input.kind,
            now,
            deviceId: input.deviceId,
            fingerprint: device.fingerprint,
            ipGeo,
            gps: device.gps,
            sessionDeviceId: input.sessionDeviceId ?? null,
            history: await history(c, input.user, input.sessionId ?? null, now),
          })
        : [];

    await c.accessEvents.insertOne({
      _id: new ObjectId(),
      at: now,
      kind: input.kind,
      principalType: "user",
      userId: input.user?._id ?? null,
      loginIdAttempted: input.kind === "login_failure" ? (input.loginIdAttempted ?? null) : null,
      sessionId: input.sessionId ?? null,
      ip: input.ip,
      ipGeo,
      gps: device.gps,
      deviceId: input.deviceId,
      fingerprint: device.fingerprint,
      deviceLabel: label,
      ua: parseUa(input.userAgent),
      client: device.client,
      flags,
      expiresAt: new Date(now.getTime() + authConfig.retention.accessMs),
    });

    if (successful && input.user && input.deviceId) {
      await c.devices.updateOne(
        { userId: input.user._id, deviceId: input.deviceId },
        {
          $setOnInsert: { firstSeenAt: now, ...(device.fingerprint ? {} : { fingerprint: null }) },
          $set: {
            label,
            lastSeenAt: now,
            lastIp: input.ip,
            lastCity: ipGeo?.city ?? null,
            lastCountry: ipGeo?.country ?? null,
            ...(device.fingerprint ? { fingerprint: device.fingerprint } : {}),
          },
          $inc: { accessCount: 1 },
        },
        { upsert: true },
      );
    }
  } catch (error) {
    console.error(`[${input.requestId}] Could not record ${input.kind} access event`, error);
  }
}
