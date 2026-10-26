import { USDA_FOODS } from "./nutrition-data";
import { ALL_INGREDIENTS } from "./recipes";

export type Measure = { label: string; grams: number };

/**
 * Amounts you can add of each catalog ingredient, with USDA FoodData Central portion
 * weights (the same source as PORTION_GRAMS). See docs/nutrition-methodology.md.
 */
const MEASURES: Record<string, Measure[]> = {
  "rolled-oats": [
    { label: "2 tbsp", grams: 10 },
    { label: "¼ cup", grams: 20 },
    { label: "½ cup", grams: 40.5 },
  ],
  "greek-yogurt": [
    { label: "2 tbsp", grams: 28 },
    { label: "¼ cup", grams: 57 },
    { label: "½ cup", grams: 113 },
  ],
  "soy-milk": [
    { label: "¼ cup", grams: 61 },
    { label: "½ cup", grams: 121.5 },
    { label: "1 cup", grams: 243 },
  ],
  "silken-tofu": [
    { label: "¼ cup", grams: 62 },
    { label: "½ cup", grams: 124 },
  ],
  "firm-tofu": [
    { label: "¼ cup, cubed", grams: 63 },
    { label: "½ cup, cubed", grams: 126 },
  ],
  blueberries: [
    { label: "¼ cup", grams: 37 },
    { label: "½ cup", grams: 74 },
    { label: "1 cup", grams: 148 },
  ],
  strawberries: [
    { label: "¼ cup, sliced", grams: 42 },
    { label: "½ cup, sliced", grams: 83 },
    { label: "1 cup, sliced", grams: 166 },
  ],
  mango: [
    { label: "¼ cup, diced", grams: 41 },
    { label: "½ cup, diced", grams: 82 },
  ],
  cherries: [
    { label: "¼ cup", grams: 39 },
    { label: "½ cup", grams: 77 },
  ],
  edamame: [
    { label: "¼ cup", grams: 39 },
    { label: "½ cup", grams: 77.5 },
  ],
  apple: [
    { label: "½ apple", grams: 91 },
    { label: "1 apple", grams: 182 },
  ],
  pear: [
    { label: "½ pear", grams: 89 },
    { label: "1 pear", grams: 178 },
  ],
  kiwi: [
    { label: "1 kiwi", grams: 69 },
    { label: "2 kiwis", grams: 138 },
  ],
  avocado: [
    { label: "¼ avocado", grams: 50 },
    { label: "½ avocado", grams: 100 },
  ],
  tomato: [
    { label: "¼ cup, chopped", grams: 45 },
    { label: "½ tomato", grams: 62 },
    { label: "1 tomato", grams: 123 },
  ],
  lemon: [
    { label: "1 tsp juice", grams: 5 },
    { label: "1 tbsp juice", grams: 15 },
  ],
  lime: [
    { label: "1 tsp juice", grams: 5 },
    { label: "1 tbsp juice", grams: 15 },
  ],
  "bell-pepper": [
    { label: "¼ cup, chopped", grams: 37 },
    { label: "½ cup, chopped", grams: 75 },
  ],
  spinach: [
    { label: "½ cup", grams: 15 },
    { label: "1 cup", grams: 30 },
  ],
  broccoli: [
    { label: "½ cup", grams: 46 },
    { label: "1 cup", grams: 91 },
  ],
  mushrooms: [
    { label: "¼ cup, sliced", grams: 18 },
    { label: "½ cup, sliced", grams: 35 },
  ],
  chia: [
    { label: "1 tsp", grams: 4 },
    { label: "1 tbsp", grams: 12 },
    { label: "2 tbsp", grams: 24 },
  ],
  walnuts: [
    { label: "1 tbsp, chopped", grams: 7 },
    { label: "2 tbsp, chopped", grams: 14 },
    { label: "¼ cup, chopped", grams: 30 },
  ],
  almonds: [
    { label: "1 tbsp, chopped", grams: 9 },
    { label: "2 tbsp, chopped", grams: 18 },
    { label: "¼ cup, chopped", grams: 36 },
  ],
  "pumpkin-seeds": [
    { label: "1 tbsp", grams: 8 },
    { label: "2 tbsp", grams: 16 },
    { label: "¼ cup", grams: 32 },
  ],
  sesame: [
    { label: "1 tsp", grams: 3 },
    { label: "1 tbsp", grams: 9 },
  ],
  "peanut-butter": [
    { label: "1 tsp", grams: 5 },
    { label: "1 tbsp", grams: 16 },
    { label: "2 tbsp", grams: 32 },
  ],
  "almond-butter": [
    { label: "1 tsp", grams: 5 },
    { label: "1 tbsp", grams: 16 },
    { label: "2 tbsp", grams: 32 },
  ],
  honey: [
    { label: "1 tsp", grams: 7 },
    { label: "1 tbsp", grams: 21 },
  ],
  "fortified-cereal": [
    { label: "¼ cup", grams: 7 },
    { label: "½ cup", grams: 14 },
    { label: "1 cup", grams: 28 },
  ],
  bread: [
    { label: "1 slice", grams: 32 },
    { label: "2 slices", grams: 64 },
  ],
  chickpeas: [
    { label: "¼ cup", grams: 41 },
    { label: "½ cup", grams: 82 },
  ],
  lentils: [
    { label: "¼ cup", grams: 50 },
    { label: "½ cup", grams: 99 },
  ],
  "black-beans": [
    { label: "¼ cup", grams: 60 },
    { label: "½ cup", grams: 120 },
  ],
  "white-beans": [
    { label: "¼ cup", grams: 65 },
    { label: "½ cup", grams: 131 },
  ],
  salsa: [
    { label: "1 tbsp", grams: 18 },
    { label: "2 tbsp", grams: 36 },
  ],
  cocoa: [
    { label: "1 tsp", grams: 1.8 },
    { label: "1 tbsp", grams: 5.4 },
  ],
  cinnamon: [
    { label: "¼ tsp", grams: 0.65 },
    { label: "½ tsp", grams: 1.3 },
    { label: "1 tsp", grams: 2.6 },
  ],
  turmeric: [
    { label: "¼ tsp", grams: 0.75 },
    { label: "½ tsp", grams: 1.5 },
  ],
  paprika: [
    { label: "¼ tsp", grams: 0.58 },
    { label: "½ tsp", grams: 1.15 },
  ],
  "garlic-powder": [
    { label: "¼ tsp", grams: 0.78 },
    { label: "½ tsp", grams: 1.55 },
  ],
  "black-pepper": [
    { label: "A pinch", grams: 0.1 },
    { label: "½ tsp", grams: 1.15 },
  ],
  salt: [
    { label: "A pinch", grams: 0.4 },
    { label: "½ tsp", grams: 3 },
  ],
  "olive-oil": [
    { label: "1 tsp", grams: 4.5 },
    { label: "1 tbsp", grams: 13.5 },
  ],
  "quinoa-cooked": [
    { label: "¼ cup", grams: 46 },
    { label: "½ cup", grams: 92.5 },
  ],
  "rice-cooked": [
    { label: "¼ cup", grams: 49 },
    { label: "½ cup", grams: 98 },
  ],
  "buckwheat-cooked": [
    { label: "¼ cup", grams: 42 },
    { label: "½ cup", grams: 84 },
  ],
  "sweet-potato-cooked": [
    { label: "¼ cup", grams: 50 },
    { label: "½ cup", grams: 100 },
  ],
  "chicken-cooked": [
    { label: "1 oz", grams: 28 },
    { label: "3 oz", grams: 85 },
  ],
};

/**
 * Measures for a catalog ingredient you can add to a recipe, or none. Raw bases of
 * cooked-ahead items (dry quinoa, raw chicken...) have no USDA record and aren't addable;
 * their cooked forms are.
 */
export function measuresFor(id: string): Measure[] {
  return USDA_FOODS[id] ? (MEASURES[id] ?? []) : [];
}

/** Catalog ingredients that can be added to a recipe. */
export const ADDABLE_CATALOG = ALL_INGREDIENTS.filter((i) => measuresFor(i.id).length > 0);

export const measureGrams = (id: string, label: string) => measuresFor(id).find((m) => m.label === label)?.grams;
