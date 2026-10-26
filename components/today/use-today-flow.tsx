"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markMade, planTomorrow, recordCheck } from "@/app/actions";
import { chooseVersion } from "@/app/version-actions";
import { toast } from "@/components/activity/toast";
import type { LoggedBreakfast } from "@/components/already-made";
import {
  clearSession,
  isFinished,
  isUnderway,
  NO_PROGRESS,
  saveSession,
  useSavedSession,
  type Frame,
  type MadeChoice,
  type Mode,
  type Nav,
  type Progress,
  type SavedSession,
  type Step,
} from "@/components/flow-session";
import { BackButton, goBack, scrollAppToTop } from "@/components/navigation";
import type { PrepFocus, UncookedState } from "@/components/prep-details";
import { RecipeNoteCard } from "@/components/recipe-note";
import { asAdditions, asInputs } from "@/components/today/helpers";
import { Button } from "@/components/ui/button";
import { useHour } from "@/components/use-hour";
import { failureMessage, unwrap } from "@/lib/action-result";
import { ingredientsWith } from "@/lib/ingredients";
import {
  checkableIds,
  cookedAheadItems,
  INGREDIENTS,
  rankRecipes,
  RECIPE_BY_ID,
  type CheckScope,
  type Recipe,
} from "@/lib/recipes";
import { rememberedInStock } from "@/lib/stock";
import type { AppState, CheckStatus, Extra, RecipeNote, Upcoming, VersionChoice } from "@/lib/types";
import {
  defaultChoice,
  MAX_ADDITIONS,
  namesWith,
  recipeFromSnapshot,
  resolveRecipe,
  snapshotOf,
  withExtras,
  type AdditionInput,
} from "@/lib/versions";

/** Jump straight to this recipe, e.g. from a recipe page. */
export type StartWith = { recipeId: number; mode: Mode };

/** All of Today's state and actions; each screen reads what it needs from this. */
export function useTodayFlow(initial: AppState, startWith?: StartWith) {
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

  return {
    initial,
    startWith,
    hour,
    router,
    nav,
    setNav,
    step,
    mode,
    pinned,
    skipped,
    prepOpen,
    setPrepOpen,
    uncooked,
    setUncooked,
    prepFocus,
    setPrepFocus,
    session,
    setSession,
    stock,
    setStock,
    upcoming,
    setUpcomingState,
    lastPlan,
    setLastPlan,
    choices,
    setChoices,
    cartCount,
    setCartCount,
    notes,
    setNotes,
    madeHere,
    setMadeHere,
    logging,
    setLogging,
    progress,
    setProgress,
    dismissedOffers,
    setDismissedOffers,
    mineNow,
    setMineNow,
    addingOnce,
    setAddingOnce,
    saved,
    pending,
    startTransition,
    setUpcoming,
    ingredients,
    versionState,
    choiceFor,
    recipeFor,
    nameOf,
    madeWith,
    making,
    roomFor,
    myAdditions,
    planSnapshot,
    pickVersion,
    progressFor,
    skippedFor,
    extrasFor,
    named,
    tick,
    resume,
    confirmPrepped,
    suggestedMode,
    ranked,
    setNote,
    noteCard,
    logged,
    knownMissing,
    eligible,
    candidates,
    autoSkipped,
    go,
    replace,
    settle,
    stepBack,
    restart,
    start,
    uncookedItems,
    skipUncooked,
    confirmUncooked,
    nextSuggestion,
    beginCheck,
    afterCheckPassed,
    submitCheck,
    finishBreakfast,
    markPrepped,
    back,
  };
}

export type TodayFlowState = ReturnType<typeof useTodayFlow>;
