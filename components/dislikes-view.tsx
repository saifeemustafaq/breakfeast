"use client";

import { useState, useTransition } from "react";
import { BanIcon } from "lucide-react";
import { setDisliked } from "@/app/preferences-actions";
import { toast } from "@/components/activity/toast";
import { BackButton } from "@/components/navigation";
import { SearchField } from "@/components/search-field";
import { Checkbox } from "@/components/ui/checkbox";
import { failureMessage, unwrap } from "@/lib/action-result";
import { AISLE_ORDER, DISLIKABLE, RECIPES, dislikedIn } from "@/lib/recipes";
import { matchesQuery } from "@/lib/search";
import type { AppState } from "@/lib/types";

export function DislikesView({ initial }: { initial: AppState }) {
  const [disliked, setLocal] = useState(() => new Set(initial.disliked));
  const [query, setQuery] = useState("");
  const [, startTransition] = useTransition();

  const hidden = RECIPES.filter((r) => dislikedIn(r, disliked).length > 0).length;
  const off = DISLIKABLE.filter((i) => disliked.has(i.id));
  const rest = DISLIKABLE.filter((i) => !disliked.has(i.id) && matchesQuery(query, i.name, i.aisle));

  function toggle(id: string, value: boolean) {
    const previous = disliked;
    const next = new Set(previous);
    if (value) next.add(id);
    else next.delete(id);
    setLocal(next);
    startTransition(async () => {
      try {
        await unwrap(setDisliked([...next]));
      } catch (err) {
        setLocal(previous);
        toast.error(failureMessage(err));
      }
    });
  }

  const row = (id: string, name: string) => (
    <li key={id} className="flex items-center gap-3 p-3">
      <Checkbox
        className="size-5"
        checked={disliked.has(id)}
        aria-label={`Avoid ${name}`}
        onCheckedChange={(v) => toggle(id, !!v)}
      />
      <span className="min-w-0 flex-1 leading-tight">{name}</span>
    </li>
  );

  return (
    <section className="flex flex-col gap-6">
      <BackButton />
      <div className="-mt-4">
        <h1 className="font-heading text-3xl font-semibold">Allergies &amp; dislikes</h1>
        <p className="mt-1 text-muted-foreground">
          Tick anything you can&apos;t or won&apos;t eat. Breakfasts using it are hidden from
          suggestions, planning and the recipe list. This list is yours alone, not your
          household&apos;s.
        </p>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
        <BanIcon className="size-4 shrink-0 text-warning" />
        <p>
          {off.length === 0
            ? "Nothing is off the list yet."
            : `${off.length} ${off.length === 1 ? "ingredient" : "ingredients"} off the list, hiding ${hidden} of ${RECIPES.length} breakfasts.`}
        </p>
      </div>

      {off.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold tracking-wide text-warning uppercase">
            Off the list
          </p>
          <ul className="flex flex-col divide-y rounded-xl border border-warning/30 bg-card">
            {off.map((i) => row(i.id, i.name))}
          </ul>
        </div>
      )}

      <SearchField
        value={query}
        onChange={setQuery}
        label="Search ingredients"
        placeholder="Search ingredients"
      />

      {rest.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {query.trim() ? `No ingredients match "${query.trim()}".` : "Everything is off the list."}
        </p>
      )}

      {AISLE_ORDER.map((aisle) => {
        const group = rest.filter((i) => i.aisle === aisle);
        if (!group.length) return null;
        return (
          <div key={aisle} className="flex flex-col gap-2">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {aisle}
            </p>
            <ul className="flex flex-col divide-y rounded-xl border bg-card">
              {group.map((i) => row(i.id, i.name))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
