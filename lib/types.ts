export type StockEntry = { inStock: boolean; updatedAt: string };

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
