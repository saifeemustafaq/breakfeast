"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRightIcon,
  BookOpenIcon,
  CalendarDaysIcon,
  CheckCircle2Icon,
  ChartNoAxesColumnIcon,
  HistoryIcon,
  MoonIcon,
  PlayIcon,
  PlusIcon,
  ShoppingCartIcon,
  SkipForwardIcon,
  SunIcon,
  Undo2Icon,
  XIcon,
} from "lucide-react";
import { clearTomorrow, markMade, planTomorrow, recordCheck } from "@/app/actions";
import { chooseVersion, saveVersion } from "@/app/version-actions";
import { toast } from "@/components/activity/toast";
import { AddOnceDialog } from "@/components/addition-picker";
import { AlreadyMadeDialog, type LoggedBreakfast } from "@/components/already-made";
import {
  NO_PROGRESS,
  clearSession,
  describeSession,
  isFinished,
  isUnderway,
  saveSession,
  startedAgo,
  useSavedSession,
  type Frame,
  type MadeChoice,
  type Mode,
  type Nav,
  type Progress,
  type SavedSession,
  type Step,
} from "@/components/flow-session";
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
import { RecipeNoteCard } from "@/components/recipe-note";
import { RecipeBadges, RecipeHeader } from "@/components/recipe-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useHour } from "@/components/use-hour";
import { VersionSwitch } from "@/components/version-switch";
import { failureMessage, unwrap } from "@/lib/action-result";
import { ingredientsWith } from "@/lib/ingredients";
import { measureGrams } from "@/lib/measures";
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
  type Ingredient,
  type Recipe,
} from "@/lib/recipes";
import { rememberedInStock } from "@/lib/stock";
import type {
  Addition,
  AppState,
  CheckStatus,
  Extra,
  RecipeNote,
  Upcoming,
  VersionChoice,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  MAX_ADDITIONS,
  SKIP_RUN_OFFER,
  defaultChoice,
  namesWith,
  recipeFromSnapshot,
  resolveRecipe,
  snapshotOf,
  versionChoices,
  withExtras,
  withSkips,
  type AdditionInput,
} from "@/lib/versions";

const nameList = (ids: string[], ingredients: Record<string, Ingredient>) =>
  ids.map((id) => (ingredients[id]?.name ?? id).toLowerCase()).join(", ");

/** One-offs as additions, with grams from the measure (null for your own items). */
const asAdditions = (extras: AdditionInput[] = []): Addition[] =>
  extras.map((a) => ({
    ...a,
    grams: measureGrams(a.ingredientId, a.qty) ?? null,
  }));

