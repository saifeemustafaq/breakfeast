"use client";

import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import type { UserDetail } from "@/lib/admin/serialize";
import { ClientApiError } from "@/lib/api-client";
import { formatPhoneInput, PHONE_ERROR, validatePhone } from "@/lib/phone";
import { adminFetch } from "./api";
import {
  checkTypedPassword,
  initialPasswordChoice,
  OneTimePasswordDialog,
  PasswordControl,
  passwordPayload,
  type PasswordChoice,
} from "./passwords";
import { Field, fieldAria } from "./ui";

export function UserCreatePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loginId, setLoginId] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"active" | "paused">("active");
  const [password, setPassword] = useState<PasswordChoice>(initialPasswordChoice);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState<{ user: UserDetail; password: string } | null>(null);

  function validate() {
    const f: Record<string, string> = {};
    if (!name.trim()) f.name = "Enter a display name.";
    else if (name.trim().length > 100) f.name = "Display names are at most 100 characters.";
    if (!loginId.trim()) f.loginId = "Enter a mobile number.";
    else if (!validatePhone(loginId).ok) f.loginId = PHONE_ERROR;
    if (notes.length > 2000) f.notes = "Notes are at most 2000 characters.";
    if (password.mode === "manual") {
      const problem = checkTypedPassword(password.value);
      if (problem) f.password = problem;
    }
    return f;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const local = validate();
    setFields(local);
    setError(null);
    if (Object.keys(local).length) return;
    setPending(true);
    try {
      const res = await adminFetch<{ data: { user: UserDetail; issuedPassword: string } }>("/api/admin/users", {
        body: { name: name.trim(), loginId, notes, status, password: passwordPayload(password) },
      });
      toast.success("User created");
      setCreated({ user: res.data.user, password: res.data.issuedPassword });
    } catch (err) {
      setPending(false);
      if (err instanceof ClientApiError && Object.keys(err.fields).length) {
        setFields({ ...err.fields, ...(err.fields.value ? { password: err.fields.value } : {}) });
      } else {
        setError(err instanceof ClientApiError ? err.message : "Something went wrong. Try again.");
      }
    }
  }

  return (
    <>
      <div className="adm-page-head">
        <div>
          <Link href="/theadmin/users" className="adm-row adm-muted" style={{ gap: 4, textDecoration: "none" }}>
            <ArrowLeftIcon aria-hidden style={{ width: 16, height: 16 }} />
            Users
          </Link>
          <h1 className="adm-title">Create user</h1>
        </div>
      </div>
      <form onSubmit={submit} className="adm-card adm-stack" style={{ maxWidth: 640 }} noValidate>
        <Field id="name" label="Display name" error={fields.name}>
          <input
            {...fieldAria("name", fields.name)}
            className="adm-input"
            maxLength={100}
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field id="loginId" label="Login ID (US mobile number)" error={fields.loginId} help="The user signs in with this number.">
          <input
            {...fieldAria("loginId", fields.loginId, true)}
            className="adm-input adm-mono"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="(555) 123-4567"
            maxLength={14}
            value={loginId}
            onChange={(e) => setLoginId(formatPhoneInput(e.target.value))}
          />
        </Field>
        <Field id="notes" label="Notes (optional)" error={fields.notes} help="Internal. The user never sees these.">
          <textarea
            {...fieldAria("notes", fields.notes, true)}
            className="adm-textarea"
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
        <Field id="status" label="Initial state" error={fields.status}>
          <select
            {...fieldAria("status", fields.status)}
            className="adm-select"
            value={status}
            onChange={(e) => setStatus(e.target.value as "active" | "paused")}
          >
            <option value="active">Active</option>
            <option value="paused">Paused</option>
          </select>
        </Field>
        <PasswordControl id="password" value={password} onChange={setPassword} error={fields.password} />
        {error && (
          <div className="adm-banner" role="alert">
            {error}
          </div>
        )}
        <div className="adm-row" style={{ justifyContent: "flex-end" }}>
          <Link href="/theadmin/users" className="adm-btn">
            Cancel
          </Link>
          <button type="submit" className="adm-btn adm-btn--primary" disabled={pending}>
            {pending ? "Creating…" : "Create user"}
          </button>
        </div>
      </form>
      <OneTimePasswordDialog
        name={created?.user.name ?? ""}
        password={created?.password ?? null}
        onDone={() => {
          const id = created?.user.id;
          setCreated(null);
          if (id) router.push(`/theadmin/users/${id}`);
        }}
      />
    </>
  );
}
