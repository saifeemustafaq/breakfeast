"use client";

import { useMemo, useSyncExternalStore } from "react";
import { RECIPE_BY_ID, type CheckScope, type Recipe } from "@/lib/recipes";
import { HOUR, MIN } from "@/lib/time";
import type { Extra, VersionChoice } from "@/lib/types";
import type { AdditionInput } from "@/lib/versions";

export type Mode = "now" | "tonight";

export type Step =
  | { name: "mode" }
  | { name: "upcoming" }
  | { name: "suggest" }
  | { name: "pickPrepped" }
  | { name: "check"; recipeId: number; scope: CheckScope }
  | { name: "missed"; recipeId: number; scope: CheckScope; missing: string[] }
  | { name: "gather"; recipeId: number; scope: CheckScope }
  | { name: "steps"; recipeId: number; night: boolean }
  | { name: "tonightDone"; recipeId: number; needsPrep: boolean }
  | { name: "serve"; recipeId: number; historyId: string; choice?: MadeChoice; skipped?: string[]; extras?: Extra[] }
  | { name: "done" }
  | { name: "exhausted" };

/** The version being made; "planned" is whatever last night's plan froze. */
export type MadeChoice = VersionChoice | "planned";

/**
 * Everything Back has to restore, so stepping back shows the same suggestion as before.
 * `skipped` is suggestions passed over; `choice` is the version picked for the one being made.
 */
export type Frame = { step: Step; mode: Mode; pinned: number | null; skipped: number[]; choice?: MadeChoice };
export type Nav = { at: Frame; trail: Frame[] };

/** Ticks on the gather and steps screens, ingredients skipped, and one-off extras, for the recipe being made. */
export type Progress = {
  recipeId: number | null;
  taken: string[];
  done: number[];
  skipped?: string[];
  extras?: AdditionInput[];
};
export const NO_PROGRESS: Progress = { recipeId: null, taken: [], done: [], skipped: [], extras: [] };

type Session = { version: 1; nav: Nav; progress: Progress; startedAt: number; updatedAt: number };

/** Screens that mean you've started making something; only these are saved. */
export const isUnderway = (step: Step) =>
  step.name === "check" || step.name === "missed" || step.name === "gather" || step.name === "steps";
/** Screens after a save, where the session is over. */
export const isFinished = (step: Step) =>
  step.name === "serve" || step.name === "tonightDone" || step.name === "done";

const KEY = "breakfeast.today.session.v1";
const NOW_FOR = 3 * HOUR;
const TONIGHT_FOR = 18 * HOUR;
const MORNING_FROM = 4;
const MORNING_UNTIL = 14;

const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
const notify = () => listeners.forEach((l) => l());

function read() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function parse(raw: string | null): Session | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Session;
    return s?.version === 1 && s.nav?.at?.step ? s : null;
  } catch {
    return null;
  }
}

const recipeOf = (step: Step) => ("recipeId" in step ? step.recipeId : null);

/** Saved on this phone only: an unfinished breakfast belongs to whoever was making it. */
export function saveSession(nav: Nav, progress: Progress) {
  const previous = parse(read());
  const now = Date.now();
  const same = previous && recipeOf(previous.nav.at.step) === recipeOf(nav.at.step) && previous.nav.at.mode === nav.at.mode;
  const session: Session = { version: 1, nav, progress, startedAt: same ? previous.startedAt : now, updatedAt: now };
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Private mode or full storage: resuming is a nicety, so fail quietly.
  }
  notify();
}

export function clearSession() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing saved, nothing to clear.
  }
  notify();
}

export type SavedSession = {
  nav: Nav;
  progress: Progress;
  recipe: Recipe;
  startedAt: number;
  /** When this was worked out, to the minute. */
  now: number;
  /** "askPrepped": last night's prep was never marked done, so ask instead of resuming mid-prep. */
  status: "resume" | "askPrepped";
};

function evaluate(raw: string | null, now: number): SavedSession | null {
  const s = parse(raw);
  const step = s?.nav.at.step;
  if (!s || !step || !isUnderway(step)) return null;
  const recipe = RECIPE_BY_ID[recipeOf(step) ?? -1];
  if (!recipe) return null;
  const age = now - s.updatedAt;
  const base = { nav: s.nav, progress: s.progress, recipe, startedAt: s.startedAt, now };
  if (s.nav.at.mode === "now") return age < NOW_FOR ? { ...base, status: "resume" } : null;
  if (age >= TONIGHT_FOR) return null;
  const today = new Date(now);
  const morningStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), MORNING_FROM).getTime();
  const isMorning = today.getHours() >= MORNING_FROM && today.getHours() < MORNING_UNTIL;
  if (!isMorning || s.updatedAt >= morningStart) return { ...base, status: "resume" };
  const wasPrepping = (step.name === "gather" && step.scope === "night") || (step.name === "steps" && step.night);
  return wasPrepping ? { ...base, status: "askPrepped" } : null;
}

function subscribeMinute(cb: () => void) {
  const id = setInterval(cb, MIN);
  return () => clearInterval(id);
}

/** The unfinished breakfast saved on this phone, if it's still worth offering. Null on the server. */
export function useSavedSession() {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const minute = useSyncExternalStore(subscribeMinute, () => Math.floor(Date.now() / MIN), () => 0);
  return useMemo(() => (minute ? evaluate(raw, minute * MIN) : null), [raw, minute]);
}

export function startedAgo({ startedAt, now }: SavedSession) {
  const minutes = Math.max(0, Math.round((now - startedAt) / MIN));
  if (minutes < 1) return "started just now";
  if (minutes < 60) return `started ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return `started ${hours} ${hours === 1 ? "hour" : "hours"} ago`;
}

/** "Kitchen check", "2 of 3 steps done", ... for the Resume card. */
export function describeSession({ nav, progress }: SavedSession, recipe: Recipe) {
  const step = nav.at.step;
  switch (step.name) {
    case "check":
      return "At the kitchen check";
    case "missed":
      return "Some ingredients were missing";
    case "gather":
      return step.scope === "night" ? "Gathering tonight's prep" : "Taking things out";
    case "steps": {
      const total = (step.night ? recipe.nightSteps : recipe.steps)?.length ?? 0;
      const done = progress.recipeId === recipe.id ? progress.done.length : 0;
      return `${done} of ${total} ${step.night ? "prep " : ""}steps done`;
    }
    default:
      return "";
  }
}
