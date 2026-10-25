"use server";

import { z } from "zod";
import { done, parseInput, userAction, type ActionResult } from "@/lib/action";
import { collections } from "@/lib/db";
import { RECIPE_BY_ID } from "@/lib/recipes";

const recipeId = z.custom<number>((id) => typeof id === "number" && !!RECIPE_BY_ID[id], {
  error: "That breakfast isn't in the recipe list.",
});
const noteText = z
  .string({ error: "Type a note." })
  .transform((t) => t.trim())
  .pipe(z.string().max(1000, { error: "Keep the note under 1,000 characters." }));

/** One note per recipe, shared by the household. Saving an empty note deletes it. */
export async function saveRecipeNote(recipe: number, text: string): Promise<ActionResult> {
  return userAction(["recipe.note_saved", "recipe.note_save_failed"], { recipeId: recipe }, async ({ user }) => {
    const id = parseInput(recipeId, recipe);
    const body = parseInput(noteText, text);
    const c = await collections();
    if (!body) {
      await c.recipeNotes.deleteOne({ householdId: user.householdId, recipeId: id });
      return done(null);
    }
    await c.recipeNotes.updateOne(
      { householdId: user.householdId, recipeId: id },
      { $set: { text: body, updatedAt: new Date(), updatedBy: user._id } },
      { upsert: true },
    );
    return done(null);
  });
}

export async function deleteRecipeNote(recipe: number): Promise<ActionResult> {
  return userAction(["recipe.note_deleted", "recipe.note_delete_failed"], { recipeId: recipe }, async ({ user }) => {
    const id = parseInput(recipeId, recipe);
    const c = await collections();
    await c.recipeNotes.deleteOne({ householdId: user.householdId, recipeId: id });
    return done(null);
  });
}
