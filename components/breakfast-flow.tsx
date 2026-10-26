"use client";

import { useSearchParams } from "next/navigation";
import type { Mode } from "@/components/flow-session";
import { CheckScreen } from "@/components/today/check-screen";
import { DoneScreen } from "@/components/today/done-screen";
import { GatherScreen } from "@/components/today/gather-screen";
import { MissedScreen } from "@/components/today/missed-screen";
import { ModeScreen } from "@/components/today/mode-screen";
import { Exhausted } from "@/components/today/parts";
import { PickPreppedScreen } from "@/components/today/pick-prepped-screen";
import { ServeScreen } from "@/components/today/serve-screen";
import { StepsScreen } from "@/components/today/steps-screen";
import { SuggestScreen } from "@/components/today/suggest-screen";
import { TonightDoneScreen } from "@/components/today/tonight-done-screen";
import { UpcomingScreen } from "@/components/today/upcoming-screen";
import { useTodayFlow, type StartWith } from "@/components/today/use-today-flow";
import { RECIPE_BY_ID } from "@/lib/recipes";
import type { AppState } from "@/lib/types";

/**
 * `?recipe=3&mode=tonight` (from a recipe page) jumps straight to that recipe. Read on the client
 * because Next.js keeps a visited Today screen alive, and it must still react to the link.
 */
export function TodayFlow({ initial }: { initial: AppState }) {
  const params = useSearchParams();
  const recipeId = Number(params.get("recipe"));
  const mode: Mode = params.get("mode") === "tonight" ? "tonight" : "now";
  const startWith = RECIPE_BY_ID[recipeId] ? { recipeId, mode } : undefined;
  return (
    <BreakfastFlow
      key={startWith ? `${recipeId}-${mode}` : "today"}
      initial={initial}
      startWith={startWith}
    />
  );
}

/** Today's state machine: one screen per step, all sharing `useTodayFlow`. */
export function BreakfastFlow({ initial, startWith }: { initial: AppState; startWith?: StartWith }) {
  const flow = useTodayFlow(initial, startWith);
  const { step } = flow;
  switch (step.name) {
    case "mode":
      return <ModeScreen flow={flow} />;
    case "upcoming":
      if (!flow.upcoming) {
        flow.replace({ name: "mode" });
        return null;
      }
      return <UpcomingScreen flow={flow} />;
    case "suggest":
      return <SuggestScreen flow={flow} />;
    case "pickPrepped":
      return <PickPreppedScreen flow={flow} />;
    case "check":
      return <CheckScreen flow={flow} step={step} />;
    case "missed":
      return <MissedScreen flow={flow} step={step} />;
    case "gather":
      return <GatherScreen flow={flow} step={step} />;
    case "steps":
      return <StepsScreen flow={flow} step={step} />;
    case "tonightDone":
      return <TonightDoneScreen flow={flow} step={step} />;
    case "serve":
      return <ServeScreen flow={flow} step={step} />;
    case "done":
      return <DoneScreen flow={flow} />;
    case "exhausted":
      return <Exhausted back={flow.back} cartCount={flow.cartCount} />;
  }
}
