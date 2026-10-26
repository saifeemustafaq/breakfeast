"use client";

import type { Step } from "@/components/flow-session";
import { KitchenChecklist } from "@/components/kitchen-checklist";
import type { TodayFlowState } from "@/components/today/use-today-flow";
import { checkableIds, recipeItems } from "@/lib/recipes";
import { rememberedInStock } from "@/lib/stock";

export function CheckScreen({
  flow,
  step,
}: {
  flow: TodayFlowState;
  step: Extract<Step, { name: "check" }>;
}) {
  const { initial, mode, session, stock, pending, ingredients, making, submitCheck, back } = flow;
  const recipe = making(step.recipeId);
  const ids = checkableIds(recipe, step.scope);
  const qty = Object.fromEntries(recipeItems(recipe, step.scope).map((ri) => [ri.id, ri]));
  const remembered = new Set(
    ids.filter((id) => !session[id] && rememberedInStock(id, stock, initial.loadedAt)),
  );
  const initialStatus = Object.fromEntries(
    ids.map((id) => [id, session[id] ?? (remembered.has(id) ? "have" : undefined)]),
  );
  return (
    <section className="flex flex-col gap-5">
      {back}
      <div>
        <p className="text-xs font-semibold tracking-wide text-primary uppercase">Kitchen check</p>
        <h1 className="font-heading text-2xl font-semibold">{recipe.name}</h1>
        <p className="mt-1 text-muted-foreground">
          {step.scope === "morning"
            ? "Just the morning toppings and add-ins."
            : mode === "tonight" && recipe.prep === "overnight"
              ? "Tonight's prep plus tomorrow's toppings, so nothing's missing in the morning."
              : "Tick what you have; mark what you're out of."}
        </p>
      </div>
      <KitchenChecklist
        key={`${step.recipeId}-${step.scope}`}
        items={ids.map((id) => ({
          id,
          detail:
            qty[id]?.qty +
            (mode === "tonight" && qty[id]?.when === "morning" ? " · for the morning" : ""),
        }))}
        initial={initialStatus}
        remembered={remembered}
        knownInStock={(id) => rememberedInStock(id, stock, initial.loadedAt)}
        missingLabel="Add missing to cart & try the next one"
        pending={pending}
        onSubmit={(status) => submitCheck(step.recipeId, step.scope, status)}
        ingredients={ingredients}
      />
    </section>
  );
}
