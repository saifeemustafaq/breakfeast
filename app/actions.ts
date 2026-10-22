"use server";

import { ObjectId } from "mongodb";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { done, fail, parseInput, userAction, type ActionResult } from "@/lib/action";
import { assertSameOrigin, requestContext } from "@/lib/auth/request";
import { signOutUser } from "@/lib/auth/user-session";
import { collections } from "@/lib/db";
import { checkableIds, INGREDIENTS, RECIPE_BY_ID } from "@/lib/recipes";

const isIngredient = (id: unknown): id is string =>
  typeof id === "string" && !!INGREDIENTS[id] && !INGREDIENTS[id].always;
const isRecipe = (id: unknown): id is number => typeof id === "number" && !!RECIPE_BY_ID[id];

const recipeId = z.custom<number>(isRecipe, { error: "That breakfast isn't in the recipe list." });
const ingredientId = z.custom<string>(isIngredient, { error: "That ingredient isn't in the recipe list." });
/** Lists from a kitchen check: unknown ids are dropped rather than failing the whole save. */
const ingredientList = z.array(z.unknown()).max(200).transform((ids) => ids.filter(isIngredient));
const recipeList = z.array(z.unknown()).max(50).transform((ids) => ids.filter(isRecipe));
const score = z.number({ error: "Choose a score from 1 to 5." }).int().min(1).max(5);

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

function cartUpsertOp(householdId: ObjectId, ingredientId: string, forRecipes: number[], now: Date) {
  return {
    updateOne: {
      filter: { householdId, ingredientId },
      update: {
        $setOnInsert: {
          kind: INGREDIENTS[ingredientId].batch ? ("cook" as const) : ("buy" as const),
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
    const id = parseInput(ingredientId, ingredient);
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
    const ids = parseInput(z.array(ingredientId).min(1).max(100), ingredients);
    await upsertCart(user.householdId, ids, parseInput(recipeList, recipeIds), new Date());
    return done(null);
  });
}

export async function removeFromCart(ingredient: string): Promise<ActionResult> {
  return userAction(["cart.removed", "cart.remove_failed"], { ingredientId: ingredient }, async ({ user }) => {
    const id = parseInput(ingredientId, ingredient);
    const c = await collections();
    await c.cart.deleteOne({ householdId: user.householdId, ingredientId: id });
    return done(null);
  });
}

/** Bought it at the store, or finished cooking a batch. */
export async function completeCartItem(ingredient: string): Promise<ActionResult> {
  return userAction(["cart.completed", "cart.complete_failed"], { ingredientId: ingredient }, async ({ user }) => {
    const id = parseInput(ingredientId, ingredient);
    await saveStock(user.householdId, id, true);
    return done(null);
  });
}
