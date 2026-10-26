"use client";

import { MoonIcon } from "lucide-react";
import type { Step } from "@/components/flow-session";
import { BottomLinks } from "@/components/today/parts";
import type { TodayFlowState } from "@/components/today/use-today-flow";

export function TonightDoneScreen({
  flow,
  step,
}: {
  flow: TodayFlowState;
  step: Extract<Step, { name: "tonightDone" }>;
}) {
  const { cartCount, making, restart } = flow;
  const recipe = making(step.recipeId);
  return (
    <section className="flex flex-col gap-6 pt-6 text-center">
      <MoonIcon className="mx-auto size-10 text-primary" />
      <h1 className="font-heading text-2xl font-semibold">You&apos;re set for tomorrow</h1>
      <p className="text-muted-foreground">
        {step.needsPrep
          ? `${recipe.name} is prepped. Open the app in the morning and it'll walk you through the finishing touches.`
          : `Nothing to prep tonight for ${recipe.name}; the ingredients are confirmed. It'll be first up in the morning.`}
      </p>
      <BottomLinks cartCount={cartCount} onRestart={restart} />
    </section>
  );
}
