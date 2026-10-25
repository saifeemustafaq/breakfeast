"use server";

import { z } from "zod";
import { done, parseInput, userAction, type ActionResult } from "@/lib/action";
import { collections } from "@/lib/db";
import { DISLIKABLE } from "@/lib/recipes";

const dislikable = new Set(DISLIKABLE.map((i) => i.id));
const dislikedList = z
  .array(z.unknown())
  .max(200)
  .transform((ids) => [...new Set(ids.filter((id): id is string => typeof id === "string" && dislikable.has(id)))]);

/** Allergies and dislikes are per person, so they stay on the user, not the household. */
export async function setDisliked(disliked: string[]): Promise<ActionResult> {
  return userAction(
    ["preferences.disliked_set", "preferences.disliked_set_failed"],
    { count: disliked?.length ?? 0 },
    async ({ user }) => {
      const ids = parseInput(dislikedList, disliked);
      const c = await collections();
      await c.preferences.updateOne(
        { userId: user._id },
        { $set: { disliked: ids, updatedAt: new Date() } },
        { upsert: true },
      );
      return done(null);
    },
  );
}
