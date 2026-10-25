"use server";

import { ObjectId } from "mongodb";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { done, fail, parseInput, userAction, type ActionResult } from "@/lib/action";
import { assertSameOrigin, requestContext } from "@/lib/auth/request";
import { signOutUser } from "@/lib/auth/user-session";
import { collections, isDuplicateKey } from "@/lib/db";
import { CUSTOM_AISLES, catalogByName, cleanName, isCustomId, nameKey } from "@/lib/ingredients";
import { checkableIds, INGREDIENTS, RECIPE_BY_ID } from "@/lib/recipes";
import type { CustomIngredientDoc } from "@/lib/schema";
import { DAY } from "@/lib/time";
import type { AddedIngredient } from "@/lib/types";

const isIngredient = (id: unknown): id is string =>
  typeof id === "string" && !!INGREDIENTS[id] && !INGREDIENTS[id].always;
const isRecipe = (id: unknown): id is number => typeof id === "number" && !!RECIPE_BY_ID[id];

const recipeId = z.custom<number>(isRecipe, { error: "That breakfast isn't in the recipe list." });
/** Pantry and cart entries: a catalog ingredient or one of the household's own items. */
const pantryId = z.custom<string>((id) => isIngredient(id) || isCustomId(id), {
  error: "That ingredient isn't in your pantry.",
});
/** Lists from a kitchen check: unknown ids are dropped rather than failing the whole save. */
const ingredientList = z.array(z.unknown()).max(200).transform((ids) => ids.filter(isIngredient));
const recipeList = z.array(z.unknown()).max(50).transform((ids) => ids.filter(isRecipe));
const score = z.number({ error: "Choose a score from 1 to 5." }).int().min(1).max(5);

const newIngredientInput = z.object({
  name: z
    .string({ error: "Type the ingredient's name." })
    .transform(cleanName)
    .pipe(
      z
        .string()
        .min(1, { error: "Type the ingredient's name." })
        .max(60, { error: "Keep the name under 60 characters." }),
    ),
  aisle: z.enum(CUSTOM_AISLES, { error: "Choose where it lives." }),
  toCart: z.boolean(),
});

const checkInput = z.object({ have: ingredientList, missing: ingredientList, recipeIds: recipeList });
const ratingInput = z.object({
  historyId: z.string().refine(ObjectId.isValid, { error: "That breakfast wasn't found." }),
  taste: score,
  feel: score,
  again: score,
  note: z
    .string()
    .optional()
    .transform((n) => n?.trim().slice(0, 500) || undefined),
});

export async function logout() {
  const h = await headers();
  assertSameOrigin(h);
  await signOutUser(requestContext(h));
  redirect("/login");
}

/**
 * Saves the result of a kitchen check: confirmed items are marked in stock,
 * missing ones are marked out and added to the cart (cooked components become
 * batch-cook tasks rather than shopping items).
 */
export async function recordCheck(input: { have: string[]; missing: string[]; recipeIds: number[] }): Promise<ActionResult> {
  return userAction(
    ["check.recorded", "check.record_failed"],
    { have: input?.have?.length ?? 0, missing: input?.missing?.length ?? 0, recipeIds: input?.recipeIds },
    async ({ user }) => {
      const { have, missing, recipeIds } = parseInput(checkInput, input);
      await applyKitchenCheck(user.householdId, have, missing, recipeIds, new Date(), "shared");
      return done(null);
    },
  );
}

/** Custom ids are only usable by the household that added them. */
async function ownsAll(householdId: ObjectId, ids: string[]) {
  const custom = [...new Set(ids.filter(isCustomId))];
  if (!custom.length) return true;
  const c = await collections();
  const found = await c.customIngredients.countDocuments({ householdId, ingredientId: { $in: custom } });
  return found === custom.length;
}
const NOT_YOURS = "That item isn't in your pantry anymore. Refresh and try again.";

