"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Menu } from "@base-ui/react/menu";
import {
  ActivityIcon,
  ChevronDownIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MenuIcon,
  ScrollTextIcon,
  ShieldAlertIcon,
  UserCircleIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ClientApiError } from "@/lib/api-client";
import { SEC } from "@/lib/time";
import { adminFetch } from "./api";
import { ChangePasswordDialog } from "./passwords";
import { ReauthCancelled, useWithReauth } from "./reauth";
import { usePortalContainer } from "./root";

type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean; badged?: boolean };

const NAV: NavItem[] = [
  { href: "/theadmin", label: "Overview", icon: LayoutDashboardIcon, exact: true },
  { href: "/theadmin/users", label: "Users", icon: UsersIcon },
  { href: "/theadmin/activity", label: "Live activity", icon: ActivityIcon },
  { href: "/theadmin/alerts", label: "Alerts", icon: ShieldAlertIcon, badged: true },
  { href: "/theadmin/audit", label: "Audit log", icon: ScrollTextIcon },
];

const BADGE_POLL_MS = 30 * SEC;

/** Flagged access events in the last 24 hours, refreshed in the background while the tab is visible. */
function useAlertCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let stopped = false;
    async function load() {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await adminFetch<{ last24h: number }>("/api/admin/alerts?countOnly=1", { headers: { "X-Background-Poll": "1" } });
        if (!stopped) setCount(res.last24h);
      } catch {
        // The badge is a hint; the Alerts page shows errors.
      }
    }
    void load();
    const timer = setInterval(load, BADGE_POLL_MS);
    document.addEventListener("visibilitychange", load);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, []);
  return count;
}

function Nav({ onNavigate, alertCount }: { onNavigate?: () => void; alertCount: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="adm-nav">
      {NAV.map(({ href, label, icon: Icon, exact, badged }) => {
        const badge = badged ? alertCount : 0;
        const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className="adm-nav-item"
            aria-current={active ? "page" : undefined}
            onClick={onNavigate}
          >
            <Icon aria-hidden />
            {label}
            {!!badge && (
              <span className="adm-nav-count" aria-label={`${badge} in the last 24 hours`}>
                {badge > 99 ? "99+" : badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminShell({ adminId, children }: { adminId: string; children: React.ReactNode }) {
  const container = usePortalContainer();
  const withReauth = useWithReauth();
  const [drawer, setDrawer] = useState(false);
  const [changing, setChanging] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const alertCount = useAlertCount();

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await adminFetch("/api/admin/auth/logout", { body: {} });
    } catch {
      // The session is gone either way; returning to sign-in is the right outcome.
    }
    window.location.replace("/theadmin");
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    try {
      await withReauth(() => adminFetch("/api/admin/auth/change-password", { body: { currentPassword, newPassword } }));
      window.location.replace("/theadmin?reason=password-changed");
      return null;
    } catch (err) {
      if (err instanceof ReauthCancelled) return "Password not changed.";
      if (err instanceof ClientApiError) {
        if (Object.keys(err.fields).length) return err.fields;
        return err.message;
      }
      toast.error("Something went wrong.");
      return "Something went wrong. Try again.";
    }
  }

  return (
    <div className="adm-shell">
      <header className="adm-header">
        <button
          type="button"
          className="adm-btn adm-btn--ghost adm-btn--icon adm-menu-button"
          aria-label="Open navigation"
          onClick={() => setDrawer(true)}
        >
          <MenuIcon aria-hidden />
        </button>
        <Link href="/theadmin" className="adm-brand">
          Breakfeast
          <span className="adm-caption" style={{ fontWeight: 400 }}>
            Admin
          </span>
        </Link>
        <div style={{ marginLeft: "auto" }}>
          <Menu.Root>
            <Menu.Trigger className="adm-btn adm-btn--ghost" aria-label={`Account menu for ${adminId}`}>
              <UserCircleIcon aria-hidden />
              <span className="adm-mono">{adminId}</span>
              <ChevronDownIcon aria-hidden />
            </Menu.Trigger>
            <Menu.Portal container={container}>
              <Menu.Positioner sideOffset={4} align="end">
                <Menu.Popup className="adm-menu">
                  <div className="adm-menu-label">
                    Signed in as <span className="adm-mono">{adminId}</span>
                  </div>
                  <Menu.Item className="adm-menu-item" onClick={() => setChanging(true)}>
                    <KeyRoundIcon aria-hidden />
                    Change password
                  </Menu.Item>
                  <Menu.Item className="adm-menu-item" onClick={signOut}>
                    <LogOutIcon aria-hidden />
                    Sign out
                  </Menu.Item>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </div>
      </header>
      <aside className="adm-sidebar adm-sidebar--desktop">
        <Nav alertCount={alertCount} />
      </aside>
      <Dialog.Root open={drawer} onOpenChange={setDrawer}>
        <Dialog.Portal container={container}>
          <Dialog.Backdrop className="adm-drawer-backdrop" />
          <Dialog.Popup className="adm-drawer" aria-label="Navigation">
            <Dialog.Title className="adm-brand" style={{ padding: "8px 12px 16px" }}>
              Breakfeast
            </Dialog.Title>
            <Nav alertCount={alertCount} onNavigate={() => setDrawer(false)} />
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
      <main className="adm-content">{children}</main>
      <ChangePasswordDialog open={changing} onOpenChange={setChanging} onSubmit={changePassword} />
    </div>
  );
}
