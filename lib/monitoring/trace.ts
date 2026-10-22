/** Headers the client's fetch wrapper adds to Server Action requests, so server-side events join the timeline. */
export const TRACE_HEADERS = { pageLoadId: "x-bf-page-load", seq: "x-bf-seq", path: "x-bf-path" } as const;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const isUuid = (s: string) => UUID_RE.test(s);
