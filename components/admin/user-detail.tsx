"use client";

import { Tabs } from "@base-ui/react/tabs";
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import type { AuditRow, SessionRow, UserDetail } from "@/lib/admin/serialize";
import { ClientApiError } from "@/lib/api-client";
import { formatPhoneInput, PHONE_ERROR, validatePhone } from "@/lib/phone";
import { adminFetch, useAdminQuery, useCursorList } from "./api";
import { AuditTable } from "./audit-table";
import { useUserActions } from "./user-actions";
import { HouseholdTab } from "./user-household";
import { AccessTab, ActivityTab, DevicesTab } from "./user-monitoring";
import { Badge, ConfirmDialog, DateTime, ErrorBanner, Field, fieldAria, LoadMore, RelativeTime, SkeletonRows, StatusBadge } from "./ui";

const TABS = [
  { value: "profile", label: "Profile" },
  { value: "household", label: "Household" },
  { value: "sessions", label: "Sessions" },
  { value: "devices", label: "Devices" },
  { value: "access", label: "Access history" },
  { value: "activity", label: "Activity" },
  { value: "audit", label: "Audit history" },
] as const;
type TabValue = (typeof TABS)[number]["value"];

function isTabValue(v: string): v is TabValue {
  return TABS.some((t) => t.value === v);
}

function parseTab(raw: string | null): TabValue {
  return raw && isTabValue(raw) ? raw : "profile";
}

