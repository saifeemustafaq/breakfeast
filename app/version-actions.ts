"use server";

import { ObjectId } from "mongodb";
import { z } from "zod";
import { done, fail, parseInput, userAction, type ActionResult } from "@/lib/action";
import { collections } from "@/lib/db";
import { RECIPE_BY_ID } from "@/lib/recipes";
import { choiceKind } from "@/lib/version-store";
import { MAX_ADDITIONS, validateAdditions, type AdditionInput } from "@/lib/versions";

const recipeId = z.custom<number>((id) => typeof id === "number" && !!RECIPE_BY_ID[id], {
  error: "That breakfast isn't in the recipe list.",
});
const additionList = z
  .array(
    z.object({
      ingredientId: z.string().max(40),
      qty: z.string().max(60),
      when: z.enum(["night", "morning"]),
    }),
  )
  .max(MAX_ADDITIONS, { error: `You can add up to ${MAX_ADDITIONS} items.` });
const choice = z.string().regex(/^(original|mine|user:[0-9a-f]{24})$/, { error: "That version wasn't found." });
const ownerId = z.string().refine(ObjectId.isValid, { error: "That version wasn't found." });

async function ownerContext(householdId: ObjectId, userId: ObjectId) {
  const c = await collections();
  const [custom, prefs] = await Promise.all([
    c.customIngredients.find({ householdId }, { projection: { ingredientId: 1 } }).toArray(),
    c.preferences.findOne({ userId }, { projection: { disliked: 1 } }),
  ]);
  return { customIds: new Set(custom.map((i) => i.ingredientId)), disliked: new Set(prefs?.disliked ?? []) };
}

async function remember(userId: ObjectId, recipe: number, value: string) {
  const c = await collections();
  await c.preferences.updateOne(
    { userId },
    { $set: { [`choices.${recipe}`]: value, updatedAt: new Date() }, $setOnInsert: { disliked: [] } },
    { upsert: true },
  );
}

/**
 * Saves your version of a recipe (saving no additions resets it). Saving makes it your
 * default from then on.
 */
export async function saveVersion(recipe: number, additions: AdditionInput[]): Promise<ActionResult> {
  return userAction(
    ["recipe.version_saved", "recipe.version_save_failed"],
    { recipeId: recipe, count: additions?.length ?? 0 },
    async ({ user }) => {
      const id = parseInput(recipeId, recipe);
      const list = parseInput(additionList, additions);
      const c = await collections();
      if (!list.length) {
        await c.recipeVersions.deleteOne({ userId: user._id, recipeId: id });
        await remember(user._id, id, "original");
        return done(null);
      }
      const checked = validateAdditions(RECIPE_BY_ID[id], list, await ownerContext(user.householdId, user._id));
      if (!checked.ok) return fail(checked.message);
      const now = new Date();
      await c.recipeVersions.updateOne(
        { userId: user._id, recipeId: id },
        {
          $set: { householdId: user.householdId, additions: checked.additions, updatedAt: now },
          $setOnInsert: { shared: false, createdAt: now },
        },
        { upsert: true },
      );
      await remember(user._id, id, "mine");
      return done(null);
    },
  );
}

/** Deletes your version; the original is what you'll see and make. */
export async function resetVersion(recipe: number): Promise<ActionResult> {
  return userAction(["recipe.version_reset", "recipe.version_reset_failed"], { recipeId: recipe }, async ({ user }) => {
    const id = parseInput(recipeId, recipe);
    const c = await collections();
    await c.recipeVersions.deleteOne({ userId: user._id, recipeId: id });
    await remember(user._id, id, "original");
    return done(null);
  });
}

/** Shares your version with the household, live: they always see your latest. */
export async function setVersionShared(recipe: number, shared: boolean): Promise<ActionResult> {
  return userAction(
    ["recipe.version_shared", "recipe.version_share_failed"],
    { recipeId: recipe, shared },
    async ({ user }) => {
      const id = parseInput(recipeId, recipe);
      const on = parseInput(z.boolean(), shared);
      const c = await collections();
      const { matchedCount } = await c.recipeVersions.updateOne(
        { userId: user._id, recipeId: id },
        { $set: { shared: on, householdId: user.householdId } },
      );
      if (!matchedCount) return fail("Make your version first.");
      return done(null);
    },
  );
}

/**
 * Starts your own version from someone's shared one. Anything you can't add (your
 * dislikes) is left out; returns how many items that was.
 */
export async function copySharedVersion(recipe: number, owner: string): Promise<ActionResult<number>> {
  return userAction(["recipe.version_copied", "recipe.version_copy_failed"], { recipeId: recipe }, async ({ user }) => {
    const id = parseInput(recipeId, recipe);
    const from = new ObjectId(parseInput(ownerId, owner));
    const c = await collections();
    const source = await c.recipeVersions.findOne({
      userId: from,
      recipeId: id,
      householdId: user.householdId,
      shared: true,
    });
    if (!source || from.equals(user._id)) return fail("That version isn't shared anymore.");
    const ctx = await ownerContext(user.householdId, user._id);
    const keep = source.additions.filter((a) => validateAdditions(RECIPE_BY_ID[id], [a], ctx).ok);
    if (!keep.length) return fail("Everything in that version is on your allergies and dislikes list.");
    const now = new Date();
    await c.recipeVersions.updateOne(
      { userId: user._id, recipeId: id },
      {
        $set: { householdId: user.householdId, additions: keep, updatedAt: now },
        $setOnInsert: { shared: false, createdAt: now },
      },
      { upsert: true },
    );
    await remember(user._id, id, "mine");
    return done(source.additions.length - keep.length);
  });
}

/** Remembers the version you picked, so it's the default next time. */
export async function chooseVersion(recipe: number, picked: string): Promise<ActionResult> {
  return userAction(
    ["recipe.version_chosen", "recipe.version_choose_failed"],
    { recipeId: recipe, version: choiceKind(picked) },
    async ({ user }) => {
      const id = parseInput(recipeId, recipe);
      const value = parseInput(choice, picked);
      await remember(user._id, id, value);
      return done(null);
    },
  );
}
