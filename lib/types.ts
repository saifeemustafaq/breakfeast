import type { Aisle } from "./recipes";

export type StockEntry = { inStock: boolean; updatedAt: string };

/** An item the household added to its pantry by hand; never part of a recipe. */
export type CustomIngredient = { id: string; name: string; aisle: Aisle };

/** What `addIngredient` resolved the typed name to: an existing item, or a new one of yours. */
export type AddedIngredient = CustomIngredient & { custom: boolean; isNew: boolean };

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
};

export type CheckStatus = "have" | "missing";
