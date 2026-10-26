"use client";

import { ArrowRightIcon, ShoppingCartIcon } from "lucide-react";
import type { Step } from "@/components/flow-session";
import type { TodayFlowState } from "@/components/today/use-today-flow";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { INGREDIENTS } from "@/lib/recipes";

export function MissedScreen({
  flow,
  step,
}: {
  flow: TodayFlowState;
  step: Extract<Step, { name: "missed" }>;
}) {
  const { ingredients, making, skippedFor, tick, nextSuggestion, afterCheckPassed, back } = flow;
  const recipe = making(step.recipeId);
  const buy = step.missing.filter((id) => !INGREDIENTS[id]?.batch);
  const cook = step.missing.filter((id) => INGREDIENTS[id]?.batch);
  return (
    <section className="flex flex-col gap-6">
      {back}
      <div>
        <p className="text-xs font-semibold tracking-wide text-destructive uppercase">
          Missing ingredients
        </p>
        <h1 className="font-heading text-2xl font-semibold">{recipe.name}</h1>
      </div>
      {buy.length > 0 && (
        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCartIcon className="size-4" />
              Added to your shopping cart
            </CardTitle>
            <CardDescription>
              {buy.map((id) => ingredients[id]?.name ?? id).join(", ")}
            </CardDescription>
          </CardHeader>
        </Card>
      )}
      {cook.length > 0 && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Batch-cook tasks added</CardTitle>
            <CardDescription>
              {cook
                .map((id) => `${INGREDIENTS[id].name} (~${INGREDIENTS[id].batch!.minutes} min)`)
                .join(", ")}
              . You&apos;ll find instructions in the cart.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
      <div className="flex flex-col gap-2">
        <Button size="lg" className="h-12 text-base" onClick={() => nextSuggestion(step.recipeId)}>
          Try the next breakfast
          <ArrowRightIcon />
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="h-12 text-base"
          onClick={() => {
            tick(step.recipeId, {
              skipped: [...new Set([...skippedFor(step.recipeId), ...step.missing])],
            });
            afterCheckPassed(step.recipeId, step.scope);
          }}
        >
          Make it anyway without them
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          They&apos;ll be noted as skipped this time.
        </p>
      </div>
    </section>
  );
}
