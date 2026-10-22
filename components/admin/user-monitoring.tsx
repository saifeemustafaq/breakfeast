"use client";

import { useEffect, useState } from "react";
import type { AccessRow, ActivityRow, DeviceRow, SessionRow } from "@/lib/admin/serialize";
import { ACCESS_KIND_LABELS, ACTIVITY_TYPE_LABELS } from "@/lib/monitoring/labels";
import { AccessTable } from "./access-table";
import { useCursorList } from "./api";
import { dayEnd, dayStart, formatDate, formatTime, isFailure } from "./format";
import { Badge, DateTime, ErrorBanner, LoadMore, RelativeTime, SkeletonRows } from "./ui";

const withQuery = (base: string, params: Record<string, string>) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  return qs ? `${base}?${qs}` : base;
};

export function DevicesTab({ userId, name }: { userId: string; name: string }) {
  const list = useCursorList<DeviceRow>(`/api/admin/users/${userId}/devices`);
  return (
    <div className="adm-stack" style={{ gap: 16 }}>
      {list.error && <ErrorBanner message={list.error.message} onRetry={list.reload} />}
      <div className="adm-card adm-card--flush">
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Device</th>
                <th>First seen</th>
                <th>Last seen</th>
                <th>Last IP and city</th>
                <th>Accesses</th>
              </tr>
            </thead>
            <tbody>
              {list.loading ? (
                <SkeletonRows columns={5} rows={3} />
              ) : list.rows.length ? (
                list.rows.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <div className="adm-row" style={{ gap: 8 }}>
                        {d.label}
                        {d.isNew && <Badge tone="info">New</Badge>}
                      </div>
                      {d.fingerprint && (
                        <div className="adm-caption adm-mono" title="Browser fingerprint (first 12 characters)">
                          {d.fingerprint}
                        </div>
                      )}
                    </td>
                    <td>
                      <DateTime iso={d.firstSeenAt} />
                    </td>
                    <td>
                      <RelativeTime iso={d.lastSeenAt} />
                    </td>
                    <td>
                      <span className="adm-mono">{d.lastIp}</span>
                      {(d.lastCity || d.lastCountry) && (
                        <div className="adm-caption">{[d.lastCity, d.lastCountry].filter(Boolean).join(", ")}</div>
                      )}
                    </td>
                    <td>{d.accessCount}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="adm-empty">
                    No devices recorded for {name} yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <LoadMore list={list} />
    </div>
  );
}

export function AccessTab({ userId, name }: { userId: string; name: string }) {
  const [kind, setKind] = useState("");
  const [flagged, setFlagged] = useState(false);
  const list = useCursorList<AccessRow>(withQuery(`/api/admin/users/${userId}/access`, { kind, flagged: flagged ? "true" : "" }));
  const filtered = !!kind || flagged;
  return (
    <div className="adm-stack" style={{ gap: 16 }}>
      <div className="adm-row" style={{ gap: 12, alignItems: "flex-end" }}>
        <label className="adm-field" style={{ minWidth: 200 }}>
          <span className="adm-label">Event</span>
          <select className="adm-select" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">All events</option>
            {Object.entries(ACCESS_KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="adm-field adm-row" style={{ gap: 8, minHeight: 40, alignItems: "center" }}>
          <input
            id="access-flagged-only"
            type="checkbox"
            checked={flagged}
            onChange={(e) => setFlagged(e.target.checked)}
          />
          <span className="adm-label">Flagged only</span>
        </label>
      </div>
      <p className="adm-caption">Flags are signals of possible sharing, not proof.</p>
      {list.error && <ErrorBanner message={list.error.message} onRetry={list.reload} />}
      <div className="adm-card adm-card--flush">
        <AccessTable
          rows={list.rows}
          loading={list.loading}
          empty={filtered ? "No access events match these filters." : `No access events for ${name} yet.`}
        />
      </div>
      <LoadMore list={list} />
    </div>
  );
}

type Group = { id: string; rows: ActivityRow[]; start: string; deviceLabel: string | null; errors: number };

/** Newest page load first; events in a page load in the order they happened. */
function groupByPageLoad(rows: ActivityRow[]): Group[] {
  const groups = new Map<string, ActivityRow[]>();
  for (const r of rows) groups.set(r.pageLoadId, [...(groups.get(r.pageLoadId) ?? []), r]);
  return [...groups].map(([id, events]) => {
    const sorted = [...events].sort((a, b) => a.seq - b.seq || a.clientAt.localeCompare(b.clientAt));
    const start = sorted.reduce((min, e) => (e.clientAt < min ? e.clientAt : min), sorted[0].clientAt);
    return { id, rows: sorted, start, deviceLabel: sorted[0].deviceLabel, errors: sorted.filter(isFailure).length };
  });
}

function DataPreview({ data }: { data: ActivityRow["data"] }) {
  const [open, setOpen] = useState(false);
  if (!data || !Object.keys(data).length) return null;
  return (
    <button type="button" className="adm-data" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
      {open ? JSON.stringify(data, null, 2) : JSON.stringify(data)}
    </button>
  );
}

export function ActivityTab({ userId, name }: { userId: string; name: string }) {
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const sessions = useCursorList<SessionRow>(`/api/admin/users/${userId}/sessions`);
  const list = useCursorList<ActivityRow>(
    withQuery(`/api/admin/users/${userId}/activity`, {
      type,
      sessionId,
      q,
      from: from ? dayStart(from) : "",
      to: to ? dayEnd(to) : "",
    }),
  );
  const groups = groupByPageLoad(list.rows);
  const firstError = list.rows.filter(isFailure).sort((a, b) => a.clientAt.localeCompare(b.clientAt))[0];
  const filtered = !!(type || from || to || sessionId || q);

  function jumpToFirstError() {
    if (!firstError) return;
    const row = document.getElementById(`activity-${firstError.id}`);
    const group = row?.closest("details");
    if (group) group.open = true;
    row?.scrollIntoView({ behavior: "smooth", block: "center" });
    row?.focus({ preventScroll: true });
  }

  return (
    <div className="adm-stack" style={{ gap: 16 }}>
      <div className="adm-row" style={{ gap: 12, alignItems: "flex-end" }}>
        <label className="adm-field" style={{ flex: "1 1 180px", maxWidth: 260 }}>
          <span className="adm-label">Search name or target</span>
          <input className="adm-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. cart.added" />
        </label>
        <label className="adm-field">
          <span className="adm-label">Type</span>
          <select className="adm-select" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>
            {Object.entries(ACTIVITY_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="adm-field" style={{ maxWidth: 280 }}>
          <span className="adm-label">Session</span>
          <select className="adm-select" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
            <option value="">All sessions</option>
            {sessions.rows.map((s) => (
              <option key={s.id} value={s.id}>
                {s.deviceLabel}, {formatDate(s.createdAt)}
              </option>
            ))}
          </select>
        </label>
        <label className="adm-field">
          <span className="adm-label">From</span>
          <input className="adm-input" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="adm-field">
          <span className="adm-label">To</span>
          <input className="adm-input" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button type="button" className="adm-btn" onClick={jumpToFirstError} disabled={!firstError}>
          Jump to first error
        </button>
      </div>
      {list.error && <ErrorBanner message={list.error.message} onRetry={list.reload} />}
      {list.loading ? (
        <div className="adm-card">
          <span className="adm-skeleton" style={{ width: "50%" }} />
        </div>
      ) : groups.length ? (
        groups.map((g) => (
          <details key={g.id} className="adm-group" open>
            <summary>
              <strong>
                <DateTime iso={g.start} />
              </strong>
              <span>{g.deviceLabel ?? "Unknown device"}</span>
              <span className="adm-muted">
                {g.rows.length} event{g.rows.length === 1 ? "" : "s"}
              </span>
              {g.errors > 0 && (
                <Badge tone="danger">
                  {g.errors} error{g.errors === 1 ? "" : "s"}
                </Badge>
              )}
            </summary>
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Type</th>
                    <th>Name</th>
                    <th>Target</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((e) => (
                    <tr key={e.id} id={`activity-${e.id}`} tabIndex={-1} className={isFailure(e) ? "adm-tr--danger" : undefined}>
                      <td className="adm-mono" title={e.path}>
                        {formatTime(e.clientAt)}
                      </td>
                      <td>
                        <Badge tone={isFailure(e) ? "danger" : e.type === "workflow" ? "info" : "neutral"}>
                          {ACTIVITY_TYPE_LABELS[e.type] ?? e.type}
                        </Badge>
                      </td>
                      <td>{e.name}</td>
                      <td className="adm-caption adm-mono">{e.target}</td>
                      <td>
                        <DataPreview data={e.data} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ))
      ) : (
        <div className="adm-card adm-empty">{filtered ? "No activity matches these filters." : `No activity for ${name} yet.`}</div>
      )}
      <LoadMore list={list} />
    </div>
  );
}