const asInputs = (list: Addition[]): AdditionInput[] =>
  list.map(({ ingredientId, qty, when }) => ({ ingredientId, qty, when }));

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
  const [nav, setNav] = useState<Nav>(() => ({
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
  const [upcoming, setUpcomingState] = useState(initial.upcoming);
  /** The last plan seen, kept after it's cleared so a finished planned breakfast still shows what it was. */
  const [lastPlan, setLastPlan] = useState(initial.upcoming);
  const [choices, setChoices] = useState(initial.choices);
  const [cartCount, setCartCount] = useState(initial.cart.length);
  const [notes, setNotes] = useState(initial.notes);
  /** Breakfasts made or logged on this screen, which `initial.lastMade` doesn't know about yet. */
  const [madeHere, setMadeHere] = useState<Record<number, string>>({});
  const [logging, setLogging] = useState<number | null>(null);
  const [progress, setProgress] = useState<Progress>(NO_PROGRESS);
  /** Repeat-skip and keep offers answered on this screen. */
  const [dismissedOffers, setDismissedOffers] = useState<string[]>([]);
  /** Your version's additions as changed by those offers, ahead of `initial.versions`. */
  const [mineNow, setMineNow] = useState<Record<number, AdditionInput[]>>({});
  const [addingOnce, setAddingOnce] = useState(false);
  const saved = useSavedSession();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (isUnderway(nav.at.step)) saveSession(nav, progress);
    else if (isFinished(nav.at.step)) clearSession();
  }, [nav, progress]);

  function setUpcoming(next: Upcoming | null) {
    setUpcomingState(next);
    if (next) setLastPlan(next);
  }

  const ingredients = useMemo(
    () => namesWith(ingredientsWith(initial.custom), lastPlan?.version, lastPlan?.extras),
    [initial.custom, lastPlan],
  );
  const versionState = useMemo(
    () => ({ versions: initial.versions, choices, disliked: initial.disliked }),
    [initial.versions, choices, initial.disliked],
  );
  const choiceFor = (recipeId: number) => defaultChoice(versionState, recipeId);

  /** The recipe as it'll be made: last night's frozen plan (with its extras), or the picked version. */
  function recipeFor(recipeId: number, choice?: MadeChoice): Recipe {
    if (choice === "planned") {
      const plan = lastPlan?.recipeId === recipeId ? lastPlan : null;
      return recipeFromSnapshot(recipeId, plan?.version, [], plan?.extras) ?? RECIPE_BY_ID[recipeId];
    }
    return (
      resolveRecipe(versionState, recipeId, ingredients, choice ?? choiceFor(recipeId))?.recipe ??
      RECIPE_BY_ID[recipeId]
    );
  }
  const nameOf = (id: string) => ingredients[id]?.name ?? id;
  /** The picked version plus this breakfast's one-offs. */
  const madeWith = (recipeId: number, choice: MadeChoice | undefined, extras: AdditionInput[] = []) =>
    withExtras(recipeFor(recipeId, choice), asAdditions(extras), nameOf);
  const making = (recipeId: number) => madeWith(recipeId, nav.at.choice, extrasFor(recipeId));
  /** One-offs already in the recipe (from last night's plan) count toward the limit too. */
  const roomFor = (recipeId: number) =>
    MAX_ADDITIONS -
    recipeFor(recipeId, nav.at.choice).ingredients.filter((ri) => ri.added).length -
    extrasFor(recipeId).length;
  const myAdditions = (recipeId: number) =>
    mineNow[recipeId] ?? asInputs(initial.versions.mine[recipeId]?.additions ?? []);

  /** The version to store with tomorrow's plan, mirroring what the server freezes. */
  function planSnapshot(recipeId: number, choice?: MadeChoice) {
    if (choice === "planned") return lastPlan?.recipeId === recipeId ? lastPlan.version : null;
    const r = resolveRecipe(versionState, recipeId, ingredients, choice ?? choiceFor(recipeId));
    return r?.version ? snapshotOf(r.version, r.recipe, ingredients) : null;
  }

  function pickVersion(recipeId: number, choice: VersionChoice) {
    const previous = choices[recipeId];
    setChoices((c) => ({ ...c, [recipeId]: choice }));
    startTransition(async () => {
      try {
        await unwrap(chooseVersion(recipeId, choice));
      } catch (err) {
        setChoices((c) => {
          const next = { ...c };
          if (previous) next[recipeId] = previous;
          else delete next[recipeId];
          return next;
        });
        toast.error(failureMessage(err, "Couldn't switch versions. Try again."));
      }
    });
  }

  const progressFor = (recipeId: number) => (progress.recipeId === recipeId ? progress : NO_PROGRESS);
  const skippedFor = (recipeId: number) => progressFor(recipeId).skipped ?? [];
  const extrasFor = (recipeId: number) => progressFor(recipeId).extras ?? [];
  const named = (extras: AdditionInput[]): Extra[] =>
    asAdditions(extras).map((a) => ({ ...a, name: nameOf(a.ingredientId) }));
  function tick(recipeId: number, patch: Partial<Omit<Progress, "recipeId">>) {
    setProgress((p) => ({
      ...(p.recipeId === recipeId ? p : NO_PROGRESS),
      ...patch,
      recipeId,
    }));
  }

  function resume(s: SavedSession) {
    setNav(s.nav);
    setProgress(s.progress);
    scrollAppToTop();
  }

  /** Last night's prep was never marked done: if it was finished after all, it's tomorrow's breakfast. */
  function confirmPrepped(s: SavedSession) {
    startTransition(async () => {
      try {
        const choice = s.nav.at.choice;
        const same = s.progress.recipeId === s.recipe.id;
        const skipped = same ? (s.progress.skipped ?? []) : [];
        const extras = same ? (s.progress.extras ?? []) : [];
        await unwrap(planTomorrow(s.recipe.id, true, { choice, skipped, extras }));
        clearSession();
        setUpcoming({
          recipeId: s.recipe.id,
          needsPrep: true,
          createdAt: new Date().toISOString(),
          version: planSnapshot(s.recipe.id, choice),
          skipped,
          extras: named(extras.map((a) => ({ ...a, when: "night" }))),
        });
        go({ name: "upcoming" }, { mode: "now", skipped: [], pinned: null });
      } catch (err) {
        toast.error(failureMessage(err));
      }
    });
  }

  const suggestedMode: Mode | null =
    hour === null ? null : hour >= 4 && hour < 14 ? "now" : "tonight";

  const ranked = useMemo(
    () => rankRecipes({ ...initial.lastMade, ...madeHere }, initial.stats, initial.disliked),
    [initial.lastMade, madeHere, initial.stats, initial.disliked],
  );

  function setNote(recipeId: number, note: RecipeNote | undefined) {
    setNotes((all) => {
      const next = { ...all };
      if (note) next[recipeId] = note;
      else delete next[recipeId];
      return next;
    });
  }

  const noteCard = (recipeId: number) =>
    notes[recipeId] && (
      <RecipeNoteCard
        key={`note-${recipeId}`}
        recipeId={recipeId}
        note={notes[recipeId]}
        onChange={(n) => setNote(recipeId, n)}
      />
    );

  function logged({ recipeId, madeAt, note }: LoggedBreakfast) {
    setLogging(null);
    setMadeHere((m) => ({ ...m, [recipeId]: madeAt }));
    if (note !== null)
      setNote(recipeId, note ? { text: note, updatedAt: new Date().toISOString() } : undefined);
    nextSuggestion(recipeId);
  }

  const knownMissing = (recipeId: number) =>
    checkableIds(recipeFor(recipeId)).some((id) => session[id] === "missing");

  const eligible = pinned !== null ? [pinned, ...ranked.filter((id) => id !== pinned)] : ranked;
  const candidates = eligible.filter((id) => !skipped.includes(id) && !knownMissing(id));
  const autoSkipped = eligible.filter((id) => !skipped.includes(id) && knownMissing(id)).length;

  /** Forward one screen; Back returns to exactly the screen you were on. */
  function go(next: Step, patch: Partial<Omit<Frame, "step">> = {}) {
    setNav(({ at, trail }) => ({
      at: { ...at, ...patch, step: next },
      trail: [...trail, at],
    }));
    scrollAppToTop();
  }

  /** Swap the current screen without adding a Back step. */
  function replace(next: Step) {
    setNav(({ at, trail }) => ({ at: { ...at, step: next }, trail }));
  }

  /** Once something is saved (made, prepped, rated) there's nothing to step back into. */
  function settle(next: Step) {
    setNav(({ at }) => ({ at: { ...at, step: next }, trail: [] }));
    setProgress(NO_PROGRESS);
    scrollAppToTop();
  }

  function stepBack() {
    if (nav.trail.length) {
      setNav(({ trail }) => ({
        at: trail[trail.length - 1],
        trail: trail.slice(0, -1),
      }));
      scrollAppToTop();
    } else if (startWith) {
      goBack(router, `/recipes/${startWith.recipeId}`);
    }
  }

  function restart() {
    clearSession();
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
    cookedAheadItems(recipeFor(recipeId)).filter(
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
      toast.success(
        `Added ${missing.length} ${missing.length === 1 ? "thing" : "things"} to your cart`,
      );
    });
  }

  function nextSuggestion(skipId?: number) {
    const nextSkipped = skipId ? [...skipped, skipId] : skipped;
    const remaining = eligible.filter((id) => !nextSkipped.includes(id) && !knownMissing(id));
    go(remaining.length ? { name: "suggest" } : { name: "exhausted" }, {
      skipped: nextSkipped,
    });
  }

  /** Starts making a recipe in the version picked; from last night's plan, its night skips come along. */
  function beginCheck(recipeId: number, scope: CheckScope, choice: MadeChoice) {
    if (progress.recipeId !== recipeId) {
      setProgress({
        ...NO_PROGRESS,
        recipeId,
        skipped: choice === "planned" ? (lastPlan?.skipped ?? []) : [],
      });
    }
    const ids = checkableIds(recipeFor(recipeId, choice), scope);
    if (ids.length === 0) {
      afterCheckPassed(recipeId, scope, choice);
      return;
    }
    go({ name: "check", recipeId, scope }, { choice });
  }

  function afterCheckPassed(
    recipeId: number,
    scope: CheckScope,
    choice: MadeChoice | undefined = nav.at.choice,
  ) {
    const recipe = recipeFor(recipeId, choice);
    if (mode === "tonight") {
      if (recipe.prep === "overnight") go({ name: "gather", recipeId, scope: "night" }, { choice });
      else {
        startTransition(async () => {
          try {
            await unwrap(planTomorrow(recipeId, false, { choice }));
            setUpcoming({
              recipeId,
              needsPrep: false,
              createdAt: new Date().toISOString(),
              version: planSnapshot(recipeId, choice),
              skipped: [],
              extras: [],
            });
            settle({ name: "tonightDone", recipeId, needsPrep: false });
          } catch (err) {
            toast.error(failureMessage(err));
          }
        });
      }
    } else {
      go({ name: "gather", recipeId, scope }, { choice });
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
    const choice = nav.at.choice;
    const skipped = skippedFor(recipeId);
    const extras = extrasFor(recipeId);
    startTransition(async () => {
      try {
        const historyId = await unwrap(markMade(recipeId, { choice, skipped, extras }));
        setMadeHere((m) => ({ ...m, [recipeId]: new Date().toISOString() }));
        if (upcoming?.recipeId === recipeId) setUpcomingState(null);
        settle({
          name: "serve",
          recipeId,
          historyId,
          choice,
          skipped,
          extras: named(extras),
        });
      } catch (err) {
        toast.error(failureMessage(err));
      }
    });
  }

  function markPrepped(recipeId: number) {
    const choice = nav.at.choice;
    const skipped = skippedFor(recipeId);
    const extras = extrasFor(recipeId);
    startTransition(async () => {
      try {
        await unwrap(planTomorrow(recipeId, true, { choice, skipped, extras }));
        setUpcoming({
          recipeId,
          needsPrep: true,
          createdAt: new Date().toISOString(),
          version: planSnapshot(recipeId, choice),
          skipped,
          extras: named(extras.map((a) => ({ ...a, when: "night" }))),
        });
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
        <Button
          variant="ghost"
          size="sm"
          className="-mr-2 h-10 text-muted-foreground"
          onClick={restart}
        >
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

          {saved && (
            <ResumeCard
              saved={saved}
              recipe={madeWith(
                saved.recipe.id,
                saved.nav.at.choice,
                saved.progress.recipeId === saved.recipe.id ? saved.progress.extras : [],
              )}
              pending={pending}
              onResume={() => resume(saved)}
              onPrepped={() => confirmPrepped(saved)}
              onDiscard={clearSession}
            />
          )}

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
          <p className="text-lg">
            {prepped ? "Is it ready in the fridge?" : "Still want to make it?"}
          </p>
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

    case "suggest": {
      const id = candidates[0];
      if (id === undefined) {
        return <Exhausted back={back} cartCount={cartCount} />;
      }
      const choice = choiceFor(id);
      const recipe = recipeFor(id, choice);
      const items = recipeItems(recipe).filter((ri) => !INGREDIENTS[ri.id]?.always);
      const lastSkipped = (initial.skips[id]?.last ?? []).filter((s) =>
        items.some((ri) => ri.id === s),
      );
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
                onClick={() => beginCheck(r.id, "morning", choiceFor(r.id))}
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
            ingredients={ingredients}
          />
        </section>
      );
    }

    case "missed": {
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

    case "gather": {
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
            <Button
              variant="outline"
              className="h-11 border-dashed"
              onClick={() => setAddingOnce(true)}
            >
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

    case "steps": {
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

    case "tonightDone": {
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

    case "serve": {
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
                !myIds.includes(a.ingredientId) &&
                !dismissedOffers.includes(`keep:${a.ingredientId}`),
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

/** An unfinished breakfast saved on this phone: pick it back up, or say last night's prep got done. */
function ResumeCard({
  saved,
  recipe,
  pending,
  onResume,
  onPrepped,
  onDiscard,
}: {
  saved: SavedSession;
  /** The version being made, so step counts include any added steps. */
  recipe: Recipe;
  pending: boolean;
  onResume: () => void;
  onPrepped: () => void;
  onDiscard: () => void;
}) {
  if (saved.status === "askPrepped") {
    return (
      <Card className="ring-primary/30">
        <CardHeader>
          <CardDescription className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-primary uppercase">
            <MoonIcon className="size-3.5" />
            Last night
          </CardDescription>
          <CardTitle className="text-lg">
            Did you finish prepping {saved.recipe.name.toLowerCase()}?
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Button size="lg" className="h-12 text-base" disabled={pending} onClick={onPrepped}>
            Yes, it&apos;s in the fridge
          </Button>
          <Button variant="outline" size="lg" className="h-11" disabled={pending} onClick={onDiscard}>
            No, I didn&apos;t finish
          </Button>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="ring-primary/30">
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-primary uppercase">
          {saved.nav.at.mode === "tonight" ? (
            <MoonIcon className="size-3.5" />
          ) : (
            <SunIcon className="size-3.5" />
          )}
          {saved.nav.at.mode === "tonight" ? "Prep in progress" : "Breakfast in progress"}
        </CardDescription>
        <CardTitle className="text-lg">Resume: {saved.recipe.name}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {describeSession(saved, recipe)} · {startedAgo(saved)}
        </p>
      </CardHeader>
      <CardContent className="grid grid-cols-[1fr_auto] gap-2">
        <Button size="lg" className="h-12 text-base" onClick={onResume}>
          <PlayIcon />
          Resume
        </Button>
        <Button variant="ghost" size="lg" className="h-12 text-muted-foreground" onClick={onDiscard}>
          Discard
        </Button>
      </CardContent>
    </Card>
  );
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
