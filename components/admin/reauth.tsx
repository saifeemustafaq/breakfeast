"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { ClientApiError } from "@/lib/api-client";
import { adminFetch } from "./api";
import { AdminDialog, Field, fieldAria } from "./ui";

export class ReauthCancelled extends Error {
  constructor() {
    super("Cancelled");
  }
}

type Run = <T>(fn: () => Promise<T>) => Promise<T>;
const ReauthContext = createContext<Run | null>(null);

/** Wraps a sensitive call: on REAUTH_REQUIRED, asks for the admin password and retries once. */
export function useWithReauth(): Run {
  const run = useContext(ReauthContext);
  if (!run) throw new Error("useWithReauth must be used inside ReauthProvider");
  return run;
}

export function ReauthProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const waiter = useRef<{ resolve: () => void; reject: (e: Error) => void } | null>(null);

  const run: Run = useCallback(async (fn) => {
    try {
      return await fn();
    } catch (err) {
      if (!(err instanceof ClientApiError) || err.code !== "REAUTH_REQUIRED") throw err;
      await new Promise<void>((resolve, reject) => {
        waiter.current = { resolve, reject };
        setPassword("");
        setError(null);
        setOpen(true);
      });
      return fn();
    }
  }, []);

  function close() {
    if (pending) return;
    setOpen(false);
    setPassword("");
    waiter.current?.reject(new ReauthCancelled());
    waiter.current = null;
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await adminFetch("/api/admin/auth/reauth", { body: { password } });
      setOpen(false);
      setPassword("");
      waiter.current?.resolve();
      waiter.current = null;
    } catch (err) {
      setError(err instanceof ClientApiError ? (err.fields.password ?? err.message) : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  return (
    <ReauthContext.Provider value={run}>
      {children}
      <AdminDialog
        open={open}
        onOpenChange={(o) => !o && close()}
        title="Confirm it's you"
        description="Enter your admin password to continue. You won't be asked again for 5 minutes."
      >
        <form onSubmit={confirm} className="adm-stack" style={{ gap: 16 }}>
          <Field id="reauth-password" label="Admin password" error={error ?? undefined}>
            <input
              {...fieldAria("reauth-password", error ?? undefined)}
              className="adm-input"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <div className="adm-dialog-actions">
            <button type="button" className="adm-btn" onClick={close} disabled={pending}>
              Cancel
            </button>
            <button type="submit" className="adm-btn adm-btn--primary" disabled={pending || !password}>
              {pending ? "Checking…" : "Confirm"}
            </button>
          </div>
        </form>
      </AdminDialog>
    </ReauthContext.Provider>
  );
}
