"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { HouseholdDetail, HouseholdInviteRow } from "@/lib/admin/households";
import type { UserDetail, UserSummary } from "@/lib/admin/serialize";
import { ClientApiError } from "@/lib/api-client";
import { adminFetch, useAdminQuery } from "./api";
import { AdminDialog, ConfirmDialog, DateTime, ErrorBanner, SkeletonRows, StatusBadge } from "./ui";

const people = (n: number) => (n === 1 ? "1 person" : `${n} people`);

export function HouseholdTab({ user, onChanged }: { user: UserDetail; onChanged: () => void }) {
  const { data, error, loading, reload, setData } = useAdminQuery<{ data: HouseholdDetail }>(
    `/api/admin/users/${user.id}/household`,
  );
  const household = data?.data;
  const [removing, setRemoving] = useState(false);
  const [moving, setMoving] = useState(false);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const shared = (household?.members.length ?? 0) > 1;

  async function remove() {
    setPending(true);
    setActionError(null);
    try {
      const res = await adminFetch<{ data: HouseholdDetail }>(`/api/admin/users/${user.id}/household/remove`, {
        method: "POST",
        body: {},
      });
      setData(res);
      setRemoving(false);
      toast.success(`${user.name} now has their own household`);
      onChanged();
    } catch (err) {
      setActionError(err instanceof ClientApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="adm-stack" style={{ gap: 16 }}>
      <div className="adm-row" style={{ justifyContent: "space-between" }}>
        <div>
          <h2 className="adm-h2">Household</h2>
          {household && (
            <div className="adm-caption">
              {shared ? `Shared by ${people(household.members.length)}` : "Solo"}. Members share the pantry, cart,
              plan and breakfast history; ratings stay personal.
            </div>
          )}
        </div>
        <div className="adm-row">
          <button type="button" className="adm-btn" disabled={!household} onClick={() => setMoving(true)}>
            Move to another household
          </button>
          <button
            type="button"
            className="adm-btn adm-btn--danger-outline"
            disabled={!shared}
            onClick={() => {
              setActionError(null);
              setRemoving(true);
            }}
          >
            Remove from household
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error.message} onRetry={reload} />}

      <div className="adm-card adm-card--flush">
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Login ID</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && !household ? (
                <SkeletonRows columns={3} rows={2} />
              ) : (
                household?.members.map((m) => (
                  <tr key={m.id}>
                    <td>
                      {m.id === user.id ? (
                        <>
                          {m.name} <span className="adm-muted">(this user)</span>
                        </>
                      ) : (
                        <Link href={`/theadmin/users/${m.id}`}>{m.name}</Link>
                      )}
                    </td>
                    <td className="adm-mono">{m.loginId}</td>
                    <td>
                      <StatusBadge status={m.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {household && (
        <>
          <InviteTable title="Invites sent from this household" rows={household.sent} empty="No pending invites." />
          <InviteTable
            title={`Invites waiting for ${user.name}`}
            rows={household.received}
            empty={shared ? "None. They can only receive invites while solo." : "No pending invites."}
            showFrom
          />
        </>
      )}

      <ConfirmDialog
        open={removing}
        onOpenChange={(o) => !o && !pending && setRemoving(false)}
        title="Remove from household"
        body={
          <>
            Take <strong>{user.name}</strong> out of this household? They get their own copy of the pantry, cart,
            plan and breakfast history, and their ratings go with them. The other members keep everything else.
          </>
        }
        confirmLabel="Remove from household"
        danger
        pending={pending}
        error={actionError}
        onConfirm={remove}
      />
      {moving && household && (
        <MoveDialog
          user={user}
          householdId={household.householdId}
          shared={shared}
          onClose={() => setMoving(false)}
          onMoved={(next) => {
            setData({ data: next });
            setMoving(false);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function InviteTable({
  title,
  rows,
  empty,
  showFrom,
}: {
  title: string;
  rows: HouseholdInviteRow[];
  empty: string;
  showFrom?: boolean;
}) {
  return (
    <div className="adm-stack" style={{ gap: 8 }}>
      <h3 className="adm-label">{title}</h3>
      <div className="adm-card adm-card--flush">
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>{showFrom ? "From" : "To"}</th>
                <th>{showFrom ? "Sent to" : "Sent by"}</th>
                <th>Sent</th>
                <th>Expires</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((i) => (
                  <tr key={i.id}>
                    <td className={showFrom ? undefined : "adm-mono"}>{showFrom ? i.fromName : i.phone}</td>
                    <td className={showFrom ? "adm-mono" : undefined}>{showFrom ? i.phone : i.fromName}</td>
                    <td>
                      <DateTime iso={i.createdAt} />
                    </td>
                    <td>
                      <DateTime iso={i.expiresAt} />
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="adm-empty">
                    {empty}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MoveDialog({
  user,
  householdId,
  shared,
  onClose,
  onMoved,
}: {
  user: UserDetail;
  householdId: string;
  shared: boolean;
  onClose: () => void;
  onMoved: (next: HouseholdDetail) => void;
}) {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<UserSummary | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQuery(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);

  const results = useAdminQuery<{ data: UserSummary[] }>(
    query ? `/api/admin/users?${new URLSearchParams({ q: query, pageSize: "8", sort: "name" })}` : null,
  );
  const candidates = (results.data?.data ?? []).filter((u) => u.householdId !== householdId);

  async function move() {
    if (!target) return;
    setPending(true);
    setError(null);
    try {
      const res = await adminFetch<{ data: HouseholdDetail }>(`/api/admin/users/${user.id}/household/move`, {
        method: "POST",
        body: { targetUserId: target.id },
      });
      toast.success(`${user.name} moved to ${target.name}'s household`);
      onMoved(res.data);
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AdminDialog
      open
      onOpenChange={(o) => !o && !pending && onClose()}
      title="Move to another household"
      description={`Find someone in the household ${user.name} should join.`}
    >
      {!target ? (
        <div className="adm-stack" style={{ gap: 12 }}>
          <label className="adm-field">
            <span className="adm-label">Search by name or mobile number</span>
            <input className="adm-input" autoFocus value={input} onChange={(e) => setInput(e.target.value)} />
          </label>
          {query && (
            <ul className="adm-stack" style={{ gap: 4, listStyle: "none", padding: 0, margin: 0 }} aria-live="polite">
              {results.loading ? (
                <li className="adm-muted">Searching…</li>
              ) : candidates.length ? (
                candidates.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      className="adm-btn adm-btn--ghost"
                      style={{ width: "100%", justifyContent: "space-between" }}
                      onClick={() => setTarget(u)}
                    >
                      <span>{u.name}</span>
                      <span className="adm-mono adm-muted">
                        {u.loginId} · {u.householdSize > 1 ? people(u.householdSize) : "Solo"}
                      </span>
                    </button>
                  </li>
                ))
              ) : (
                <li className="adm-muted">No one outside this household matches.</li>
              )}
            </ul>
          )}
          <div className="adm-row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="adm-btn" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="adm-stack" style={{ gap: 12 }}>
          <p>
            Move <strong>{user.name}</strong> into <strong>{target.name}</strong>&apos;s household (
            {people(target.householdSize)})?
          </p>
          <ul className="adm-muted" style={{ margin: 0, paddingLeft: 20 }}>
            <li>
              {shared
                ? `${user.name} leaves their current household with a copy of its data, which is then merged in.`
                : `${user.name}'s pantry, cart and history are merged in.`}
            </li>
            <li>Pantry keeps the most recent update, cart items are combined, and their plan for tomorrow is kept only if the household has none.</li>
            <li>Ratings stay personal.</li>
          </ul>
          {error && (
            <div className="adm-banner" role="alert">
              {error}
            </div>
          )}
          <div className="adm-row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="adm-btn" disabled={pending} onClick={() => setTarget(null)}>
              Back
            </button>
            <button type="button" className="adm-btn adm-btn--primary" disabled={pending} onClick={move}>
              {pending ? "Moving…" : "Move user"}
            </button>
          </div>
        </div>
      )}
    </AdminDialog>
  );
}
