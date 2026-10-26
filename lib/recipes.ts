import type { RecipeStats } from "./types";

export type Aisle =
  | "Produce"
  | "Dairy & tofu"
  | "Meat"
  | "Frozen"
  | "Pantry"
  | "Spices & oils"
  | "Cooked ahead";

export type Batch = {
  from: string;
  minutes: number;
  keepsDays: number;
  howTo: string;
};

export type Ingredient = {
  id: string;
  name: string;
  aisle: Aisle;
  note?: string;
  batch?: Batch;
  always?: boolean;
};

export type RecipeIngredient = {
  id: string;
  qty: string;
  when?: "night" | "morning";
  /** Added by a personal version, not part of the original. */
  added?: boolean;
  /** Added just for this breakfast, not saved to any version. */
  oneOff?: boolean;
};

export type Recipe = {
  id: number;
  name: string;
  prep: "overnight" | "none";
  minutes: number;
  blurb: string;
  tip?: string;
  ingredients: RecipeIngredient[];
  nightSteps?: string[];
  steps: string[];
  /** Set on a personal version or a skipped-item variant (see lib/versions.ts). */
  variant?: {
    /** Nutrition cache key; unique per distinct set of ingredients and amounts. */
    key: string;
    portions: Record<string, number>;
    /** The household's own items in this variant, which have no nutrition data. */
    uncounted: string[];
  };
};

export const AISLE_ORDER: Aisle[] = [
  "Produce",
  "Dairy & tofu",
  "Cooked ahead",
  "Meat",
  "Frozen",
  "Pantry",
  "Spices & oils",
];

export const KITCHEN_SPOT: Record<Aisle, string> = {
  Produce: "Fridge / counter",
  "Dairy & tofu": "Fridge",
  "Cooked ahead": "Fridge",
  Meat: "Fridge",
  Frozen: "Freezer",
  Pantry: "Cupboard",
  "Spices & oils": "Spice shelf",
};

