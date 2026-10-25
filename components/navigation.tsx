"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** The one element that scrolls; the document itself never does, so the header and tab bar can't move. */
export const APP_SCROLL_ID = "app-scroll";

const nav = { depth: 0, popped: false };
const positions = new Map<string, number>();

const scroller = () => document.getElementById(APP_SCROLL_ID);
const here = () => location.pathname + location.search;

export function scrollAppToTop() {
  scroller()?.scrollTo({ top: 0 });
}

/**
 * Counts in-app navigations so Back knows whether `router.back()` stays inside the app,
 * and puts a list back where you left it when you return with Back.
 */
export function NavTracker() {
  const pathname = usePathname();
  const last = useRef<string | null>(null);

  useEffect(() => {
    const el = scroller();
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (el) positions.set(here(), el.scrollTop);
      });
    };
    const onPop = () => {
      nav.popped = true;
    };
    el?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("popstate", onPop);
    return () => {
      cancelAnimationFrame(frame);
      el?.removeEventListener("scroll", onScroll);
      window.removeEventListener("popstate", onPop);
    };
  }, []);

  useLayoutEffect(() => {
    const previous = last.current;
    last.current = pathname;
    if (previous === null || previous === pathname) return;
    if (!nav.popped) {
      nav.depth += 1;
      return;
    }
    nav.popped = false;
    nav.depth = Math.max(0, nav.depth - 1);
    const top = positions.get(here());
    if (top !== undefined) requestAnimationFrame(() => scroller()?.scrollTo({ top }));
  }, [pathname]);

  return null;
}

/**
 * One step back. With `onClick` it steps back inside a flow; otherwise it goes to the previous
 * screen, or to `fallback` when the app was opened straight onto this page.
 */
export function BackButton({
  label = "Back",
  onClick,
  fallback = "/",
}: {
  label?: string;
  onClick?: () => void;
  fallback?: string;
}) {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2 h-10 self-start text-muted-foreground"
      onClick={() => {
        if (onClick) onClick();
        else goBack(router, fallback);
      }}
    >
      <ArrowLeftIcon />
      {label}
    </Button>
  );
}

export function goBack(router: ReturnType<typeof useRouter>, fallback: string) {
  if (nav.depth > 0) router.back();
  else router.push(fallback);
}
