"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AccessRow } from "@/lib/admin/serialize";
import { FLAG_LABELS } from "@/lib/monitoring/labels";
import { AccessTable } from "./access-table";
import { useCursorList } from "./api";
import { ErrorBanner, LoadMore } from "./ui";

export function AlertsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const flag = params.get("flag") ?? "";
  const list = useCursorList<AccessRow>(flag ? `/api/admin/alerts?flag=${encodeURIComponent(flag)}` : "/api/admin/alerts");

  return (
    <>
      <div className="adm-page-head">
        <h1 className="adm-title">Alerts</h1>
      </div>
      <div className="adm-stack" style={{ gap: 16 }}>
        <div className="adm-row" style={{ gap: 12, alignItems: "flex-end" }}>
          <label className="adm-field" style={{ minWidth: 240 }}>
            <span className="adm-label">Flag</span>
            <select
              className="adm-select"
              value={flag}
              onChange={(e) => router.replace(e.target.value ? `${pathname}?flag=${e.target.value}` : pathname, { scroll: false })}
            >
              <option value="">All flags</option>
              {Object.entries(FLAG_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="adm-caption">Flags are signals of possible sharing, not proof. Open a user to see the full access history.</p>
        {list.error && <ErrorBanner message={list.error.message} onRetry={list.reload} />}
        <div className="adm-card adm-card--flush">
          <AccessTable
            rows={list.rows}
            loading={list.loading}
            showUser
            empty={flag ? "No access events with this flag." : "No flagged access events."}
          />
        </div>
        <LoadMore list={list} />
      </div>
    </>
  );
}
