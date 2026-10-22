export type ApiErrorBody = {
  code: string;
  message: string;
  fields?: Record<string, string>;
  reason?: string;
};

export class ClientApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
    readonly retryAfterSec: number | null,
  ) {
    super(body.message);
  }
  get code() {
    return this.body.code;
  }
  get fields() {
    return this.body.fields ?? {};
  }
}

/** JSON fetch against this app's API. Throws ClientApiError with the server's error body. */
export async function apiFetch<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string>; signal?: AbortSignal } = {},
): Promise<T> {
  const method = init.method ?? (init.body === undefined ? "GET" : "POST");
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: {
        Accept: "application/json",
        ...(method !== "GET" ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
      body: method !== "GET" && method !== "DELETE" ? JSON.stringify(init.body ?? {}) : undefined,
      credentials: "same-origin",
      cache: "no-store",
      signal: init.signal,
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new ClientApiError(0, { code: "NETWORK", message: "Couldn't reach the server. Check your connection." }, null);
  }
  if (res.status === 204) return undefined as T;
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const body: ApiErrorBody = payload?.error ?? { code: "INTERNAL", message: "Something went wrong. Try again." };
    const retry = Number(res.headers.get("Retry-After"));
    throw new ClientApiError(res.status, body, Number.isFinite(retry) && retry > 0 ? retry : null);
  }
  return payload as T;
}
