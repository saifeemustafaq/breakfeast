import type { DevicePayload } from "@/lib/monitoring/payload";
import { MIN, SEC } from "@/lib/time";

type Gps = NonNullable<DevicePayload["gps"]>;
type UaData = {
  platform?: string;
  getHighEntropyValues?: (hints: string[]) => Promise<Record<string, unknown>>;
};
type BrowserNavigator = Navigator & {
  deviceMemory?: number;
  connection?: { effectiveType?: string };
  standalone?: boolean;
  userAgentData?: UaData;
};

const GPS_TIMEOUT_MS = 10 * SEC;
const GPS_MAX_AGE_MS = 5 * MIN;

/**
 * One location request per page load. Low accuracy is enough to tell cities apart and
 * answers faster. Settles within 10 seconds whatever the browser does.
 */
let gpsRequest: Promise<Gps> | null = null;
export function requestGps(): Promise<Gps> {
  gpsRequest ??= (async (): Promise<Gps> => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return { status: "unavailable" };
    try {
      const permission = await navigator.permissions?.query({ name: "geolocation" });
      if (permission?.state === "denied") return { status: "denied" };
    } catch {
      // Some browsers can't query geolocation permission; ask anyway.
    }
    return new Promise<Gps>((resolve) => {
      const timer = setTimeout(() => resolve({ status: "timeout" }), GPS_TIMEOUT_MS);
      navigator.geolocation.getCurrentPosition(
        (p) => {
          clearTimeout(timer);
          resolve({ status: "granted", lat: p.coords.latitude, lon: p.coords.longitude, accuracyM: p.coords.accuracy });
        },
        (err) => {
          clearTimeout(timer);
          resolve({ status: err.code === err.PERMISSION_DENIED ? "denied" : err.code === err.TIMEOUT ? "timeout" : "unavailable" });
        },
        { enableHighAccuracy: false, maximumAge: GPS_MAX_AGE_MS, timeout: GPS_TIMEOUT_MS },
      );
    });
  })();
  return gpsRequest;
}

/** The GPS result if it arrives within `waitMs`, otherwise "timeout" (the request keeps running). */
export function gpsWithin(waitMs: number): Promise<Gps> {
  return Promise.race([
    requestGps(),
    new Promise<Gps>((resolve) => setTimeout(() => resolve({ status: "timeout" }), waitMs)),
  ]);
}

function gpu() {
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    if (!gl) return { vendor: null, renderer: null };
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      vendor: String(gl.getParameter(ext ? ext.UNMASKED_VENDOR_WEBGL : gl.VENDOR)),
      renderer: String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)),
    };
  } catch {
    return { vendor: null, renderer: null };
  }
}

function canvasSample() {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 40;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.textBaseline = "top";
    ctx.font = "16px Arial";
    ctx.fillStyle = "#f60";
    ctx.fillRect(100, 1, 60, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("Breakfeast, 2026 \u{1F95E}", 2, 15);
    return canvas.toDataURL();
  } catch {
    return "";
  }
}

async function sha256(text: string) {
  if (!crypto.subtle) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hints(nav: BrowserNavigator) {
  const data = nav.userAgentData;
  if (!data) return {};
  try {
    const high = (await data.getHighEntropyValues?.(["platformVersion", "model", "architecture"])) ?? {};
    return { platform: data.platform, platformVersion: high.platformVersion, model: high.model, architecture: high.architecture };
  } catch {
    return { platform: data.platform };
  }
}

/** Everything the browser can tell us about the device. Never throws; missing parts are left out. */
export async function collectDevice(gps: Gps): Promise<DevicePayload> {
  try {
    const nav: BrowserNavigator = navigator;
    const g = gpu();
    const hardware = {
      cores: nav.hardwareConcurrency,
      memoryGb: nav.deviceMemory,
      gpuVendor: g.vendor,
      gpuRenderer: g.renderer,
      maxTouchPoints: nav.maxTouchPoints,
      screenW: screen.width,
      screenH: screen.height,
      colorDepth: screen.colorDepth,
    };
    const env = {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale: nav.language,
      languages: [...nav.languages],
      cookiesEnabled: nav.cookieEnabled,
      connection: nav.connection?.effectiveType,
      standalone: matchMedia("(display-mode: standalone)").matches || nav.standalone === true,
      referrer: document.referrer ? new URL(document.referrer).origin : undefined,
    };
    // Only attributes that survive a browser update, so the fingerprint stays put.
    const stable = [hardware.cores, hardware.memoryGb, g.vendor, g.renderer, hardware.screenW, hardware.screenH, hardware.colorDepth, hardware.maxTouchPoints, env.timezone, nav.platform];
    const canvasHash = await sha256(canvasSample());
    return {
      fingerprint: await sha256(JSON.stringify([...stable, canvasHash])),
      gps,
      hardware,
      env,
      hints: await hints(nav),
    };
  } catch {
    return { gps };
  }
}
