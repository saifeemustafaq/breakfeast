"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { installAutoCapture } from "./auto-capture";
import { collectDevice, requestGps } from "./device";
import { track } from "./logger";

const SIGNED_OUT_PATHS = new Set(["/login"]);

let appOpenSent = false;
let lastViewed: string | null = null;

/** Tells the server this device opened the app: one request per full page load, with location if allowed. */
async function sendAppOpen() {
  if (appOpenSent) return;
  appOpenSent = true;
  const device = await collectDevice(await requestGps());
  await fetch("/api/auth/app-open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device }),
    credentials: "same-origin",
  }).catch(() => undefined);
}

/** Starts activity logging for signed-in pages. Renders nothing. */
export function ActivityProvider() {
  const pathname = usePathname();
  const signedIn = !SIGNED_OUT_PATHS.has(pathname);

  useEffect(() => {
    if (!signedIn) return;
    installAutoCapture();
    void sendAppOpen();
  }, [signedIn]);

  useEffect(() => {
    // Effects run twice in development; one view per route change.
    if (!signedIn || pathname === lastViewed) return;
    lastViewed = pathname;
    track("navigation", `Viewed ${pathname}`);
  }, [pathname, signedIn]);

  return null;
}
