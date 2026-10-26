import { USDA_FOODS } from "./nutrition-data";
import { INGREDIENTS, RECIPES, type Recipe } from "./recipes";

export type NutrientKey =
  | "kcal"
  | "protein"
  | "fat"
  | "satFat"
  | "carbs"
  | "fiber"
  | "sugars"
  | "calcium"
  | "iron"
  | "magnesium"
  | "potassium"
  | "sodium"
  | "zinc"
  | "selenium"
  | "vitA"
  | "vitC"
  | "vitD"
  | "vitE"
  | "vitK"
  | "folate"
  | "b12"
  | "choline"
  | "ala";

type NutrientDef = {
  label: string;
  short: string;
  unit: "kcal" | "g" | "mg" | "mcg";
  /** FDA Daily Value for adults, or the NIH Adequate Intake where FDA sets none (ALA). */
  dv?: number;
  reference?: "AI";
  kind: "energy" | "macro" | "limit" | "micro";
};

export const NUTRIENTS: Record<NutrientKey, NutrientDef> = {
  kcal: { label: "Calories", short: "Calories", unit: "kcal", dv: 2000, kind: "energy" },
  protein: { label: "Protein", short: "Protein", unit: "g", dv: 50, kind: "macro" },
  carbs: { label: "Carbohydrates", short: "Carbs", unit: "g", dv: 275, kind: "macro" },
  fiber: { label: "Fiber", short: "Fiber", unit: "g", dv: 28, kind: "macro" },
  sugars: { label: "Total sugars", short: "Sugars", unit: "g", kind: "limit" },
  fat: { label: "Fat", short: "Fat", unit: "g", dv: 78, kind: "macro" },
  satFat: { label: "Saturated fat", short: "Sat. fat", unit: "g", dv: 20, kind: "limit" },
  sodium: { label: "Sodium", short: "Sodium", unit: "mg", dv: 2300, kind: "limit" },
  ala: { label: "Omega-3 (ALA)", short: "Omega-3", unit: "g", dv: 1.6, reference: "AI", kind: "micro" },
  calcium: { label: "Calcium", short: "Calcium", unit: "mg", dv: 1300, kind: "micro" },
  iron: { label: "Iron", short: "Iron", unit: "mg", dv: 18, kind: "micro" },
  magnesium: { label: "Magnesium", short: "Magnesium", unit: "mg", dv: 420, kind: "micro" },
  potassium: { label: "Potassium", short: "Potassium", unit: "mg", dv: 4700, kind: "micro" },
  zinc: { label: "Zinc", short: "Zinc", unit: "mg", dv: 11, kind: "micro" },
  selenium: { label: "Selenium", short: "Selenium", unit: "mcg", dv: 55, kind: "micro" },
  vitA: { label: "Vitamin A", short: "Vit A", unit: "mcg", dv: 900, kind: "micro" },
  vitC: { label: "Vitamin C", short: "Vit C", unit: "mg", dv: 90, kind: "micro" },
  vitD: { label: "Vitamin D", short: "Vit D", unit: "mcg", dv: 20, kind: "micro" },
  vitE: { label: "Vitamin E", short: "Vit E", unit: "mg", dv: 15, kind: "micro" },
  vitK: { label: "Vitamin K", short: "Vit K", unit: "mcg", dv: 120, kind: "micro" },
  folate: { label: "Folate", short: "Folate", unit: "mcg", dv: 400, kind: "micro" },
  b12: { label: "Vitamin B12", short: "B12", unit: "mcg", dv: 2.4, kind: "micro" },
  choline: { label: "Choline", short: "Choline", unit: "mg", dv: 550, kind: "micro" },
};

export const NUTRIENT_KEYS = Object.keys(NUTRIENTS) as NutrientKey[];
export const MICRO_KEYS = NUTRIENT_KEYS.filter((k) => NUTRIENTS[k].kind === "micro");

/** Ingredients that carry no nutrients worth counting. */
const NO_NUTRIENTS = new Set(["water"]);

/**
 * Grams of each ingredient in one serving. Household measures are converted
 * with USDA FoodData Central portion weights where USDA publishes them; the
 * rest are documented in docs/nutrition-methodology.md.
 */