const list: Ingredient[] = [
  { id: "rolled-oats", name: "Rolled oats", aisle: "Pantry" },
  { id: "greek-yogurt", name: "Plain Greek yogurt", aisle: "Dairy & tofu" },
  { id: "soy-milk", name: "Fortified unsweetened soy milk", aisle: "Dairy & tofu" },
  { id: "silken-tofu", name: "Silken tofu", aisle: "Dairy & tofu" },
  { id: "firm-tofu", name: "Firm tofu", aisle: "Dairy & tofu" },
  { id: "blueberries", name: "Blueberries", aisle: "Produce" },
  { id: "strawberries", name: "Strawberries", aisle: "Produce" },
  { id: "mango", name: "Mango", aisle: "Produce" },
  { id: "cherries", name: "Cherries", aisle: "Produce" },
  { id: "edamame", name: "Frozen shelled edamame", aisle: "Frozen" },
  { id: "apple", name: "Apple", aisle: "Produce" },
  { id: "pear", name: "Pear", aisle: "Produce" },
  { id: "kiwi", name: "Kiwi", aisle: "Produce" },
  { id: "avocado", name: "Avocado", aisle: "Produce" },
  { id: "tomato", name: "Tomato", aisle: "Produce" },
  { id: "lemon", name: "Lemon", aisle: "Produce" },
  { id: "lime", name: "Lime", aisle: "Produce" },
  { id: "bell-pepper", name: "Red bell pepper", aisle: "Produce" },
  { id: "spinach", name: "Spinach", aisle: "Produce" },
  { id: "broccoli", name: "Broccoli", aisle: "Produce" },
  { id: "mushrooms", name: "Mushrooms", aisle: "Produce" },
  { id: "sweet-potato", name: "Sweet potatoes", aisle: "Produce" },
  { id: "chicken-raw", name: "Chicken breast (raw)", aisle: "Meat" },
  { id: "chia", name: "Chia seeds", aisle: "Pantry" },
  { id: "walnuts", name: "Walnuts or pecans", aisle: "Pantry" },
  { id: "almonds", name: "Almonds", aisle: "Pantry" },
  { id: "pumpkin-seeds", name: "Pumpkin seeds", aisle: "Pantry" },
  { id: "sesame", name: "Sesame seeds", aisle: "Pantry" },
  { id: "honey", name: "Honey", aisle: "Pantry" },
  { id: "peanut-butter", name: "Peanut butter", aisle: "Pantry" },
  { id: "almond-butter", name: "Almond butter", aisle: "Pantry" },
  {
    id: "fortified-cereal",
    name: "Iron-fortified cereal",
    aisle: "Pantry",
    note: "Check label: no egg, coconut or beetroot",
  },
  {
    id: "bread",
    name: "Whole-grain bread",
    aisle: "Pantry",
    note: "Egg-free, check the label",
  },
  { id: "chickpeas", name: "Canned chickpeas", aisle: "Pantry" },
  { id: "lentils", name: "Canned lentils", aisle: "Pantry" },
  { id: "black-beans", name: "Canned black beans", aisle: "Pantry" },
  { id: "white-beans", name: "Canned white beans", aisle: "Pantry" },
  { id: "quinoa", name: "Quinoa (dry)", aisle: "Pantry" },
  { id: "brown-rice", name: "Brown rice (dry)", aisle: "Pantry" },
  { id: "buckwheat", name: "Buckwheat groats (dry)", aisle: "Pantry" },
  {
    id: "salsa",
    name: "Salsa",
    aisle: "Pantry",
    note: "Check label: no egg or beetroot",
  },
  { id: "cocoa", name: "Unsweetened cocoa", aisle: "Spices & oils" },
  { id: "cinnamon", name: "Cinnamon", aisle: "Spices & oils" },
  { id: "turmeric", name: "Turmeric or paprika", aisle: "Spices & oils" },
  { id: "paprika", name: "Paprika", aisle: "Spices & oils" },
  { id: "garlic-powder", name: "Garlic powder", aisle: "Spices & oils" },
  { id: "black-pepper", name: "Black pepper", aisle: "Spices & oils" },
  { id: "salt", name: "Salt", aisle: "Spices & oils" },
  { id: "olive-oil", name: "Olive oil", aisle: "Spices & oils" },
  { id: "water", name: "Water or milk", aisle: "Pantry", always: true },
  {
    id: "quinoa-cooked",
    name: "Cooked quinoa",
    aisle: "Cooked ahead",
    batch: {
      from: "quinoa",
      minutes: 20,
      keepsDays: 4,
      howTo:
        "Rinse 1 cup quinoa, simmer covered in 2 cups water for 15 min, rest 5 min. Makes about 3 cups.",
    },
  },
  {
    id: "rice-cooked",
    name: "Cooked brown rice",
    aisle: "Cooked ahead",
    batch: {
      from: "brown-rice",
      minutes: 45,
      keepsDays: 4,
      howTo:
        "Simmer 1 cup brown rice covered in 2¼ cups water for 40–45 min. Makes about 3 cups.",
    },
  },
  {
    id: "buckwheat-cooked",
    name: "Cooked buckwheat",
    aisle: "Cooked ahead",
    batch: {
      from: "buckwheat",
      minutes: 20,
      keepsDays: 4,
      howTo:
        "Toast 1 cup groats for 2 min, add 2 cups water, simmer covered 15 min. Makes about 3 cups.",
    },
  },
  {
    id: "sweet-potato-cooked",
    name: "Cooked sweet potato",
    aisle: "Cooked ahead",
    batch: {
      from: "sweet-potato",
      minutes: 45,
      keepsDays: 4,
      howTo:
        "Pierce 2–3 small sweet potatoes and bake at 400°F (200°C) for 40–50 min, or microwave 5–8 min, until tender.",
    },
  },
  {
    id: "chicken-cooked",
    name: "Cooked chicken",
    aisle: "Cooked ahead",
    batch: {
      from: "chicken-raw",
      minutes: 30,
      keepsDays: 4,
      howTo:
        "For each 1 lb of chicken breast, rub with 1 tsp olive oil, ½ tsp salt, ½ tsp black pepper, ½ tsp paprika and ½ tsp garlic powder. Bake at 425°F (220°C) for about 20 min, until 165°F (74°C) inside. Cool, cut into 3 oz portions; refrigerate up to 3–4 days or freeze.",
    },
  },
];

