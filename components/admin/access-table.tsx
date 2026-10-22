"use client";

import Link from "next/link";
import type { AccessRow } from "@/lib/admin/serialize";
import { ACCESS_KIND_LABELS, FLAG_LABELS, GPS_LABELS } from "@/lib/monitoring/labels";
import type { Flag } from "@/lib/schema";
import { Badge, DateTime, SkeletonRows } from "./ui";

/** Shown as context, not alerts. */
const QUIET_FLAGS = new Set<Flag>(["vpn_or_proxy", "gps_denied"]);

export function FlagBadges({ flags }: { flags: Flag[] }) {
  if (!flags.length) return <span className="adm-muted">None</span>;
  return (
    <span className="adm-flags">
      {flags.map((f) => (
        <Badge key={f} tone={QUIET_FLAGS.has(f) ? "warning" : "danger"}>
          {FLAG_LABELS[f] ?? f}
        </Badge>
      ))}
    </span>
  );
}

export const placeOf = (r: Pick<AccessRow, "city" | "region" | "country">) =>
  [r.city, r.region, r.country].filter(Boolean).join(", ") || null;

function Gps({ gps }: { gps: AccessRow["gps"] }) {
  if (!gps) return <span className="adm-muted">Not reported</span>;
  if (gps.status !== "granted") return <>{GPS_LABELS[gps.status]}</>;
  return <>GPS{gps.accuracyM != null && <span className="adm-caption"> ±{Math.round(gps.accuracyM)} m</span>}</>;
}

export function AccessTable({
  rows,
  loading,
  showUser = false,
  empty,
}: {
  rows: AccessRow[];
  loading: boolean;
  showUser?: boolean;
  empty: string;
}) {
  const columns = showUser ? 8 : 7;
  return (
    <div className="adm-table-wrap">
      <table className="adm-table">
        <thead>
          <tr>
            <th>Time</th>
            {showUser && <th>User</th>}
            <th>Event</th>
            <th>Device</th>
            <th>IP and location</th>
            <th>Location source</th>
            <th>Map</th>
            <th>Flags</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <SkeletonRows columns={columns} rows={4} />
          ) : rows.length ? (
            rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <DateTime iso={r.at} />
                </td>
                {showUser && (
                  <td>
                    {r.userId ? (
                      <Link href={`/theadmin/users/${r.userId}?tab=access`}>{r.userName ?? "Deleted user"}</Link>
                    ) : (
                      <span className="adm-mono adm-muted">{r.loginIdAttempted ?? "Unknown"}</span>
                    )}
                  </td>
                )}
                <td>{ACCESS_KIND_LABELS[r.kind] ?? r.kind}</td>
                <td>{r.deviceLabel}</td>
                <td>
                  <span className="adm-mono">{r.ip}</span>
                  {placeOf(r) && <div className="adm-caption">{placeOf(r)}</div>}
                  {r.isp && <div className="adm-caption">{r.isp}</div>}
                </td>
                <td>
                  <Gps gps={r.gps} />
                </td>
                <td>
                  {r.map ? (
                    <a href={r.map.url} target="_blank" rel="noopener noreferrer">
                      Map <span className="adm-caption">({r.map.source === "gps" ? "GPS" : "IP location"})</span>
                    </a>
                  ) : (
                    <span className="adm-muted">None</span>
                  )}
                </td>
                <td>
                  <FlagBadges flags={r.flags} />
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
