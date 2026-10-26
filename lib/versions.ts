import { isCustomId } from "./ingredients";
import { measureGrams } from "./measures";
import { PORTION_GRAMS } from "./nutrition";
import { INGREDIENTS, RECIPE_BY_ID, type Ingredient, type Recipe, type RecipeIngredient } from "./recipes";
import type {
  Addition,
  AppState,
  Extra,
  HistoryEntry,
  RecipeVersion,
  SkipHistory,
  VersionChoice,
  VersionSnapshot,
} from "./types";

export const MAX_ADDITIONS = 8;
/** Longest amount you can type for one of your own items. */
export const OWN_QTY_MAX = 40;
/** Skipping an item this many times running offers to take it out of your version. */
export const SKIP_RUN_OFFER = 3;

const lower = (name: string) => (/^[A-Z][a-z]/.test(name) ? name[0].toLowerCase() + name.slice(1) : name);

function listText(parts: string[]) {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** "Add your extras: chia seeds (1 tbsp) and walnuts (1 tbsp, chopped)." */
function extrasStep(additions: Addition[], nameOf: (id: string) => string) {
  return `Add your extras: ${listText(additions.map((a) => `${lower(nameOf(a.ingredientId))} (${a.qty})`))}.`;
}

/**
 * The recipe with a version's additions: extra ingredients (marked `added`), a step
 * for each half of the prep that gets some, and its own gram weights for nutrition.
 */
export function applyAdditions(recipe: Recipe, additions: Addition[], nameOf: (id: string) => string): Recipe {
  const present = new Set(recipe.ingredients.map((ri) => ri.id));
  const list = additions.filter((a) => !present.has(a.ingredientId));
  if (!list.length) return recipe;
  const overnight = recipe.prep === "overnight";
  const at = (a: Addition) => (overnight ? a.when : "morning");
  const night = list.filter((a) => at(a) === "night");
  const morning = list.filter((a) => at(a) === "morning");

  const ingredients: RecipeIngredient[] = [
    ...recipe.ingredients,
    ...list.map((a) => ({
      id: a.ingredientId,
      qty: a.qty,
      ...(overnight ? { when: a.when } : {}),
      added: true,
    })),
  ];
  const portions = { ...PORTION_GRAMS[recipe.id] };
  const uncounted: string[] = [];
  for (const a of list) {
    if (a.grams === null) uncounted.push(a.ingredientId);
    else portions[a.ingredientId] = a.grams;
  }
  return {
    ...recipe,
    ingredients,
    nightSteps: recipe.nightSteps && night.length
      ? [...recipe.nightSteps.slice(0, -1), extrasStep(night, nameOf), ...recipe.nightSteps.slice(-1)]
      : recipe.nightSteps,
    steps: morning.length ? [...recipe.steps, extrasStep(morning, nameOf)] : recipe.steps,
    variant: {
      key: `${recipe.id}|${list.map((a) => `${a.ingredientId}:${a.grams ?? a.qty}`).join(",")}`,
      portions,
      uncounted,
    },
  };
}

/**
 * The recipe with one-off extras on top of whatever version it already is. Rebuilt from the
 * original in one pass, so there's still a single "Add your extras" step and one variant key.
 */
export function withExtras(recipe: Recipe, extras: Addition[], nameOf: (id: string) => string): Recipe {
  const original = RECIPE_BY_ID[recipe.id];
  if (!extras.length || !original) return recipe;
  const portions = recipe.variant?.portions ?? {};
  const kept: Addition[] = recipe.ingredients
    .filter((ri) => ri.added)
    .map((ri) => ({ ingredientId: ri.id, qty: ri.qty, grams: portions[ri.id] ?? null, when: ri.when ?? "morning" }));
  const oneOff = new Set(extras.map((a) => a.ingredientId));
  const made = applyAdditions(original, [...kept, ...extras], nameOf);
  return {
    ...made,
    ingredients: made.ingredients.map((ri) => (ri.added && oneOff.has(ri.id) ? { ...ri, oneOff: true } : ri)),
  };
}

/** The recipe without the items you skipped, so nutrition counts what you actually ate. */
export function withSkips(recipe: Recipe, skipped: string[]): Recipe {
  const drop = new Set(skipped.filter((id) => recipe.ingredients.some((ri) => ri.id === id)));
  if (!drop.size) return recipe;
  const base = recipe.variant ?? { key: String(recipe.id), portions: { ...PORTION_GRAMS[recipe.id] }, uncounted: [] };
  const portions = Object.fromEntries(Object.entries(base.portions).filter(([id]) => !drop.has(id)));
  return {
    ...recipe,
    ingredients: recipe.ingredients.filter((ri) => !drop.has(ri.id)),
    variant: {
      key: `${base.key}|-${[...drop].sort().join(",")}`,
      portions,
      uncounted: base.uncounted.filter((id) => !drop.has(id)),
    },
  };
}

/** Additions that still make sense: own items still in the pantry, nothing you've since marked as a dislike. */
function usable(additions: Addition[], ingredients: Record<string, Ingredient>, disliked: Set<string>) {
  return additions.filter((a) => {
    const item = ingredients[a.ingredientId];
    if (!item) return false;
    return !disliked.has(item.batch?.from ?? a.ingredientId);
  });
}

export type ChoiceOption = { choice: VersionChoice; label: string; version: RecipeVersion | null };

export const choiceLabel = (v: RecipeVersion | null, mine: boolean) =>
  !v ? "Original" : mine ? "Your version" : `${v.ownerName}'s version`;

/** The versions you can make of this recipe: yours, the original, then what others shared. */
export function versionChoices(state: Pick<AppState, "versions">, recipeId: number): ChoiceOption[] {
  const mine = state.versions.mine[recipeId];
  return [
    ...(mine ? [{ choice: "mine" as const, label: "Your version", version: mine }] : []),
    { choice: "original" as const, label: "Original", version: null },
    ...(state.versions.shared[recipeId] ?? []).map((v) => ({
      choice: `user:${v.ownerId}` as const,
      label: choiceLabel(v, false),
      version: v,
    })),
  ];
}

export function versionFor(state: Pick<AppState, "versions">, recipeId: number, choice: VersionChoice) {
  if (choice === "original") return null;
  if (choice === "mine") return state.versions.mine[recipeId] ?? null;
  const owner = choice.slice("user:".length);
  return state.versions.shared[recipeId]?.find((v) => v.ownerId === owner) ?? null;
}

/** Your last pick if it still exists, otherwise your version, otherwise the original. */
export function defaultChoice(state: Pick<AppState, "versions" | "choices">, recipeId: number): VersionChoice {
  const last = state.choices[recipeId];
  if (last && (last === "original" || versionFor(state, recipeId, last))) return last;
  return state.versions.mine[recipeId] ? "mine" : "original";
}

export type Resolved = {
  choice: VersionChoice;
  version: RecipeVersion | null;
  recipe: Recipe;
  label: string;
};

/** The recipe to show or make for a choice (the default when none is given). */
export function resolveRecipe(
  state: Pick<AppState, "versions" | "choices" | "disliked">,
  recipeId: number,
  ingredients: Record<string, Ingredient>,
  choice?: VersionChoice,
): Resolved | null {
  const recipe = RECIPE_BY_ID[recipeId];
  if (!recipe) return null;
  const picked = choice ?? defaultChoice(state, recipeId);
  const version = versionFor(state, recipeId, picked);
  if (!version) return { choice: "original", version: null, recipe, label: "Original" };
  const additions = usable(version.additions, ingredients, new Set(state.disliked));
  return {
    choice: picked,
    version,
    recipe: applyAdditions(recipe, additions, (id) => ingredients[id]?.name ?? id),
    label: choiceLabel(version, picked === "mine"),
  };
}

/** Freezes a version for the history or tomorrow's plan, with names so deleted own items still read right. */
export function snapshotOf(version: RecipeVersion, recipe: Recipe, ingredients: Record<string, Ingredient>): VersionSnapshot | null {
  const used = new Set(recipe.ingredients.filter((ri) => ri.added).map((ri) => ri.id));
  const additions = version.additions
    .filter((a) => used.has(a.ingredientId))
    .map((a) => ({ ...a, name: ingredients[a.ingredientId]?.name ?? a.ingredientId }));
  return additions.length ? { ownerId: version.ownerId, ownerName: version.ownerName, additions } : null;
}

/** The recipe as made from a snapshot (tomorrow's plan, or a past breakfast). */
export function recipeFromSnapshot(
  recipeId: number,
  snapshot: VersionSnapshot | null | undefined,
  skipped: string[] = [],
  extras: Extra[] = [],
) {
  const recipe = RECIPE_BY_ID[recipeId];
  if (!recipe) return undefined;
  const names = Object.fromEntries([...(snapshot?.additions ?? []), ...extras].map((a) => [a.ingredientId, a.name]));
  const nameOf = (id: string) => names[id] ?? id;
  const made = snapshot ? applyAdditions(recipe, snapshot.additions, nameOf) : recipe;
  return withSkips(withExtras(made, extras, nameOf), skipped);
}

/** What a past breakfast actually was, for nutrition and exports. */
export const mealRecipe = (entry: Pick<HistoryEntry, "recipeId" | "version" | "skipped" | "extras">) =>
  recipeFromSnapshot(entry.recipeId, entry.version, entry.skipped, entry.extras);

/** Display names for every ingredient a snapshot or one-off list mentions, on top of the catalog and your pantry. */
export function namesWith(
  ingredients: Record<string, Ingredient>,
  snapshot: VersionSnapshot | null | undefined,
  extras: Extra[] = [],
) {
  const extra = [...(snapshot?.additions ?? []), ...extras]
    .filter((a) => !ingredients[a.ingredientId])
    .map((a) => [a.ingredientId, { id: a.ingredientId, name: a.name, aisle: "Pantry" as const }]);
  return extra.length ? { ...ingredients, ...Object.fromEntries(extra) } : ingredients;
}

/** "Skipped last time: walnuts" and the items skipped often enough to offer removing them. */
export function skipInfo(skips: SkipHistory | undefined, recipe: Recipe) {
  const inRecipe = new Set(recipe.ingredients.map((ri) => ri.id));
  return {
    last: (skips?.last ?? []).filter((id) => inRecipe.has(id)),
    runs: skips?.runs ?? {},
  };
}

export type AdditionInput = { ingredientId: string; qty: string; when: "night" | "morning" };

/**
 * Checks and normalizes a version's additions on the server: up to 8, each a pantry item
 * not already in the recipe and not one of the owner's dislikes. Catalog amounts must be
 * a listed measure (which fixes the grams); your own items take a short free-text amount.
 */
export function validateAdditions(
  recipe: Recipe,
  input: AdditionInput[],
  ctx: { customIds: Set<string>; disliked: Set<string>; max?: number },
): { ok: true; additions: Addition[] } | { ok: false; message: string } {
  if (input.length > (ctx.max ?? MAX_ADDITIONS)) {
    return {
      ok: false,
      message: ctx.max === undefined ? `You can add up to ${MAX_ADDITIONS} items.` : `Up to ${MAX_ADDITIONS} extras per breakfast, counting your version's.`,
    };
  }
  const inRecipe = new Set(recipe.ingredients.map((ri) => ri.id));
  const seen = new Set<string>();
  const additions: Addition[] = [];
  for (const a of input) {
    const id = a.ingredientId;
    if (seen.has(id)) return { ok: false, message: "Each item can only be added once." };
    seen.add(id);
    if (inRecipe.has(id)) return { ok: false, message: "That item is already in the recipe." };
    const when = recipe.prep === "overnight" ? a.when : "morning";
    if (isCustomId(id)) {
      if (!ctx.customIds.has(id)) return { ok: false, message: "That item isn't on your pantry list anymore." };
      const qty = a.qty.normalize("NFKC").trim().replace(/\s+/g, " ");
      if (!qty || qty.length > OWN_QTY_MAX) return { ok: false, message: "Give each of your own items a short amount." };
      additions.push({ ingredientId: id, qty, grams: null, when });
      continue;
    }
    const item = INGREDIENTS[id];
    if (!item || item.always) return { ok: false, message: "That item can't be added." };
    if (ctx.disliked.has(item.batch?.from ?? id)) {
      return { ok: false, message: `${item.name} is on your allergies and dislikes list.` };
    }
    const grams = measureGrams(id, a.qty);
    if (grams === undefined) return { ok: false, message: `Pick an amount for ${item.name.toLowerCase()}.` };
    additions.push({ ingredientId: id, qty: a.qty, grams, when });
  }
  return { ok: true, additions };
}
