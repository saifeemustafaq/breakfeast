"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { AccessRow, ActivityRow } from "@/lib/admin/serialize";
import { ClientApiError } from "@/lib/api-client";
import { ACCESS_KIND_LABELS, ACTIVITY_TYPE_LABELS } from "@/lib/monitoring/labels";
import { SEC } from "@/lib/time";
import { FlagBadges, placeOf } from "./access-table";
import { adminFetch } from "./api";
import { Badge, ErrorBanner, RelativeTime } from "./ui";
import { isFailure } from "./format";

const POLL_MS = 5 * SEC;
const MAX_ROWS = 200;

type Feed = { data: { now: string; activity: ActivityRow[]; access: AccessRow[] } };
type FeedRow =
  | { key: string; at: string; kind: "activity"; row: ActivityRow }
  | { key: string; at: string; kind: "access"; row: AccessRow };

function merge(prev: FeedRow[], feed: Feed["data"]): FeedRow[] {
  const byKey = new Map(prev.map((r) => [r.key, r]));
  for (const row of feed.activity) byKey.set(`a:${row.id}`, { key: `a:${row.id}`, at: row.clientAt, kind: "activity", row });
  for (const row of feed.access) byKey.set(`x:${row.id}`, { key: `x:${row.id}`, at: row.at, kind: "access", row });
  return [...byKey.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, MAX_ROWS);
}

/** Polls every 5 seconds while the tab is visible. Rows are de-duplicated by id across overlapping polls. */
export function LiveActivityPage() {
  const [rows, setRows] = useState<FeedRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const since = useRef<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;

    async function poll() {
      clearTimeout(timer);
      if (stopped || inFlight) return;
      if (document.visibilityState === "visible") {
        inFlight = true;
        try {
          const qs = since.current ? `?since=${encodeURIComponent(since.current)}` : "";
          const res = await adminFetch<Feed>(`/api/admin/feed${qs}`, { headers: { "X-Background-Poll": "1" } });
          since.current = res.data.now;
          setRows((prev) => merge(prev, res.data));
          setError(null);
        } catch (err) {
          setError(err instanceof ClientApiError ? err.message : "Couldn't load the feed.");
        } finally {
          inFlight = false;
          setLoaded(true);
        }
      }
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    }

    const onVisible = () => document.visibilityState === "visible" && void poll();
    document.addEventListener("visibilitychange", onVisible);
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return (
    <>
      <div className="adm-page-head">
        <h1 className="adm-title">Live activity</h1>
        <span className="adm-caption">Updates every 5 seconds while this tab is open</span>
      </div>
      <div className="adm-stack" style={{ gap: 16 }}>
        {error && <ErrorBanner message={error} />}
        <div className="adm-card adm-card--flush">
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>User</th>
                  <th>Type</th>
                  <th>What</th>
                  <th>Where</th>
                </tr>
              </thead>
              <tbody>
                {rows.length ? (
                  rows.map((r) => <FeedLine key={r.key} item={r} />)
                ) : (
                  <tr>
                    <td colSpan={5} className="adm-empty">
                      {loaded ? "No activity yet. New events appear here as they happen." : "Loading…"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

function UserLink({ id, name, tab }: { id: string | null; name: string | null; tab: string }) {
  if (!id) return <span className="adm-muted">Unknown</span>;
  return <Link href={`/theadmin/users/${id}?tab=${tab}`}>{name ?? "Deleted user"}</Link>;
}

function FeedLine({ item }: { item: FeedRow }) {
  if (item.kind === "access") {
    const r = item.row;
    return (
      <tr>
        <td>
          <RelativeTime iso={r.at} />
        </td>
        <td>
          {r.userId ? <UserLink id={r.userId} name={r.userName} tab="access" /> : <span className="adm-mono">{r.loginIdAttempted}</span>}
        </td>
        <td>
          <Badge tone={r.kind === "login_failure" ? "danger" : "info"}>Access</Badge>
        </td>
        <td>
          <div>{ACCESS_KIND_LABELS[r.kind] ?? r.kind}</div>
          {r.flags.length > 0 && <FlagBadges flags={r.flags} />}
        </td>
        <td>
          {r.deviceLabel}
          <div className="adm-caption">
            <span className="adm-mono">{r.ip}</span>
            {placeOf(r) && `, ${placeOf(r)}`}
          </div>
        </td>
      </tr>
    );
  }
  const r = item.row;
  const failed = isFailure(r);
  return (
    <tr className={failed ? "adm-tr--danger" : undefined}>
      <td>
        <RelativeTime iso={r.clientAt} />
      </td>
      <td>
        <UserLink id={r.userId} name={r.userName} tab="activity" />
      </td>
      <td>
        <Badge tone={failed ? "danger" : r.type === "workflow" ? "info" : "neutral"}>{ACTIVITY_TYPE_LABELS[r.type] ?? r.type}</Badge>
      </td>
      <td>
        {r.name}
        {r.target && <div className="adm-caption adm-mono">{r.target}</div>}
      </td>
      <td>
        {r.deviceLabel ?? <span className="adm-muted">Unknown device</span>}
        <div className="adm-caption adm-mono">{r.path}</div>
      </td>
    </tr>
  );
}
