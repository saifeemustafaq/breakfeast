"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ClientApiError } from "@/lib/api-client";
import { safeReturnPath } from "@/lib/return-path";

const SIGN_IN = "/theadmin";

const isAbortError = (err: unknown) =>
  (err instanceof DOMException || err instanceof Error) && err.name === "AbortError";

function redirectToSignIn(reason?: string) {
  const params = new URLSearchParams();
  if (reason) params.set("reason", reason);
  const here = window.location.pathname + window.location.search;
  if (here !== SIGN_IN) params.set("next", safeReturnPath(here, SIGN_IN, "/theadmin"));
  window.location.replace(`${SIGN_IN}?${params}`);
}

/** apiFetch for admin endpoints; an ended admin session sends the browser back to sign-in. */
export async function adminFetch<T>(path: string, init: Parameters<typeof apiFetch>[1] = {}): Promise<T> {
  try {
    return await apiFetch<T>(path, init);
  } catch (error) {
    if (error instanceof ClientApiError && (error.code === "UNAUTHENTICATED" || error.code === "SESSION_ENDED")) {
      redirectToSignIn(error.body.reason);
      return new Promise<T>(() => {});
    }
    throw error;
  }
}

const asApiError = (err: unknown) =>
  err instanceof ClientApiError ? err : new ClientApiError(0, { code: "INTERNAL", message: String(err) }, null);

export type QueryState<T> = {
  data: T | undefined;
  error: ClientApiError | null;
  loading: boolean;
  reload: () => void;
  setData: (next: T) => void;
};

/** Fetches `path` (null to skip) and refetches when it changes. Keeps the last data while reloading. */
export function useAdminQuery<T>(path: string | null): QueryState<T> {
  const [nonce, setNonce] = useState(0);
  const key = path ? `${nonce}:${path}` : null;
  const [settled, setSettled] = useState<{ key: string | null; error: ClientApiError | null }>({ key: null, error: null });
  const [data, setData] = useState<T | undefined>(undefined);

  useEffect(() => {
    if (!key || !path) return;
    const controller = new AbortController();
    adminFetch<T>(path, { signal: controller.signal }).then(
      (result) => {
        setData(result);
        setSettled({ key, error: null });
      },
      (err) => {
        if (!isAbortError(err)) setSettled({ key, error: asApiError(err) });
      },
    );
    return () => controller.abort();
  }, [key, path]);

  const current = settled.key === key;
  return {
    data,
    error: current ? settled.error : null,
    loading: !!key && !current,
    reload: useCallback(() => setNonce((n) => n + 1), []),
    setData,
  };
}

export type CursorPage<T> = { data: T[]; nextCursor: string | null };

/** Cursor-paginated history with "Load more". */
export function useCursorList<T extends { id: string }>(basePath: string | null) {
  const [nonce, setNonce] = useState(0);
  const key = basePath ? `${nonce}:${basePath}` : null;
  const [state, setState] = useState<{ key: string | null; rows: T[]; cursor: string | null; error: ClientApiError | null }>({
    key: null,
    rows: [],
    cursor: null,
    error: null,
  });
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!key || !basePath) return;
    const controller = new AbortController();
    adminFetch<CursorPage<T>>(basePath, { signal: controller.signal }).then(
      (page) => setState({ key, rows: page.data, cursor: page.nextCursor, error: null }),
      (err) => {
        if (!isAbortError(err)) setState({ key, rows: [], cursor: null, error: asApiError(err) });
      },
    );
    return () => controller.abort();
  }, [key, basePath]);

  const current = state.key === key;

  const loadMore = useCallback(async () => {
    if (!basePath || !state.cursor || !current) return;
    setLoadingMore(true);
    try {
      const sep = basePath.includes("?") ? "&" : "?";
      const page = await adminFetch<CursorPage<T>>(`${basePath}${sep}cursor=${encodeURIComponent(state.cursor)}`);
      setState((prev) => {
        const seen = new Set(prev.rows.map((r) => r.id));
        return { ...prev, rows: [...prev.rows, ...page.data.filter((r) => !seen.has(r.id))], cursor: page.nextCursor };
      });
    } catch (err) {
      setState((prev) => ({ ...prev, error: asApiError(err) }));
    } finally {
      setLoadingMore(false);
    }
  }, [basePath, state.cursor, current]);

  return {
    rows: current ? state.rows : [],
    hasMore: current && !!state.cursor,
    loading: !!key && !current,
    loadingMore,
    error: current ? state.error : null,
    loadMore,
    reload: useCallback(() => setNonce((n) => n + 1), []),
  };
}
