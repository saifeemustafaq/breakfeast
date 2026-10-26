"use client";

import { ArrowRightIcon, HistoryIcon, SkipForwardIcon } from "lucide-react";
import { AlreadyMadeDialog } from "@/components/already-made";
import { InsightTeaser, NutritionSnapshot } from "@/components/nutrition";
import {
  cookedAheadReady,
  PrepDialog,
  PrepStatus,
  UncookedDialog,
  type PrepFocus,
} from "@/components/prep-details";
import { RecipeHeader } from "@/components/recipe-header";
import { nameList } from "@/components/today/helpers";
import { Exhausted } from "@/components/today/parts";
import type { TodayFlowState } from "@/components/today/use-today-flow";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { VersionSwitch } from "@/components/version-switch";
import { cookedAheadItems, INGREDIENTS, RECIPE_BY_ID, recipeItems } from "@/lib/recipes";
import { versionChoices } from "@/lib/versions";

export function SuggestScreen({ flow }: { flow: TodayFlowState }) {
  const {
    initial,
    mode,
    prepOpen,
    setPrepOpen,
    uncooked,
    setUncooked,
    prepFocus,
    setPrepFocus,
    stock,
    upcoming,
    cartCount,
    notes,
    logging,
    setLogging,
    pending,
    ingredients,
    versionState,
    choiceFor,
    recipeFor,
    pickVersion,
    noteCard,
    logged,
    candidates,
    autoSkipped,
    go,
    skipUncooked,
    confirmUncooked,
    nextSuggestion,
    beginCheck,
    back,
  } = flow;
  const id = candidates[0];
  if (id === undefined) {
    return <Exhausted back={back} cartCount={cartCount} />;
  }
  const choice = choiceFor(id);
  const recipe = recipeFor(id, choice);
  const items = recipeItems(recipe).filter((ri) => !INGREDIENTS[ri.id]?.always);
  const lastSkipped = (initial.skips[id]?.last ?? []).filter((s) => items.some((ri) => ri.id === s));
  const replacing =
    mode === "tonight" && upcoming && upcoming.recipeId !== id
      ? RECIPE_BY_ID[upcoming.recipeId]
      : null;
  const needsLastNight = mode === "now" && recipe.prep === "overnight";
  const hasCooked = cookedAheadItems(recipe).length > 0;
  const cookedReady = cookedAheadReady(recipe, stock, initial.loadedAt);
  const openPrep = (focus: PrepFocus) => {
    setPrepFocus(focus);
    setPrepOpen(true);
  };
  const dialogActions =
    prepFocus === "overnight" ? (
      needsLastNight ? (
        <>
          <Button
            size="lg"
            className="h-12 text-base"
            onClick={() => {
              setPrepOpen(false);
              beginCheck(id, "morning", choice);
            }}
          >
            I prepped it last night
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="h-12 text-base"
            onClick={() => {
              setPrepOpen(false);
              nextSuggestion(id);
            }}
          >
            <SkipForwardIcon />I haven&apos;t prepped this, show the next one
          </Button>
        </>
      ) : (
        <Button size="lg" className="h-12 text-base" onClick={() => setPrepOpen(false)}>
          Got it
        </Button>
      )
    ) : cookedReady ? (
      <Button size="lg" className="h-12 text-base" onClick={() => setPrepOpen(false)}>
        Got it, it&apos;s ready
      </Button>
    ) : (
      <>
        <Button size="lg" className="h-12 text-base" onClick={() => setPrepOpen(false)}>
          {mode === "now" ? "I have it ready" : "I'll cook it tonight"}
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="h-12 text-base"
          disabled={pending}
          onClick={() => skipUncooked(id)}
        >
          <SkipForwardIcon />
          Not cooked yet, add a cook task and show the next one
        </Button>
      </>
    );
  return (
    <section className="flex flex-col gap-6">
      {back}
      <RecipeHeader
        recipe={recipe}
        showBadges={false}
        eyebrow={mode === "now" ? "How about this morning…" : "For tomorrow morning…"}
      />
      <VersionSwitch
        className="-mt-3"
        options={versionChoices(versionState, id)}
        value={choice}
        onChange={(c) => pickVersion(id, c)}
      />
      {noteCard(id)}
      <PrepStatus
        recipe={recipe}
        context={mode}
        onOpen={openPrep}
        stock={stock}
        loadedAt={initial.loadedAt}
      />
      <PrepDialog
        recipe={recipe}
        open={prepOpen}
        onOpenChange={setPrepOpen}
        focus={prepFocus}
        stock={stock}
        loadedAt={initial.loadedAt}
        actions={dialogActions}
        ingredients={ingredients}
      />
      <UncookedDialog
        state={uncooked}
        pending={pending}
        onChange={setUncooked}
        onConfirm={confirmUncooked}
      />
      {recipe.tip && <p className="text-sm text-muted-foreground">{recipe.tip}</p>}

      <NutritionSnapshot recipe={recipe} />
      <InsightTeaser recipe={recipe} href={`/recipes/${recipe.id}`} />

      <Card size="sm">
        <CardHeader>
          <CardTitle>You&apos;ll need {items.length} things</CardTitle>
          <CardDescription>
            {items.map((ri) => ingredients[ri.id]?.name ?? ri.id).join(", ")}
          </CardDescription>
          {lastSkipped.length > 0 && (
            <p className="text-xs text-muted-foreground">
              You skipped {nameList(lastSkipped, ingredients)} last time.
            </p>
          )}
        </CardHeader>
      </Card>

      {replacing && (
        <p className="text-sm text-muted-foreground">
          This will replace {replacing.name} as tomorrow&apos;s breakfast.
        </p>
      )}
      {autoSkipped > 0 && (
        <p className="text-sm text-muted-foreground">
          Skipped {autoSkipped} {autoSkipped === 1 ? "breakfast" : "breakfasts"} that need something
          you&apos;re out of.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {needsLastNight ? (
          <>
            <Button
              size="lg"
              className="h-12 text-base"
              onClick={() => beginCheck(id, "morning", choice)}
            >
              I prepped it last night
              <ArrowRightIcon />
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="h-12 text-base"
              onClick={() => nextSuggestion(id)}
            >
              <SkipForwardIcon />I haven&apos;t prepped this, show the next one
            </Button>
          </>
        ) : (
          <>
            <Button
              size="lg"
              className="h-12 text-base"
              onClick={() => beginCheck(id, "all", choice)}
            >
              Go to the kitchen and check
              <ArrowRightIcon />
            </Button>
            {hasCooked && !cookedReady && (
              <Button
                variant="outline"
                size="lg"
                className="h-12 text-base"
                disabled={pending}
                onClick={() => skipUncooked(id)}
              >
                <SkipForwardIcon />
                Not cooked yet, show the next one
              </Button>
            )}
            <Button
              variant="outline"
              size="lg"
              className="h-12 text-base"
              onClick={() => nextSuggestion(id)}
            >
              <SkipForwardIcon />
              Not this one
            </Button>
          </>
        )}
      </div>

      <div className="flex flex-col items-center">
        <Button variant="link" className="text-muted-foreground" onClick={() => setLogging(id)}>
          <HistoryIcon />I made this recently
        </Button>
        {mode === "now" && !needsLastNight && (
          <Button
            variant="link"
            className="text-muted-foreground"
            onClick={() => go({ name: "pickPrepped" })}
          >
            I prepped something last night
          </Button>
        )}
      </div>
      <AlreadyMadeDialog
        recipe={logging !== null ? RECIPE_BY_ID[logging] : null}
        choice={logging !== null ? choiceFor(logging) : undefined}
        note={logging !== null ? notes[logging]?.text : undefined}
        onClose={() => setLogging(null)}
        onLogged={logged}
      />
    </section>
  );
}
