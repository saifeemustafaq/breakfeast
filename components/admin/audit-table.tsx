"use client";

import Link from "next/link";
import type { AuditRow } from "@/lib/admin/serialize";
import { actionLabel, formatChangeValue } from "./format";
import { Badge, DateTime, SkeletonRows } from "./ui";

function Changes({ changes }: { changes: AuditRow["changes"] }) {
  const entries = Object.entries(changes);
  if (!entries.length) return <span className="adm-muted">None</span>;
  return (
    <span className="adm-caption" style={{ color: "var(--admin-text)", whiteSpace: "normal" }}>
      {entries.map(([field, { from, to }], i) => (
        <span key={field}>
          {i > 0 && "; "}
          <strong style={{ fontWeight: 500 }}>{field}</strong>:{" "}
          {from === null ? formatChangeValue(to) : `${formatChangeValue(from)} → ${formatChangeValue(to)}`}
        </span>
      ))}
    </span>
  );
}

export function AuditTable({
  rows,
  loading,
  showTarget = true,
  empty = "No audit records yet.",
}: {
  rows: AuditRow[];
  loading: boolean;
  showTarget?: boolean;
  empty?: string;
}) {
  const columns = showTarget ? 6 : 5;
  return (
    <div className="adm-table-wrap">
      <table className="adm-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Actor</th>
            <th>Action</th>
            {showTarget && <th>Target</th>}
            <th>Result</th>
            <th>Changes</th>
          </tr>
        </thead>
        <tbody>
          {loading && !rows.length ? (
            <SkeletonRows columns={columns} />
          ) : rows.length ? (
            rows.map((a) => (
              <tr key={a.id}>
                <td>
                  <DateTime iso={a.at} />
                </td>
                <td>
                  <span className="adm-mono">{a.actorLabel}</span>
                  {a.actorType !== "admin" && (
                    <span style={{ marginLeft: 6 }}>
                      <Badge>{a.actorType === "cli" ? "CLI" : "System"}</Badge>
                    </span>
                  )}
                </td>
                <td>{actionLabel(a.action)}</td>
                {showTarget && (
                  <td>
                    {a.targetType === "user" && a.targetId ? (
                      <Link href={`/theadmin/users/${a.targetId}?tab=audit`}>{a.targetLabel}</Link>
                    ) : a.targetLabel ? (
                      <span className="adm-mono">{a.targetLabel}</span>
                    ) : (
                      <span className="adm-muted">None</span>
                    )}
                  </td>
                )}
                <td>{a.result === "success" ? <Badge tone="success">Success</Badge> : <Badge tone="danger">Failed</Badge>}</td>
                <td style={{ minWidth: 220 }}>
                  <Changes changes={a.changes} />
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns} className="adm-empty">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