function cartUpsertOp(householdId: ObjectId, ingredientId: string, forRecipes: number[], now: Date) {
  return {
    updateOne: {
      filter: { householdId, ingredientId },
      update: {
        $setOnInsert: {
          kind: INGREDIENTS[ingredientId]?.batch ? ("cook" as const) : ("buy" as const),
          addedAt: now,
        },
        $addToSet: { forRecipes: { $each: forRecipes } },
      },
      upsert: true,
    },
  };
}

async function upsertCart(householdId: ObjectId, ingredientIds: string[], recipeIds: number[], now: Date) {
  const c = await collections();
  if (!ingredientIds.length) return;
  await c.cart.bulkWrite(ingredientIds.map((id) => cartUpsertOp(householdId, id, recipeIds, now)));
}

async function applyKitchenCheck(
  householdId: ObjectId,
  have: string[],
  missing: string[],
  recipeIds: number[],
  now: Date,
  cartMode: "shared" | "perRecipe",
) {
  const c = await collections();
  const stockOps = [
    ...have.map((id) => ({ id, inStock: true })),
    ...missing.map((id) => ({ id, inStock: false })),
  ].map(({ id, inStock }) => ({
    updateOne: {
      filter: { householdId, ingredientId: id },
      update: { $set: { inStock, updatedAt: now } },
      upsert: true,
    },
  }));
  if (stockOps.length) await c.pantry.bulkWrite(stockOps);
  if (missing.length) {
    const ops =
      cartMode === "shared"
        ? missing.map((id) => cartUpsertOp(householdId, id, recipeIds, now))
        : missing.map((id) =>
            cartUpsertOp(
              householdId,
              id,
              recipeIds.filter((r) => checkableIds(RECIPE_BY_ID[r]).includes(id)),
              now,
            ),
          );
    await c.cart.bulkWrite(ops);
  }
  if (have.length) await c.cart.deleteMany({ householdId, ingredientId: { $in: have } });
}

export async function recordPlanCheck(input: { have: string[]; missing: string[]; recipeIds: number[] }): Promise<ActionResult> {
  return userAction(
    ["plan.checked", "plan.check_failed"],
    {
      have: input?.have?.length ?? 0,
      missing: input?.missing?.length ?? 0,
      recipeIds: input?.recipeIds?.length ?? 0,
    },
    async ({ user }) => {
      const { have, missing, recipeIds } = parseInput(checkInput, input);
      await applyKitchenCheck(user.householdId, have, missing, recipeIds, new Date(), "perRecipe");
      return done(null);
    },
  );
}

export async function planTomorrow(recipe: number, needsPrep: boolean): Promise<ActionResult> {
  return userAction(["plan.set", "plan.set_failed"], { recipeId: recipe, needsPrep }, async ({ user }) => {
    const id = parseInput(recipeId, recipe);
    const prep = parseInput(z.boolean(), needsPrep);
    const c = await collections();
    await c.upcoming.updateOne(
      { householdId: user.householdId },
      { $set: { recipeId: id, needsPrep: prep, createdAt: new Date() } },
      { upsert: true },
    );
    return done(null);
  });
}

export async function clearTomorrow(): Promise<ActionResult> {
  return userAction(["plan.cleared", "plan.clear_failed"], {}, async ({ user }) => {
    const c = await collections();
    await c.upcoming.deleteOne({ householdId: user.householdId });
    return done(null);
  });
}

/** Returns the new history id, for the rating form. */
export async function markMade(recipe: number): Promise<ActionResult<string>> {
  return userAction(["breakfast.made", "breakfast.mark_failed"], { recipeId: recipe }, async ({ user }) => {
    const id = parseInput(recipeId, recipe);
    const c = await collections();
    const { insertedId } = await c.history.insertOne({
      householdId: user.householdId,
      recipeId: id,
      madeAt: new Date(),
      madeBy: user._id,
    });
    await c.upcoming.deleteOne({ householdId: user.householdId, recipeId: id });
    return done(insertedId.toHexString());
  });
}

const logInput = z.object({
  recipeId,
  daysAgo: z.number({ error: "Choose when you made it." }).int().min(0).max(6),
  rating: z.object({ taste: score, feel: score, again: score }).optional(),
});