export const INGREDIENTS: Record<string, Ingredient> = Object.fromEntries(
  list.map((i) => [i.id, i]),
);

export const ALL_INGREDIENTS = list.filter((i) => !i.always);

export const RECIPES: Recipe[] = [
  {
    id: 1,
    name: "Blueberry–walnut overnight oats",
    prep: "overnight",
    minutes: 3,
    blurb: "A filling, familiar starting point.",
    ingredients: [
      { id: "rolled-oats", qty: "½ cup", when: "night" },
      { id: "greek-yogurt", qty: "¾ cup", when: "night" },
      { id: "chia", qty: "1 tbsp", when: "night" },
      { id: "water", qty: "A splash, to loosen", when: "night" },
      { id: "blueberries", qty: "½–¾ cup", when: "morning" },
      { id: "walnuts", qty: "1 tbsp, chopped", when: "morning" },
      { id: "honey", qty: "1 tbsp", when: "morning" },
    ],
    nightSteps: [
      "In a jar, mix the oats, yogurt and chia with a splash of water or milk.",
      "Cover and refrigerate overnight.",
    ],
    steps: [
      "Stir the oats; loosen with a little liquid if thick.",
      "Top with blueberries, chopped walnuts or pecans and 1 tbsp honey.",
      "Serve cold.",
    ],
  },
  {
    id: 2,
    name: "Strawberry–pumpkin seed overnight oats",
    prep: "overnight",
    minutes: 3,
    blurb: "A brighter, less nutty oat bowl.",
    ingredients: [
      { id: "rolled-oats", qty: "½ cup", when: "night" },
      { id: "soy-milk", qty: "½ cup", when: "night" },
      { id: "greek-yogurt", qty: "½ cup", when: "morning" },
      { id: "strawberries", qty: "¾ cup", when: "morning" },
      { id: "pumpkin-seeds", qty: "1 tbsp", when: "morning" },
      { id: "chia", qty: "1 tbsp", when: "morning" },
      { id: "walnuts", qty: "1 tbsp, chopped", when: "morning" },
    ],
    nightSteps: [
      "Stir the oats into the soy milk in a jar.",
      "Cover and refrigerate overnight.",
    ],
    steps: [
      "Stir the yogurt into the soaked oats.",
      "Slice the strawberries and add them on top.",
      "Sprinkle with pumpkin seeds, chia seeds and chopped walnuts or pecans, then serve.",
    ],
  },
  {
    id: 3,
    name: "Apple–peanut butter yogurt oats",
    prep: "none",
    minutes: 5,
    blurb: "Creamy and crunchy, without berries.",
    tip: "Optional: mix the oats and yogurt the night before for a softer texture.",
    ingredients: [
      { id: "rolled-oats", qty: "⅓ cup" },
      { id: "greek-yogurt", qty: "¾ cup" },
      { id: "apple", qty: "1, chopped" },
      { id: "peanut-butter", qty: "1 tbsp" },
      { id: "cinnamon", qty: "A pinch" },
    ],
    steps: [
      "Chop the apple.",
      "Stir the oats into the yogurt.",
      "Top with apple, a spoon of peanut butter and a pinch of cinnamon.",
    ],
  },
  {
    id: 4,
    name: "Mango–almond chia cup",
    prep: "overnight",
    minutes: 3,
    blurb: "A different texture from ordinary oats.",
    ingredients: [
      { id: "chia", qty: "2 tbsp", when: "night" },
      { id: "rolled-oats", qty: "¼ cup", when: "night" },
      { id: "soy-milk", qty: "¾ cup", when: "night" },
      { id: "mango", qty: "¾ cup", when: "morning" },
      { id: "almonds", qty: "1 tbsp, chopped", when: "morning" },
    ],
    nightSteps: [
      "Whisk the chia, oats and soy milk in a jar; stir again after 5 minutes so the chia doesn't clump.",
      "Cover and refrigerate overnight.",
    ],
    steps: [
      "Stir the chia cup.",
      "Top with mango and chopped almonds, then serve.",
    ],
  },
  {
    id: 5,
    name: "Kiwi and fortified-cereal crunch",
    prep: "none",
    minutes: 3,
    blurb: "The quickest sweet breakfast.",
    ingredients: [
      { id: "greek-yogurt", qty: "¾ cup" },
      { id: "kiwi", qty: "1" },
      { id: "fortified-cereal", qty: "½ cup" },
      { id: "pumpkin-seeds", qty: "1 tbsp" },
    ],
    steps: [
      "Peel and slice the kiwi.",
      "Spoon the yogurt into a bowl and top with kiwi and pumpkin seeds.",
      "Add the cereal just before eating so it stays crunchy.",
    ],
  },
  {
    id: 6,
    name: "Strawberry–spinach yogurt shake",
    prep: "none",
    minutes: 4,
    blurb: "Berries lead; yogurt and nut butter make it filling.",
    ingredients: [
      { id: "greek-yogurt", qty: "¾ cup" },
      { id: "soy-milk", qty: "½ cup" },
      { id: "strawberries", qty: "¾ cup" },
      { id: "spinach", qty: "1 loosely packed cup" },
      { id: "almond-butter", qty: "1 tbsp" },
    ],
    steps: [
      "Hull the strawberries.",
      "Add soy milk to the blender first, then yogurt, spinach, strawberries, almond butter and a couple of ice cubes.",
      "Blend until smooth and pour.",
    ],
  },
  {
    id: 7,
    name: "Cherry–cocoa tofu shake",
    prep: "none",
    minutes: 4,
    blurb: "Dairy-free and dessert-like, with soy protein.",
    ingredients: [
      { id: "cherries", qty: "¾ cup, pitted" },
      { id: "soy-milk", qty: "½–¾ cup" },
      { id: "silken-tofu", qty: "About 5 oz" },
      { id: "peanut-butter", qty: "1 tbsp" },
      { id: "cocoa", qty: "1 tsp" },
    ],
    steps: [
      "Pit the cherries.",
      "Add soy milk, tofu, cherries, peanut butter, cocoa and a few ice cubes to the blender.",
      "Blend until smooth and frosty; add more soy milk if it's too thick.",
    ],
  },
  {
    id: 8,
    name: "Chickpea–avocado tomato toast",
    prep: "none",
    minutes: 8,
    blurb: "An iron-conscious savory choice.",
    ingredients: [
      { id: "bread", qty: "1–2 slices" },
      { id: "chickpeas", qty: "¾ cup, rinsed" },
      { id: "avocado", qty: "¼" },
      { id: "tomato", qty: "½, chopped" },
      { id: "lemon", qty: "A squeeze" },
      { id: "black-pepper", qty: "To taste" },
    ],
    steps: [
      "Toast the bread.",
      "Rinse the chickpeas and roughly mash them with the avocado.",
      "Pile onto the toast, top with tomato, a squeeze of lemon and pepper.",
    ],
  },
  {
    id: 9,
    name: "Lemon lentil and pepper bowl",
    prep: "none",
    minutes: 8,
    blurb: "A useful test of a bean-based breakfast.",
    ingredients: [
      { id: "lentils", qty: "¾ cup" },
      { id: "quinoa-cooked", qty: "½ cup" },
      { id: "bell-pepper", qty: "½, chopped" },
      { id: "pumpkin-seeds", qty: "1 tbsp" },
      { id: "lemon", qty: "A squeeze" },
      { id: "olive-oil", qty: "1 tsp" },
    ],
    steps: [
      "Rinse the lentils and warm them with the quinoa.",
      "Chop the pepper and add it to the bowl.",
      "Top with pumpkin seeds, lemon and a drizzle of olive oil.",
    ],
  },
  {
    id: 10,
    name: "Tofu, spinach and pepper scramble",
    prep: "none",
    minutes: 12,
    blurb: "A savory scramble without egg.",
    ingredients: [
      { id: "firm-tofu", qty: "About 5 oz" },
      { id: "spinach", qty: "1 cup" },
      { id: "bell-pepper", qty: "½, chopped" },
      { id: "bread", qty: "1 slice" },
      { id: "olive-oil", qty: "1 tsp" },
      { id: "turmeric", qty: "¼ tsp" },
    ],
    steps: [
      "Heat the oil in a pan and soften the chopped pepper for 2–3 min.",
      "Crumble in the tofu, add turmeric or paprika and cook 3–4 min.",
      "Stir in the spinach until wilted. Toast the bread and serve alongside.",
    ],
  },
  {
    id: 11,
    name: "Black bean–sweet potato bowl",
    prep: "none",
    minutes: 8,
    blurb: "Fiber, color and a sweet-savory mix.",
    ingredients: [
      { id: "black-beans", qty: "¾ cup, rinsed" },
      { id: "sweet-potato-cooked", qty: "1 small" },
      { id: "avocado", qty: "¼" },
      { id: "salsa", qty: "2 tbsp" },
      { id: "lime", qty: "A squeeze" },
    ],
    steps: [
      "Reheat the sweet potato and beans until steaming.",
      "Top with sliced avocado, salsa and a squeeze of lime.",
    ],
  },
  {
    id: 12,
    name: "Chicken–broccoli rice bowl",
    prep: "none",
    minutes: 8,
    blurb: "Do you actually want chicken at breakfast?",
    ingredients: [
      { id: "chicken-cooked", qty: "3 oz" },
      { id: "rice-cooked", qty: "½ cup" },
      { id: "broccoli", qty: "1 cup" },
      { id: "lemon", qty: "A squeeze" },
      { id: "olive-oil", qty: "1 tsp, plus 1 tsp per 1 lb chicken" },
      { id: "salt", qty: "½ tsp per 1 lb chicken" },
      { id: "black-pepper", qty: "½ tsp per 1 lb chicken, plus to taste" },
      { id: "paprika", qty: "½ tsp per 1 lb chicken" },
      { id: "garlic-powder", qty: "½ tsp per 1 lb chicken" },
    ],
    steps: [
      "Steam or microwave the broccoli for about 3 min.",
      "Reheat the chicken and rice until steaming hot (165°F / 74°C).",
      "Finish with lemon, olive oil and pepper.",
    ],
  },
  {
    id: 13,
    name: "Lemon chicken and white-bean toast",
    prep: "none",
    minutes: 8,
    blurb: "A second chicken test with a different texture.",
    ingredients: [
      { id: "chicken-cooked", qty: "3 oz" },
      { id: "white-beans", qty: "½ cup, rinsed" },
      { id: "spinach", qty: "A handful" },
      { id: "bread", qty: "1–2 slices" },
      { id: "lemon", qty: "A squeeze" },
    ],
    steps: [
      "Toast the bread.",
      "Warm the chicken and beans until steaming hot (165°F / 74°C).",
      "Layer spinach on the toast, pile on the chicken and beans, finish with lemon.",
    ],
  },
  {
    id: 14,
    name: "Warm pear–walnut buckwheat",
    prep: "none",
    minutes: 6,
    blurb: "A warm, gently sweet breakfast.",
    ingredients: [
      { id: "buckwheat-cooked", qty: "About ¾ cup" },
      { id: "pear", qty: "1, chopped" },
      { id: "greek-yogurt", qty: "½ cup" },
      { id: "walnuts", qty: "1 tbsp" },
      { id: "cinnamon", qty: "A pinch" },
    ],
    steps: [
      "Chop the pear and reheat it with the buckwheat for 1–2 min.",
      "Top with yogurt, walnuts and a pinch of cinnamon.",
    ],
  },
  {
    id: 15,
    name: "Savory mushroom–edamame oats",
    prep: "none",
    minutes: 10,
    blurb: "Do oats work for you as a savory food?",
    ingredients: [
      { id: "rolled-oats", qty: "½ cup" },
      { id: "edamame", qty: "½ cup" },
      { id: "mushrooms", qty: "½ cup, sliced" },
      { id: "spinach", qty: "A handful" },
      { id: "sesame", qty: "1 tsp" },
      { id: "salt", qty: "A little" },
      { id: "water", qty: "About 1 cup" },
    ],
    steps: [
      "Simmer the oats in water with a little salt for 3–4 min.",
      "Stir in the edamame, mushrooms and spinach; cook until hot and wilted.",
      "Sprinkle with sesame seeds and serve.",
    ],
  },
];

