import type { Aisle } from "./recipes";

export type StockEntry = { inStock: boolean; updatedAt: string };

/** An item the household added to its pantry by hand; never part of a recipe. */
export type CustomIngredient = { id: string; name: string; aisle: Aisle };

/** What `addIngredient` resolved the typed name to: an existing item, or a new one of yours. */
export type AddedIngredient = CustomIngredient & { custom: boolean; isNew: boolean };

export type RecipeNote = { text: string; updatedAt: string };

/**
 * An ingredient a personal version adds. `qty` is one of the catalog measures in
 * lib/measures.ts (which sets `grams`), or free text for your own items (`grams` null).
 */
export type Addition = {
  ingredientId: string;
  qty: string;
  grams: number | null;
  when: "night" | "morning";
};

/** Someone's personal take on a recipe: the original plus up to 8 additions. */
export type RecipeVersion = {
  recipeId: number;
  ownerId: string;
  ownerName: string;
  additions: Addition[];
  shared: boolean;
  updatedAt: string;
};

/** Which version of a recipe to make: the original, yours, or a household member's shared one (their user id). */
export type VersionChoice = "original" | "mine" | `user:${string}`;

/** What a breakfast was made from, frozen at the time so later edits don't rewrite history. */
export type VersionSnapshot = {
  ownerId: string;
  ownerName: string;
  additions: (Addition & { name: string })[];
};

/** Something added for one breakfast only, with its name frozen like a snapshot's. */
export type Extra = Addition & { name: string };

/** Your skips for one recipe: what you skipped last time, and how many times running each item was skipped. */
export type SkipHistory = { last: string[]; runs: Record<string, number> };

export type CartItem = {
  ingredientId: string;
  kind: "buy" | "cook";
  forRecipes: number[];
  addedAt: string;
};

export type Upcoming = {
  recipeId: number;
  needsPrep: boolean;
  createdAt: string;
  /** The version planned, if not the original. */
  version: VersionSnapshot | null;
  /** Items skipped while prepping the night before. */
  skipped: string[];
  /** One-off extras added while prepping the night before. */
  extras: Extra[];
};

export type AppState = {
  stock: Record<string, StockEntry>;
  cart: CartItem[];
  upcoming: Upcoming | null;
  lastMade: Record<number, string>;
  stats: Record<number, RecipeStats>;
  /** Your own allergies and dislikes: breakfasts using these are hidden. */
  disliked: string[];
  /** The household's own pantry items, beyond the recipe catalog. */
  custom: CustomIngredient[];
  /** The household's note for each recipe that has one. */
  notes: Record<number, RecipeNote>;
  /** Your versions, and the ones others in the household shared (live, never including yours). */
  versions: { mine: Record<number, RecipeVersion>; shared: Record<number, RecipeVersion[]> };
  /** The version you last picked for each recipe. */
  choices: Record<number, VersionChoice>;
  /** Your skips per recipe, from the breakfasts you made. */
  skips: Record<number, SkipHistory>;
  /** The signed-in user, to tell your own version snapshots from others'. */
  userId: string;
  loadedAt: number;
};

/** Averages are over rated meals only; null until the recipe has a rating. */
export type RecipeStats = {
  made: number;
  rated: number;
  taste: number | null;
  feel: number | null;
  again: number | null;
  lastNote: string | null;
};

export type HistoryEntry = {
  id: string;
  recipeId: number;
  madeAt: string;
  taste?: number;
  feel?: number;
  again?: number;
  note?: string;
  version?: VersionSnapshot;
  skipped?: string[];
  extras?: Extra[];
};

export type CheckStatus = "have" | "missing";
