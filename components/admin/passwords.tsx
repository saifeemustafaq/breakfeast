"use client";

import { CopyIcon, EyeIcon, EyeOffIcon, RefreshCwIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AdminDialog, Field, fieldAria } from "./ui";

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** Same rules as the server: 6 characters, no look-alikes, at least one letter and one digit. */
export function generatePassword() {
  for (;;) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    let out = "";
    for (const b of bytes) {
      if (b >= 256 - (256 % ALPHABET.length)) continue;
      out += ALPHABET[b % ALPHABET.length];
      if (out.length === 6) break;
    }
    if (out.length === 6 && /[a-z]/.test(out) && /\d/.test(out)) return out;
  }
}

export function checkTypedPassword(value: string) {
  const length = [...value].length;
  if (!length) return "Enter a password.";
  if (length > 6) return "Passwords are at most 6 characters.";
  if (length < 4) return "Passwords are at least 4 characters.";
  return null;
}

export type PasswordChoice = { mode: "generate"; preview: string } | { mode: "manual"; value: string };

export const initialPasswordChoice = (): PasswordChoice => ({ mode: "generate", preview: generatePassword() });

/** The value sent to the API; the previewed password is what gets issued. */
export const passwordPayload = (choice: PasswordChoice) =>
  choice.mode === "generate" ? { mode: "manual", value: choice.preview } : { mode: "manual", value: choice.value };

export function PasswordControl({
  id,
  value,
  onChange,
  error,
}: {
  id: string;
  value: PasswordChoice;
  onChange: (v: PasswordChoice) => void;
  error?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="adm-field">
      <span className="adm-label" id={`${id}-label`}>
        Password
      </span>
      <div className="adm-segmented" role="group" aria-labelledby={`${id}-label`}>
        <button
          type="button"
          aria-pressed={value.mode === "generate"}
          onClick={() => value.mode !== "generate" && onChange(initialPasswordChoice())}
        >
          Generate
        </button>
        <button
          type="button"
          aria-pressed={value.mode === "manual"}
          onClick={() => value.mode !== "manual" && onChange({ mode: "manual", value: "" })}
        >
          Enter manually
        </button>
      </div>
      {value.mode === "generate" ? (
        <div className="adm-row">
          <span className="adm-input adm-mono" style={{ width: "auto", minWidth: 140, letterSpacing: "0.2em" }} aria-live="polite">
            {value.preview}
          </span>
          <button type="button" className="adm-btn" onClick={() => onChange({ mode: "generate", preview: generatePassword() })}>
            <RefreshCwIcon aria-hidden />
            Regenerate
          </button>
        </div>
      ) : (
        <div className="adm-row" style={{ flexWrap: "nowrap" }}>
          <input
            {...fieldAria(id, error, true)}
            className="adm-input adm-mono"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            maxLength={12}
            value={value.value}
            onChange={(e) => onChange({ mode: "manual", value: e.target.value })}
            aria-label="Password"
          />
          <button
            type="button"
            className="adm-btn adm-btn--icon"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
            aria-pressed={show}
          >
            {show ? <EyeOffIcon aria-hidden /> : <EyeIcon aria-hidden />}
          </button>
        </div>
      )}
      {error ? (
        <span id={`${id}-error`} className="adm-field-error">
          {error}
        </span>
      ) : (
        value.mode === "manual" && (
          <span id={`${id}-help`} className="adm-help">
            4 to 6 characters.
          </span>
        )
      )}
    </div>
  );
}

/** Shows an issued password once. Closing it drops the password from memory. */
export function OneTimePasswordDialog({
  name,
  password,
  onDone,
}: {
  name: string;
  password: string | null;
  onDone: () => void;
}) {
  async function copy() {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      toast.success("Password copied");
    } catch {
      toast.error("Couldn't copy. Read it out instead.");
    }
  }
  return (
    <AdminDialog
      open={!!password}
      onOpenChange={(open) => !open && onDone()}
      title={`Give this password to ${name}`}
      dismissible={false}
    >
      <div className="adm-password" aria-label={`Password: ${password?.split("").join(" ")}`}>
        {password}
      </div>
      <p className="adm-muted">This password cannot be viewed again. Reset it if needed.</p>
      <div className="adm-dialog-actions">
        <button type="button" className="adm-btn" onClick={copy}>
          <CopyIcon aria-hidden />
          Copy
        </button>
        <button type="button" className="adm-btn adm-btn--primary" onClick={onDone}>
          Done
        </button>
      </div>
    </AdminDialog>
  );
}

export function ChangePasswordDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (current: string, next: string) => Promise<Record<string, string> | string | null>;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function reset(o: boolean) {
    if (pending) return;
    if (!o) {
      setCurrent("");
      setNext("");
      setConfirm("");
      setFields({});
      setError(null);
    }
    onOpenChange(o);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const local: Record<string, string> = {};
    if (!current) local.currentPassword = "Enter your current password.";
    if (new TextEncoder().encode(next).length < 6) local.newPassword = "Admin passwords are at least 6 characters.";
    if (next !== confirm) local.confirm = "The passwords don't match.";
    setFields(local);
    setError(null);
    if (Object.keys(local).length) return;
    setPending(true);
    const result = await onSubmit(current, next);
    setPending(false);
    if (typeof result === "string") setError(result);
    else if (result) setFields(result);
  }

  return (
    <AdminDialog open={open} onOpenChange={reset} title="Change password">
      <form onSubmit={submit} className="adm-stack" style={{ gap: 16 }} noValidate>
        <Field id="cp-current" label="Current password" error={fields.currentPassword}>
          <input
            {...fieldAria("cp-current", fields.currentPassword)}
            className="adm-input"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </Field>
        <Field id="cp-new" label="New password" error={fields.newPassword} help="6 to 72 characters.">
          <input
            {...fieldAria("cp-new", fields.newPassword, true)}
            className="adm-input"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </Field>
        <Field id="cp-confirm" label="Confirm new password" error={fields.confirm}>
          <input
            {...fieldAria("cp-confirm", fields.confirm)}
            className="adm-input"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        {error && <div className="adm-banner" role="alert">{error}</div>}
        <div className="adm-dialog-actions">
          <button type="button" className="adm-btn" onClick={() => reset(false)} disabled={pending}>
            Cancel
          </button>
          <button type="submit" className="adm-btn adm-btn--primary" disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}