export const PORTION_GRAMS: Record<number, Record<string, number>> = {
  1: { "rolled-oats": 40.5, "greek-yogurt": 170, chia: 12, water: 30, blueberries: 92, walnuts: 7 },
  2: { "rolled-oats": 40.5, "soy-milk": 121.5, "greek-yogurt": 113, strawberries: 125, "pumpkin-seeds": 8 },
  3: { "rolled-oats": 27, "greek-yogurt": 170, apple: 182, "peanut-butter": 16, cinnamon: 0.3 },
  4: { chia: 24, "rolled-oats": 20, "soy-milk": 182, mango: 124, almonds: 9 },
  5: { "greek-yogurt": 170, kiwi: 69, "fortified-cereal": 14, "pumpkin-seeds": 8 },
  6: { "greek-yogurt": 170, "soy-milk": 121.5, strawberries: 108, spinach: 30, "almond-butter": 16 },
  7: { cherries: 115.5, "soy-milk": 152, "silken-tofu": 142, "peanut-butter": 16, cocoa: 1.8 },
  8: { bread: 48, chickpeas: 114, avocado: 50, tomato: 62, lemon: 6, "black-pepper": 0.1 },
  9: { lentils: 148.5, "quinoa-cooked": 92.5, "bell-pepper": 60, "pumpkin-seeds": 8, lemon: 6, "olive-oil": 4.5 },
  10: { "firm-tofu": 142, spinach: 30, "bell-pepper": 60, bread: 32, "olive-oil": 4.5, turmeric: 0.75 },
  11: { "black-beans": 180, "sweet-potato-cooked": 100, avocado: 50, salsa: 36, lime: 6 },
  12: { "chicken-cooked": 85, "rice-cooked": 101, broccoli: 91, lemon: 6, "olive-oil": 4.5, "black-pepper": 0.1 },
  13: { "chicken-cooked": 85, "white-beans": 131, spinach: 20, bread: 48, lemon: 6 },
  14: { "buckwheat-cooked": 126, pear: 178, "greek-yogurt": 113, walnuts: 7, cinnamon: 0.3 },
  15: { "rolled-oats": 40.5, edamame: 77.5, mushrooms: 35, spinach: 20, sesame: 3, salt: 0.5, water: 240 },
};

type CaveatDef = { text: string; major?: boolean };

/** Where an ingredient's USDA record is a stand-in or varies a lot by brand. */
const INGREDIENT_CAVEATS: Record<string, CaveatDef> = {
  "soy-milk": {
    text: "Fortified soy milk varies by brand. USDA's record lists added calcium, vitamin D and B12 but not vitamins A or E, zinc or folate, so those totals may read low.",
    major: true,
  },
  "fortified-cereal": {
    text: "Modeled on Cheerios. Most of the iron, folic acid, zinc and B12 is added by the maker, so check your box's label.",
    major: true,
  },
  lentils: {
    text: "Canned lentils are modeled on boiled lentils; canned ones usually carry more sodium.",
    major: true,
  },
  "greek-yogurt": { text: "Modeled on low-fat plain Greek yogurt; nonfat or whole milk changes calories and fat." },
  bread: { text: "Modeled on store-bought whole-wheat bread; slice size and brand vary." },
  "black-beans": { text: "USDA canned values before rinsing; rinsing removes some sodium." },
  "white-beans": { text: "USDA canned values before rinsing; rinsing removes some sodium." },
  chickpeas: { text: "Modeled on canned chickpeas, drained and rinsed." },
  cherries: { text: "Modeled on fresh sweet cherries; frozen unsweetened are similar." },
  broccoli: { text: "Raw broccoli values; a short steam keeps most nutrients but loses some vitamin C." },
  "silken-tofu": { text: "Modeled on Mori-Nu firm silken tofu." },
  salsa: { text: "Salsa brands vary widely in sodium." },
  "peanut-butter": { text: "Modeled on salted smooth peanut butter." },
  chia: { text: "USDA doesn't report folate or choline for chia, so those totals may read low." },
};

const VARIABLE_QTY = /–|handful|squeeze|about|to taste|little|splash|pinch/i;

export type Contribution = { id: string; amount: number };

export type RecipeNutrition = {
  grams: number;
  totals: Record<NutrientKey, number>;
  /** Ingredient IDs whose USDA record doesn't report the nutrient. */
  unknownIn: Partial<Record<NutrientKey, string[]>>;
  contributions: Record<NutrientKey, Contribution[]>;
  caveats: { id: string; text: string }[];
  variableQty: string[];
  confidence: "good" | "fair";
};

