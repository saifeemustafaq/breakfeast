import "server-only";
import { ObjectId } from "mongodb";
import { cacheLife, cacheTag } from "next/cache";
import { requireUserPage } from "./auth/guards";
import { CLIENT_STALE_SEC, householdTag, userTag } from "./cache-tags";
import { collections } from "./db";
import { HOUR } from "./time";
import type { Aisle } from "./recipes";
import type { AppState, HistoryEntry, RecipeStats } from "./types";

const UPCOMING_FRESH_MS = 36 * HOUR;

export async function getAppState(): Promise<AppState> {
  const { user } = await requireUserPage();
  return appState(user.householdId.toHexString(), user._id.toHexString());
}

/** Everything the five tabs render from, in one round of queries. */
async function appState(householdIdHex: string, userIdHex: string): Promise<AppState> {
  "use cache: private";
  cacheTag(householdTag(householdIdHex), userTag(userIdHex));
  cacheLife({ stale: CLIENT_STALE_SEC });
  const householdId = new ObjectId(householdIdHex);
  const user = { _id: new ObjectId(userIdHex) };
  const c = await collections();

  const [pantry, cart, upcoming, lastMade, ratings, prefs, custom, notes] = await Promise.all([
    c.pantry.find({ householdId }).toArray(),
    c.cart.find({ householdId }).sort({ addedAt: 1 }).toArray(),
    c.upcoming.findOne({ householdId }),
    c.history
      .aggregate<{ _id: number; last: Date; made: number }>([
        { $match: { householdId } },
        { $group: { _id: "$recipeId", last: { $max: "$madeAt" }, made: { $sum: 1 } } },
      ])
      .toArray(),
    c.ratings
      .aggregate<{
        _id: number;
        rated: number;
        taste: number;
        feel: number;
        again: number;
        notes: (string | null)[];
      }>([
        { $match: { householdId, userId: user._id } },
        { $sort: { updatedAt: 1 } },
        {
          $group: {
            _id: "$recipeId",
            rated: { $sum: 1 },
            taste: { $avg: "$taste" },
            feel: { $avg: "$feel" },
            again: { $avg: "$again" },
            notes: { $push: { $ifNull: ["$note", null] } },
          },
        },
      ])
      .toArray(),
    c.preferences.findOne({ userId: user._id }),
    c.customIngredients.find({ householdId }).sort({ nameKey: 1 }).toArray(),
    c.recipeNotes.find({ householdId }).toArray(),
  ]);

  const stats: Record<number, RecipeStats> = {};
  for (const h of lastMade) {
    stats[h._id] = { made: h.made, rated: 0, taste: null, feel: null, again: null, lastNote: null };
  }
  for (const r of ratings) {
    stats[r._id] = {
      made: stats[r._id]?.made ?? r.rated,
      rated: r.rated,
      taste: r.taste,
      feel: r.feel,
      again: r.again,
      lastNote: r.notes.findLast((n): n is string => !!n) ?? null,
    };
  }

  const loadedAt = Date.now();
  const fresh = upcoming && loadedAt - upcoming.createdAt.getTime() < UPCOMING_FRESH_MS;

  return {
    stock: Object.fromEntries(
      pantry.map((p) => [p.ingredientId, { inStock: p.inStock, updatedAt: p.updatedAt.toISOString() }]),
    ),
    cart: cart.map((i) => ({
      ingredientId: i.ingredientId,
      kind: i.kind,
      forRecipes: i.forRecipes,
      addedAt: i.addedAt.toISOString(),
    })),
    upcoming: fresh
      ? {
          recipeId: upcoming.recipeId,
          needsPrep: upcoming.needsPrep,
          createdAt: upcoming.createdAt.toISOString(),
        }
      : null,
    lastMade: Object.fromEntries(lastMade.map((h) => [h._id, h.last.toISOString()])),
    stats,
    disliked: prefs?.disliked ?? [],
    custom: custom.map((i) => ({ id: i.ingredientId, name: i.name, aisle: i.aisle as Aisle })),
    notes: Object.fromEntries(notes.map((n) => [n.recipeId, { text: n.text, updatedAt: n.updatedAt.toISOString() }])),
    loadedAt,
  };
}

/** The household's breakfasts, newest first, with the signed-in user's own rating. */
export async function getHistory(limit = 365): Promise<HistoryEntry[]> {
  const { user } = await requireUserPage();
  return historyEntries(user.householdId.toHexString(), user._id.toHexString(), limit);
}

async function historyEntries(householdIdHex: string, userIdHex: string, limit: number): Promise<HistoryEntry[]> {
  "use cache: private";
  cacheTag(householdTag(householdIdHex), userTag(userIdHex));
  cacheLife({ stale: CLIENT_STALE_SEC });
  const householdId = new ObjectId(householdIdHex);
  const userId = new ObjectId(userIdHex);
  const c = await collections();
  const history = await c.history.find({ householdId }).sort({ madeAt: -1 }).limit(limit).toArray();
  const historyIds = history.flatMap((h) => (h._id ? [h._id] : []));
  const ratings = historyIds.length
    ? await c.ratings.find({ userId, historyId: { $in: historyIds } }).toArray()
    : [];
  const byHistory = new Map(ratings.map((r) => [r.historyId.toHexString(), r]));
  return history.flatMap((h) => {
    if (!h._id) return [];
    const id = h._id.toHexString();
    const r = byHistory.get(id);
    return {
      id,
      recipeId: h.recipeId,
      madeAt: h.madeAt.toISOString(),
      ...(r ? { taste: r.taste, feel: r.feel, again: r.again } : {}),
      ...(r?.note ? { note: r.note } : {}),
    };
  });
}