/**
 * "I made this recently": records a breakfast made outside the flow, today or up to six days
 * back, with an optional rating. Returns the new history id.
 */
export async function logBreakfast(input: {
  recipeId: number;
  daysAgo: number;
  rating?: { taste: number; feel: number; again: number };
}): Promise<ActionResult<string>> {
  return userAction(
    ["breakfast.logged", "breakfast.log_failed"],
    { recipeId: input?.recipeId, daysAgo: input?.daysAgo, rated: !!input?.rating },
    async ({ user }) => {
      const { recipeId: id, daysAgo, rating } = parseInput(logInput, input);
      const now = new Date();
      const c = await collections();
      const { insertedId } = await c.history.insertOne({
        householdId: user.householdId,
        recipeId: id,
        madeAt: new Date(now.getTime() - daysAgo * DAY),
        madeBy: user._id,
      });
      if (rating) {
        await c.ratings.insertOne({
          householdId: user.householdId,
          historyId: insertedId,
          userId: user._id,
          recipeId: id,
          ...rating,
          updatedAt: now,
        });
      }
      return done(insertedId.toHexString());
    },
  );
}

/** Each household member keeps their own rating of a breakfast. */
export async function rateBreakfast(
  historyId: string,
  rating: { taste: number; feel: number; again: number; note?: string },
): Promise<ActionResult> {
  return userAction(
    ["breakfast.rated", "breakfast.rate_failed"],
    { taste: rating?.taste, feel: rating?.feel, again: rating?.again, hasNote: !!rating?.note?.trim() },
    async ({ user }) => {
      const r = parseInput(ratingInput, { ...rating, historyId });
      const c = await collections();
      const history = await c.history.findOne({ _id: new ObjectId(r.historyId), householdId: user.householdId });
      if (!history) return fail("That breakfast wasn't found.");
      await c.ratings.updateOne(
        { historyId: history._id, userId: user._id },
        {
          $set: {
            householdId: user.householdId,
            recipeId: history.recipeId,
            taste: r.taste,
            feel: r.feel,
            again: r.again,
            updatedAt: new Date(),
            ...(r.note ? { note: r.note } : {}),
          },
          ...(r.note ? {} : { $unset: { note: "" } }),
        },
        { upsert: true },
      );
      return done(null);
    },
  );
}

async function saveStock(householdId: ObjectId, id: string, inStock: boolean) {
  const c = await collections();
  await c.pantry.updateOne(
    { householdId, ingredientId: id },
    { $set: { inStock, updatedAt: new Date() } },
    { upsert: true },
  );
  if (inStock) await c.cart.deleteOne({ householdId, ingredientId: id });
}

export async function setStock(ingredient: string, inStock: boolean): Promise<ActionResult> {
  return userAction(["stock.set", "stock.set_failed"], { ingredientId: ingredient, inStock }, async ({ user }) => {
    const id = parseInput(pantryId, ingredient);
    if (!(await ownsAll(user.householdId, [id]))) return fail(NOT_YOURS);
    await saveStock(user.householdId, id, inStock === true);
    return done(null);
  });
}

export async function addToCart(ingredient: string, recipeIds: number[] = []): Promise<ActionResult> {
  return addManyToCart([ingredient], recipeIds);
}

/** One round trip for several items (Server Actions from one client run one at a time). */
export async function addManyToCart(ingredients: string[], recipeIds: number[] = []): Promise<ActionResult> {
  return userAction(["cart.added", "cart.add_failed"], { ingredientIds: ingredients, recipeIds }, async ({ user }) => {
    const ids = parseInput(z.array(pantryId).min(1).max(100), ingredients);
    if (!(await ownsAll(user.householdId, ids))) return fail(NOT_YOURS);
    await upsertCart(user.householdId, ids, parseInput(recipeList, recipeIds), new Date());
    return done(null);
  });
}