export const RECIPE_BY_ID: Record<number, Recipe> = Object.fromEntries(
  RECIPES.map((r) => [r.id, r]),
);

export type CheckScope = "all" | "night" | "morning";

export function recipeItems(recipe: Recipe, scope: CheckScope = "all") {
  return recipe.ingredients.filter(
    (ri) => scope === "all" || (ri.when ?? "morning") === scope,
  );
}

export function checkableIds(recipe: Recipe, scope: CheckScope = "all") {
  return recipeItems(recipe, scope)
    .map((ri) => ri.id)
    .filter((id) => !INGREDIENTS[id]?.always);
}

/**
 * Ingredients you can mark as an allergy or dislike. Cooked-ahead forms are left
 * out: ticking the raw ingredient already covers the batch made from it.
 */
export const DISLIKABLE = ALL_INGREDIENTS.filter((i) => !i.batch);

/** Which of your disliked ingredients this recipe uses, counting batches as their raw base. */
export function dislikedIn(recipe: Recipe, disliked: Iterable<string>) {
  const set = disliked instanceof Set ? disliked : new Set(disliked);
  const ids = recipe.ingredients.map((ri) => INGREDIENTS[ri.id]?.batch?.from ?? ri.id);
  return [...new Set(ids.filter((id) => set.has(id)))];
}

