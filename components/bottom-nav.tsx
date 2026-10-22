"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenIcon, CalendarDaysIcon, PackageIcon, ShoppingCartIcon, SunIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Today", icon: SunIcon },
  { href: "/recipes", label: "Recipes", icon: BookOpenIcon },
  { href: "/plan", label: "Plan", icon: CalendarDaysIcon },
  { href: "/cart", label: "Cart", icon: ShoppingCartIcon },
  { href: "/pantry", label: "Pantry", icon: PackageIcon },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  if (pathname === "/login") return null;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href ||
            (href === "/recipes" && (pathname.startsWith("/recipes/") || pathname === "/insights"));
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-xs text-muted-foreground transition-colors",
                  active && "font-medium text-primary",
                )}
              >
                <Icon className="size-5" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