export async function removeFromCart(ingredient: string): Promise<ActionResult> {
  return userAction(["cart.removed", "cart.remove_failed"], { ingredientId: ingredient }, async ({ user }) => {
    const id = parseInput(pantryId, ingredient);
    const c = await collections();
    await c.cart.deleteOne({ householdId: user.householdId, ingredientId: id });
    return done(null);
  });
}

/** Clearing out everything one breakfast needs, in a single round trip. */
export async function removeManyFromCart(ingredients: string[]): Promise<ActionResult> {
  return userAction(
    ["cart.removed_many", "cart.remove_many_failed"],
    { ingredientIds: ingredients },
    async ({ user }) => {
      const ids = parseInput(z.array(pantryId).min(1).max(100), ingredients);
      const c = await collections();
      await c.cart.deleteMany({ householdId: user.householdId, ingredientId: { $in: ids } });
      return done(null);
    },
  );
}

/** Bought it at the store, or finished cooking a batch. */
export async function completeCartItem(ingredient: string): Promise<ActionResult> {
  return userAction(["cart.completed", "cart.complete_failed"], { ingredientId: ingredient }, async ({ user }) => {
    const id = parseInput(pantryId, ingredient);
    if (!(await ownsAll(user.householdId, [id]))) return fail(NOT_YOURS);
    await saveStock(user.householdId, id, true);
    return done(null);
  });
}

/**
 * Adds an item to the pantry by name. A name that's already there (from the catalog or added
 * before) reuses that item. With `toCart` it's marked out of stock and goes on the list;
 * otherwise it's marked in stock.
 */
export async function addIngredient(input: {
  name: string;
  aisle: string;
  toCart: boolean;
}): Promise<ActionResult<AddedIngredient>> {
  return userAction(
    ["pantry.ingredient_added", "pantry.ingredient_add_failed"],
    { aisle: input?.aisle, toCart: input?.toCart },
    async ({ user }) => {
      const { name, aisle, toCart } = parseInput(newIngredientInput, input);
      const householdId = user.householdId;
      const now = new Date();
      let added: AddedIngredient;

      const catalog = catalogByName(name);
      if (catalog?.always) return fail(`${catalog.name} is assumed to always be in the kitchen.`);
      if (catalog) {
        added = { id: catalog.id, name: catalog.name, aisle: catalog.aisle, custom: false, isNew: false };
      } else {
        const c = await collections();
        const key = nameKey(name);
        let doc: CustomIngredientDoc | null = await c.customIngredients.findOne({ householdId, nameKey: key });
        let isNew = false;
        if (!doc) {
          const fresh = {
            householdId,
            ingredientId: `custom-${new ObjectId().toHexString()}`,
            name,
            nameKey: key,
            aisle,
            createdAt: now,
            createdBy: user._id,
          };
          try {
            await c.customIngredients.insertOne(fresh);
            doc = fresh;
            isNew = true;
          } catch (error) {
            if (!isDuplicateKey(error)) throw error;
            doc = await c.customIngredients.findOne({ householdId, nameKey: key });
            if (!doc) throw error;
          }
        }
        added = { id: doc.ingredientId, name: doc.name, aisle: doc.aisle as typeof aisle, custom: true, isNew };
      }

      await saveStock(householdId, added.id, !toCart);
      if (toCart) await upsertCart(householdId, [added.id], [], now);
      return done(added);
    },
  );
}

/** Deletes one of the household's own items, with its pantry entry and cart line. */
export async function removeIngredient(ingredient: string): Promise<ActionResult> {
  return userAction(["pantry.ingredient_removed", "pantry.ingredient_remove_failed"], { ingredientId: ingredient }, async ({ user }) => {
    const id = parseInput(z.custom<string>(isCustomId, { error: "Only items you added can be removed." }), ingredient);
    const c = await collections();
    const householdId = user.householdId;
    await c.customIngredients.deleteOne({ householdId, ingredientId: id });
    await c.pantry.deleteOne({ householdId, ingredientId: id });
    await c.cart.deleteOne({ householdId, ingredientId: id });
    return done(null);
  });
}