/** The breakfasts you're willing to eat: everything that uses none of your disliked ingredients. */
export function visibleRecipes(disliked: Iterable<string>, recipes: Recipe[] = RECIPES) {
  const set = new Set(disliked);
  return set.size ? recipes.filter((r) => dislikedIn(r, set).length === 0) : recipes;
}

export function usesCookedAhead(recipe: Recipe) {
  return recipe.ingredients.some((ri) => INGREDIENTS[ri.id]?.batch);
}

/** Cooked-ahead components this recipe needs, with how to make each one. */
export function cookedAheadItems(recipe: Recipe) {
  return recipe.ingredients
    .filter((ri) => INGREDIENTS[ri.id]?.batch)
    .map((ri) => ({ ...INGREDIENTS[ri.id], qty: ri.qty, batch: INGREDIENTS[ri.id].batch! }));
}

export type PrepKind = "overnight" | "cookedAhead" | "none";

/** The advance work a recipe needs, most demanding first. */
export function prepKinds(recipe: Recipe): PrepKind[] {
  const kinds: PrepKind[] = [];
  if (recipe.prep === "overnight") kinds.push("overnight");
  if (usesCookedAhead(recipe)) kinds.push("cookedAhead");
  return kinds.length ? kinds : ["none"];
}

export type Traits = {
  flavor: "Sweet" | "Savory";
  temperature: "Cold" | "Warm";
  format: "Bowl" | "Shake" | "Toast" | "Scramble";
  protein: "Dairy" | "Soy" | "Beans & lentils" | "Chicken";
};

