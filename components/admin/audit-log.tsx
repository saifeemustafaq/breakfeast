"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { AuditRow } from "@/lib/admin/serialize";
import { useCursorList } from "./api";
import { AuditTable } from "./audit-table";
import { ACTION_LABELS, dayEnd, dayStart } from "./format";
import { ErrorBanner, LoadMore } from "./ui";

export function AuditLogPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const actor = params.get("actor") ?? "";
  const action = params.get("action") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const targetId = params.get("targetId") ?? "";
  const [actorInput, setActorInput] = useState(actor);
  const [syncedActor, setSyncedActor] = useState(actor);
  if (actor !== syncedActor) {
    setSyncedActor(actor);
    setActorInput(actor);
  }

  function update(next: Record<string, string | null>) {
    const merged = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (!v) merged.delete(k);
      else merged.set(k, v);
    }
    const qs = merged.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  useEffect(() => {
    if (actorInput === actor) return;
    const t = setTimeout(() => update({ actor: actorInput.trim() || null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actorInput]);

  const api = new URLSearchParams();
  if (actor) api.set("actor", actor);
  if (action) api.set("action", action);
  if (from) api.set("from", dayStart(from));
  if (to) api.set("to", dayEnd(to));
  if (targetId) api.set("targetId", targetId);
  const qs = api.toString();
  const list = useCursorList<AuditRow>(`/api/admin/audit${qs ? `?${qs}` : ""}`);
  const filtered = !!(actor || action || from || to || targetId);

  return (
    <>
      <div className="adm-page-head">
        <h1 className="adm-title">Audit log</h1>
      </div>
      <div className="adm-stack" style={{ gap: 16 }}>
        <div className="adm-row" style={{ gap: 12, alignItems: "flex-end" }}>
          <label className="adm-field" style={{ flex: "1 1 180px", maxWidth: 240 }}>
            <span className="adm-label">Actor</span>
            <input
              className="adm-input adm-mono"
              placeholder="Admin ID, cli or system"
              value={actorInput}
              onChange={(e) => setActorInput(e.target.value)}
            />
          </label>
          <label className="adm-field" style={{ flex: "1 1 200px", maxWidth: 260 }}>
            <span className="adm-label">Action</span>
            <select className="adm-select" value={action} onChange={(e) => update({ action: e.target.value || null })}>
              <option value="">All actions</option>
              {Object.entries(ACTION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="adm-field">
            <span className="adm-label">From</span>
            <input className="adm-input" type="date" value={from} max={to || undefined} onChange={(e) => update({ from: e.target.value || null })} />
          </label>
          <label className="adm-field">
            <span className="adm-label">To</span>
            <input className="adm-input" type="date" value={to} min={from || undefined} onChange={(e) => update({ to: e.target.value || null })} />
          </label>
          {filtered && (
            <button
              type="button"
              className="adm-btn adm-btn--ghost"
              onClick={() => {
                setActorInput("");
                router.replace(pathname, { scroll: false });
              }}
            >
              Clear filters
            </button>
          )}
        </div>
        {list.error && <ErrorBanner message={list.error.message} onRetry={list.reload} />}
        <div className="adm-card adm-card--flush">
          <AuditTable
            rows={list.rows}
            loading={list.loading}
            empty={filtered ? "No audit records match these filters." : "No audit records yet."}
          />
        </div>
        <LoadMore list={list} />
      </div>
    </>
  );
}
