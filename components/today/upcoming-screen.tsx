"use client";

import { clearTomorrow } from "@/app/actions";
import { toast } from "@/components/activity/toast";
import { NutritionSnapshot } from "@/components/nutrition";
import { RecipeHeader } from "@/components/recipe-header";
import { nameList } from "@/components/today/helpers";
import type { TodayFlowState } from "@/components/today/use-today-flow";
import { Button } from "@/components/ui/button";
import { failureMessage, unwrap } from "@/lib/action-result";
import { withSkips } from "@/lib/versions";

export function UpcomingScreen({ flow }: { flow: TodayFlowState }) {
  const {
    initial,
    upcoming,
    setUpcomingState,
    pending,
    startTransition,
    ingredients,
    recipeFor,
    noteCard,
    replace,
    beginCheck,
    back,
  } = flow;
  const plan = upcoming;
  if (!plan) return null;
  const recipe = recipeFor(plan.recipeId, "planned");
  const prepped = plan.needsPrep;
  const added = recipe.ingredients.filter((ri) => ri.added && !ri.oneOff).map((ri) => ri.id);
  return (
    <section className="flex flex-col gap-6">
      {back}
      <RecipeHeader
        recipe={recipe}
        eyebrow={prepped ? "You prepped this last night" : "You picked this last night"}
      />
      {(plan.version || plan.skipped.length > 0 || plan.extras.length > 0) && (
        <div className="-mt-3 flex flex-col gap-1 text-sm text-muted-foreground">
          {plan.version && (
            <p>
              {plan.version.ownerId === initial.userId
                ? "Your version"
                : `${plan.version.ownerName}'s version`}
              : + {nameList(added, ingredients)}
            </p>
          )}
          {plan.extras.length > 0 && (
            <p>
              +{" "}
              {nameList(
                plan.extras.map((a) => a.ingredientId),
                ingredients,
              )}{" "}
              (just this time)
            </p>
          )}
          {plan.skipped.length > 0 && (
            <p>Skipped last night: {nameList(plan.skipped, ingredients)}</p>
          )}
        </div>
      )}
      {noteCard(recipe.id)}
      <NutritionSnapshot recipe={withSkips(recipe, plan.skipped)} />
      <p className="text-lg">{prepped ? "Is it ready in the fridge?" : "Still want to make it?"}</p>
      <div className="flex flex-col gap-2">
        <Button
          size="lg"
          className="h-12 text-base"
          onClick={() => beginCheck(recipe.id, prepped ? "morning" : "all", "planned")}
        >
          {prepped ? "Yes, let's finish it" : "Yes, let's make it"}
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="h-12 text-base"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              try {
                await unwrap(clearTomorrow());
                setUpcomingState(null);
                replace({ name: "suggest" });
              } catch (err) {
                toast.error(failureMessage(err));
              }
            })
          }
        >
          {prepped ? "No, it's not there" : "No, suggest something else"}
        </Button>
      </div>
    </section>
  );
}
