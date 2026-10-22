"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { apiFetch, ClientApiError } from "@/lib/api-client";
import { safeReturnPath } from "@/lib/return-path";
import { Field, fieldAria } from "./ui";

const REASONS: Record<string, string> = {
  "password-changed": "Password changed. Sign in again.",
  revoked: "You were signed out. Sign in again.",
  expired: "Your session expired. Sign in again.",
  disabled: "This admin account is disabled.",
};

export function AdminLogin() {
  const params = useSearchParams();
  const notice = REASONS[params.get("reason") ?? ""];
  const [adminId, setAdminId] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    setFields({});
    try {
      await apiFetch("/api/admin/auth/login", { body: { adminId, password } });
      window.location.replace(safeReturnPath(params.get("next"), "/theadmin", "/theadmin"));
    } catch (err) {
      setPending(false);
      if (err instanceof ClientApiError) {
        if (err.code === "VALIDATION_FAILED") setFields(err.fields);
        else if (err.code === "RATE_LIMITED" && err.retryAfterSec) {
          const minutes = Math.ceil(err.retryAfterSec / 60);
          setError(`Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
        } else setError(err.message);
      } else setError("Something went wrong. Try again.");
    }
  }

  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "100dvh", padding: 16 }}>
      <form onSubmit={submit} className="adm-card adm-stack" style={{ width: "min(400px, 100%)", gap: 16 }} noValidate>
        <div>
          <div className="adm-caption" style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-text)" }}>
            Breakfeast
          </div>
          <h1 className="adm-title">Admin sign in</h1>
        </div>
        {notice && !error && (
          <div className="adm-banner adm-banner--info" role="status">
            {notice}
          </div>
        )}
        <Field id="adminId" label="Admin ID" error={fields.adminId}>
          <input
            {...fieldAria("adminId", fields.adminId)}
            className="adm-input"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            value={adminId}
            onChange={(e) => setAdminId(e.target.value)}
          />
        </Field>
        <Field id="adminPassword" label="Password" error={fields.password}>
          <input
            {...fieldAria("adminPassword", fields.password)}
            className="adm-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error && (
          <div className="adm-banner" role="alert">
            {error}
          </div>
        )}
        <button type="submit" className="adm-btn adm-btn--primary" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
