"use client";

import { CheckCircle2Icon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { saveVersion } from "@/app/version-actions";
import { toast } from "@/components/activity/toast";
import type { Step } from "@/components/flow-session";
import { InsightCard, NutritionSnapshot } from "@/components/nutrition";
import { RatingForm } from "@/components/rating-form";
import { asInputs, nameList } from "@/components/today/helpers";
import type { TodayFlowState } from "@/components/today/use-today-flow";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { failureMessage, unwrap } from "@/lib/action-result";
import { recipeInsights } from "@/lib/nutrition";
import type { Ingredient } from "@/lib/recipes";
import type { Extra } from "@/lib/types";
import { MAX_ADDITIONS, SKIP_RUN_OFFER, withExtras, withSkips } from "@/lib/versions";

export function ServeScreen({
  flow,
  step,
}: {
  flow: TodayFlowState;
  step: Extract<Step, { name: "serve" }>;
}) {
  const {
    initial,
    lastPlan,
    notes,
    dismissedOffers,
    setDismissedOffers,
    setMineNow,
    pending,
    startTransition,
    ingredients,
    recipeFor,
    nameOf,
    myAdditions,
    setNote,
    settle,
  } = flow;
  const skippedNow = step.skipped ?? [];
  const recipe = withSkips(
    withExtras(recipeFor(step.recipeId, step.choice), step.extras ?? [], nameOf),
    skippedNow,
  );
  const mine = step.choice === "mine" ? myAdditions(step.recipeId) : undefined;
  const myIds = myAdditions(step.recipeId).map((a) => a.ingredientId);
  const oneOffs = [
    ...(step.choice === "planned" && lastPlan?.recipeId === step.recipeId ? lastPlan.extras : []),
    ...(step.extras ?? []),
  ];
  const keepable =
    myIds.length < MAX_ADDITIONS
      ? oneOffs.filter(
          (a) =>
            !myIds.includes(a.ingredientId) && !dismissedOffers.includes(`keep:${a.ingredientId}`),
        )
      : [];
  const offer = mine?.length
    ? mine
        .map((a) => a.ingredientId)
        .filter(
          (a) =>
            skippedNow.includes(a) &&
            (initial.skips[step.recipeId]?.runs[a] ?? 0) + 1 >= SKIP_RUN_OFFER &&
            !dismissedOffers.includes(a),
        )
    : [];
  return (
    <section className="flex flex-col gap-6">
      <div className="pt-4 text-center">
        <CheckCircle2Icon className="mx-auto size-12 text-success" />
        <h1 className="mt-3 font-heading text-2xl font-semibold">Ready to serve</h1>
        <p className="text-muted-foreground">{recipe.name}</p>
        {oneOffs.length > 0 && (
          <p className="mt-1 text-sm text-muted-foreground">
            With{" "}
            {nameList(
              oneOffs.map((a) => a.ingredientId),
              ingredients,
            )}{" "}
            just this time
          </p>
        )}
        {skippedNow.length > 0 && (
          <p className="mt-1 text-sm text-muted-foreground">
            Without {nameList(skippedNow, ingredients)}
          </p>
        )}
      </div>
      {keepable.length > 0 && (
        <KeepOffer
          extras={keepable}
          hasVersion={myIds.length > 0}
          pending={pending}
          onAdd={(extra) =>
            startTransition(async () => {
              const next = [...myAdditions(step.recipeId), ...asInputs([extra])];
              try {
                await unwrap(saveVersion(step.recipeId, next));
                setMineNow((m) => ({ ...m, [step.recipeId]: next }));
                toast.success(`${extra.name} is in your version now`);
              } catch (err) {
                toast.error(failureMessage(err, "Couldn't update your version. Try again."));
              }
            })
          }
          onDismiss={() =>
            setDismissedOffers((d) => [...d, ...keepable.map((a) => `keep:${a.ingredientId}`)])
          }
        />
      )}
      {mine && offer.length > 0 && (
        <SkipOffer
          ids={offer}
          ingredients={ingredients}
          pending={pending}
          onRemove={() =>
            startTransition(async () => {
              try {
                const keep = mine.filter((a) => !offer.includes(a.ingredientId));
                await unwrap(saveVersion(step.recipeId, keep));
                setMineNow((m) => ({ ...m, [step.recipeId]: keep }));
                setDismissedOffers((d) => [...d, ...offer]);
                toast.success(keep.length ? "Taken out of your version" : "Back to the original");
              } catch (err) {
                toast.error(failureMessage(err, "Couldn't update your version. Try again."));
              }
            })
          }
          onKeep={() => setDismissedOffers((d) => [...d, ...offer])}
        />
      )}
      <Card size="sm">
        <CardHeader>
          <CardTitle>What this breakfast gives you</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <NutritionSnapshot recipe={recipe} />
          <ul className="flex flex-col gap-3">
            {recipeInsights(recipe)
              .slice(0, 2)
              .map((insight) => (
                <InsightCard key={insight.id} insight={insight} />
              ))}
          </ul>
          <Link
            href={`/recipes/${recipe.id}`}
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Full nutrition and every reason
          </Link>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>How was it?</CardTitle>
          <CardDescription>
            Rate it once you&apos;ve eaten. Your ratings shape what Today suggests next.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RatingForm
            historyId={step.historyId}
            recipeId={recipe.id}
            note={notes[recipe.id]?.text}
            onNoteSaved={(text) =>
              setNote(recipe.id, text ? { text, updatedAt: new Date().toISOString() } : undefined)
            }
            onDone={() => settle({ name: "done" })}
          />
        </CardContent>
      </Card>
    </section>
  );
}

/** One-offs from this breakfast you might want every time. */
function KeepOffer({
  extras,
  hasVersion,
  pending,
  onAdd,
  onDismiss,
}: {
  extras: Extra[];
  hasVersion: boolean;
  pending: boolean;
  onAdd: (extra: Extra) => void;
  onDismiss: () => void;
}) {
  return (
    <Card size="sm" className="ring-primary/30">
      <CardHeader>
        <CardTitle className="text-base">
          Want {extras.length === 1 ? "it" : "any of these"} every time?
        </CardTitle>
        <CardDescription>
          {hasVersion
            ? "Add to your version of this recipe."
            : "Start your own version of this recipe with it."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {extras.map((a) => (
          <div key={a.ingredientId} className="flex items-center justify-between gap-3">
            <span className="text-sm">
              {a.name} <span className="text-muted-foreground">({a.qty})</span>
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              disabled={pending}
              onClick={() => onAdd(a)}
            >
              <PlusIcon />
              Add
            </Button>
          </div>
        ))}
        <Button
          variant="ghost"
          className="h-10 text-muted-foreground"
          disabled={pending}
          onClick={onDismiss}
        >
          Not now
        </Button>
      </CardContent>
    </Card>
  );
}

/** After the same addition is skipped several times running: offer to take it out of your version. */
function SkipOffer({
  ids,
  ingredients,
  pending,
  onRemove,
  onKeep,
}: {
  ids: string[];
  ingredients: Record<string, Ingredient>;
  pending: boolean;
  onRemove: () => void;
  onKeep: () => void;
}) {
  const names = nameList(ids, ingredients);
  return (
    <Card size="sm" className="ring-warning/40">
      <CardHeader>
        <CardTitle className="text-base">
          You&apos;ve skipped {names} {SKIP_RUN_OFFER} times in a row
        </CardTitle>
        <CardDescription>
          Take {ids.length === 1 ? "it" : "them"} out of your version?
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-11" disabled={pending} onClick={onRemove}>
          Take {ids.length === 1 ? "it" : "them"} out
        </Button>
        <Button
          variant="ghost"
          className="h-11 text-muted-foreground"
          disabled={pending}
          onClick={onKeep}
        >
          Keep {ids.length === 1 ? "it" : "them"}
        </Button>
      </CardContent>
    </Card>
  );
}
