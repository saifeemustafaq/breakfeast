import type { ActivityType } from "@/lib/schema";
import { redactData, redactEmails } from "@/lib/monitoring/redact";
import { SEC } from "@/lib/time";

type QueuedEvent = {
  pageLoadId: string;
  seq: number;
  clientAt: number;
  type: ActivityType;
  name: string;
  target: string | null;
  data: Record<string, unknown> | null;
  path: string;
};

const STORAGE_KEY = "bf.activityQueue";
const MAX_QUEUE = 500;
const FLUSH_MS = 3 * SEC;
const FLUSH_AT = 25;
const CHUNK_EVENTS = 100;
/** Below the browser's 64 KB keepalive limit. */
const CHUNK_BYTES = 60 * 1024;

let pageLoadId: string | null = null;
let seq = 0;
let queue: QueuedEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
let send: typeof fetch | null = null;

function uuid() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function currentPageLoadId() {
  pageLoadId ??= uuid();
  return pageLoadId;
}

/** Reserves the next sequence number, e.g. for an event a Server Action records on the server. */
export const nextSeq = () => seq++;

function persist() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Storage full or unavailable: the in-memory queue still works.
  }
}

/** Restores events a previous page load queued but couldn't send. Pass the un-patched fetch. */
export function initLogger(fetcher: typeof fetch) {
  send = fetcher;
  currentPageLoadId();
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]");
    if (Array.isArray(saved)) queue = [...saved.slice(-MAX_QUEUE), ...queue].slice(-MAX_QUEUE);
  } catch {
    queue = [];
  }
  if (queue.length) schedule();
}

function schedule() {
  if (queue.length >= FLUSH_AT) void flush();
  else timer ??= setTimeout(() => void flush(), FLUSH_MS);
}

/** Logs one activity event. Strings are redacted; nothing here may hold a password or form contents. */
export function track(type: ActivityType, name: string, data?: Record<string, unknown> | null, target?: string | null) {
  if (typeof window === "undefined") return;
  queue.push({
    pageLoadId: currentPageLoadId(),
    seq: nextSeq(),
    clientAt: Date.now(),
    type,
    name: redactEmails(name).slice(0, 120),
    target: target ? redactEmails(target).slice(0, 200) : null,
    data:
      data == null
        ? null
        : (() => {
            const cleaned = redactData(data);
            return typeof cleaned === "object" && cleaned !== null && !Array.isArray(cleaned)
              ? (cleaned as Record<string, unknown>)
              : null;
          })(),
    path: location.pathname,
  });
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
  persist();
  if (send) schedule();
}

function chunks(events: QueuedEvent[]) {
  const out: { pageLoadId: string; events: QueuedEvent[] }[] = [];
  for (const e of events) {
    const last = out[out.length - 1];
    const size = last ? JSON.stringify(last).length + JSON.stringify(e).length : 0;
    if (!last || last.pageLoadId !== e.pageLoadId || last.events.length >= CHUNK_EVENTS || size > CHUNK_BYTES) {
      out.push({ pageLoadId: e.pageLoadId, events: [e] });
    } else last.events.push(e);
  }
  return out;
}

/** Sends the queue. `all` is for page hide, when the page may be gone before a timer fires. */
export async function flush({ all = false } = {}) {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!send || (flushing && !all) || !queue.length) return;
  flushing = true;
  const batch = all ? queue : queue.slice(0, CHUNK_EVENTS);
  queue = queue.slice(batch.length);
  persist();
  const retry: QueuedEvent[] = [];
  for (const chunk of chunks(batch)) {
    try {
      const res = await send("/api/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageLoadId: chunk.pageLoadId, events: chunk.events }),
        keepalive: true,
        credentials: "same-origin",
      });
      // 4xx (signed out, malformed) is dropped; 5xx is retried.
      if (res.status >= 500) retry.push(...chunk.events);
    } catch {
      retry.push(...chunk.events);
    }
  }
  flushing = false;
  if (retry.length) {
    queue = [...retry, ...queue].slice(-MAX_QUEUE);
    persist();
  }
  // Wait out the interval even if the queue is long, so a failing server isn't hammered.
  if (queue.length) timer ??= setTimeout(() => void flush(), FLUSH_MS);
}

/** On sign-in and sign-out: nothing from one person's session carries into the next. */
export function clearActivity() {
  queue = [];
  if (timer) clearTimeout(timer);
  timer = null;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore unavailable storage.
  }
}