export const TRAIT_LABELS: Record<keyof Traits, string> = {
  flavor: "Sweet or savory",
  temperature: "Cold or warm",
  format: "Format",
  protein: "Main protein",
};

export const RECIPE_TRAITS: Record<number, Traits> = {
  1: { flavor: "Sweet", temperature: "Cold", format: "Bowl", protein: "Dairy" },
  2: { flavor: "Sweet", temperature: "Cold", format: "Bowl", protein: "Dairy" },
  3: { flavor: "Sweet", temperature: "Cold", format: "Bowl", protein: "Dairy" },
  4: { flavor: "Sweet", temperature: "Cold", format: "Bowl", protein: "Soy" },
  5: { flavor: "Sweet", temperature: "Cold", format: "Bowl", protein: "Dairy" },
  6: { flavor: "Sweet", temperature: "Cold", format: "Shake", protein: "Dairy" },
  7: { flavor: "Sweet", temperature: "Cold", format: "Shake", protein: "Soy" },
  8: { flavor: "Savory", temperature: "Cold", format: "Toast", protein: "Beans & lentils" },
  9: { flavor: "Savory", temperature: "Warm", format: "Bowl", protein: "Beans & lentils" },
  10: { flavor: "Savory", temperature: "Warm", format: "Scramble", protein: "Soy" },
  11: { flavor: "Savory", temperature: "Warm", format: "Bowl", protein: "Beans & lentils" },
  12: { flavor: "Savory", temperature: "Warm", format: "Bowl", protein: "Chicken" },
  13: { flavor: "Savory", temperature: "Warm", format: "Toast", protein: "Chicken" },
  14: { flavor: "Sweet", temperature: "Warm", format: "Bowl", protein: "Dairy" },
  15: { flavor: "Savory", temperature: "Warm", format: "Bowl", protein: "Soy" },
};

