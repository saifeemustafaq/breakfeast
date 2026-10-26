"use client";

import { CheckCircle2Icon, MoonIcon, SkipForwardIcon } from "lucide-react";
import type { Step } from "@/components/flow-session";
import { nameList } from "@/components/today/helpers";
import type { TodayFlowState } from "@/components/today/use-today-flow";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function StepsScreen({
  flow,
  step,
}: {
  flow: TodayFlowState;
  step: Extract<Step, { name: "steps" }>;
}) {
  const {
    pending,
    ingredients,
    making,
    progressFor,
    skippedFor,
    tick,
    noteCard,
    finishBreakfast,
    markPrepped,
    back,
  } = flow;
  const recipe = making(step.recipeId);
  const steps = step.night ? (recipe.nightSteps ?? []) : recipe.steps;
  const skipping = skippedFor(recipe.id);
  return (
    <section className="flex flex-col gap-5">
      {back}
      <div>
        <p className="text-xs font-semibold tracking-wide text-primary uppercase">
          {step.night ? "Prep tonight" : "Let's make it"}
        </p>
        <h1 className="font-heading text-2xl font-semibold">{recipe.name}</h1>
      </div>
      {noteCard(recipe.id)}
      {skipping.length > 0 && (
        <p className="flex items-start gap-2 rounded-xl bg-muted/60 p-3 text-sm">
          <SkipForwardIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span>
            Leaving out {nameList(skipping, ingredients)}
            {step.night ? " tonight" : " this time"}. Skip that part of any step.
          </span>
        </p>
      )}
      <StepList
        steps={steps}
        done={progressFor(recipe.id).done}
        onChange={(done) => tick(recipe.id, { done })}
      />
      {step.night ? (
        <Button
          size="lg"
          className="h-12 text-base"
          disabled={pending}
          onClick={() => markPrepped(recipe.id)}
        >
          <MoonIcon />
          Prepped, it&apos;s in the fridge
        </Button>
      ) : (
        <Button
          size="lg"
          className="h-12 text-base"
          disabled={pending}
          onClick={() => finishBreakfast(recipe.id)}
        >
          <CheckCircle2Icon />
          Breakfast is ready
        </Button>
      )}
    </section>
  );
}

function StepList({
  steps,
  done,
  onChange,
}: {
  steps: string[];
  done: number[];
  onChange: (done: number[]) => void;
}) {
  return (
    <ol className="flex flex-col gap-3">
      {steps.map((s, i) => {
        const isDone = done.includes(i);
        return (
          <li key={i}>
            <button
              type="button"
              className={cn(
                "flex w-full items-start gap-3 rounded-xl border bg-card p-4 text-left transition-colors",
                isDone && "bg-muted text-muted-foreground",
              )}
              onClick={() => onChange(isDone ? done.filter((x) => x !== i) : [...done, i])}
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
                  isDone && "border-success bg-success text-success-foreground",
                )}
              >
                {i + 1}
              </span>
              <span className={cn("pt-0.5", isDone && "line-through")}>{s}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
