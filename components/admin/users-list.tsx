"use client";

import { ArrowDownIcon, ArrowUpIcon, MoreHorizontalIcon, PlusIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { UserSummary } from "@/lib/admin/serialize";
import { useAdminQuery } from "./api";
import { availableActions, useUserActions } from "./user-actions";
import { ActionMenu, DateTime, ErrorBanner, RelativeTime, SkeletonRows, StatusBadge } from "./ui";

type Page = { data: UserSummary[]; page: number; pageSize: number; total: number };

const SORT_KEYS = ["name", "createdAt", "lastLoginAt", "lastSeenAt"] as const;
type SortKey = (typeof SORT_KEYS)[number];

function isSortKey(v: string): v is SortKey {
  return (SORT_KEYS as readonly string[]).includes(v);
}

function parseSort(raw: string | null): SortKey {
  return raw && isSortKey(raw) ? raw : "createdAt";
}

const COLUMNS = 10;
const STATUSES = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "disabled", label: "Deactivated" },
];

export function UsersListPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const status = params.get("status") ?? "all";
  const sort = parseSort(params.get("sort"));
  const order = params.get("order") ?? (sort === "name" ? "asc" : "desc");
  const page = Math.max(1, Number(params.get("page")) || 1);
  const pageSize = 25;

  const [search, setSearch] = useState(q);
  const [syncedQ, setSyncedQ] = useState(q);
  if (q !== syncedQ) {
    setSyncedQ(q);
    setSearch(q);
  }

  function update(next: Record<string, string | null>) {
    const merged = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === "" || (k === "status" && v === "all") || (k === "page" && v === "1")) merged.delete(k);
      else merged.set(k, v);
    }
    const qs = merged.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  useEffect(() => {
    if (search === q) return;
    const t = setTimeout(() => update({ q: search.trim() || null, page: null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const api = new URLSearchParams({ sort, order, page: String(page), pageSize: String(pageSize) });
  if (q) api.set("q", q);
  if (status !== "all") api.set("status", status);
  const { data, error, loading, reload } = useAdminQuery<Page>(`/api/admin/users?${api}`);
  const actions = useUserActions(() => reload());

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const filtered = !!q || status !== "all";

  function sortBy(key: SortKey) {
    const nextOrder = sort === key ? (order === "asc" ? "desc" : "asc") : key === "name" ? "asc" : "desc";
    update({ sort: key === "createdAt" && nextOrder === "desc" ? null : key, order: nextOrder, page: null });
  }

  function sortHeader(k: SortKey, label: string) {
    const active = sort === k;
    return (
      <th key={k} aria-sort={active ? (order === "asc" ? "ascending" : "descending") : "none"}>
        <button type="button" className="adm-sort" onClick={() => sortBy(k)}>
          {label}
          {active && (order === "asc" ? <ArrowUpIcon aria-hidden /> : <ArrowDownIcon aria-hidden />)}
        </button>
      </th>
    );
  }

  return (
    <>
      <div className="adm-page-head">
        <h1 className="adm-title">Users</h1>
        <Link href="/theadmin/users/new" className="adm-btn adm-btn--primary">
          <PlusIcon aria-hidden />
          Create user
        </Link>
      </div>
      <div className="adm-stack" style={{ gap: 16 }}>
        <div className="adm-row" style={{ gap: 12 }}>
          <div style={{ position: "relative", flex: "1 1 260px", maxWidth: 360 }}>
            <SearchIcon
              aria-hidden
              style={{ position: "absolute", left: 12, top: 12, width: 16, height: 16, color: "var(--admin-text-muted)" }}
            />
            <input
              className="adm-input"
              style={{ paddingLeft: 36 }}
              type="search"
              placeholder="Search name or mobile number"
              aria-label="Search users"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="adm-select"
            style={{ width: "auto" }}
            aria-label="Status"
            value={status}
            onChange={(e) => update({ status: e.target.value, page: null })}
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          {filtered && (
            <button
              type="button"
              className="adm-btn adm-btn--ghost"
              onClick={() => {
                setSearch("");
                update({ q: null, status: null, page: null });
              }}
            >
              Clear filters
            </button>
          )}
          <span className="adm-muted" style={{ marginLeft: "auto" }} aria-live="polite">
            {data ? `${total} ${total === 1 ? "user" : "users"}` : ""}
          </span>
        </div>
        {error && <ErrorBanner message={error.message} onRetry={reload} />}
        <div className="adm-card adm-card--flush">
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  {sortHeader("name", "Name")}
                  <th>Login ID</th>
                  <th>Status</th>
                  {sortHeader("createdAt", "Created")}
                  {sortHeader("lastLoginAt", "Last login")}
                  {sortHeader("lastSeenAt", "Last seen")}
                  <th>Active sessions</th>
                  <th>Flags</th>
                  <th>Household</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading && !data ? (
                  <SkeletonRows columns={COLUMNS} rows={8} />
                ) : data?.data.length ? (
                  data.data.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <Link href={`/theadmin/users/${u.id}`}>{u.name}</Link>
                      </td>
                      <td className="adm-mono">{u.loginId}</td>
                      <td>
                        <StatusBadge status={u.status} />
                      </td>
                      <td>
                        <DateTime iso={u.createdAt} />
                      </td>
                      <td>
                        <DateTime iso={u.lastLoginAt} />
                      </td>
                      <td>
                        <RelativeTime iso={u.lastSeenAt} />
                      </td>
                      <td>{u.activeSessions}</td>
                      <td>
                        {u.flagCount24h ? (
                          <span className="adm-badge adm-badge--warning">{u.flagCount24h}</span>
                        ) : (
                          <span className="adm-muted">0</span>
                        )}
                      </td>
                      <td>
                        {u.householdSize > 1 ? `Shared with ${u.householdSize - 1}` : <span className="adm-muted">Solo</span>}
                      </td>
                      <td>
                        <div className="adm-row" style={{ flexWrap: "nowrap", justifyContent: "flex-end" }}>
                          <Link href={`/theadmin/users/${u.id}`} className="adm-btn adm-btn--ghost">
                            View
                          </Link>
                          <ActionMenu
                            label={`Actions for ${u.name}`}
                            trigger={<MoreHorizontalIcon aria-hidden />}
                            items={availableActions(u.status).map((a) => ({
                              label: a.label,
                              danger: a.danger,
                              onSelect: () => actions.open(a.action, u),
                            }))}
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={COLUMNS} className="adm-empty">
                      {filtered ? (
                        "No users match these filters."
                      ) : (
                        <>
                          No users yet. <Link href="/theadmin/users/new">Create the first one.</Link>
                        </>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {total > pageSize && (
            <div className="adm-pagination">
              <span className="adm-muted">
                Page {page} of {pages}
              </span>
              <div className="adm-row">
                <button
                  type="button"
                  className="adm-btn"
                  disabled={page <= 1 || loading}
                  onClick={() => update({ page: String(page - 1) })}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="adm-btn"
                  disabled={page >= pages || loading}
                  onClick={() => update({ page: String(page + 1) })}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {actions.dialogs}
    </>
  );
}
