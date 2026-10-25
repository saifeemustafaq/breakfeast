"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRightIcon,
  BookOpenIcon,
  CalendarDaysIcon,
  CheckCircle2Icon,
  ChartNoAxesColumnIcon,
  MoonIcon,
  ShoppingCartIcon,
  SkipForwardIcon,
  SunIcon,
} from "lucide-react";
import { clearTomorrow, markMade, planTomorrow, recordCheck } from "@/app/actions";
import { toast } from "@/components/activity/toast";
import { KitchenChecklist } from "@/components/kitchen-checklist";
import { BackButton, goBack, scrollAppToTop } from "@/components/navigation";
import { InsightCard, InsightTeaser, NutritionSnapshot } from "@/components/nutrition";
import {
  PrepDialog,
  PrepStatus,
  UncookedDialog,
  cookedAheadReady,
  type PrepFocus,
  type UncookedState,
} from "@/components/prep-details";
import { RatingForm } from "@/components/rating-form";
import { RecipeBadges, RecipeHeader } from "@/components/recipe-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useHour } from "@/components/use-hour";
import { failureMessage, unwrap } from "@/lib/action-result";
import { recipeInsights } from "@/lib/nutrition";
import {
  INGREDIENTS,
  RECIPE_BY_ID,
  checkableIds,
  cookedAheadItems,
  rankRecipes,
  recipeItems,
  visibleRecipes,
  type CheckScope,
} from "@/lib/recipes";
import { rememberedInStock } from "@/lib/stock";
import type { AppState, CheckStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export type Mode = "now" | "tonight";

type Step =
  | { name: "mode" }
  | { name: "upcoming" }
  | { name: "suggest" }
  | { name: "pickPrepped" }
  | { name: "check"; recipeId: number; scope: CheckScope }
  | { name: "missed"; recipeId: number; scope: CheckScope; missing: string[] }
  | { name: "gather"; recipeId: number; scope: CheckScope }
  | { name: "steps"; recipeId: number; night: boolean }
  | { name: "tonightDone"; recipeId: number; needsPrep: boolean }
  | { name: "serve"; recipeId: number; historyId: string }
  | { name: "done" }
  | { name: "exhausted" };

/** Everything Back has to restore, so stepping back shows the same suggestion as before. */
type Frame = { step: Step; mode: Mode; pinned: number | null; skipped: number[] };

function greeting(hour: number | null) {
  if (hour === null) return "Hello";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

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

export function BreakfastFlow({
  initial,
  startWith,
}: {
  initial: AppState;
  /** Jump straight to this recipe, e.g. from a recipe page. */
  startWith?: { recipeId: number; mode: Mode };
}) {
  const hour = useHour();
  const router = useRouter();
  const [nav, setNav] = useState<{ at: Frame; trail: Frame[] }>(() => ({
    at: {
      step: startWith ? { name: "suggest" } : { name: "mode" },
      mode: startWith?.mode ?? "now",
      pinned: startWith?.recipeId ?? null,
      skipped: [],
    },
    trail: [],
  }));
  const { step, mode, pinned, skipped } = nav.at;
  const [prepOpen, setPrepOpen] = useState(false);
  const [uncooked, setUncooked] = useState<UncookedState | null>(null);
  const [prepFocus, setPrepFocus] = useState<PrepFocus>("overnight");
  const [session, setSession] = useState<Record<string, CheckStatus>>({});
  const [stock, setStock] = useState(initial.stock);
  const [upcoming, setUpcoming] = useState(initial.upcoming);
  const [cartCount, setCartCount] = useState(initial.cart.length);
  const [pending, startTransition] = useTransition();

  const suggestedMode: Mode | null =
    hour === null ? null : hour >= 4 && hour < 14 ? "now" : "tonight";

  const ranked = useMemo(
    () => rankRecipes(initial.lastMade, initial.stats, initial.disliked),
    [initial.lastMade, initial.stats, initial.disliked],
  );

  const knownMissing = (recipeId: number) =>
    checkableIds(RECIPE_BY_ID[recipeId]).some((id) => session[id] === "missing");

  const eligible = pinned !== null ? [pinned, ...ranked.filter((id) => id !== pinned)] : ranked;
  const candidates = eligible.filter((id) => !skipped.includes(id) && !knownMissing(id));
  const autoSkipped = eligible.filter((id) => !skipped.includes(id) && knownMissing(id)).length;

  /** Forward one screen; Back returns to exactly the screen you were on. */
  function go(next: Step, patch: Partial<Omit<Frame, "step">> = {}) {
    setNav(({ at, trail }) => ({ at: { ...at, ...patch, step: next }, trail: [...trail, at] }));
    scrollAppToTop();
  }

  /** Swap the current screen without adding a Back step. */
  function replace(next: Step) {
    setNav(({ at, trail }) => ({ at: { ...at, step: next }, trail }));
  }

  /** Once something is saved (made, prepped, rated) there's nothing to step back into. */
  function settle(next: Step) {
    setNav(({ at }) => ({ at: { ...at, step: next }, trail: [] }));
    scrollAppToTop();
  }

  function stepBack() {
    if (nav.trail.length) {
      setNav(({ trail }) => ({ at: trail[trail.length - 1], trail: trail.slice(0, -1) }));
      scrollAppToTop();
    } else if (startWith) {
      goBack(router, `/recipes/${startWith.recipeId}`);
    }
  }

  function restart() {
    setNav(({ at }) => ({
      at: { step: { name: "mode" }, mode: at.mode, pinned: null, skipped: [] },
      trail: [],
    }));
    scrollAppToTop();
  }

  function start(m: Mode) {
    go(m === "now" && upcoming ? { name: "upcoming" } : { name: "suggest" }, {
      mode: m,
      skipped: [],
      pinned: null,
    });
  }

  const uncookedItems = (recipeId: number) =>
    cookedAheadItems(RECIPE_BY_ID[recipeId]).filter(
      (i) => !rememberedInStock(i.id, stock, initial.loadedAt),
    );

  /** Nothing cooked yet: ask whether the raw bases are there before queueing the cook tasks. */
  function skipUncooked(recipeId: number) {
    const missing = uncookedItems(recipeId);
    setPrepOpen(false);
    if (!missing.length) {
      nextSuggestion(recipeId);
      return;
    }
    setUncooked({
      recipeId,
      bases: Object.fromEntries(
        missing.map((i) => [
          INGREDIENTS[i.id].batch!.from,
          rememberedInStock(INGREDIENTS[i.id].batch!.from, stock, initial.loadedAt)
            ? ("have" as CheckStatus)
            : undefined,
        ]),
      ),
    });
  }

  /** Cook tasks for what isn't cooked, shopping items for the raw bases you're out of. */
  function confirmUncooked(recipeId: number, bases: Record<string, CheckStatus | undefined>) {
    const missing = [
      ...uncookedItems(recipeId).map((i) => i.id),
      ...Object.keys(bases).filter((id) => bases[id] === "missing"),
    ];
    const have = Object.keys(bases).filter((id) => bases[id] === "have");
    setUncooked(null);
    nextSuggestion(recipeId);
    startTransition(async () => {
      try {
        await unwrap(recordCheck({ have, missing, recipeIds: [recipeId] }));
      } catch (err) {
        toast.error(failureMessage(err, "Couldn't add the cook task. Check your connection."));
        return;
      }
      const now = new Date().toISOString();
      const status = Object.fromEntries([
        ...missing.map((id) => [id, "missing" as CheckStatus]),
        ...have.map((id) => [id, "have" as CheckStatus]),
      ]);
      setSession((s) => ({ ...s, ...status }));
      setStock((s) => ({
        ...s,
        ...Object.fromEntries(
          Object.entries(status).map(([id, v]) => [id, { inStock: v === "have", updatedAt: now }]),
        ),
      }));
      setCartCount((c) => c + missing.filter((id) => stock[id]?.inStock !== false).length);
      toast.success(`Added ${missing.length} ${missing.length === 1 ? "thing" : "things"} to your cart`);
    });
  }

  function nextSuggestion(skipId?: number) {
    const nextSkipped = skipId ? [...skipped, skipId] : skipped;
    const remaining = eligible.filter((id) => !nextSkipped.includes(id) && !knownMissing(id));
    go(remaining.length ? { name: "suggest" } : { name: "exhausted" }, { skipped: nextSkipped });
  }

  function beginCheck(recipeId: number, scope: CheckScope) {
    const ids = checkableIds(RECIPE_BY_ID[recipeId], scope);
    if (ids.length === 0) {
      afterCheckPassed(recipeId, scope);
      return;
    }
    go({ name: "check", recipeId, scope });
  }

  function afterCheckPassed(recipeId: number, scope: CheckScope) {
    const recipe = RECIPE_BY_ID[recipeId];
    if (mode === "tonight") {
      if (recipe.prep === "overnight") go({ name: "gather", recipeId, scope: "night" });
      else {
        startTransition(async () => {
          try {
            await unwrap(planTomorrow(recipeId, false));
            setUpcoming({ recipeId, needsPrep: false, createdAt: new Date().toISOString() });
            settle({ name: "tonightDone", recipeId, needsPrep: false });
          } catch (err) {
            toast.error(failureMessage(err));
          }
        });
      }
    } else {
      go({ name: "gather", recipeId, scope });
    }
  }

  function submitCheck(recipeId: number, scope: CheckScope, status: Record<string, CheckStatus>) {
    const have = Object.keys(status).filter((id) => status[id] === "have");
    const missing = Object.keys(status).filter((id) => status[id] === "missing");
    startTransition(async () => {
      try {
        await unwrap(recordCheck({ have, missing, recipeIds: [recipeId] }));
      } catch (err) {
        toast.error(failureMessage(err, "Couldn't save your kitchen check. Check your connection."));
        return;
      }
      const now = new Date().toISOString();
      setSession((s) => ({ ...s, ...status }));
      setStock((s) => ({
        ...s,
        ...Object.fromEntries(
          Object.entries(status).map(([id, v]) => [id, { inStock: v === "have", updatedAt: now }]),
        ),
      }));
      const newToCart = missing.filter((id) => stock[id]?.inStock !== false);
      setCartCount((c) => c + newToCart.length);
      if (missing.length) go({ name: "missed", recipeId, scope, missing });
      else afterCheckPassed(recipeId, scope);
    });
  }

  function finishBreakfast(recipeId: number) {
    startTransition(async () => {
      try {
        const historyId = await unwrap(markMade(recipeId));
        if (upcoming?.recipeId === recipeId) setUpcoming(null);
        settle({ name: "serve", recipeId, historyId });
      } catch (err) {
        toast.error(failureMessage(err));
      }
    });
  }

  function markPrepped(recipeId: number) {
    startTransition(async () => {
      try {
        await unwrap(planTomorrow(recipeId, true));
        setUpcoming({ recipeId, needsPrep: true, createdAt: new Date().toISOString() });
        settle({ name: "tonightDone", recipeId, needsPrep: true });
      } catch (err) {
        toast.error(failureMessage(err));
      }
    });
  }

  const back = (nav.trail.length > 0 || startWith) && (
    <div className="flex items-center justify-between">
      <BackButton onClick={stepBack} />
      {nav.trail.length > 1 && (
        <Button variant="ghost" size="sm" className="-mr-2 h-10 text-muted-foreground" onClick={restart}>
          Start over
        </Button>
      )}
    </div>
  );

  switch (step.name) {
    case "mode": {
      const upcomingRecipe = upcoming ? RECIPE_BY_ID[upcoming.recipeId] : null;
      return (
        <section className="flex flex-col gap-6">
          <div>
            <h1 className="font-heading text-3xl font-semibold">{greeting(hour)}</h1>
            <p className="mt-1 text-muted-foreground">What are we doing?</p>
          </div>

          {upcoming && upcomingRecipe && (
            <Card size="sm" className="bg-primary/5 ring-primary/20">
              <CardContent className="flex items-start gap-3">
                <MoonIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                <p className="text-sm">
                  {upcoming.needsPrep ? "Prepped for tomorrow: " : "Picked for tomorrow: "}
                  <span className="font-medium">{upcomingRecipe.name}</span>
                </p>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-col gap-3">
            <ModeButton
              icon={<SunIcon />}
              title="Make breakfast now"
              description={
                upcomingRecipe
                  ? `Finish ${upcomingRecipe.name.toLowerCase()} or pick something quick`
                  : "Each pick shows if it's ready to make or needed prep last night"
              }
              suggested={suggestedMode === "now"}
              onClick={() => start("now")}
            />
            <ModeButton
              icon={<MoonIcon />}
              title="Prep for tomorrow morning"
              description="Check ingredients tonight and do any overnight prep"
              suggested={suggestedMode === "tonight"}
              onClick={() => start("tonight")}
            />
          </div>

          <Link
            href="/plan"
            className={cn(buttonVariants({ variant: "outline" }), "h-12 justify-between text-base")}
          >
            <span className="flex items-center gap-2">
              <CalendarDaysIcon />
              Plan 3–4 breakfasts ahead
            </span>
            <ArrowRightIcon />
          </Link>

          <div className="grid grid-cols-2 gap-2">
            <Link
              href="/recipes"
              className={cn(buttonVariants({ variant: "ghost" }), "h-11 justify-start bg-muted/60")}
            >
              <BookOpenIcon />
              All recipes
            </Link>
            <Link
              href="/insights"
              className={cn(buttonVariants({ variant: "ghost" }), "h-11 justify-start bg-muted/60")}
            >
              <ChartNoAxesColumnIcon />
              Your patterns
            </Link>
          </div>
        </section>
      );
    }

    case "upcoming": {
      const plan = upcoming;
      if (!plan) {
        replace({ name: "mode" });
        return null;
      }
      const recipe = RECIPE_BY_ID[plan.recipeId];
      const prepped = plan.needsPrep;
      return (
        <section className="flex flex-col gap-6">
          {back}
          <RecipeHeader
            recipe={recipe}
            eyebrow={prepped ? "You prepped this last night" : "You picked this last night"}
          />
          <NutritionSnapshot recipe={recipe} />
          <p className="text-lg">
            {prepped ? "Is it ready in the fridge?" : "Still want to make it?"}
          </p>
          <div className="flex flex-col gap-2">
            <Button
              size="lg"
              className="h-12 text-base"
              onClick={() => beginCheck(recipe.id, prepped ? "morning" : "all")}
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
                    setUpcoming(null);
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

    case "suggest": {
      const id = candidates[0];
      if (id === undefined) {
        return <Exhausted back={back} cartCount={cartCount} />;
      }
      const recipe = RECIPE_BY_ID[id];
      const items = recipeItems(recipe).filter((ri) => !INGREDIENTS[ri.id].always);
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
                  beginCheck(id, "morning");
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
                <SkipForwardIcon />
                I haven&apos;t prepped this, show the next one
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
                {items.map((ri) => INGREDIENTS[ri.id].name).join(", ")}
              </CardDescription>
            </CardHeader>
          </Card>

          {replacing && (
            <p className="text-sm text-muted-foreground">
              This will replace {replacing.name} as tomorrow&apos;s breakfast.
            </p>
          )}
          {autoSkipped > 0 && (
            <p className="text-sm text-muted-foreground">
              Skipped {autoSkipped} {autoSkipped === 1 ? "breakfast" : "breakfasts"} that need
              something you&apos;re out of.
            </p>
          )}

          <div className="flex flex-col gap-2">
            {needsLastNight ? (
              <>
                <Button
                  size="lg"
                  className="h-12 text-base"
                  onClick={() => beginCheck(id, "morning")}
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
                  <SkipForwardIcon />
                  I haven&apos;t prepped this, show the next one
                </Button>
              </>
            ) : (
              <>
                <Button size="lg" className="h-12 text-base" onClick={() => beginCheck(id, "all")}>
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

          {mode === "now" && !needsLastNight && (
            <Button
              variant="link"
              className="self-center text-muted-foreground"
              onClick={() => go({ name: "pickPrepped" })}
            >
              I prepped something last night
            </Button>
          )}
        </section>
      );
    }

    case "pickPrepped": {
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
                onClick={() => beginCheck(r.id, "morning")}
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

    case "check": {
      const recipe = RECIPE_BY_ID[step.recipeId];
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
            <p className="text-xs font-semibold tracking-wide text-primary uppercase">
              Kitchen check
            </p>
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
          />
        </section>
      );
    }

    case "missed": {
      const recipe = RECIPE_BY_ID[step.recipeId];
      const buy = step.missing.filter((id) => !INGREDIENTS[id].batch);
      const cook = step.missing.filter((id) => INGREDIENTS[id].batch);
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
                <CardDescription>{buy.map((id) => INGREDIENTS[id].name).join(", ")}</CardDescription>
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
            <Button
              size="lg"
              className="h-12 text-base"
              onClick={() => nextSuggestion(step.recipeId)}
            >
              Try the next breakfast
              <ArrowRightIcon />
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="h-12 text-base"
              onClick={() => afterCheckPassed(step.recipeId, step.scope)}
            >
              Make it anyway without them
            </Button>
          </div>
        </section>
      );
    }

    case "gather": {
      const recipe = RECIPE_BY_ID[step.recipeId];
      return (
        <section className="flex flex-col gap-5">
          {back}
          <div>
            <p className="text-xs font-semibold tracking-wide text-primary uppercase">
              {step.scope === "night" ? "Tonight's prep" : "Take out and measure"}
            </p>
            <h1 className="font-heading text-2xl font-semibold">{recipe.name}</h1>
          </div>
          <GatherList recipeId={recipe.id} scope={step.scope} />
          <Button
            size="lg"
            className="h-12 text-base"
            onClick={() =>
              go({ name: "steps", recipeId: recipe.id, night: step.scope === "night" })
            }
          >
            Everything&apos;s out
            <ArrowRightIcon />
          </Button>
        </section>
      );
    }

    case "steps": {
      const recipe = RECIPE_BY_ID[step.recipeId];
      const steps = step.night ? (recipe.nightSteps ?? []) : recipe.steps;
      return (
        <section className="flex flex-col gap-5">
          {back}
          <div>
            <p className="text-xs font-semibold tracking-wide text-primary uppercase">
              {step.night ? "Prep tonight" : "Let's make it"}
            </p>
            <h1 className="font-heading text-2xl font-semibold">{recipe.name}</h1>
          </div>
          <StepList key={`${recipe.id}-${step.night}`} steps={steps} />
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

    case "tonightDone": {
      const recipe = RECIPE_BY_ID[step.recipeId];
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

    case "serve": {
      const recipe = RECIPE_BY_ID[step.recipeId];
      return (
        <section className="flex flex-col gap-6">
          <div className="pt-4 text-center">
            <CheckCircle2Icon className="mx-auto size-12 text-success" />
            <h1 className="mt-3 font-heading text-2xl font-semibold">Ready to serve</h1>
            <p className="text-muted-foreground">{recipe.name}</p>
          </div>
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
                Rate it after she&apos;s eaten. Ratings help pick the final seven.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RatingForm historyId={step.historyId} onDone={() => settle({ name: "done" })} />
            </CardContent>
          </Card>
        </section>
      );
    }

    case "done":
      return (
        <section className="flex flex-col gap-6 pt-6 text-center">
          <SunIcon className="mx-auto size-10 text-primary" />
          <h1 className="font-heading text-2xl font-semibold">Enjoy breakfast</h1>
          <p className="text-muted-foreground">
            Want to get tomorrow ready while you&apos;re in the kitchen?
          </p>
          <Button size="lg" className="h-12 text-base" onClick={() => start("tonight")}>
            <MoonIcon />
            Prep for tomorrow
          </Button>
          <BottomLinks cartCount={cartCount} onRestart={restart} />
        </section>
      );

    case "exhausted":
      return <Exhausted back={back} cartCount={cartCount} />;
  }
}

function ModeButton({
  icon,
  title,
  description,
  suggested,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  suggested: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-start gap-4 rounded-2xl border p-5 text-left transition-colors [&_svg]:size-6",
        suggested
          ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
          : "bg-card hover:bg-muted",
      )}
    >
      <span className="mt-0.5">{icon}</span>
      <span className="flex flex-col gap-1">
        <span className="text-lg font-semibold">{title}</span>
        <span className={cn("text-sm", suggested ? "opacity-85" : "text-muted-foreground")}>
          {description}
        </span>
        {suggested && <span className="text-xs font-medium opacity-75">Suggested for now</span>}
      </span>
    </button>
  );
}

function GatherList({ recipeId, scope }: { recipeId: number; scope: CheckScope }) {
  const items = recipeItems(RECIPE_BY_ID[recipeId], scope);
  const [taken, setTaken] = useState<Record<string, boolean>>({});
  return (
    <ul className="flex flex-col divide-y rounded-xl border bg-card">
      {items.map((ri) => (
        <li key={ri.id}>
          <label className="flex cursor-pointer items-center gap-3 p-3">
            <Checkbox
              checked={!!taken[ri.id]}
              onCheckedChange={(v) => setTaken((t) => ({ ...t, [ri.id]: !!v }))}
              className="size-5"
            />
            <span className={cn("flex-1", taken[ri.id] && "text-muted-foreground line-through")}>
              {INGREDIENTS[ri.id].name}
            </span>
            <span className="text-right text-sm font-medium tabular-nums">{ri.qty}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

function StepList({ steps }: { steps: string[] }) {
  const [done, setDone] = useState<number[]>([]);
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
              onClick={() =>
                setDone((d) => (isDone ? d.filter((x) => x !== i) : [...d, i]))
              }
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

function Exhausted({ back, cartCount }: { back: React.ReactNode; cartCount: number }) {
  return (
    <section className="flex flex-col gap-6">
      {back}
      <h1 className="font-heading text-2xl font-semibold">That&apos;s every option for now</h1>
      <p className="text-muted-foreground">
        There&apos;s nothing left to suggest with what&apos;s in the kitchen right now. Your shopping
        cart has what you need to restock.
      </p>
      <Link href="/cart" className={cn(buttonVariants(), "h-12 text-base")}>
        <ShoppingCartIcon />
        Open shopping cart{cartCount ? ` (${cartCount})` : ""}
      </Link>
    </section>
  );
}

function BottomLinks({ cartCount, onRestart }: { cartCount: number; onRestart: () => void }) {
  return (
    <div className="flex flex-col gap-2">
      {cartCount > 0 && (
        <Link href="/cart" className={cn(buttonVariants({ variant: "outline" }), "h-12 text-base")}>
          <ShoppingCartIcon />
          Shopping cart ({cartCount})
        </Link>
      )}
      <Button variant="ghost" onClick={onRestart}>
        Back to start
      </Button>
    </div>
  );
}
