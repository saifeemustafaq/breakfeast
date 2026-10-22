"use client";

import { useSyncExternalStore } from "react";
import { MIN } from "@/lib/time";

function subscribe(onChange: () => void) {
  const id = setInterval(onChange, MIN);
  return () => clearInterval(id);
}

/** The phone's local hour, or null while rendering on the server. */
export function useHour() {
  return useSyncExternalStore(
    subscribe,
    () => new Date().getHours(),
    () => null,
  );
}
