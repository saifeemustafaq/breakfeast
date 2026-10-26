"use client";

import { RecipeBadges } from "@/components/recipe-header";
import type { TodayFlowState } from "@/components/today/use-today-flow";
import { visibleRecipes } from "@/lib/recipes";

export function PickPreppedScreen({ flow }: { flow: TodayFlowState }) {
  const { initial, stock, choiceFor, beginCheck, back } = flow;
  const overnight = visibleRecipes(initial.disliked).filter((r) => r.prep === "overnight");
  return (
    <section className="flex flex-col gap-4">
      {back}
      <h1 className="font-heading text-2xl font-semibold">What did you prep?</h1>
      {overnight.map((r) => (
        <div
          key={r.id}
          className="relative flex flex-col gap-2 rounded-xl border bg-card p-4 transition-colors hover:bg-muted"
        >
          <button
            className="text-left font-medium after:absolute after:inset-0 after:rounded-xl"
            onClick={() => beginCheck(r.id, "morning", choiceFor(r.id))}
          >
            {r.name}
          </button>
          <div className="relative z-10 self-start">
            <RecipeBadges recipe={r} stock={stock} loadedAt={initial.loadedAt} />
          </div>
        </div>
      ))}
    </section>
  );
}