const cache = new Map<number | string, RecipeNutrition>();

const cacheKey = (recipe: Recipe) => recipe.variant?.key ?? recipe.id;

/** Grams of one ingredient in a serving of this recipe or version. */
export const portionGrams = (recipe: Recipe, id: string) =>
  (recipe.variant?.portions ?? PORTION_GRAMS[recipe.id])?.[id];

export function recipeNutrition(recipe: Recipe): RecipeNutrition {
  const hit = cache.get(cacheKey(recipe));
  if (hit) return hit;

  const portions = recipe.variant?.portions ?? PORTION_GRAMS[recipe.id] ?? {};
  const uncounted = new Set(recipe.variant?.uncounted ?? []);
  const totals = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0])) as Record<NutrientKey, number>;
  const contributions = Object.fromEntries(
    NUTRIENT_KEYS.map((k) => [k, [] as Contribution[]]),
  ) as Record<NutrientKey, Contribution[]>;
  const unknownIn: Partial<Record<NutrientKey, string[]>> = {};
  let grams = 0;

  for (const ri of recipe.ingredients) {
    const g = portions[ri.id] ?? 0;
    grams += g;
    if (NO_NUTRIENTS.has(ri.id)) continue;
    const food = USDA_FOODS[ri.id];
    if (!food) continue;
    for (const k of NUTRIENT_KEYS) {
      const per100 = food.per100g[k];
      if (per100 === undefined) {
        (unknownIn[k] ??= []).push(ri.id);
        continue;
      }
      const amount = (per100 * g) / 100;
      totals[k] += amount;
      if (amount > 0) contributions[k].push({ id: ri.id, amount });
    }
  }
  for (const k of NUTRIENT_KEYS) contributions[k].sort((a, b) => b.amount - a.amount);

  const caveats = recipe.ingredients
    .filter((ri) => INGREDIENT_CAVEATS[ri.id])
    .map((ri) => ({ id: ri.id, text: INGREDIENT_CAVEATS[ri.id].text }));
  if (uncounted.size) {
    caveats.push({
      id: "uncounted",
      text: `${uncounted.size === 1 ? "1 item you added isn't" : `${uncounted.size} items you added aren't`} counted: there's no nutrition data for items you add to the pantry yourself.`,
    });
  }
  const variableQty = recipe.ingredients
    .filter((ri) => !NO_NUTRIENTS.has(ri.id) && !uncounted.has(ri.id) && VARIABLE_QTY.test(ri.qty))
    .map((ri) => ri.id);
  const confidence = recipe.ingredients.some((ri) => INGREDIENT_CAVEATS[ri.id]?.major)
    ? "fair"
    : "good";

  const result: RecipeNutrition = {
    grams,
    totals,
    unknownIn,
    contributions,
    caveats,
    variableQty,
    confidence,
  };
  cache.set(cacheKey(recipe), result);
  return result;
}

export function percentDV(key: NutrientKey, amount: number) {
  const dv = NUTRIENTS[key].dv;
  return dv ? Math.round((amount / dv) * 100) : null;
}

export function formatAmount(key: NutrientKey, amount: number) {
  const unit = NUTRIENTS[key].unit;
  if (unit === "kcal") return `${Math.round(amount)}`;
  if (unit === "g") return amount < 10 ? `${amount.toFixed(1)} g` : `${Math.round(amount)} g`;
  if (amount < 10) return `${amount.toFixed(1)} ${unit}`;
  return `${Math.round(amount)} ${unit}`;
}

/** Micronutrients ranked by share of the Daily Value this serving provides. */
export function topMicros(recipe: Recipe, limit = 3) {
  const { totals } = recipeNutrition(recipe);
  return MICRO_KEYS.map((key) => ({ key, percent: percentDV(key, totals[key]) ?? 0 }))
    .filter((m) => m.percent >= 10)
    .sort((a, b) => b.percent - a.percent)
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Insights

export type Source = { label: string; url: string };

export type Insight = {
  id: string;
  title: string;
  body: string;
  /** "established": consensus from NIH, FDA or USDA. "observational": a link seen in studies, not proof. */
  evidence: "established" | "observational";
  sources: Source[];
  score: number;
};

export const SOURCES = {
  fdc: { label: "USDA FoodData Central", url: "https://fdc.nal.usda.gov/" },
  dv: {
    label: "FDA Daily Values",
    url: "https://www.fda.gov/food/nutrition-facts-label/daily-value-nutrition-and-supplement-facts-labels",
  },
  protein: { label: "MedlinePlus: Protein in diet", url: "https://medlineplus.gov/ency/article/002467.htm" },
  proteinSatiety: {
    label: "Leidy et al., Am J Clin Nutr 2015",
    url: "https://pubmed.ncbi.nlm.nih.gov/25926512/",
  },
  fiber: { label: "Harvard Nutrition Source: Fiber", url: "https://nutritionsource.hsph.harvard.edu/carbohydrates/fiber/" },
  oats: {
    label: "FDA health claim for oat beta-glucan (21 CFR 101.81)",
    url: "https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-E/section-101.81",
  },
  iron: { label: "NIH ODS: Iron", url: "https://ods.od.nih.gov/factsheets/Iron-Consumer/" },
  vitC: { label: "NIH ODS: Vitamin C", url: "https://ods.od.nih.gov/factsheets/VitaminC-Consumer/" },
  skin: {
    label: "Cosgrove et al., Am J Clin Nutr 2007",
    url: "https://pubmed.ncbi.nlm.nih.gov/17921406/",
  },
  berries: {
    label: "Devore et al., Ann Neurol 2012",
    url: "https://pubmed.ncbi.nlm.nih.gov/22535616/",
  },
  nailsIron: {
    label: "Koilonychia review, J Eur Acad Dermatol Venereol 2016",
    url: "https://pubmed.ncbi.nlm.nih.gov/27531645/",
  },
  nailsVitamins: {
    label: "Curtis & Lipner, Skin Appendage Disord 2024",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC10987071/",
  },
  magnesium: { label: "NIH ODS: Magnesium", url: "https://ods.od.nih.gov/factsheets/Magnesium-Consumer/" },
  calcium: { label: "NIH ODS: Calcium", url: "https://ods.od.nih.gov/factsheets/Calcium-Consumer/" },
  potassium: { label: "NIH ODS: Potassium", url: "https://ods.od.nih.gov/factsheets/Potassium-Consumer/" },
  folate: { label: "NIH ODS: Folate", url: "https://ods.od.nih.gov/factsheets/Folate-Consumer/" },
  b12: { label: "NIH ODS: Vitamin B12", url: "https://ods.od.nih.gov/factsheets/VitaminB12-Consumer/" },
  zinc: { label: "NIH ODS: Zinc", url: "https://ods.od.nih.gov/factsheets/Zinc-Consumer/" },
  vitE: { label: "NIH ODS: Vitamin E", url: "https://ods.od.nih.gov/factsheets/VitaminE-Consumer/" },
  vitA: { label: "NIH ODS: Vitamin A", url: "https://ods.od.nih.gov/factsheets/VitaminA-Consumer/" },
  vitK: { label: "NIH ODS: Vitamin K", url: "https://ods.od.nih.gov/factsheets/VitaminK-Consumer/" },
  choline: { label: "NIH ODS: Choline", url: "https://ods.od.nih.gov/factsheets/Choline-Consumer/" },
  selenium: { label: "NIH ODS: Selenium", url: "https://ods.od.nih.gov/factsheets/Selenium-Consumer/" },
  omega3: { label: "NIH ODS: Omega-3 fatty acids", url: "https://ods.od.nih.gov/factsheets/Omega3FattyAcids-Consumer/" },
} satisfies Record<string, Source>;

export function shortName(id: string) {
  const name = INGREDIENTS[id].name.replace(/^(Canned|Frozen shelled|Plain|Fortified unsweetened) /, "");
  return /^Greek/.test(name) ? name : name[0].toLowerCase() + name.slice(1);
}

function names(ids: string[]) {
  const list = ids.map(shortName);
  if (list.length <= 1) return list.join("");
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

function mainSources(n: RecipeNutrition, key: NutrientKey, count = 2) {
  const total = n.totals[key];
  return n.contributions[key]
    .filter((c) => c.amount / total >= 0.15)
    .slice(0, count)
    .map((c) => c.id);
}

type Ctx = { recipe: Recipe; n: RecipeNutrition; pct: (k: NutrientKey) => number; from: (k: NutrientKey) => string };

type Rule = { id: string; when: (c: Ctx) => boolean; score: (c: Ctx) => number; build: (c: Ctx) => Omit<Insight, "id" | "score"> };

const has = (r: Recipe, ...ids: string[]) => r.ingredients.some((ri) => ids.includes(ri.id));

const RULES: Rule[] = [
  {
    id: "protein",
    when: ({ n }) => n.totals.protein >= 15,
    score: ({ n }) => 60 + n.totals.protein,
    build: ({ n, from }) => ({
      title: "Protein that carries you to lunch",
      body: `About ${Math.round(n.totals.protein)} g of protein, mostly from ${from("protein")}. Protein builds and repairs muscle, and higher-protein meals tend to keep people fuller for longer than carb-heavy ones.`,
      evidence: "established",
      sources: [SOURCES.protein, SOURCES.proteinSatiety],
    }),
  },
  {
    id: "iron-vitc",
    when: ({ pct, recipe }) =>
      pct("iron") >= 15 && pct("vitC") >= 20 && !has(recipe, "chicken-cooked"),
    score: () => 110,
    build: ({ pct, from }) => ({
      title: "Built-in iron boost",
      body: `${pct("iron")}% of a day's iron from ${from("iron")}, plus vitamin C from ${from("vitC")} in the same bowl. Plant iron is harder to absorb, and eating vitamin C with it helps your body take up more. Iron carries oxygen to every cell, so low iron shows up as tiredness.`,
      evidence: "established",
      sources: [SOURCES.iron],
    }),
  },
  {
    id: "hair-nails",
    when: ({ n, pct }) => n.totals.protein >= 18 && (pct("iron") >= 15 || pct("zinc") >= 20),
    score: () => 85,
    build: ({ n, pct }) => ({
      title: "Building blocks for hair and nails",
      body: `Hair and nails are made of keratin, a protein, and need iron and zinc to grow. This gives ${Math.round(n.totals.protein)} g protein, ${pct("iron")}% of a day's iron and ${pct("zinc")}% of zinc. Low iron is a known cause of brittle, spoon-shaped nails. Extra vitamins haven't been shown to fix nails when you aren't low, so think of this as keeping the supply steady.`,
      evidence: "established",
      sources: [SOURCES.nailsIron, SOURCES.nailsVitamins],
    }),
  },
  {
    id: "vitc-skin",
    when: ({ pct }) => pct("vitC") >= 50,
    score: ({ pct }) => 100 + pct("vitC") / 10,
    build: ({ pct, from }) => ({
      title: "Vitamin C for skin",
      body: `${pct("vitC")}% of a day's vitamin C, mostly from ${from("vitC")}. Your body needs vitamin C to make collagen, the protein that keeps skin firm and helps wounds heal. In a US study of 4,025 women, those who ate more vitamin C had a less wrinkled appearance. That's a link seen in a study, not proof that vitamin C changes how you age.`,
      evidence: "observational",
      sources: [SOURCES.vitC, SOURCES.skin],
    }),
  },
  {
    id: "berries-brain",
    when: ({ recipe }) => has(recipe, "blueberries", "strawberries"),
    score: () => 95,
    build: ({ recipe }) => ({
      title: "Berries and brain aging",
      body: `${has(recipe, "blueberries") ? "Blueberries" : "Strawberries"} are rich in flavonoids called anthocyanins. In the Nurses' Health Study of 16,010 older women, those who ate the most blueberries and strawberries had slower memory decline, equal to about 1.5 to 2.5 years of delayed brain aging. That's a long-term pattern, not the effect of one bowl.`,
      evidence: "observational",
      sources: [SOURCES.berries],
    }),
  },
  {
    id: "oats",
    when: ({ n, recipe }) => has(recipe, "rolled-oats") && (portionGrams(recipe, "rolled-oats") ?? 0) >= 27 && n.totals.fiber > 0,
    score: () => 90,
    build: () => ({
      title: "Oats for cholesterol",
      body: "Oats carry beta-glucan, a soluble fiber that forms a gel in the gut and helps lower LDL (\"bad\") cholesterol. FDA recognizes the benefit at about 3 g of beta-glucan a day as part of a diet low in saturated fat; this serving gives roughly 1 to 2 g.",
      evidence: "established",
      sources: [SOURCES.oats],
    }),
  },
  {
    id: "fiber",
    when: ({ pct }) => pct("fiber") >= 25,
    score: ({ pct }) => 70 + pct("fiber") / 2,
    build: ({ n, from }) => ({
      title: "Fiber for your gut and steady energy",
      body: `${Math.round(n.totals.fiber)} g of fiber, mostly from ${from("fiber")}. Fiber feeds your gut bacteria, keeps digestion regular and slows how fast sugar reaches your blood, so energy stays steadier through the morning. Most adults eat about half the 28 g a day they need.`,
      evidence: "established",
      sources: [SOURCES.fiber],
    }),
  },
  {
    id: "magnesium",
    when: ({ pct }) => pct("magnesium") >= 20,
    score: ({ pct }) => 60 + pct("magnesium"),
    build: ({ pct, from }) => ({
      title: "Magnesium for muscles, nerves and bones",
      body: `${pct("magnesium")}% of a day's magnesium, mostly from ${from("magnesium")}. Magnesium is used in more than 300 reactions in the body, including turning food into energy, steady muscle and nerve function, and building bone. Many US adults get less than they need.`,
      evidence: "established",
      sources: [SOURCES.magnesium],
    }),
  },
  {
    id: "omega3",
    when: ({ n }) => n.totals.ala >= 1.1,
    score: ({ n }) => 70 + n.totals.ala * 10,
    build: ({ n, from }) => ({
      title: "Plant omega-3 for your heart",
      body: `${n.totals.ala.toFixed(1)} g of ALA omega-3 from ${from("ala")}, a full day's worth. ALA is an essential fat your body can't make, and eating more of it is linked with a modestly lower risk of heart disease. Your body turns only a little of it into the DHA found in fish, so it isn't a substitute for that.`,
      evidence: "established",
      sources: [SOURCES.omega3],
    }),
  },
  {
    id: "calcium",
    when: ({ pct }) => pct("calcium") >= 20,
    score: ({ pct }) => 55 + pct("calcium"),
    build: ({ pct, from }) => ({
      title: "Calcium for strong bones",
      body: `${pct("calcium")}% of a day's calcium, mostly from ${from("calcium")}. Bones store almost all your calcium and keep rebuilding throughout life; calcium also helps muscles contract and nerves send signals.${pct("vitD") >= 10 ? ` It also brings ${pct("vitD")}% of a day's vitamin D, which helps you absorb calcium.` : ""}`,
      evidence: "established",
      sources: [SOURCES.calcium],
    }),
  },
  {
    id: "folate",
    when: ({ pct }) => pct("folate") >= 20,
    score: ({ pct }) => 55 + pct("folate"),
    build: ({ pct, from }) => ({
      title: "Folate for making new cells",
      body: `${pct("folate")}% of a day's folate, mostly from ${from("folate")}. Folate helps make DNA and new cells, including red blood cells. Anyone who could become pregnant is advised to get 400 mcg of folic acid daily, because it lowers the risk of certain birth defects.`,
      evidence: "established",
      sources: [SOURCES.folate],
    }),
  },
  {
    id: "potassium",
    when: ({ pct }) => pct("potassium") >= 15,
    score: ({ pct }) => 50 + pct("potassium"),
    build: ({ pct, from }) => ({
      title: "Potassium for healthy blood pressure",
      body: `${pct("potassium")}% of a day's potassium, mostly from ${from("potassium")}. Potassium helps your kidneys balance out sodium and supports healthy blood pressure, and most people eat less than they need.`,
      evidence: "established",
      sources: [SOURCES.potassium],
    }),
  },
  {
    id: "vitA",
    when: ({ pct }) => pct("vitA") >= 20,
    score: ({ pct }) => 50 + pct("vitA") / 2,
    build: ({ pct, from }) => ({
      title: "Vitamin A for eyes, immunity and skin",
      body: `${pct("vitA")}% of a day's vitamin A, mostly from ${from("vitA")}. Vitamin A helps you see in dim light, keeps your immune system working and supports the steady renewal of skin cells.`,
      evidence: "established",
      sources: [SOURCES.vitA],
    }),
  },
  {
    id: "vitE",
    when: ({ pct }) => pct("vitE") >= 20,
    score: ({ pct }) => 55 + pct("vitE"),
    build: ({ pct, from }) => ({
      title: "Vitamin E, an antioxidant",
      body: `${pct("vitE")}% of a day's vitamin E, mostly from ${from("vitE")}. Vitamin E protects cells, including skin cells, from damage by free radicals and supports the immune system. Food sources are the way to get it; high-dose pills haven't shown the same benefits.`,
      evidence: "established",
      sources: [SOURCES.vitE],
    }),
  },
  {
    id: "vitK",
    when: ({ pct }) => pct("vitK") >= 50,
    score: ({ pct }) => 45 + pct("vitK") / 5,
    build: ({ pct, from }) => ({
      title: "Vitamin K for blood and bones",
      body: `${pct("vitK")}% of a day's vitamin K, mostly from ${from("vitK")}. Vitamin K helps blood clot normally and helps build bone. If you take warfarin, keep your vitamin K intake consistent from day to day.`,
      evidence: "established",
      sources: [SOURCES.vitK],
    }),
  },
  {
    id: "b12",
    when: ({ pct }) => pct("b12") >= 25,
    score: ({ pct }) => 50 + pct("b12") / 2,
    build: ({ pct, from }) => ({
      title: "B12 for nerves and blood",
      body: `${pct("b12")}% of a day's vitamin B12, from ${from("b12")}. B12 keeps nerve and blood cells healthy and helps make DNA. Plant foods don't naturally contain it, so fortified foods matter if you eat little meat.`,
      evidence: "established",
      sources: [SOURCES.b12],
    }),
  },
  {
    id: "zinc",
    when: ({ pct }) => pct("zinc") >= 20,
    score: ({ pct }) => 45 + pct("zinc"),
    build: ({ pct, from }) => ({
      title: "Zinc for immunity and healing",
      body: `${pct("zinc")}% of a day's zinc, mostly from ${from("zinc")}. Zinc helps your immune system fight off germs, helps wounds heal and is needed for your senses of taste and smell.`,
      evidence: "established",
      sources: [SOURCES.zinc],
    }),
  },
  {
    id: "choline",
    when: ({ pct }) => pct("choline") >= 15,
    score: ({ pct }) => 45 + pct("choline"),
    build: ({ pct, from }) => ({
      title: "Choline for brain and liver",
      body: `${pct("choline")}% of a day's choline, mostly from ${from("choline")}. Choline is used to build cell membranes and a brain messenger involved in memory and mood, and it helps the liver move fat. Most people don't reach the recommended amount, especially without eggs.`,
      evidence: "established",
      sources: [SOURCES.choline],
    }),
  },
  {
    id: "selenium",
    when: ({ pct }) => pct("selenium") >= 30,
    score: ({ pct }) => 40 + pct("selenium") / 2,
    build: ({ pct, from }) => ({
      title: "Selenium for your thyroid",
      body: `${pct("selenium")}% of a day's selenium, mostly from ${from("selenium")}. Selenium helps make thyroid hormones and powers enzymes that protect cells from damage.`,
      evidence: "established",
      sources: [SOURCES.selenium],
    }),
  },
];

