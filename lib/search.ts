import { INGREDIENTS, RECIPE_TRAITS, type Recipe } from "@/lib/recipes";

const fold = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Every word of the query appears somewhere in the texts, ignoring case and accents. */
export function matchesQuery(query: string, ...texts: string[]) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = fold(texts.join(" "));
  return words.every((w) => haystack.includes(w));
}

/** What a recipe can be found by: number, name, blurb, ingredients and traits. */
export function recipeSearchText(recipe: Recipe) {
  return [
    `#${recipe.id}`,
    recipe.name,
    recipe.blurb,
    ...recipe.ingredients.map((ri) => INGREDIENTS[ri.id].name),
    ...Object.values(RECIPE_TRAITS[recipe.id] ?? {}),
  ].join(" ");
}
