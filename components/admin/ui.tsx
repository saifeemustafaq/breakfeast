"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Menu } from "@base-ui/react/menu";
import { useEffect, useState } from "react";
import { SEC } from "@/lib/time";
import { formatDate, formatDateTitle, formatRelative } from "./format";
import { usePortalContainer } from "./root";

export type UserStatus = "active" | "paused" | "disabled";

const STATUS: Record<UserStatus, { label: string; tone: string }> = {
  active: { label: "Active", tone: "success" },
  paused: { label: "Paused", tone: "warning" },
  disabled: { label: "Deactivated", tone: "danger" },
};

export function StatusBadge({ status }: { status: UserStatus }) {
  const s = STATUS[status];
  return <span className={`adm-badge adm-badge--${s.tone}`}>{s.label}</span>;
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  children: React.ReactNode;
}) {
  return <span className={`adm-badge adm-badge--${tone}`}>{children}</span>;
}

export function DateTime({ iso, empty = "Never" }: { iso: string | null | undefined; empty?: string }) {
  if (!iso) return <span className="adm-muted">{empty}</span>;
  return (
    <time dateTime={iso} title={formatDateTitle(iso)}>
      {formatDate(iso)}
    </time>
  );
}

/** Re-renders every 30 s so "5 min ago" stays current. */
export function RelativeTime({ iso, empty = "Never" }: { iso: string | null | undefined; empty?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30 * SEC);
    return () => clearInterval(t);
  }, []);
  if (!iso) return <span className="adm-muted">{empty}</span>;
  return (
    <time dateTime={iso} title={formatDateTitle(iso)}>
      {formatRelative(iso, now)}
    </time>
  );
}

export function SkeletonRows({ columns, rows = 5 }: { columns: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} aria-hidden>
          {Array.from({ length: columns }, (_, c) => (
            <td key={c}>
              <span className="adm-skeleton" style={{ width: `${40 + ((r * 7 + c * 13) % 50)}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="adm-banner adm-row" role="alert" style={{ justifyContent: "space-between" }}>
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="adm-btn" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function Field({
  id,
  label,
  error,
  help,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  help?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="adm-field">
      <label className="adm-label" htmlFor={id}>
        {label}
      </label>
      {children}
      {help && !error && (
        <span id={`${id}-help`} className="adm-help">
          {help}
        </span>
      )}
      {error && (
        <span id={`${id}-error`} className="adm-field-error">
          {error}
        </span>
      )}
    </div>
  );
}

/** aria props that connect an input to its Field error/help text. */
export const fieldAria = (id: string, error?: string, hasHelp = false) => ({
  id,
  "aria-invalid": error ? true : undefined,
  "aria-describedby": error ? `${id}-error` : hasHelp ? `${id}-help` : undefined,
});

/** Centered modal. Focus is trapped, Escape closes, and focus returns to the trigger. */
export function AdminDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  dismissible = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  dismissible?: boolean;
}) {
  const container = usePortalContainer();
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (next || dismissible) onOpenChange(next);
      }}
      disablePointerDismissal={!dismissible}
    >
      <Dialog.Portal container={container}>
        <Dialog.Backdrop className="adm-backdrop" />
        <Dialog.Popup className="adm-dialog">
          <Dialog.Title className="adm-dialog-title">{title}</Dialog.Title>
          {description && <Dialog.Description className="adm-muted">{description}</Dialog.Description>}
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  danger,
  pending,
  error,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  pending?: boolean;
  error?: string | null;
  onConfirm: () => void;
  children?: React.ReactNode;
}) {
  return (
    <AdminDialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)} title={title} description={body}>
      <form
        className="adm-stack"
        style={{ gap: 16 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!pending) onConfirm();
        }}
      >
        {children}
        {error && <div className="adm-banner" role="alert">{error}</div>}
        <div className="adm-dialog-actions">
          <button type="button" className="adm-btn" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </button>
          <button type="submit" className={`adm-btn ${danger ? "adm-btn--danger" : "adm-btn--primary"}`} disabled={pending}>
            {pending ? "Working…" : confirmLabel}
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}

export type MenuEntry =
  | { label: string; icon?: React.ReactNode; onSelect: () => void; danger?: boolean }
  | { separator: true };

export function LoadMore({ list }: { list: { hasMore: boolean; loadingMore: boolean; loadMore: () => void } }) {
  if (!list.hasMore) return null;
  return (
    <button type="button" className="adm-btn" onClick={list.loadMore} disabled={list.loadingMore} style={{ alignSelf: "center" }}>
      {list.loadingMore ? "Loading…" : "Load more"}
    </button>
  );
}

export function ActionMenu({ label, trigger, items }: { label: string; trigger: React.ReactNode; items: MenuEntry[] }) {
  const container = usePortalContainer();
  return (
    <Menu.Root>
      <Menu.Trigger className="adm-btn adm-btn--ghost adm-btn--icon" aria-label={label}>
        {trigger}
      </Menu.Trigger>
      <Menu.Portal container={container}>
        <Menu.Positioner sideOffset={4} align="end">
          <Menu.Popup className="adm-menu">
            {items.map((item, i) =>
              "separator" in item ? (
                <Menu.Separator key={i} className="adm-menu-sep" />
              ) : (
                <Menu.Item
                  key={item.label}
                  className={`adm-menu-item${item.danger ? " adm-menu-item--danger" : ""}`}
                  onClick={item.onSelect}
                >
                  {item.icon}
                  {item.label}
                </Menu.Item>
              ),
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