export function UserDetailPage({ id }: { id: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = parseTab(params.get("tab"));

  const { data, error, loading, reload, setData } = useAdminQuery<{ data: UserDetail }>(`/api/admin/users/${id}`);
  const user = data?.data;
  const [refreshKey, setRefreshKey] = useState(0);
  const actions = useUserActions((updated) => {
    if (updated) setData({ data: updated });
    else reload();
    setRefreshKey((k) => k + 1);
  });

  function setTab(value: TabValue) {
    const next = new URLSearchParams(params.toString());
    if (value === "profile") next.delete("tab");
    else next.set("tab", value);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  if (error && !user) {
    return (
      <div className="adm-stack">
        <BackLink />
        <ErrorBanner message={error.code === "NOT_FOUND" ? "That user was not found." : error.message} onRetry={error.code === "NOT_FOUND" ? undefined : reload} />
      </div>
    );
  }

  return (
    <>
      <div className="adm-stack">
        <div>
          <BackLink />
          <div className="adm-page-head" style={{ marginBottom: 16, alignItems: "flex-start" }}>
            <div>
              <div className="adm-row" style={{ gap: 12 }}>
                <h1 className="adm-title">{user ? user.name : <span className="adm-skeleton" style={{ width: 200, height: 28 }} />}</h1>
                {user && <StatusBadge status={user.status} />}
              </div>
              {user && <div className="adm-mono adm-muted">{user.loginId}</div>}
            </div>
            {user && (
              <div className="adm-row">
                <button type="button" className="adm-btn adm-btn--primary" onClick={() => actions.open("reset", user)}>
                  Reset password
                </button>
                {user.status === "active" && (
                  <button type="button" className="adm-btn adm-btn--danger-outline" onClick={() => actions.open("pause", user)}>
                    Pause access
                  </button>
                )}
                {user.status === "paused" && (
                  <button type="button" className="adm-btn" onClick={() => actions.open("resume", user)}>
                    Resume access
                  </button>
                )}
                {user.status === "disabled" ? (
                  <button type="button" className="adm-btn" onClick={() => actions.open("activate", user)}>
                    Activate
                  </button>
                ) : (
                  <button type="button" className="adm-btn adm-btn--danger-outline" onClick={() => actions.open("deactivate", user)}>
                    Deactivate
                  </button>
                )}
              </div>
            )}
          </div>
          <dl className="adm-dl adm-card" style={{ padding: 16 }}>
            <div>
              <dt>Created</dt>
              <dd>{user ? <DateTime iso={user.createdAt} /> : <span className="adm-skeleton" />}</dd>
            </div>
            <div>
              <dt>Last login</dt>
              <dd>{user ? <DateTime iso={user.lastLoginAt} /> : <span className="adm-skeleton" />}</dd>
            </div>
            <div>
              <dt>Last seen</dt>
              <dd>{user ? <RelativeTime iso={user.lastSeenAt} /> : <span className="adm-skeleton" />}</dd>
            </div>
            <div>
              <dt>Active sessions</dt>
              <dd>{user ? user.activeSessions : <span className="adm-skeleton" />}</dd>
            </div>
          </dl>
        </div>

        {user?.status === "paused" && (
          <div className="adm-banner adm-banner--warning" role="status">
            Access is paused{user.pauseReason ? `: ${user.pauseReason}` : "."}{" "}
            {user.pausedUntil ? (
              <>
                Resumes automatically <DateTime iso={user.pausedUntil} />.
              </>
            ) : (
              "Paused until you resume access."
            )}
          </div>
        )}

        <Tabs.Root value={tab} onValueChange={(v) => setTab(parseTab(v))}>
          <Tabs.List className="adm-tabs" aria-label="User details">
            {TABS.map((t) => (
              <Tabs.Tab key={t.value} value={t.value} className="adm-tab">
                {t.label}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          <Tabs.Panel value="profile" style={{ paddingTop: 24 }}>
            {user ? (
              <ProfileForm key={user.updatedAt} user={user} onSaved={(u) => setData({ data: u })} onStale={reload} />
            ) : (
              loading && <div className="adm-card"><span className="adm-skeleton" style={{ width: "40%" }} /></div>
            )}
          </Tabs.Panel>
          <Tabs.Panel value="household" style={{ paddingTop: 24 }}>
            {user && (
              <HouseholdTab
                user={user}
                onChanged={() => {
                  reload();
                  setRefreshKey((k) => k + 1);
                }}
              />
            )}
          </Tabs.Panel>
          <Tabs.Panel value="sessions" style={{ paddingTop: 24 }}>
            {user && (
              <SessionsTab
                key={refreshKey}
                user={user}
                onRevokeAll={() => actions.open("revokeAll", user)}
                onChanged={() => {
                  reload();
                }}
              />
            )}
          </Tabs.Panel>
          <Tabs.Panel value="devices" style={{ paddingTop: 24 }}>
            {user && <DevicesTab key={refreshKey} userId={id} name={user.name} />}
          </Tabs.Panel>
          <Tabs.Panel value="access" style={{ paddingTop: 24 }}>
            {user && <AccessTab key={refreshKey} userId={id} name={user.name} />}
          </Tabs.Panel>
          <Tabs.Panel value="activity" style={{ paddingTop: 24 }}>
            {user && <ActivityTab key={refreshKey} userId={id} name={user.name} />}
          </Tabs.Panel>
          <Tabs.Panel value="audit" style={{ paddingTop: 24 }}>
            <UserAuditTab key={refreshKey} id={id} />
          </Tabs.Panel>
        </Tabs.Root>
      </div>
      {actions.dialogs}
    </>
  );
}

function BackLink() {
  return (
    <Link href="/theadmin/users" className="adm-row adm-muted" style={{ gap: 4, textDecoration: "none", marginBottom: 8 }}>
      <ArrowLeftIcon aria-hidden style={{ width: 16, height: 16 }} />
      Users
    </Link>
  );
}

function ProfileForm({
  user,
  onSaved,
  onStale,
}: {
  user: UserDetail;
  onSaved: (u: UserDetail) => void;
  onStale: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [loginId, setLoginId] = useState(user.loginId);
  const [notes, setNotes] = useState(user.notes);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [pending, setPending] = useState(false);
  const dirty = name !== user.name || loginId !== user.loginId || notes !== user.notes;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (pending || !dirty) return;
    const local: Record<string, string> = {};
    if (!name.trim()) local.name = "Enter a display name.";
    if (!validatePhone(loginId).ok) local.loginId = PHONE_ERROR;
    if (notes.length > 2000) local.notes = "Notes are at most 2000 characters.";
    setFields(local);
    setError(null);
    setStale(false);
    if (Object.keys(local).length) return;
    setPending(true);
    try {
      const res = await adminFetch<{ data: UserDetail }>(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        body: { expectedUpdatedAt: user.updatedAt, name: name.trim(), loginId, notes },
      });
      toast.success("Changes saved");
      onSaved(res.data);
    } catch (err) {
      if (err instanceof ClientApiError) {
        if (Object.keys(err.fields).length) setFields(err.fields);
        else if (err.code === "CONFLICT") setStale(true);
        else setError(err.message);
      } else setError("Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={save} className="adm-card adm-stack" style={{ maxWidth: 640 }} noValidate>
      <Field id="p-name" label="Display name" error={fields.name}>
        <input {...fieldAria("p-name", fields.name)} className="adm-input" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field id="p-login" label="Login ID (US mobile number)" error={fields.loginId}>
        <input
          {...fieldAria("p-login", fields.loginId)}
          className="adm-input adm-mono"
          type="tel"
          inputMode="tel"
          maxLength={14}
          value={loginId}
          onChange={(e) => setLoginId(formatPhoneInput(e.target.value))}
        />
      </Field>
      <Field id="p-notes" label="Notes" error={fields.notes} help="Internal. The user never sees these.">
        <textarea {...fieldAria("p-notes", fields.notes, true)} className="adm-textarea" maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <dl className="adm-dl">
        <div>
          <dt>Created by</dt>
          <dd className="adm-mono">{user.createdBy}</dd>
        </div>
        <div>
          <dt>Password last set</dt>
          <dd>
            <DateTime iso={user.passwordUpdatedAt} />
          </dd>
        </div>
        {user.status === "paused" && (
          <>
            <div>
              <dt>Pause reason</dt>
              <dd>{user.pauseReason || <span className="adm-muted">None given</span>}</dd>
            </div>
            <div>
              <dt>Resumes</dt>
              <dd>{user.pausedUntil ? <DateTime iso={user.pausedUntil} /> : <span className="adm-muted">When you resume access</span>}</dd>
            </div>
          </>
        )}
      </dl>
      {stale && (
        <div className="adm-banner adm-row" role="alert" style={{ justifyContent: "space-between" }}>
          <span>Someone else changed this user. Reload to see the latest details; your edits will be discarded.</span>
          <button type="button" className="adm-btn" onClick={onStale}>
            Reload
          </button>
        </div>
      )}
      {error && <div className="adm-banner" role="alert">{error}</div>}
      <div className="adm-row" style={{ justifyContent: "flex-end" }}>
        <button type="submit" className="adm-btn adm-btn--primary" disabled={pending || !dirty}>
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

const REVOKE_REASONS: Record<string, string> = {
  logout: "Signed out",
  admin: "Revoked by admin",
  password_reset: "Password reset",
  paused: "Access paused",
  deactivated: "Deactivated",
  revoke_all: "All sessions revoked",
  password_changed: "Password changed",
};

function SessionsTab({ user, onRevokeAll, onChanged }: { user: UserDetail; onRevokeAll: () => void; onChanged: () => void }) {
  const list = useCursorList<SessionRow>(`/api/admin/users/${user.id}/sessions`);
  const [revoking, setRevoking] = useState<SessionRow | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const anyActive = list.rows.some((s) => s.status === "active");

  async function revoke() {
    if (!revoking) return;
    setPending(true);
    setError(null);
    try {
      await adminFetch(`/api/admin/users/${user.id}/sessions/${revoking.id}`, { method: "DELETE" });
      toast.success("Session revoked");
      setRevoking(null);
      list.reload();
      onChanged();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="adm-stack" style={{ gap: 16 }}>
      <div className="adm-row" style={{ justifyContent: "space-between" }}>
        <h2 className="adm-h2">Sessions</h2>
        <button type="button" className="adm-btn adm-btn--danger-outline" onClick={onRevokeAll} disabled={!anyActive}>
          Revoke all sessions
        </button>
      </div>
      {list.error && <ErrorBanner message={list.error.message} onRetry={list.reload} />}
      <div className="adm-card adm-card--flush">
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Device</th>
                <th>IP and city</th>
                <th>Created</th>
                <th>Last activity</th>
                <th>Expires</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.loading ? (
                <SkeletonRows columns={7} rows={3} />
              ) : list.rows.length ? (
                list.rows.map((s) => (
                  <tr key={s.id}>
                    <td>{s.deviceLabel}</td>
                    <td>
                      <span className="adm-mono">{s.ip}</span>
                      {s.city && <div className="adm-caption">{s.city}</div>}
                    </td>
                    <td>
                      <DateTime iso={s.createdAt} />
                    </td>
                    <td>
                      <RelativeTime iso={s.lastSeenAt} />
                    </td>
                    <td>{s.status === "active" ? <DateTime iso={s.expiresAt} /> : <span className="adm-muted">None</span>}</td>
                    <td>
                      {s.status === "active" ? (
                        <Badge tone="success">Active</Badge>
                      ) : (
                        <span title={s.revokeReason ? REVOKE_REASONS[s.revokeReason] ?? s.revokeReason : undefined}>
                          <Badge>{s.status === "revoked" ? "Revoked" : "Expired"}</Badge>
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {s.status === "active" && (
                        <button type="button" className="adm-btn adm-btn--danger-outline" onClick={() => setRevoking(s)}>
                          Revoke session
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="adm-empty">
                    {user.name} hasn&apos;t signed in yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <LoadMore list={list} />
      <ConfirmDialog
        open={!!revoking}
        onOpenChange={(o) => !o && setRevoking(null)}
        title="Revoke session"
        body={
          <>
            Sign <strong>{user.name}</strong> out of {revoking?.deviceLabel}? Their other sessions keep working.
          </>
        }
        confirmLabel="Revoke session"
        danger
        pending={pending}
        error={error}
        onConfirm={revoke}
      />
    </div>
  );
}

function UserAuditTab({ id }: { id: string }) {
  const list = useCursorList<AuditRow>(`/api/admin/users/${id}/audit`);
  return (
    <div className="adm-stack" style={{ gap: 16 }}>
      {list.error && <ErrorBanner message={list.error.message} onRetry={list.reload} />}
      <div className="adm-card adm-card--flush">
        <AuditTable rows={list.rows} loading={list.loading} showTarget={false} empty="No admin actions on this user yet." />
      </div>
      <LoadMore list={list} />
    </div>
  );
}
