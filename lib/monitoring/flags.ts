import "server-only";

import { authConfig } from "@/lib/auth/config";
import { HOUR, MIN } from "@/lib/time";
import type { AccessKind, Flag, GpsFix, IpGeo } from "@/lib/schema";

type DeviceKey = { deviceId: string | null; fingerprint: string | null };
type Point = { at: Date; ipGeo: IpGeo | null; gps: GpsFix };

export type FlagInput = DeviceKey & {
  kind: AccessKind;
  now: Date;
  ipGeo: IpGeo | null;
  gps: GpsFix;
  /** For app opens: the device the session was created on. */
  sessionDeviceId: string | null;
  history: {
    devices: DeviceKey[];
    /** Country codes from earlier successful accesses. */
    countries: string[];
    previous: Point | null;
    /** Other unrevoked sessions of this user active within the concurrency window. */
    otherSessions: DeviceKey[];
    recentFailures: number;
  };
};

const sameDevice = (a: DeviceKey, b: DeviceKey) =>
  (!!a.deviceId && a.deviceId === b.deviceId) || (!!a.fingerprint && a.fingerprint === b.fingerprint);

export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const gpsPoint = (g: GpsFix) =>
  g?.status === "granted" && g.lat !== null && g.lon !== null ? { lat: g.lat, lon: g.lon } : null;
const ipPoint = (g: IpGeo | null) => (g && g.lat !== null && g.lon !== null ? { lat: g.lat, lon: g.lon } : null);

/** Compares like with like: GPS to GPS when both have it, otherwise IP location to IP location. */
function movement(current: Point, previous: Point) {
  const [a, b] =
    gpsPoint(current.gps) && gpsPoint(previous.gps)
      ? [gpsPoint(current.gps), gpsPoint(previous.gps)]
      : [ipPoint(current.ipGeo), ipPoint(previous.ipGeo)];
  if (!a || !b) return null;
  return { km: distanceKm(a, b), hours: (current.at.getTime() - previous.at.getTime()) / HOUR };
}

/** Sharing signals for a sign-in or app open. Signals, never proof: they inform the admin and never block access. */
export function computeFlags(input: FlagInput): Flag[] {
  const { history: h } = input;
  const flags: Flag[] = [];
  const { farKm, impossibleKmh, failedLogins } = authConfig.sharing;

  if (h.devices.length && !h.devices.some((d) => sameDevice(d, input))) flags.push("new_device");

  const country = input.ipGeo?.countryCode;
  if (country && h.countries.length && !h.countries.includes(country)) flags.push("new_country");

  if (h.previous) {
    const moved = movement({ at: input.now, ipGeo: input.ipGeo, gps: input.gps }, h.previous);
    if (moved && moved.km > farKm) flags.push("far_location");
    if (moved && moved.hours * HOUR >= MIN && moved.km / moved.hours > impossibleKmh) flags.push("impossible_travel");
  }

  if (h.otherSessions.some((s) => !sameDevice(s, input))) flags.push("concurrent_devices");
  if (input.kind === "app_open" && input.sessionDeviceId && input.sessionDeviceId !== input.deviceId) {
    flags.push("session_moved");
  }
  if (h.recentFailures >= failedLogins) flags.push("failed_logins");
  if (input.ipGeo?.isProxy || input.ipGeo?.isHosting) flags.push("vpn_or_proxy");
  if (input.gps?.status === "denied") flags.push("gps_denied");
  return flags;
}
