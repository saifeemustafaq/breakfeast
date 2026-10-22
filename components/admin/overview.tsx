"use client";

import { PlusIcon } from "lucide-react";
import Link from "next/link";
import type { AuditRow, UserSummary } from "@/lib/admin/serialize";
import { useAdminQuery } from "./api";
import { actionLabel } from "./format";
import { DateTime, ErrorBanner, RelativeTime, SkeletonRows, StatusBadge } from "./ui";

type Overview = {
  counts: { total: number; active: number; paused: number; disabled: number; activeNow: number; alerts24h: number };
  recentAudit: AuditRow[];
  recentUsers: UserSummary[];
};

function Stat({ label, value, href }: { label: string; value: number | undefined; href?: string }) {
  const body = (
    <>
      <div className="adm-muted">{label}</div>
      <div className="adm-stat-value">{value ?? <span className="adm-skeleton" style={{ width: 48, height: 28 }} />}</div>
    </>
  );
  return href ? (
    <Link href={href} className="adm-card" style={{ color: "inherit", textDecoration: "none" }}>
      {body}
    </Link>
  ) : (
    <div className="adm-card">{body}</div>
  );
}

export function OverviewPage() {
  const { data, error, loading, reload } = useAdminQuery<{ data: Overview }>("/api/admin/overview");
  const o = data?.data;
  return (
    <>
      <div className="adm-page-head">
        <h1 className="adm-title">Overview</h1>
        <Link href="/theadmin/users/new" className="adm-btn adm-btn--primary">
          <PlusIcon aria-hidden />
          Create user
        </Link>
      </div>
      <div className="adm-stack">
        {error && <ErrorBanner message={error.message} onRetry={reload} />}
        <div className="adm-grid-cards">
          <Stat label="Total users" value={o?.counts.total} href="/theadmin/users" />
          <Stat label="Active" value={o?.counts.active} href="/theadmin/users?status=active" />
          <Stat label="Paused" value={o?.counts.paused} href="/theadmin/users?status=paused" />
          <Stat label="Deactivated" value={o?.counts.disabled} href="/theadmin/users?status=disabled" />
        </div>
        <div className="adm-grid-cards">
          <Stat label="Active now (seen in the last 15 minutes)" value={o?.counts.activeNow} href="/theadmin/activity" />
          <Stat label="Alerts in the last 24 hours" value={o?.counts.alerts24h} href="/theadmin/alerts" />
        </div>
        <div className="adm-grid-2">
          <section className="adm-card adm-card--flush" aria-labelledby="recent-audit">
            <div className="adm-card-head">
              <h2 id="recent-audit" className="adm-h2">
                Recent admin actions
              </h2>
              <Link href="/theadmin/audit">View all</Link>
            </div>
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Actor</th>
                    <th>Action</th>
                    <th>Target</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && !o ? (
                    <SkeletonRows columns={4} />
                  ) : o?.recentAudit.length ? (
                    o.recentAudit.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <DateTime iso={a.at} />
                        </td>
                        <td className="adm-mono">{a.actorLabel}</td>
                        <td>
                          {actionLabel(a.action)}
                          {a.result === "failure" && <span className="adm-badge adm-badge--danger" style={{ marginLeft: 8 }}>Failed</span>}
                        </td>
                        <td>
                          {a.targetType === "user" && a.targetId ? (
                            <Link href={`/theadmin/users/${a.targetId}`}>{a.targetLabel}</Link>
                          ) : (
                            (a.targetLabel ?? <span className="adm-muted">None</span>)
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="adm-empty">
                        No admin actions yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
          <section className="adm-card adm-card--flush" aria-labelledby="recent-users">
            <div className="adm-card-head">
              <h2 id="recent-users" className="adm-h2">
                Recently created users
              </h2>
              <Link href="/theadmin/users">View all</Link>
            </div>
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && !o ? (
                    <SkeletonRows columns={4} />
                  ) : o?.recentUsers.length ? (
                    o.recentUsers.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <Link href={`/theadmin/users/${u.id}`}>{u.name}</Link>
                          <div className="adm-caption adm-mono">{u.loginId}</div>
                        </td>
                        <td>
                          <StatusBadge status={u.status} />
                        </td>
                        <td>
                          <DateTime iso={u.createdAt} />
                        </td>
                        <td>
                          <RelativeTime iso={u.lastSeenAt} />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="adm-empty">
                        No users yet. <Link href="/theadmin/users/new">Create the first one.</Link>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
