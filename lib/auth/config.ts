import { DAY, HOUR, MIN, SEC } from "@/lib/time";

export { DAY, HOUR, MIN, SEC };

const num = (name: string, fallback: number) => {
  const raw = process.env[name];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const GEOIP_PROVIDERS = ["ip-api", "ipinfo", "none"] as const;

export const IP_SOURCES = [
  "x-forwarded-for",
  "x-real-ip",
  "cf-connecting-ip",
  "x-nf-client-connection-ip",
  "socket",
] as const;
export type IpSource = (typeof IP_SOURCES)[number];

function ipSource(): IpSource {
  const raw = process.env.CLIENT_IP_SOURCE as IpSource | undefined;
  return raw && IP_SOURCES.includes(raw) ? raw : "x-forwarded-for";
}

function origins() {
  const primary =
    process.env.APP_ORIGIN?.replace(/\/$/, "") ||
    (process.env.NODE_ENV === "production" ? "" : "http://localhost:3000");
  const extra = (process.env.APP_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return { primary, allowed: [primary, ...extra].filter(Boolean) };
}

export const authConfig = {
  appName: "Breakfeast",
  adminBasePath: "/theadmin",
  userLoginPath: "/login",
  loginIdType: "phone" as const,
  defaultPhoneCountry: "US",
  get cookiePrefix() {
    return process.env.COOKIE_PREFIX || "bf";
  },
  get cookies() {
    const p = this.cookiePrefix;
    return { user: `${p}_session`, admin: `${p}_admin`, device: `${p}_device` };
  },
  bcryptCost: 12,
  userPassword: { generatedLength: 6, minLength: 4, maxLength: 6 },
  generatedAlphabet: "abcdefghjkmnpqrstuvwxyz23456789",
  adminPassword: { minBytes: 6, maxBytes: 72 },
  get userSession() {
    return {
      idleMs: num("USER_SESSION_IDLE_DAYS", 30) * DAY,
      maxMs: num("USER_SESSION_MAX_DAYS", 90) * DAY,
    };
  },
  get adminSession() {
    return {
      idleMs: num("ADMIN_SESSION_IDLE_MIN", 30) * MIN,
      maxMs: num("ADMIN_SESSION_MAX_HOURS", 12) * HOUR,
    };
  },
  reauthWindowMs: 5 * MIN,
  lastSeenThrottleMs: 5 * MIN,
  rateLimits: {
    idShort: { max: 5, windowMs: 15 * MIN },
    ipShort: { max: 20, windowMs: 15 * MIN },
    idLong: { max: 30, windowMs: 24 * HOUR },
  },
  get retention() {
    return {
      activityMs: num("ACTIVITY_RETENTION_DAYS", 30) * DAY,
      accessMs: num("ACCESS_RETENTION_DAYS", 365) * DAY,
      auditMs: 365 * DAY,
    };
  },
  activeNowMs: 15 * MIN,
  usersPage: { defaultSize: 25, maxSize: 100 },
  historyPageSize: 50,
  // Larger than other histories: one page load can easily log a hundred events.
  activityPageSize: 200,
  householdInviteMs: 7 * DAY,
  get origins() {
    return origins();
  },
  get clientIp() {
    return { source: ipSource(), trustedHops: Math.floor(num("TRUSTED_PROXY_HOPS", 1)) };
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
  deviceCookieMaxAgeSec: (400 * DAY) / SEC,
  get geoip() {
    const wanted = (process.env.GEOIP_PROVIDER || "ip-api").toLowerCase();
    return {
      provider: GEOIP_PROVIDERS.find((p) => p === wanted) ?? "ip-api",
      token: process.env.GEOIP_TOKEN || "",
      timeoutMs: 3 * SEC,
      cacheMs: 24 * HOUR,
      /** ip-api's free tier allows 45 a minute; stay under it per process. */
      perMinute: 40,
    };
  },
  activity: { maxEvents: 100, maxBytes: 128 * 1024, maxDataBytes: 8 * 1024, pastMs: 24 * HOUR, futureMs: 5 * MIN },
  feed: { overlapMs: 10 * SEC, maxRows: 200 },
  newDeviceMs: 7 * DAY,
  sharing: {
    farKm: num("SHARING_FAR_KM", 100),
    impossibleKmh: num("SHARING_IMPOSSIBLE_KMH", 500),
    concurrentWindowMs: num("SHARING_CONCURRENT_WINDOW_MIN", 15) * MIN,
    failedLogins: num("SHARING_FAILED_LOGINS", 3),
    alertThrottleMs: num("SHARING_ALERT_THROTTLE_HOURS", 6) * HOUR,
  },
};
