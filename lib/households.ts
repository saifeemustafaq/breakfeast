import "server-only";
import { ObjectId, type AnyBulkWriteOperation, type ClientSession } from "mongodb";
import { ApiError } from "@/lib/auth/errors";
import { withTransaction, type Collections } from "@/lib/db";
import type { HouseholdInviteDoc, PantryDoc, UserDoc } from "@/lib/schema";

type Tx = { c: Collections; session: ClientSession; now: Date };

export const memberCount = (c: Collections, householdId: ObjectId, session?: ClientSession) =>
  c.users.countDocuments({ householdId }, { session });

/** Invites the invitee can act on right now. */
export const livePending = (now = new Date()) => ({ status: "pending" as const, expiresAt: { $gt: now } });

/**
 * Folds `fromId`'s data into `intoId` and deletes `fromId`:
 * pantry keeps the most recently updated entry, cart items and their recipes are combined,
 * history and ratings move over, and the target's plan for tomorrow wins if it has one.
 */
async function mergeData({ c, session, now }: Tx, fromId: ObjectId, intoId: ObjectId) {
  const srcPantry = await c.pantry.find({ householdId: fromId }, { session }).toArray();
  const dstPantry = await c.pantry.find({ householdId: intoId }, { session }).toArray();
  const dst = new Map(dstPantry.map((p) => [p.ingredientId, p]));
  const pantryOps = srcPantry.flatMap((p): AnyBulkWriteOperation<PantryDoc>[] => {
    const existing = dst.get(p.ingredientId);
    if (!existing) {
      return [{ insertOne: { document: { householdId: intoId, ingredientId: p.ingredientId, inStock: p.inStock, updatedAt: p.updatedAt } } }];
    }
    if (existing.updatedAt >= p.updatedAt) return [];
    return [{ updateOne: { filter: { _id: existing._id }, update: { $set: { inStock: p.inStock, updatedAt: p.updatedAt } } } }];
  });
  if (pantryOps.length) await c.pantry.bulkWrite(pantryOps, { session });

  const srcCart = await c.cart.find({ householdId: fromId }, { session }).toArray();
  if (srcCart.length) {
    await c.cart.bulkWrite(
      srcCart.map((item) => ({
        updateOne: {
          filter: { householdId: intoId, ingredientId: item.ingredientId },
          update: {
            $setOnInsert: { kind: item.kind },
            $min: { addedAt: item.addedAt },
            $addToSet: { forRecipes: { $each: item.forRecipes } },
          },
          upsert: true,
        },
      })),
      { session },
    );
  }

  const srcPlan = await c.upcoming.findOne({ householdId: fromId }, { session });
  const dstPlan = await c.upcoming.findOne({ householdId: intoId }, { session });
  if (srcPlan && !dstPlan) {
    await c.upcoming.insertOne(
      { householdId: intoId, recipeId: srcPlan.recipeId, needsPrep: srcPlan.needsPrep, createdAt: srcPlan.createdAt },
      { session },
    );
  }

  await mergeHistory({ c, session, now }, fromId, intoId);
  await c.pantry.deleteMany({ householdId: fromId }, { session });
  await c.cart.deleteMany({ householdId: fromId }, { session });
  await c.upcoming.deleteMany({ householdId: fromId }, { session });
  await c.householdInvites.updateMany(
    { householdId: fromId, status: "pending" },
    { $set: { status: "cancelled", respondedAt: now } },
    { session },
  );
  await c.households.deleteOne({ _id: fromId }, { session });
  await c.households.updateOne({ _id: intoId }, { $set: { updatedAt: now } }, { session });
}

/**
 * Moves history and ratings across. Entries the target already has (same recipe at the same
 * moment, e.g. from a copy made when someone left) are dropped and their ratings re-pointed.
 */
