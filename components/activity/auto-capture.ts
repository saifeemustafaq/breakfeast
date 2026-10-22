import { TRACE_HEADERS } from "@/lib/monitoring/trace";
import { currentPageLoadId, flush, initLogger, nextSeq, track } from "./logger";

const CLICKABLE = 'button, a[href], [role="button"], [role="checkbox"], [role="switch"], [role="radio"], [role="tab"], [role="menuitem"], [data-track]';
const SKIP = "[data-track-ignore]";

function label(el: Element) {
  const text =
    el.getAttribute("data-track") ??
    el.getAttribute("aria-label") ??
    (el instanceof HTMLElement ? el.innerText : el.textContent) ??
    "";
  return text.replace(/\s+/g, " ").trim().slice(0, 60) || el.tagName.toLowerCase();
}

function describe(el: Element) {
  const role = el.getAttribute("role");
  const href = el instanceof HTMLAnchorElement ? new URL(el.href, location.href).pathname : null;
  return [el.tagName.toLowerCase(), role && `[role=${role}]`, el.id && `#${el.id}`, href && `-> ${href}`].filter(Boolean).join("");
}

function onClick(e: MouseEvent) {
  const el = e.target instanceof Element ? e.target.closest(CLICKABLE) : null;
  if (!el || el.closest(SKIP)) return;
  const checked = el.getAttribute("aria-checked");
  track("click", label(el), checked === null ? null : { checked: checked !== "true" }, describe(el));
}

function fieldName(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) {
  const byLabel = el.labels?.[0]?.innerText;
  return (el.getAttribute("aria-label") ?? byLabel ?? el.name ?? el.id ?? el.tagName).replace(/\s+/g, " ").trim().slice(0, 60);
}

function onChange(e: Event) {
  const el = e.target;
  if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) return;
  if (el.closest(SKIP)) return;
  if (el instanceof HTMLInputElement) {
    if (el.type === "password" || el.type === "hidden") return;
    if (el.type === "checkbox" || el.type === "radio") return void track("change", fieldName(el), { checked: el.checked }, describe(el));
    if (el.type === "range" || el.type === "number") return void track("change", fieldName(el), { value: el.valueAsNumber }, describe(el));
  }
  if (el instanceof HTMLSelectElement) {
    const data = el.hasAttribute("data-track-value") ? { value: el.value } : { edited: true };
    return void track("change", fieldName(el), data, describe(el));
  }
  // Typed text is never logged, only that the field was edited.
  track("change", fieldName(el), { edited: true }, describe(el));
}

function onError(e: ErrorEvent) {
  track("error", e.message || "Script error", { source: e.filename ? new URL(e.filename, location.href).pathname : null, line: e.lineno });
}

function onRejection(e: PromiseRejectionEvent) {
  const reason = e.reason instanceof Error ? e.reason.message : String(e.reason);
  track("error", reason || "Unhandled rejection", { kind: "unhandledrejection" });
}

function onVisibility() {
  track("navigation", document.visibilityState === "hidden" ? "Hid page" : "Showed page");
  if (document.visibilityState === "hidden") void flush({ all: true });
}

/** Logs same-origin API calls and tags Server Action requests so their server events join this timeline. */
function wrapFetch(original: typeof fetch): typeof fetch {
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((v, k) => headers.set(k, v));
    const isAction = headers.has("next-action");
    const isApi = url.origin === location.origin && url.pathname.startsWith("/api/") && url.pathname !== "/api/activity";
    if (!isAction && !isApi) return original(input, init);

    if (isAction) {
      headers.set(TRACE_HEADERS.pageLoadId, currentPageLoadId());
      headers.set(TRACE_HEADERS.seq, String(nextSeq()));
      headers.set(TRACE_HEADERS.path, location.pathname);
      init = { ...init, headers };
    }
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const name = isAction ? `Action on ${location.pathname}` : `${method} ${url.pathname}`;
    const started = performance.now();
    try {
      const res = await original(input, init);
      const data: Record<string, unknown> = { status: res.status, ms: Math.round(performance.now() - started) };
      if (!res.ok && isApi) {
        const body = await res.clone().json().catch(() => null);
        if (typeof body?.error?.code === "string") data.code = body.error.code;
      }
      track("api", name, data, isAction ? "server-action" : url.pathname);
      return res;
    } catch (err) {
      track("api", name, { status: 0, ms: Math.round(performance.now() - started), error: err instanceof Error ? err.message : "Network error" });
      throw err;
    }
  };
}

const INSTALLED = Symbol.for("breakfeast.activity.installed");

/** Once per page load. Nothing to undo: the listeners live as long as the page. */
export function installAutoCapture() {
  // On the window, not in module state, so a dev hot reload can't install listeners or wrap fetch twice.
  const w: Window & { [INSTALLED]?: typeof fetch } = window;
  if (w[INSTALLED]) return initLogger(w[INSTALLED]);
  const original = window.fetch.bind(window);
  w[INSTALLED] = original;
  initLogger(original);
  window.fetch = wrapFetch(original);
  document.addEventListener("click", onClick, { capture: true });
  document.addEventListener("change", onChange, { capture: true });
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", () => void flush({ all: true }));
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
}
