import { UAParser } from "ua-parser-js";
import type { ParsedUa } from "@/lib/schema";

export function parseUa(userAgent: string): ParsedUa {
  const r = new UAParser(userAgent).getResult();
  return {
    browser: r.browser.name ?? null,
    browserVersion: r.browser.version ?? null,
    engine: r.engine.name ?? null,
    os: r.os.name ?? null,
    osVersion: r.os.version ?? null,
    deviceType: r.device.type ?? null,
    deviceVendor: r.device.vendor ?? null,
    deviceModel: r.device.model ?? null,
  };
}

/** "Chrome 131 on macOS 15" (optionally "· Apple M2" when a GPU is known). */
export function deviceLabel(ua: ParsedUa, extras: { osVersion?: string | null; gpu?: string | null; model?: string | null } = {}) {
  const browser = ua.browser
    ? `${ua.browser}${ua.browserVersion ? ` ${ua.browserVersion.split(".")[0]}` : ""}`
    : "Unknown browser";
  const mac = ua.os === "Mac OS" || ua.os === "macOS";
  // Browsers freeze the macOS version in the user agent at 10.15.7; only client hints carry the real one.
  const osVersion = extras.osVersion || (mac && ua.osVersion?.startsWith("10.15") ? null : ua.osVersion);
  const osName = mac ? "macOS" : ua.os;
  const os = osName ? `${osName}${osVersion ? ` ${osVersion.split(".")[0]}` : ""}` : "unknown OS";
  // Desktop user agents name a generic vendor and model ("Apple Macintosh"), which says nothing.
  const model = extras.model || (ua.deviceType && ua.deviceVendor && ua.deviceModel ? `${ua.deviceVendor} ${ua.deviceModel}` : null);
  let label = `${browser} on ${os}`;
  if (model) label += ` (${model})`;
  if (extras.gpu) label += ` · ${extras.gpu}`;
  return label.slice(0, 200);
}