async function mergeHistory({ c, session }: Tx, fromId: ObjectId, intoId: ObjectId) {
  const key = (h: { recipeId: number; madeAt: Date }) => `${h.recipeId}|${h.madeAt.getTime()}`;
  const target = await c.history.find({ householdId: intoId }, { session }).toArray();
  const existing = new Map(target.map((h) => [key(h), h._id]));
  const source = await c.history.find({ householdId: fromId }, { session }).toArray();
  const duplicateOf = new Map<string, ObjectId>();
  for (const h of source) {
    const match = existing.get(key(h));
    if (match) duplicateOf.set(h._id.toHexString(), match);
  }

  const ratings = await c.ratings.find({ householdId: fromId }, { session }).toArray();
  for (const r of ratings) {
    const historyId = duplicateOf.get(r.historyId.toHexString()) ?? r.historyId;
    const clash =
      !historyId.equals(r.historyId) &&
      (await c.ratings.findOne({ historyId, userId: r.userId }, { session, projection: { _id: 1 } }));
    if (clash) await c.ratings.deleteOne({ _id: r._id }, { session });
    else await c.ratings.updateOne({ _id: r._id }, { $set: { householdId: intoId, historyId } }, { session });
  }

  const dupIds = source.filter((h) => duplicateOf.has(h._id.toHexString())).map((h) => h._id);
  if (dupIds.length) await c.history.deleteMany({ _id: { $in: dupIds } }, { session });
  await c.history.updateMany({ householdId: fromId }, { $set: { householdId: intoId } }, { session });
}

/**
 * Gives `user` a new household holding a copy of `fromId`'s pantry, cart, plan and history.
 * The user's own ratings move with them; everyone else's stay behind.
 */
async function copyOut({ c, session, now }: Tx, user: UserDoc, fromId: ObjectId): Promise<ObjectId> {
  const newId = new ObjectId();
  await c.households.insertOne({ _id: newId, createdAt: now, updatedAt: now }, { session });

  const pantry = await c.pantry.find({ householdId: fromId }, { session }).toArray();
  const cart = await c.cart.find({ householdId: fromId }, { session }).toArray();
  const plan = await c.upcoming.findOne({ householdId: fromId }, { session });
  const history = await c.history.find({ householdId: fromId }, { session }).toArray();
  const ratings = await c.ratings.find({ householdId: fromId, userId: user._id }, { session }).toArray();
  if (pantry.length) {
    await c.pantry.insertMany(
      pantry.map((p) => ({ householdId: newId, ingredientId: p.ingredientId, inStock: p.inStock, updatedAt: p.updatedAt })),
      { session },
    );
  }
  if (cart.length) {
    await c.cart.insertMany(
      cart.map((item) => ({
        householdId: newId,
        ingredientId: item.ingredientId,
        kind: item.kind,
        forRecipes: item.forRecipes,
        addedAt: item.addedAt,
      })),
      { session },
    );
  }
  if (plan) {
    await c.upcoming.insertOne(
      { householdId: newId, recipeId: plan.recipeId, needsPrep: plan.needsPrep, createdAt: plan.createdAt },
      { session },
    );
  }
  const copyOf = new Map<string, ObjectId>();
  if (history.length) {
    const copies = history.flatMap((h) => {
      if (!h._id) return [];
      const copyId = new ObjectId();
      copyOf.set(h._id.toHexString(), copyId);
      return [{ _id: copyId, householdId: newId, recipeId: h.recipeId, madeAt: h.madeAt, madeBy: h.madeBy }];
    });
    await c.history.insertMany(copies, { session });
  }
  const ratingOps = ratings.flatMap((r) => {
    if (!r._id) return [];
    const historyId = copyOf.get(r.historyId.toHexString());
    return historyId
      ? [{ updateOne: { filter: { _id: r._id }, update: { $set: { householdId: newId, historyId } } } }]
      : [];
  });
  if (ratingOps.length) await c.ratings.bulkWrite(ratingOps, { session });

  await c.householdInvites.updateMany(
    { householdId: fromId, fromUserId: user._id, status: "pending" },
    { $set: { status: "cancelled", respondedAt: now } },
    { session },
  );
  return newId;
}

async function setHousehold({ c, session, now }: Tx, user: UserDoc, intoId: ObjectId) {
  const res = await c.users.updateOne(
    { _id: user._id, householdId: user.householdId },
    { $set: { householdId: intoId, updatedAt: now } },
    { session },
  );
  if (!res.matchedCount) throw new ApiError("CONFLICT", "Someone else changed this household. Refresh and try again.");
}

