import { measureGrams } from "@/lib/measures";
import type { Ingredient } from "@/lib/recipes";
import type { Addition } from "@/lib/types";
import type { AdditionInput } from "@/lib/versions";

export const nameList = (ids: string[], ingredients: Record<string, Ingredient>) =>
  ids.map((id) => (ingredients[id]?.name ?? id).toLowerCase()).join(", ");

/** One-offs as additions, with grams from the measure (null for your own items). */
export const asAdditions = (extras: AdditionInput[] = []): Addition[] =>
  extras.map((a) => ({
    ...a,
    grams: measureGrams(a.ingredientId, a.qty) ?? null,
  }));

export const asInputs = (list: Addition[]): AdditionInput[] =>
  list.map(({ ingredientId, qty, when }) => ({ ingredientId, qty, when }));

export function greeting(hour: number | null) {
  if (hour === null) return "Hello";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
