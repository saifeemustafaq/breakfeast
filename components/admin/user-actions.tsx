"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { UserDetail, UserSummary } from "@/lib/admin/serialize";
import { ClientApiError } from "@/lib/api-client";
import { adminFetch } from "./api";
import { timezoneLabel } from "./format";
import {
  OneTimePasswordDialog,
  PasswordControl,
  initialPasswordChoice,
  passwordPayload,
  checkTypedPassword,
  type PasswordChoice,
} from "./passwords";
import { ReauthCancelled, useWithReauth } from "./reauth";
import { AdminDialog, ConfirmDialog, Field, fieldAria } from "./ui";

export type UserAction = "reset" | "pause" | "resume" | "deactivate" | "activate" | "revokeAll";
type Target = Pick<UserSummary, "id" | "name" | "status">;

const errorText = (err: unknown) =>
  err instanceof ClientApiError ? err.message : "Something went wrong. Try again.";

/**
 * Dialogs and requests for the user actions shared by the Users table and the user page.
 * `onChanged` receives the updated user when the action returns one.
 */
export function useUserActions(onChanged: (user?: UserDetail) => void) {
  const withReauth = useWithReauth();
  const [action, setAction] = useState<UserAction | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [password, setPassword] = useState<PasswordChoice>({ mode: "generate", preview: "" });
  const [issued, setIssued] = useState<{ name: string; password: string } | null>(null);
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState("");

  function open(next: UserAction, user: Target) {
    setAction(next);
    setTarget(user);
    setError(null);
    setFields({});
    setReason("");
    setUntil("");
    if (next === "reset") setPassword(initialPasswordChoice());
  }

  function close() {
    if (pending) return;
    setAction(null);
  }

  async function run<T>(fn: () => Promise<T>, success: string, after?: (result: T) => void) {
    setPending(true);
    setError(null);
    setFields({});
    try {
      const result = await fn();
      setAction(null);
      toast.success(success);
      after?.(result);
    } catch (err) {
      if (err instanceof ReauthCancelled) return;
      if (err instanceof ClientApiError && err.code === "VALIDATION_FAILED") setFields(err.fields);
      else setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  const base = target ? `/api/admin/users/${target.id}` : "";
  const name = target?.name ?? "";

  function submitReset() {
    if (password.mode === "manual") {
      const problem = checkTypedPassword(password.value);
      if (problem) {
        setFields({ password: problem });
        return;
      }
    }
    run(
      () =>
        withReauth(() =>
          adminFetch<{ data: { issuedPassword: string } }>(`${base}/password`, { body: passwordPayload(password) }),
        ),
      "Password reset",
      (res) => {
        setIssued({ name, password: res.data.issuedPassword });
        onChanged();
      },
    );
  }

  function submitState(kind: "pause" | "resume" | "deactivate" | "activate", success: string) {
    const body: Record<string, unknown> = {};
    if (kind === "pause") {
      if (reason.trim()) body.reason = reason.trim();
      if (until) {
        const at = new Date(until);
        if (Number.isNaN(at.getTime()) || at <= new Date()) {
          setFields({ until: "Choose a time in the future." });
          return;
        }
        body.until = at.toISOString();
      }
    }
    run(
      () => adminFetch<{ data: UserDetail }>(`${base}/${kind}`, { body }),
      success,
      (res) => onChanged(res.data),
    );
  }

  const dialogs = (
    <>
      <AdminDialog
        open={action === "reset"}
        onOpenChange={(o) => !o && close()}
        title={`Reset password for ${name}`}
        description={`${name} will be signed out of every device.`}
      >
        <form
          className="adm-stack"
          style={{ gap: 16 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!pending) submitReset();
          }}
        >
          <PasswordControl id="reset-password" value={password} onChange={setPassword} error={fields.password ?? fields.value} />
          {error && <div className="adm-banner" role="alert">{error}</div>}
          <div className="adm-dialog-actions">
            <button type="button" className="adm-btn" onClick={close} disabled={pending}>
              Cancel
            </button>
            <button type="submit" className="adm-btn adm-btn--primary" disabled={pending}>
              {pending ? "Working…" : "Reset password"}
            </button>
          </div>
        </form>
      </AdminDialog>

      <ConfirmDialog
        open={action === "pause"}
        onOpenChange={(o) => !o && close()}
        title="Pause access"
        body={
          <>
            Pause access for <strong>{name}</strong>? They will be signed out of every device immediately and cannot sign
            in until you resume access.
          </>
        }
        confirmLabel="Pause access"
        danger
        pending={pending}
        error={error}
        onConfirm={() => submitState("pause", "Access paused")}
      >
        <Field id="pause-reason" label="Reason (optional)" error={fields.reason} help="Internal; at most 200 characters.">
          <input
            {...fieldAria("pause-reason", fields.reason, true)}
            className="adm-input"
            maxLength={200}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <Field
          id="pause-until"
          label="Resume at (optional)"
          error={fields.until}
          help={`Your timezone: ${timezoneLabel()}. Leave empty to pause until you resume manually.`}
        >
          <input
            {...fieldAria("pause-until", fields.until, true)}
            className="adm-input"
            type="datetime-local"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
          />
        </Field>
      </ConfirmDialog>

      <ConfirmDialog
        open={action === "resume"}
        onOpenChange={(o) => !o && close()}
        title="Resume access"
        body={
          <>
            Resume access for <strong>{name}</strong>? They will need to sign in again.
          </>
        }
        confirmLabel="Resume access"
        pending={pending}
        error={error}
        onConfirm={() => submitState("resume", "Access resumed")}
      />

      <ConfirmDialog
        open={action === "deactivate"}
        onOpenChange={(o) => !o && close()}
        title="Deactivate user"
        body={
          <>
            Deactivate <strong>{name}</strong>? They will be signed out of every device immediately and cannot sign in
            until you activate the account again.
          </>
        }
        confirmLabel="Deactivate"
        danger
        pending={pending}
        error={error}
        onConfirm={() => submitState("deactivate", "User deactivated")}
      />

      <ConfirmDialog
        open={action === "activate"}
        onOpenChange={(o) => !o && close()}
        title="Activate user"
        body={
          <>
            Activate <strong>{name}</strong>? They will be able to sign in again with their current password.
          </>
        }
        confirmLabel="Activate"
        pending={pending}
        error={error}
        onConfirm={() => submitState("activate", "User activated")}
      />

      <ConfirmDialog
        open={action === "revokeAll"}
        onOpenChange={(o) => !o && close()}
        title="Revoke all sessions"
        body={
          <>
            Sign <strong>{name}</strong> out of every device? Their account stays {target?.status === "active" ? "active" : "as it is"} and
            they can sign in again.
          </>
        }
        confirmLabel="Revoke all sessions"
        danger
        pending={pending}
        error={error}
        onConfirm={() =>
          run(
            () => adminFetch<{ data: { revoked: number } }>(`${base}/sessions`, { method: "DELETE" }),
            "All sessions revoked",
            () => onChanged(),
          )
        }
      />

      <OneTimePasswordDialog name={issued?.name ?? ""} password={issued?.password ?? null} onDone={() => setIssued(null)} />
    </>
  );

  return { open, dialogs };
}

/** The state-dependent actions a user can receive, in menu order. */
export function availableActions(status: UserSummary["status"]): { action: UserAction; label: string; danger?: boolean }[] {
  return [
    { action: "reset", label: "Reset password" },
    status === "paused"
      ? { action: "resume", label: "Resume access" }
      : status === "active"
        ? { action: "pause", label: "Pause access", danger: true }
        : null,
    status === "disabled"
      ? { action: "activate", label: "Activate" }
      : { action: "deactivate", label: "Deactivate", danger: true },
    { action: "revokeAll", label: "Revoke all sessions", danger: true },
  ].filter((a): a is { action: UserAction; label: string; danger?: boolean } => !!a);
}