/**
 * One 1–5 score per recipe from its ratings: wanting it again matters most,
 * then taste, then how you felt afterward. Null until rated.
 */
export function preferenceScore(stats: RecipeStats | undefined) {
  if (!stats || stats.again === null || stats.taste === null || stats.feel === null) return null;
  return stats.again * 0.5 + stats.taste * 0.3 + stats.feel * 0.2;
}

export function isDisliked(stats: RecipeStats | undefined) {
  const score = preferenceScore(stats);
  return score !== null && (score <= 2.25 || (stats?.again ?? 5) <= 2);
}

export function sortByKitchen<T extends { id: string }>(
  items: T[],
  ingredients: Record<string, Ingredient> = INGREDIENTS,
) {
  const spot = (id: string) => AISLE_ORDER.indexOf(ingredients[id]?.aisle ?? "Pantry");
  return [...items].sort((a, b) => spot(a.id) - spot(b.id));
}

/**
 * Least-recently-made first; never-made recipes lead, and recipes rated
 * poorly across taste, feel and "again" drop to the end. Anything using an
 * ingredient you've marked as an allergy or dislike is left out entirely.
 */
export function rankRecipes(
  lastMade: Record<number, string>,
  stats: Record<number, RecipeStats>,
  disliked: Iterable<string> = [],
) {
  return [...visibleRecipes(disliked)]
    .sort((a, b) => {
      const dislikedA = isDisliked(stats[a.id]) ? 1 : 0;
      const dislikedB = isDisliked(stats[b.id]) ? 1 : 0;
      if (dislikedA !== dislikedB) return dislikedA - dislikedB;
      const ta = lastMade[a.id] ? Date.parse(lastMade[a.id]) : 0;
      const tb = lastMade[b.id] ? Date.parse(lastMade[b.id]) : 0;
      if (ta !== tb) return ta - tb;
      return a.id - b.id;
    })
    .map((r) => r.id);
}