const insightCache = new Map<number | string, Insight[]>();

/** Evidence-backed reasons this breakfast is worth eating, strongest first. */
export function recipeInsights(recipe: Recipe): Insight[] {
  const hit = insightCache.get(cacheKey(recipe));
  if (hit) return hit;
  const n = recipeNutrition(recipe);
  const ctx: Ctx = {
    recipe,
    n,
    pct: (k) => percentDV(k, n.totals[k]) ?? 0,
    from: (k) => names(mainSources(n, k)),
  };
  const list = RULES.filter((r) => r.when(ctx))
    .map((r) => ({ id: r.id, score: r.score(ctx), ...r.build(ctx) }))
    .sort((a, b) => b.score - a.score);
  insightCache.set(cacheKey(recipe), list);
  return list;
}

/**
 * Average nutrition across a set of breakfasts (for history summaries). Pass recipe ids
 * for originals, or the recipes actually eaten (see mealRecipe in lib/versions.ts).
 */
export function averageNutrition(meals: (number | Recipe)[]) {
  const byId = Object.fromEntries(RECIPES.map((r) => [r.id, r]));
  const totals = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0])) as Record<NutrientKey, number>;
  const valid = meals.map((m) => (typeof m === "number" ? byId[m] : m)).filter(Boolean);
  for (const recipe of valid) {
    const n = recipeNutrition(recipe);
    for (const k of NUTRIENT_KEYS) totals[k] += n.totals[k];
  }
  if (valid.length) for (const k of NUTRIENT_KEYS) totals[k] /= valid.length;
  return { count: valid.length, totals };
}
