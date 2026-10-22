import type { ClientInfo, GpsFix, GpsStatus } from "@/lib/schema";

/** What the browser sends with sign-in and app opens. Every field is optional. */
export type DevicePayload = {
  fingerprint?: string | null;
  gps?: { status?: string; lat?: number; lon?: number; accuracyM?: number } | null;
  hardware?: Partial<Record<keyof ClientInfo["hardware"], unknown>>;
  env?: Partial<Record<keyof ClientInfo["env"], unknown>>;
  hints?: Partial<Record<keyof ClientInfo["hints"], unknown>>;
};

export type SanitizedDevice = { fingerprint: string | null; gps: GpsFix; client: ClientInfo | null };

const MAX_STRING = 200;
const GPS_STATUSES: GpsStatus[] = ["granted", "denied", "unavailable", "timeout"];

const obj = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, MAX_STRING) : null);
const bool = (v: unknown) => (typeof v === "boolean" ? v : null);
const num = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null;
const int = (v: unknown, min: number, max: number) => {
  const n = num(v, min, max);
  return n === null ? null : Math.round(n);
};

/** Clamps an untrusted payload. Never throws: a malformed payload still yields a recordable result. */
export function sanitizeDevice(input: unknown): SanitizedDevice {
  const p = obj(input);
  const fp = typeof p.fingerprint === "string" && /^[a-f0-9]{64}$/.test(p.fingerprint) ? p.fingerprint : null;

  const g = obj(p.gps);
  const status = GPS_STATUSES.find((s) => s === g.status);
  const gps: GpsFix = status
    ? {
        status,
        lat: status === "granted" ? num(g.lat, -90, 90) : null,
        lon: status === "granted" ? num(g.lon, -180, 180) : null,
        accuracyM: status === "granted" ? num(g.accuracyM, 0, 1_000_000) : null,
      }
    : null;

  if (!Object.keys(p).length) return { fingerprint: null, gps: null, client: null };
  const h = obj(p.hardware);
  const e = obj(p.env);
  const ch = obj(p.hints);
  const languages = Array.isArray(e.languages) ? e.languages.map(str).filter((l): l is string => !!l).slice(0, 10) : [];

  return {
    fingerprint: fp,
    gps,
    client: {
      hardware: {
        cores: int(h.cores, 1, 1024),
        memoryGb: num(h.memoryGb, 0, 1024),
        gpuVendor: str(h.gpuVendor),
        gpuRenderer: str(h.gpuRenderer),
        maxTouchPoints: int(h.maxTouchPoints, 0, 100),
        screenW: int(h.screenW, 1, 20_000),
        screenH: int(h.screenH, 1, 20_000),
        colorDepth: int(h.colorDepth, 1, 64),
      },
      env: {
        timezone: str(e.timezone),
        locale: str(e.locale),
        languages,
        cookiesEnabled: bool(e.cookiesEnabled),
        connection: str(e.connection),
        standalone: bool(e.standalone),
        referrer: str(e.referrer),
      },
      hints: {
        platform: str(ch.platform),
        platformVersion: str(ch.platformVersion),
        model: str(ch.model),
        architecture: str(ch.architecture),
      },
    },
  };
}
