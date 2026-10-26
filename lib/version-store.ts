import "server-only";
import { ObjectId } from "mongodb";
import { z } from "zod";
import type { UserAuth } from "./auth/guards";
import type { Collections } from "./db";
import { isCustomId } from "./ingredients";
import { INGREDIENTS, RECIPE_BY_ID } from "./recipes";
import type { ExtraDoc, VersionSnapshotDoc } from "./schema";
import { MAX_ADDITIONS, OWN_QTY_MAX, recipeFromSnapshot, validateAdditions, type AdditionInput } from "./versions";

/** "original", "mine", "user:<id>" for a shared version, or "planned" for whatever tomorrow's plan froze. */
export const choiceInput = z
  .string()
  .regex(/^(original|mine|planned|user:[0-9a-f]{24})$/, { error: "That version wasn't found." });

export type MadeInput = { choice?: string; skipped?: string[]; extras?: AdditionInput[] };

export const madeInput = z
  .object({
    choice: choiceInput.optional(),
    skipped: z.array(z.string().max(40)).max(30).optional(),
    extras: z
      .array(
        z.object({
          ingredientId: z.string().max(40),
          qty: z.string().max(OWN_QTY_MAX),
          when: z.enum(["night", "morning"]),
        }),
      )
      .max(MAX_ADDITIONS)
      .optional(),
  })
  .optional();

/** For business events: which kind of version, never whose. */
export const choiceKind = (choice: string | undefined) =>
  !choice || choice === "original" ? "original" : choice === "mine" ? "mine" : choice === "planned" ? "planned" : "shared";

/** The version doc a choice points at, if you're allowed to see it. */
export async function findVersion(c: Collections, user: UserAuth["user"], recipeId: number, choice: string) {
  if (choice === "mine") return c.recipeVersions.findOne({ userId: user._id, recipeId });
  if (!choice.startsWith("user:")) return null;
  const owner = new ObjectId(choice.slice("user:".length));
  if (owner.equals(user._id)) return c.recipeVersions.findOne({ userId: user._id, recipeId });
  return c.recipeVersions.findOne({ userId: owner, recipeId, householdId: user.householdId, shared: true });
}

/**
 * Freezes the chosen version for a history entry or tomorrow's plan. Own items must still be in
 * the household's pantry and nothing on your dislike list is kept, matching what Today showed.
 */
export async function snapshotFor(
  c: Collections,
  user: UserAuth["user"],
  recipeId: number,
  choice: string | undefined,
): Promise<VersionSnapshotDoc | undefined> {
  if (!choice || choice === "original") return undefined;
  if (choice === "planned") {
    const planned = await c.upcoming.findOne({ householdId: user.householdId, recipeId });
    return planned?.version;
  }
  const doc = await findVersion(c, user, recipeId, choice);
  if (!doc?.additions.length) return undefined;
  const [prefs, custom, owner] = await Promise.all([
    c.preferences.findOne({ userId: user._id }, { projection: { disliked: 1 } }),
    c.customIngredients
      .find({ householdId: user.householdId, ingredientId: { $in: doc.additions.map((a) => a.ingredientId).filter(isCustomId) } })
      .toArray(),
    c.users.findOne({ _id: doc.userId }, { projection: { name: 1 } }),
  ]);
  const disliked = new Set(prefs?.disliked ?? []);
  const ownNames = new Map(custom.map((i) => [i.ingredientId, i.name]));
  const additions = doc.additions.flatMap((a) => {
    const item = INGREDIENTS[a.ingredientId];
    const name = item?.name ?? ownNames.get(a.ingredientId);
    if (!name || disliked.has(item?.batch?.from ?? a.ingredientId)) return [];
    return [{ ...a, name }];
  });
  if (!additions.length) return undefined;
  return { ownerId: doc.userId, ownerName: owner?.name ?? "Someone", additions };
}

/** Skips limited to items actually in what was made. */
export function cleanSkipped(recipeId: number, snapshot: VersionSnapshotDoc | undefined, skipped: string[] | undefined) {
  if (!skipped?.length) return undefined;
  const known = new Set([
    ...RECIPE_BY_ID[recipeId].ingredients.map((ri) => ri.id),
    ...(snapshot?.additions.map((a) => a.ingredientId) ?? []),
  ]);
  const list = [...new Set(skipped.filter((id) => known.has(id)))];
  return list.length ? list : undefined;
}

/**
 * Checks one-off extras against what's being made (the frozen version plus anything carried over
 * from last night's plan, which comes first) and adds names. `when` is fixed by the screen they
 * were added on: night prep, or the morning.
 */
export async function extrasFor(
  c: Collections,
  user: UserAuth["user"],
  recipeId: number,
  version: VersionSnapshotDoc | undefined,
  input: AdditionInput[] | undefined,
  when: "night" | "morning",
  carried: ExtraDoc[] = [],
): Promise<{ ok: true; extras: ExtraDoc[] | undefined } | { ok: false; message: string }> {
  if (!input?.length) return { ok: true, extras: carried.length ? carried : undefined };
  const base = recipeFromSnapshot(recipeId, version && { ...version, ownerId: version.ownerId.toHexString() }, [], carried);
  if (!base) return { ok: false, message: "That recipe wasn't found." };
  const [prefs, custom] = await Promise.all([
    c.preferences.findOne({ userId: user._id }, { projection: { disliked: 1 } }),
    c.customIngredients
      .find({ householdId: user.householdId, ingredientId: { $in: input.map((a) => a.ingredientId).filter(isCustomId) } })
      .toArray(),
  ]);
  const ownNames = new Map(custom.map((i) => [i.ingredientId, i.name]));
  const checked = validateAdditions(
    base,
    input.map((a) => ({ ...a, when })),
    {
      customIds: new Set(ownNames.keys()),
      disliked: new Set(prefs?.disliked ?? []),
      max: MAX_ADDITIONS - (version?.additions.length ?? 0) - carried.length,
    },
  );
  if (!checked.ok) return checked;
  const added = checked.additions.map((a) => ({
    ...a,
    name: INGREDIENTS[a.ingredientId]?.name ?? ownNames.get(a.ingredientId) ?? a.ingredientId,
  }));
  return { ok: true, extras: [...carried, ...added] };
}
