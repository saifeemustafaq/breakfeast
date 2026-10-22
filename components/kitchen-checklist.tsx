"use client";

import { useState } from "react";
import { CheckIcon, CookingPotIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { INGREDIENTS, KITCHEN_SPOT, sortByKitchen } from "@/lib/recipes";
import type { CheckStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export type ChecklistItem = { id: string; detail?: string };

export function KitchenChecklist({
  items,
  initial,
  remembered,
  submitLabel = "Continue",
  missingLabel,
  pending,
  onSubmit,
}: {
  items: ChecklistItem[];
  initial: Record<string, CheckStatus | undefined>;
  remembered: Set<string>;
  submitLabel?: string;
  /** When set, crossing off any item lets you continue without checking the rest. */
  missingLabel?: string;
  pending?: boolean;
  onSubmit: (status: Record<string, CheckStatus>) => void;
}) {
  const [status, setStatus] = useState(initial);
  const sorted = sortByKitchen(items);
  const decided = sorted.filter((i) => status[i.id]).length;
  const allDecided = decided === sorted.length;
  const missingCount = sorted.filter((i) => status[i.id] === "missing").length;
  const canExitEarly = !!missingLabel && missingCount > 0;
  const canSubmit = allDecided || canExitEarly;
  const label = canExitEarly ? missingLabel : submitLabel;

  function submit() {
    onSubmit(
      Object.fromEntries(
        Object.entries(status).filter((e): e is [string, CheckStatus] => !!e[1]),
      ),
    );
  }

  function set(id: string, value: CheckStatus) {
    setStatus((s) => ({ ...s, [id]: s[id] === value ? undefined : value }));
  }

  function markRestHave() {
    setStatus((s) => {
      const next = { ...s };
      for (const i of sorted) next[i.id] ??= "have";
      return next;
    });
  }

  const spots = sorted.map((i) => KITCHEN_SPOT[INGREDIENTS[i.id].aisle]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {decided} of {sorted.length} checked
        </span>
        {!allDecided && (
          <Button variant="link" size="sm" className="h-auto p-0" onClick={markRestHave}>
            Mark the rest as here
          </Button>
        )}
      </div>

      <ul className="flex flex-col gap-2">
        {sorted.map((item, idx) => {
          const ing = INGREDIENTS[item.id];
          const header = spots[idx] !== spots[idx - 1] ? spots[idx] : null;
          const s = status[item.id];
          return (
            <li key={item.id} className="flex flex-col gap-2">
              {header && (
                <p className="mt-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {header}
                </p>
              )}
              <div
                className={cn(
                  "flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors",
                  s === "have" && "border-success/40 bg-success/5",
                  s === "missing" && "border-destructive/40 bg-destructive/5",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-tight">{ing.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[item.detail, ing.note].filter(Boolean).join(" · ")}
                  </p>
                  {ing.batch && s === "missing" && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-warning">
                      <CookingPotIcon className="size-3" />
                      Batch-cook task added (~{ing.batch.minutes} min)
                    </p>
                  )}
                  {s === "have" && remembered.has(item.id) && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Remembered from last time. Tap ✕ if it&apos;s gone
                    </p>
                  )}
                </div>
                <div className="flex gap-1.5">
                  <Button
                    size="icon-lg"
                    variant={s === "have" ? "default" : "outline"}
                    className={cn(s === "have" && "bg-success hover:bg-success/90")}
                    aria-label={`Have ${ing.name}`}
                    aria-pressed={s === "have"}
                    onClick={() => set(item.id, "have")}
                  >
                    <CheckIcon />
                  </Button>
                  <Button
                    size="icon-lg"
                    variant={s === "missing" ? "destructive" : "outline"}
                    aria-label={`Out of ${ing.name}`}
                    aria-pressed={s === "missing"}
                    onClick={() => set(item.id, "missing")}
                  >
                    <XIcon />
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="sticky bottom-20 flex flex-col gap-2 bg-background/95 pt-2 pb-1 backdrop-blur">
        <Button
          size="lg"
          className="h-12 text-base"
          disabled={!canSubmit || pending}
          onClick={submit}
        >
          {pending ? "Saving…" : label}
        </Button>
        {!canSubmit && (
          <p className="text-center text-xs text-muted-foreground">
            Tap ✓ or ✕ on {sorted.length - decided === 1 ? "the last item" : `the remaining ${sorted.length - decided} items`} to continue
          </p>
        )}
      </div>
    </div>
  );
}
