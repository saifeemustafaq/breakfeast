import type { ActivityRow } from "@/lib/admin/serialize";
import { DAY, HOUR, MIN, SEC } from "@/lib/time";

const absolute = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const withSeconds = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const tzName = new Intl.DateTimeFormat("en-US", { timeZoneName: "short" });

/** "21 Oct 2026, 13:05" in the admin's timezone. */
export function formatDate(iso: string | null | undefined) {
  if (!iso) return "";
  return absolute.format(new Date(iso));
}

export function formatTime(iso: string) {
  return withSeconds.format(new Date(iso));
}

/** Tooltip text: "21 Oct 2026, 13:05 PDT". */
export function formatDateTitle(iso: string) {
  const d = new Date(iso);
  const zone = tzName.formatToParts(d).find((p) => p.type === "timeZoneName")?.value ?? "";
  return `${absolute.format(d)} ${zone}`.trim();
}

export function timezoneLabel() {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const abbr = tzName.formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value;
  return abbr ? `${zone} (${abbr})` : zone;
}

/** "just now", "5 min ago", "3 h ago", "2 days ago"; future times read "in 5 min". */
export function formatRelative(iso: string, now = Date.now()) {
  const diff = now - new Date(iso).getTime();
  const future = diff < 0;
  const ms = Math.abs(diff);
  let text: string;
  if (ms < 45 * SEC) return future ? "in a moment" : "just now";
  if (ms < HOUR) text = `${Math.round(ms / MIN)} min`;
  else if (ms < DAY) text = `${Math.round(ms / HOUR)} h`;
  else {
    const days = Math.round(ms / DAY);
    text = `${days} day${days === 1 ? "" : "s"}`;
  }
  return future ? `in ${text}` : `${text} ago`;
}

/** yyyy-mm-dd in the admin's timezone -> ISO bounds for that local day. */
export const dayStart = (d: string) => new Date(`${d}T00:00:00`).toISOString();
export const dayEnd = (d: string) => new Date(`${d}T23:59:59.999`).toISOString();

const ISO_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}T/;

export function formatChangeValue(v: unknown) {
  if (v === null || v === undefined || v === "") return "none";
  if (typeof v === "string" && ISO_DATE_PREFIX.test(v)) return formatDate(v);
  return String(v);
}

export const isFailure = (e: ActivityRow) =>
  e.type === "error" || (e.type === "api" && typeof e.data?.status === "number" && (e.data.status === 0 || e.data.status >= 400));

/** Value for <input type="datetime-local"> in the admin's timezone. */
export function toLocalInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export const ACTION_LABELS: Record<string, string> = {
  "admin.login": "Admin signed in",
  "admin.login_failed": "Admin sign-in failed",
  "admin.logout": "Admin signed out",
  "admin.reauth": "Admin confirmed password",
  "admin.password_changed": "Admin changed password",
  "admin.created": "Admin created",
  "admin.password_reset": "Admin password reset",
  "admin.disabled": "Admin disabled",
  "admin.enabled": "Admin enabled",
  "user.created": "User created",
  "user.updated": "User updated",
  "user.password_reset": "Password reset",
  "user.paused": "Access paused",
  "user.resumed": "Access resumed",
  "user.resumed_automatically": "Access resumed automatically",
  "user.deactivated": "User deactivated",
  "user.activated": "User activated",
  "session.revoked": "Session revoked",
  "session.revoked_all": "All sessions revoked",
  "household.member_removed": "Removed from household",
  "household.member_moved": "Moved to another household",
};

export const actionLabel = (action: string) => ACTION_LABELS[action] ?? action;
