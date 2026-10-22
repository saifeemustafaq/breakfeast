import "server-only";

import { randomUUID } from "node:crypto";
import { authConfig } from "./config";
import { ApiError } from "./errors";

function cleanIp(raw: string | null | undefined) {
  if (!raw) return "unknown";
  let ip = raw.trim();
  if (ip.startsWith("[")) ip = ip.slice(1, ip.indexOf("]"));
  else if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(ip)) ip = ip.split(":")[0];
  ip = ip.replace(/^::ffff:/i, "");
  return ip || "unknown";
}

/** Client IP from the configured trusted source; never the client-controlled leftmost XFF entry. */
export function clientIp(headers: Headers) {
  const { source, trustedHops } = authConfig.clientIp;
  switch (source) {
    case "x-forwarded-for": {
      const parts = (headers.get("x-forwarded-for") ?? "")
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      const index = parts.length - trustedHops;
      if (trustedHops < 1 || index < 0) return "unknown";
      return cleanIp(parts[index]);
    }
    case "socket":
      return "unknown";
    default:
      return cleanIp(headers.get(source));
  }
}

export type RequestContext = {
  requestId: string;
  ip: string;
  userAgent: string;
  backgroundPoll: boolean;
};

export function requestContext(headers: Headers): RequestContext {
  return {
    requestId: headers.get("x-request-id")?.slice(0, 64) || randomUUID(),
    ip: clientIp(headers),
    userAgent: (headers.get("user-agent") ?? "").slice(0, 500),
    backgroundPoll: headers.get("x-background-poll") === "1",
  };
}

/** Origin / Fetch Metadata check for every cookie-authenticated or login mutation. */
export function assertSameOrigin(headers: Headers) {
  const origin = headers.get("origin");
  const allowed = authConfig.origins.allowed;
  if (origin) {
    if (allowed.includes(origin)) return;
  } else if (headers.get("sec-fetch-site") === "same-origin") {
    return;
  }
  throw new ApiError("CSRF_REJECTED", "This request was blocked because it did not come from this app.");
}

export function assertJson(headers: Headers) {
  const type = headers.get("content-type") ?? "";
  if (!/^application\/json(\s*;|$)/i.test(type)) {
    throw new ApiError("CSRF_REJECTED", "Requests must be sent as JSON.");
  }
}