import { averageNutrition, recipeNutrition } from "./nutrition";
import {
  RECIPE_BY_ID,
  RECIPE_TRAITS,
  RECIPES,
  TRAIT_LABELS,
  isDisliked,
  preferenceScore,
  type Traits,
} from "./recipes";
import type { HistoryEntry, RecipeStats } from "./types";

/** Below these, a difference is more likely noise than a preference. */
export const MIN_RATED_TOTAL = 4;
export const MIN_PER_GROUP = 2;
export const MIN_GAP = 0.75;

type RatedMeal = HistoryEntry & { taste: number; feel: number; again: number };

function isRated(h: HistoryEntry): h is RatedMeal {
  return h.taste !== undefined && h.feel !== undefined && h.again !== undefined;
}

function mealScore(h: RatedMeal) {
  return h.again * 0.5 + h.taste * 0.3 + h.feel * 0.2;
}

function mean(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export type GroupComparison = {
  id: string;
  label: string;
  best: { value: string; avg: number; count: number };
  worst: { value: string; avg: number; count: number };
};

function compareGroups(
  id: string,
  label: string,
  meals: RatedMeal[],
  groupOf: (m: RatedMeal) => string,
  scoreOf: (m: RatedMeal) => number,
): GroupComparison | null {
  const groups = new Map<string, number[]>();
  for (const m of meals) {
    const key = groupOf(m);
    groups.set(key, [...(groups.get(key) ?? []), scoreOf(m)]);
  }
  const eligible = [...groups.entries()]
    .filter(([, scores]) => scores.length >= MIN_PER_GROUP)
    .map(([value, scores]) => ({ value, avg: mean(scores), count: scores.length }))
    .sort((a, b) => b.avg - a.avg);
  if (eligible.length < 2) return null;
  const best = eligible[0];
  const worst = eligible[eligible.length - 1];
  return best.avg - worst.avg >= MIN_GAP ? { id, label, best, worst } : null;
}

export type Patterns = {
  tried: number;
  total: number;
  ratedMeals: number;
  favorites: number[];
  avoid: number[];
  traits: GroupComparison[];
  feel: GroupComparison[];
  recent: ReturnType<typeof averageNutrition>;
  enoughData: boolean;
};

export function analyzePatterns(
  history: HistoryEntry[],
  stats: Record<number, RecipeStats>,
): Patterns {
  const rated = history.filter(isRated).filter((h) => RECIPE_BY_ID[h.recipeId]);
  const enoughData = rated.length >= MIN_RATED_TOTAL;

  const scored = RECIPES.map((r) => ({ id: r.id, score: preferenceScore(stats[r.id]) })).filter(
    (r): r is { id: number; score: number } => r.score !== null,
  );
  const favorites = scored
    .filter((r) => r.score >= 4)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.id);
  const avoid = RECIPES.filter((r) => isDisliked(stats[r.id])).map((r) => r.id);

  const traits = enoughData
    ? (Object.keys(TRAIT_LABELS) as (keyof Traits)[])
        .map((key) =>
          compareGroups(key, TRAIT_LABELS[key], rated, (m) => RECIPE_TRAITS[m.recipeId][key], mealScore),
        )
        .filter((c): c is GroupComparison => c !== null)
    : [];

  const nutrientOf = (m: RatedMeal) => recipeNutrition(RECIPE_BY_ID[m.recipeId]).totals;
  const feel = enoughData
    ? [
        compareGroups(
          "protein",
          "Protein",
          rated,
          (m) => (nutrientOf(m).protein >= 20 ? "20 g protein or more" : "Under 20 g protein"),
          (m) => m.feel,
        ),
        compareGroups(
          "fiber",
          "Fiber",
          rated,
          (m) => (nutrientOf(m).fiber >= 8 ? "8 g fiber or more" : "Under 8 g fiber"),
          (m) => m.feel,
        ),
      ].filter((c): c is GroupComparison => c !== null)
    : [];

  return {
    tried: new Set(history.map((h) => h.recipeId).filter((id) => RECIPE_BY_ID[id])).size,
    total: RECIPES.length,
    ratedMeals: rated.length,
    favorites,
    avoid,
    traits,
    feel,
    recent: averageNutrition(history.slice(0, 7).map((h) => h.recipeId)),
    enoughData,
  };
}
