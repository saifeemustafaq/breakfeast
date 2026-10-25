"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BanIcon, LogOutIcon, MenuIcon, Share2Icon, UsersIcon } from "lucide-react";
import { logout } from "@/app/actions";
import { clearActivity, flush } from "@/components/activity/logger";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/household", label: "Household", icon: UsersIcon, hint: "Share with someone else" },
  { href: "/dislikes", label: "Allergies & dislikes", icon: BanIcon, hint: "Hide breakfasts you won't eat" },
  { href: "/export", label: "Export & share", icon: Share2Icon, hint: "Lists, diary, recipes, calendar, backup" },
] as const;

/** Top bar with the hamburger, and the side menu it opens. */
export function AppMenu({ identity }: { identity?: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  if (pathname === "/login") return null;

  return (
    <>
      <header className="z-20 shrink-0 border-b bg-background pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="mx-auto flex w-full max-w-md items-center gap-2 px-5 pb-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open menu"
            aria-expanded={open}
            onClick={() => setOpen(true)}
            className="-ml-2"
          >
            <MenuIcon />
          </Button>
          <span className="font-heading font-semibold">Breakfeast</span>
        </div>
      </header>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 gap-0">
          <SheetHeader className="gap-1 pt-[max(1rem,env(safe-area-inset-top))]">
            <SheetTitle className="font-heading text-xl">Breakfeast</SheetTitle>
            <p className="text-sm text-muted-foreground">{identity}</p>
          </SheetHeader>

          <nav className="flex flex-col gap-1 p-2">
            {LINKS.map(({ href, label, icon: Icon, hint }) => (
              <Link
                key={href}
                href={href}
                prefetch
                onClick={() => setOpen(false)}
                aria-current={pathname === href ? "page" : undefined}
                className={cn(
                  "flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted",
                  pathname === href && "bg-muted font-medium",
                )}
              >
                <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="flex flex-col">
                  <span>{label}</span>
                  <span className="text-xs text-muted-foreground">{hint}</span>
                </span>
              </Link>
            ))}
          </nav>

          <form
            action={logout}
            onSubmit={() => {
              void flush({ all: true });
              clearActivity();
            }}
            className="mt-auto border-t p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
          >
            <Button
              variant="ghost"
              type="submit"
              className="w-full justify-start gap-3 px-3 py-2.5 font-normal text-muted-foreground"
            >
              <LogOutIcon className="size-5" aria-hidden />
              Sign out
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
