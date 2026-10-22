import { describe, expect, test } from "vitest";
import { DAY } from "./time";
import { analyzePatterns } from "./patterns";
import { isDisliked, preferenceScore, rankRecipes } from "./recipes";
import type { HistoryEntry, RecipeStats } from "./types";

let n = 0;
function meal(recipeId: number, taste?: number, feel?: number, again?: number): HistoryEntry {
  n += 1;
  const madeAt = new Date(Date.UTC(2026, 0, 1) + n * DAY).toISOString();
  return taste === undefined
    ? { id: String(n), recipeId, madeAt }
    : { id: String(n), recipeId, madeAt, taste, feel, again };
}

function stat(taste: number, feel: number, again: number): RecipeStats {
  return { made: 1, rated: 1, taste, feel, again, lastNote: null };
}

describe("preference scoring", () => {
  test("weights again, then taste, then feel", () => {
    expect(preferenceScore(stat(5, 5, 5))).toBe(5);
    expect(preferenceScore(stat(1, 1, 5))).toBeCloseTo(3);
    expect(preferenceScore(undefined)).toBeNull();
  });

  test("dislikes rank last", () => {
    const ranked = rankRecipes({}, { 1: stat(1, 1, 1), 2: stat(5, 5, 5) });
    expect(ranked.at(-1)).toBe(1);
    expect(isDisliked(stat(4, 4, 2))).toBe(true);
    expect(isDisliked(stat(4, 4, 4))).toBe(false);
  });
});

describe("analyzePatterns", () => {
  test("stays quiet below the minimum number of ratings", () => {
    const p = analyzePatterns([meal(1, 5, 5, 5), meal(9, 1, 1, 1), meal(2, 5, 5, 5)], {});
    expect(p.enoughData).toBe(false);
    expect(p.traits).toEqual([]);
    expect(p.feel).toEqual([]);
  });

  test("finds a sweet over savory preference", () => {
    const history = [meal(1, 5, 5, 5), meal(2, 5, 4, 5), meal(9, 2, 3, 2), meal(11, 2, 2, 1)];
    const p = analyzePatterns(history, {});
    const flavor = p.traits.find((t) => t.id === "flavor");
    expect(flavor?.best.value).toBe("Sweet");
    expect(flavor?.worst.value).toBe("Savory");
  });

  test("ignores small gaps and single-meal groups", () => {
    const even = [meal(1, 4, 4, 4), meal(2, 4, 4, 4), meal(9, 4, 4, 3), meal(11, 4, 4, 4)];
    expect(analyzePatterns(even, {}).traits).toEqual([]);
    // Chicken has only one rated meal, so a low score there can't make a pattern.
    const single = [...even, meal(12, 1, 1, 1)];
    const protein = analyzePatterns(single, {}).traits.find((t) => t.id === "protein");
    expect(protein).toBeUndefined();
  });

  test("counts tried recipes and averages the last seven", () => {
    const history = [meal(1), meal(1), meal(3), ...Array.from({ length: 6 }, () => meal(5))];
    const p = analyzePatterns(history, {});
    expect(p.tried).toBe(3);
    expect(p.recent.count).toBe(7);
  });
});
