import { INGREDIENTS, RECIPES, checkableIds } from "./recipes";
import type { CartItem } from "./types";

export type Unlock = {
  id: number;
  /** Items to buy before this breakfast is makeable. */
  shop: string[];
  /** Cooked-ahead components still to batch-cook. */
  cook: string[];
};

export type CartUnlocks = {
  /** Breakfasts the cart would unlock, in recipe order. */
  afterShop: Unlock[];
  /** Breakfasts already makeable with what's in stock. */
  readyNow: number[];
};

/**
 * What the cart unlocks: a breakfast counts only when every missing ingredient is
 * either in the cart, or a batch-cook task whose raw base is in stock or in the cart.
 */
export function cartUnlocks(
  items: CartItem[],
  inStock: (id: string) => boolean,
  recipes = RECIPES,
): CartUnlocks {
  const inCart = (id: string, kind: CartItem["kind"]) =>
    items.some((i) => i.ingredientId === id && i.kind === kind);

  const readyNow: number[] = [];
  const afterShop: Unlock[] = [];

  for (const recipe of recipes) {
    const shop: string[] = [];
    const cook: string[] = [];
    let blocked = false;
    for (const id of checkableIds(recipe)) {
      if (inStock(id)) continue;
      const batch = INGREDIENTS[id]?.batch;
      if (inCart(id, "buy")) shop.push(id);
      else if (batch && inCart(id, "cook") && (inStock(batch.from) || inCart(batch.from, "buy"))) {
        cook.push(id);
      } else blocked = true;
    }
    if (blocked) continue;
    if (shop.length + cook.length === 0) readyNow.push(recipe.id);
    else afterShop.push({ id: recipe.id, shop, cook });
  }

  return { afterShop, readyNow };
}

export type Removal = {
  /** Cart ingredient ids to delete. */
  remove: string[];
  /** Ids left alone because another breakfast in the cart still needs them. */
  kept: string[];
};

/**
 * Removing one breakfast from the cart takes its shopping items, its batch-cook tasks
 * and the raw bases of those tasks, but keeps anything another unlocked breakfast needs.
 */
export function idsToRemoveFor(recipeId: number, unlocks: CartUnlocks, items: CartItem[]): Removal {
  const target = unlocks.afterShop.find((u) => u.id === recipeId);
  if (!target) return { remove: [], kept: [] };

  const inCart = (id: string) => items.some((i) => i.ingredientId === id);
  const bases = target.cook.flatMap((id) => {
    const from = INGREDIENTS[id]?.batch?.from;
    return from && inCart(from) ? [from] : [];
  });
  const mine = [...new Set([...target.shop, ...target.cook, ...bases])];

  const neededElsewhere = new Set<string>();
  for (const other of unlocks.afterShop) {
    if (other.id === recipeId) continue;
    for (const id of [...other.shop, ...other.cook]) {
      neededElsewhere.add(id);
      const from = INGREDIENTS[id]?.batch?.from;
      if (from) neededElsewhere.add(from);
    }
  }

  return {
    remove: mine.filter((id) => !neededElsewhere.has(id)),
    kept: mine.filter((id) => neededElsewhere.has(id)),
  };
}
