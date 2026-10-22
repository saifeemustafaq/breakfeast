import { describe, expect, test } from "vitest";
import { USDA_FOODS } from "./nutrition-data";
import {
  NUTRIENT_KEYS,
  PORTION_GRAMS,
  percentDV,
  recipeInsights,
  recipeNutrition,
  topMicros,
} from "./nutrition";
import { INGREDIENTS, RECIPES } from "./recipes";

const BANNED = /\b(cures?|treats?|prevents?|reverses?|detox|superfood|guarantee[sd]?|high in|good source|excellent source)\b/i;

describe("nutrition data", () => {
  test.each(RECIPES.map((r) => [r.id, r] as const))("recipe #%i maps every ingredient", (_, r) => {
    for (const ri of r.ingredients) {
      if (ri.id === "water") continue;
      expect(USDA_FOODS[ri.id], `${ri.id} has a USDA record`).toBeDefined();
      expect(PORTION_GRAMS[r.id]?.[ri.id], `${ri.id} has a gram weight`).toBeGreaterThan(0);
    }
  });

  test("portion tables only reference ingredients the recipe uses", () => {
    for (const r of RECIPES) {
      const used = new Set(r.ingredients.map((ri) => ri.id));
      for (const id of Object.keys(PORTION_GRAMS[r.id] ?? {})) expect(used.has(id), `#${r.id} ${id}`).toBe(true);
    }
  });

  test("every USDA record is for a known ingredient", () => {
    for (const id of Object.keys(USDA_FOODS)) expect(INGREDIENTS[id], id).toBeDefined();
  });

  test.each(RECIPES.map((r) => [r.id, r] as const))("recipe #%i totals are sane", (_, r) => {
    const { totals } = recipeNutrition(r);
    for (const k of NUTRIENT_KEYS) {
      expect(Number.isFinite(totals[k]), k).toBe(true);
      expect(totals[k], k).toBeGreaterThanOrEqual(0);
    }
    expect(totals.kcal).toBeGreaterThan(200);
    expect(totals.kcal).toBeLessThan(700);
    expect(totals.protein).toBeGreaterThan(10);
    // Energy roughly matches the Atwater factors for the macros.
    const atwater = totals.protein * 4 + totals.carbs * 4 + totals.fat * 9;
    expect(Math.abs(atwater - totals.kcal) / totals.kcal).toBeLessThan(0.15);
  });

  test("percent of Daily Value", () => {
    expect(percentDV("protein", 25)).toBe(50);
    expect(percentDV("kcal", 500)).toBe(25);
  });

  test("standouts are at least 10% of a day", () => {
    for (const r of RECIPES) for (const m of topMicros(r, 5)) expect(m.percent).toBeGreaterThanOrEqual(10);
  });
});

describe("insights", () => {
  test.each(RECIPES.map((r) => [r.id, r] as const))("recipe #%i has sourced insights", (_, r) => {
    const insights = recipeInsights(r);
    expect(insights.length).toBeGreaterThanOrEqual(2);
    for (const i of insights) {
      expect(i.sources.length, i.id).toBeGreaterThan(0);
      for (const s of i.sources) expect(s.url).toMatch(/^https:\/\//);
    }
  });

  test("copy avoids health claims and em dashes", () => {
    for (const r of RECIPES) {
      for (const i of recipeInsights(r)) {
        const text = `${i.title} ${i.body}`;
        expect(text, `#${r.id} ${i.id}`).not.toMatch(BANNED);
        expect(text, `#${r.id} ${i.id}`).not.toContain("\u2014");
      }
    }
  });
});
