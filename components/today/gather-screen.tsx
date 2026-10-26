"use client";

import { ArrowRightIcon, PlusIcon, SkipForwardIcon, Undo2Icon, XIcon } from "lucide-react";
import { AddOnceDialog } from "@/components/addition-picker";
import type { Step } from "@/components/flow-session";
import type { TodayFlowState } from "@/components/today/use-today-flow";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { recipeItems, type CheckScope, type Ingredient, type Recipe } from "@/lib/recipes";
import { cn } from "@/lib/utils";
import { MAX_ADDITIONS } from "@/lib/versions";

export function GatherScreen({
  flow,
  step,
}: {
  flow: TodayFlowState;
  step: Extract<Step, { name: "gather" }>;
}) {
  const {
    initial,
    stock,
    addingOnce,
    setAddingOnce,
    ingredients,
    making,
    roomFor,
    progressFor,
    tick,
    noteCard,
    go,
    back,
  } = flow;
  const recipe = making(step.recipeId);
  const p = progressFor(recipe.id);
  const room = roomFor(recipe.id);
  return (
    <section className="flex flex-col gap-5">
      {back}
      <div>
        <p className="text-xs font-semibold tracking-wide text-primary uppercase">
          {step.scope === "night" ? "Tonight's prep" : "Take out and measure"}
        </p>
        <h1 className="font-heading text-2xl font-semibold">{recipe.name}</h1>
      </div>
      {noteCard(recipe.id)}
      <GatherList
        recipe={recipe}
        scope={step.scope}
        ingredients={ingredients}
        taken={p.taken}
        onChange={(taken) => tick(recipe.id, { taken })}
        skipped={p.skipped ?? []}
        onSkip={(skipped) => tick(recipe.id, { skipped })}
        onRemoveExtra={(id) =>
          tick(recipe.id, {
            extras: (p.extras ?? []).filter((a) => a.ingredientId !== id),
            taken: p.taken.filter((t) => t !== id),
          })
        }
        lastSkipped={initial.skips[recipe.id]?.last ?? []}
      />
      {room > 0 ? (
        <Button variant="outline" className="h-11 border-dashed" onClick={() => setAddingOnce(true)}>
          <PlusIcon />
          Add something just this time
        </Button>
      ) : (
        <p className="text-center text-xs text-muted-foreground">
          Up to {MAX_ADDITIONS} extras per breakfast
        </p>
      )}
      <AddOnceDialog
        open={addingOnce}
        onOpenChange={setAddingOnce}
        recipe={recipe}
        state={{
          custom: initial.custom,
          disliked: initial.disliked,
          stock,
        }}
        when={step.scope === "night" ? "night" : "morning"}
        onAdd={(a) => tick(recipe.id, { extras: [...(p.extras ?? []), a] })}
      />
      <Button
        size="lg"
        className="h-12 text-base"
        onClick={() =>
          go({
            name: "steps",
            recipeId: recipe.id,
            night: step.scope === "night",
          })
        }
      >
        Everything&apos;s out
        <ArrowRightIcon />
      </Button>
    </section>
  );
}

/** Tick each ingredient as it comes out, or skip it this time (remembered for next time). */
function GatherList({
  recipe,
  scope,
  ingredients,
  taken,
  onChange,
  skipped,
  onSkip,
  onRemoveExtra,
  lastSkipped,
}: {
  recipe: Recipe;
  scope: CheckScope;
  ingredients: Record<string, Ingredient>;
  taken: string[];
  onChange: (taken: string[]) => void;
  skipped: string[];
  onSkip: (skipped: string[]) => void;
  onRemoveExtra: (id: string) => void;
  lastSkipped: string[];
}) {
  const items = recipeItems(recipe, scope);
  return (
    <ul className="flex flex-col divide-y rounded-xl border bg-card">
      {items.map((ri) => {
        const name = ingredients[ri.id]?.name ?? ri.id;
        const isSkipped = skipped.includes(ri.id);
        const isTaken = taken.includes(ri.id);
        return (
          <li key={ri.id} className={cn("flex items-center gap-2 pr-2", isSkipped && "bg-muted/50")}>
            <label
              className={cn(
                "flex min-w-0 flex-1 items-center gap-3 p-3",
                isSkipped ? "cursor-default" : "cursor-pointer",
              )}
            >
              <Checkbox
                checked={isTaken && !isSkipped}
                disabled={isSkipped}
                onCheckedChange={(v) =>
                  onChange(v ? [...taken, ri.id] : taken.filter((id) => id !== ri.id))
                }
                className="size-5"
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={cn((isTaken || isSkipped) && "text-muted-foreground line-through")}>
                  {name}
                  {ri.added && (
                    <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary no-underline">
                      {ri.oneOff ? "Just this time" : "Added"}
                    </span>
                  )}
                </span>
                {isSkipped ? (
                  <span className="text-xs text-muted-foreground">Skipping this time</span>
                ) : (
                  lastSkipped.includes(ri.id) && (
                    <span className="text-xs text-warning">Skipped last time</span>
                  )
                )}
              </span>
              <span
                className={cn(
                  "text-right text-sm font-medium tabular-nums",
                  isSkipped && "text-muted-foreground",
                )}
              >
                {ri.qty}
              </span>
            </label>
            {ri.oneOff ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 shrink-0 text-muted-foreground"
                aria-label={`Remove ${name}`}
                onClick={() => onRemoveExtra(ri.id)}
              >
                <XIcon />
                Remove
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 shrink-0 text-muted-foreground"
                aria-label={isSkipped ? `Don't skip ${name}` : `Skip ${name}`}
                onClick={() => {
                  onSkip(isSkipped ? skipped.filter((id) => id !== ri.id) : [...skipped, ri.id]);
                  if (!isSkipped && isTaken) onChange(taken.filter((id) => id !== ri.id));
                }}
              >
                {isSkipped ? <Undo2Icon /> : <SkipForwardIcon />}
                {isSkipped ? "Undo" : "Skip"}
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
