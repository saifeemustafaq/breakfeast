import { AISLE_ORDER, INGREDIENTS, type Aisle, type Ingredient } from "./recipes";
import type { CustomIngredient } from "./types";

/** Aisles you can file your own item under; cooked-ahead items come from recipes only. */
export const CUSTOM_AISLES = AISLE_ORDER.filter((a) => a !== "Cooked ahead") as [Aisle, ...Aisle[]];

export const isCustomId = (id: unknown): id is string =>
  typeof id === "string" && /^custom-[0-9a-f]{24}$/.test(id);

/** Trimmed, single-spaced display name. */
export const cleanName = (name: string) => name.normalize("NFKC").trim().replace(/\s+/g, " ");

/** What two names have to share to count as the same item. */
export const nameKey = (name: string) => cleanName(name).toLowerCase();

const CATALOG_BY_NAME = new Map(Object.values(INGREDIENTS).map((i) => [nameKey(i.name), i]));

/** The catalog ingredient with exactly this name, if there is one. */
export const catalogByName = (name: string) => CATALOG_BY_NAME.get(nameKey(name));

/** The catalog plus the household's own items, for screens that list pantry and cart entries. */
export function ingredientsWith(custom: CustomIngredient[]): Record<string, Ingredient> {
  return {
    ...INGREDIENTS,
    ...Object.fromEntries(custom.map((c) => [c.id, { id: c.id, name: c.name, aisle: c.aisle }])),
  };
}