async function loadInTx({ c, session }: Tx, userId: ObjectId) {
  const user = await c.users.findOne({ _id: userId }, { session });
  if (!user) throw new ApiError("NOT_FOUND", "That user no longer exists.");
  return user;
}

/** Accepts an invite on behalf of a solo user: their data merges into the inviting household. */
export async function acceptInvite(userId: ObjectId, inviteId: ObjectId) {
  return withTransaction(async (c, session) => {
    const tx = { c, session, now: new Date() };
    const user = await loadInTx(tx, userId);
    const invite = await c.householdInvites.findOne(
      { _id: inviteId, toLoginId: user.loginIdNormalized, ...livePending(tx.now) },
      { session },
    );
    if (!invite) throw new ApiError("NOT_FOUND", "This invite is no longer available.");
    if (invite.householdId.equals(user.householdId)) throw new ApiError("CONFLICT", "You're already in this household.");
    if ((await memberCount(c, user.householdId, session)) > 1) {
      throw new ApiError("INVALID_TRANSITION", "Leave your current household before joining another.");
    }
    if (!(await memberCount(c, invite.householdId, session))) {
      throw new ApiError("NOT_FOUND", "This invite is no longer available.");
    }
    await mergeData(tx, user.householdId, invite.householdId);
    await setHousehold(tx, user, invite.householdId);
    await c.householdInvites.updateOne(
      { _id: invite._id },
      { $set: { status: "accepted", respondedAt: tx.now } },
      { session },
    );
    await c.householdInvites.updateMany(
      { toLoginId: user.loginIdNormalized, status: "pending" },
      { $set: { status: "cancelled", respondedAt: tx.now } },
      { session },
    );
    return { householdId: invite.householdId, invite };
  });
}

/** Leaves a shared household, keeping a copy of its data. */
export async function leaveHousehold(userId: ObjectId) {
  return withTransaction(async (c, session) => {
    const tx = { c, session, now: new Date() };
    const user = await loadInTx(tx, userId);
    const size = await memberCount(c, user.householdId, session);
    if (size <= 1) throw new ApiError("INVALID_TRANSITION", "You're not sharing a household.");
    const newId = await copyOut(tx, user, user.householdId);
    await setHousehold(tx, user, newId);
    return { from: user.householdId, to: newId, previousSize: size };
  });
}

/** Admin move: the user (with a copy of their data if they were sharing) is merged into another household. */
export async function moveToHousehold(userId: ObjectId, intoId: ObjectId) {
  return withTransaction(async (c, session) => {
    const tx = { c, session, now: new Date() };
    const user = await loadInTx(tx, userId);
    if (user.householdId.equals(intoId)) throw new ApiError("CONFLICT", "They're already in that household.");
    if (!(await memberCount(c, intoId, session))) throw new ApiError("NOT_FOUND", "That household no longer exists.");
    const shared = (await memberCount(c, user.householdId, session)) > 1;
    const source = shared ? await copyOut(tx, user, user.householdId) : user.householdId;
    await mergeData(tx, source, intoId);
    await setHousehold(tx, user, intoId);
    await c.householdInvites.updateMany(
      { toLoginId: user.loginIdNormalized, status: "pending" },
      { $set: { status: "cancelled", respondedAt: tx.now } },
      { session },
    );
    return { from: user.householdId, to: intoId };
  });
}

export type InviteWithPeople = HouseholdInviteDoc & { fromName: string };

export async function invitesWithNames(c: Collections, invites: HouseholdInviteDoc[]): Promise<InviteWithPeople[]> {
  const ids = [...new Set(invites.map((i) => i.fromUserId.toHexString()))].map((id) => new ObjectId(id));
  const people = ids.length ? await c.users.find({ _id: { $in: ids } }, { projection: { name: 1 } }).toArray() : [];
  const names = new Map(people.map((p) => [p._id.toHexString(), p.name]));
  return invites.map((i) => ({ ...i, fromName: names.get(i.fromUserId.toHexString()) ?? "A former member" }));
}
