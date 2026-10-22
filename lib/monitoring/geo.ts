import "server-only";
import { authConfig, MIN } from "@/lib/auth/config";
import type { IpGeo } from "@/lib/schema";

const cache = new Map<string, { geo: IpGeo | null; at: number }>();
const CACHE_LIMIT = 1000;
let budget = { windowStart: 0, used: 0 };

const PRIVATE = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^::1$/,
  /^::$/,
  /^f[cd][0-9a-f]{2}:/i,
  /^fe80:/i,
  /^::ffff:(10|127|192\.168)\./i,
];

export const isPublicIp = (ip: string) => !!ip && ip !== "unknown" && !PRIVATE.some((re) => re.test(ip));

function takeBudget(now: number) {
  if (now - budget.windowStart >= MIN) budget = { windowStart: now, used: 0 };
  if (budget.used >= authConfig.geoip.perMinute) return false;
  budget.used++;
  return true;
}

const s = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 200) : null);
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const b = (v: unknown) => (typeof v === "boolean" ? v : null);

async function fetchIpApi(ip: string, signal: AbortSignal): Promise<IpGeo | null> {
  const fields = "status,country,countryCode,regionName,city,lat,lon,timezone,isp,org,as,mobile,proxy,hosting";
  // The free tier is HTTP only.
  const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=${fields}`, { signal, cache: "no-store" });
  if (!res.ok) return null;
  const j = (await res.json()) as Record<string, unknown>;
  if (j.status !== "success") return null;
  return {
    country: s(j.country),
    countryCode: s(j.countryCode),
    region: s(j.regionName),
    city: s(j.city),
    lat: n(j.lat),
    lon: n(j.lon),
    timezone: s(j.timezone),
    isp: s(j.isp),
    org: s(j.org),
    asn: s(j.as),
    isMobile: b(j.mobile),
    isProxy: b(j.proxy),
    isHosting: b(j.hosting),
  };
}

async function fetchIpinfo(ip: string, token: string, signal: AbortSignal): Promise<IpGeo | null> {
  const res = await fetch(`https://ipinfo.io/${encodeURIComponent(ip)}/json?token=${encodeURIComponent(token)}`, {
    signal,
    cache: "no-store",
  });
  if (!res.ok) return null;
  const j = (await res.json()) as Record<string, unknown>;
  const [lat, lon] = typeof j.loc === "string" ? j.loc.split(",").map(Number) : [NaN, NaN];
  const org = s(j.org);
  // `privacy` is only present on paid ipinfo plans; without it the flags stay unknown.
  const p = typeof j.privacy === "object" && j.privacy !== null ? (j.privacy as Record<string, unknown>) : null;
  return {
    country: s(j.country),
    countryCode: s(j.country),
    region: s(j.region),
    city: s(j.city),
    lat: n(lat),
    lon: n(lon),
    timezone: s(j.timezone),
    isp: org,
    org,
    asn: org?.match(/^AS\d+/)?.[0] ?? null,
    isMobile: null,
    isProxy: p ? p.vpn === true || p.proxy === true || p.tor === true : null,
    isHosting: p ? b(p.hosting) : null,
  };
}

/** Looks up an IP's location. Never throws; returns null for private IPs, failures and when over budget. */
export async function lookupIpGeo(ip: string): Promise<IpGeo | null> {
  const { provider, token, timeoutMs, cacheMs } = authConfig.geoip;
  if (provider === "none" || !isPublicIp(ip)) return null;
  const now = Date.now();
  const hit = cache.get(ip);
  if (hit && now - hit.at < cacheMs) return hit.geo;
  if (provider === "ip-api" && !takeBudget(now)) return null;
  if (provider === "ipinfo" && !token) return null;

  try {
    const signal = AbortSignal.timeout(timeoutMs);
    const geo = provider === "ipinfo" ? await fetchIpinfo(ip, token, signal) : await fetchIpApi(ip, signal);
    if (cache.size >= CACHE_LIMIT) {
      const oldest = cache.keys().next();
      if (!oldest.done && oldest.value !== undefined) cache.delete(oldest.value);
    }
    cache.set(ip, { geo, at: now });
    return geo;
  } catch (error) {
    console.warn(`IP geolocation failed for ${provider}`, (error as Error).name);
    return null;
  }
}
