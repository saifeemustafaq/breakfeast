import type { AccessKind, ActivityType, Flag, GpsStatus } from "@/lib/schema";

export const FLAG_LABELS: Record<Flag, string> = {
  new_device: "New device",
  new_country: "New country",
  far_location: "Far from last location",
  impossible_travel: "Impossible travel",
  concurrent_devices: "Two devices at once",
  session_moved: "Session used on another browser",
  failed_logins: "Repeated failed logins",
  vpn_or_proxy: "VPN or proxy",
  gps_denied: "Location denied",
};

export const ACCESS_KIND_LABELS: Record<AccessKind, string> = {
  login_success: "Signed in",
  login_failure: "Failed sign-in",
  logout: "Signed out",
  app_open: "Opened app",
  session_revoked: "Session revoked",
};

export const GPS_LABELS: Record<GpsStatus, string> = {
  granted: "GPS",
  denied: "Location denied",
  unavailable: "GPS unavailable",
  timeout: "GPS timed out",
};

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  navigation: "Navigation",
  click: "Click",
  change: "Change",
  workflow: "Workflow",
  api: "API",
  notification: "Notification",
  error: "Error",
  settings: "Settings",
};
