import "server-only";
import { ObjectId } from "mongodb";
import { cacheLife, cacheTag } from "next/cache";
import { requireUserPage } from "./auth/guards";
import { CLIENT_STALE_SEC, householdTag, userTag } from "./cache-tags";
import { collections } from "./db";
import { HOUR } from "./time";
import type { Aisle } from "./recipes";
import type { VersionSnapshotDoc } from "./schema";
import type { AppState, HistoryEntry, RecipeStats, SkipHistory, VersionChoice, VersionSnapshot } from "./types";

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

  const [pantry, cart, upcoming, lastMade, ratings, prefs, custom, notes, versionDocs, mine] = await Promise.all([
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
    c.recipeVersions.find({ $or: [{ userId: user._id }, { householdId, shared: true }] }).toArray(),
    c.history
      .find({ householdId, madeBy: user._id }, { projection: { recipeId: 1, skipped: 1 } })
      .sort({ madeAt: -1 })
      .limit(SKIP_LOOKBACK)
      .toArray(),
  ]);

  const ownerIds = [...new Set(versionDocs.map((v) => v.userId.toHexString()))].map((id) => new ObjectId(id));
  const owners = ownerIds.length
    ? await c.users.find({ _id: { $in: ownerIds } }, { projection: { name: 1 } }).toArray()
    : [];
  const ownerName = new Map(owners.map((u) => [u._id.toHexString(), u.name]));
  const versions: AppState["versions"] = { mine: {}, shared: {} };
  for (const v of versionDocs) {
    const ownerId = v.userId.toHexString();
    const version = {
      recipeId: v.recipeId,
      ownerId,
      ownerName: ownerName.get(ownerId) ?? "Someone",
      additions: v.additions,
      shared: v.shared,
      updatedAt: v.updatedAt.toISOString(),
    };
    if (ownerId === userIdHex) versions.mine[v.recipeId] = version;
    else (versions.shared[v.recipeId] ??= []).push(version);
  }

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
    userId: userIdHex,
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
          version: upcoming.version ? snapshotFromDoc(upcoming.version) : null,
          skipped: upcoming.skipped ?? [],
          extras: upcoming.extras ?? [],
        }
      : null,
    lastMade: Object.fromEntries(lastMade.map((h) => [h._id, h.last.toISOString()])),
    stats,
    disliked: prefs?.disliked ?? [],
    custom: custom.map((i) => ({ id: i.ingredientId, name: i.name, aisle: i.aisle as Aisle })),
    notes: Object.fromEntries(notes.map((n) => [n.recipeId, { text: n.text, updatedAt: n.updatedAt.toISOString() }])),
    versions,
    choices: Object.fromEntries(
      Object.entries(prefs?.choices ?? {}).filter(([, v]) => isChoice(v)),
    ) as AppState["choices"],
    skips: skipHistory(mine),
    loadedAt,
  };
}

/** How many of your recent breakfasts to scan for skips. */
const SKIP_LOOKBACK = 300;

const isChoice = (v: string): v is VersionChoice => v === "original" || v === "mine" || /^user:[0-9a-f]{24}$/.test(v);

export const snapshotFromDoc = (s: VersionSnapshotDoc): VersionSnapshot => ({
  ownerId: s.ownerId.toHexString(),
  ownerName: s.ownerName,
  additions: s.additions,
});

/** Per recipe: what you skipped the last time you made it, and each item's current skip streak. */
function skipHistory(made: { recipeId: number; skipped?: string[] }[]): Record<number, SkipHistory> {
  const out: Record<number, SkipHistory> = {};
  const open = new Map<number, Set<string>>();
  for (const h of made) {
    const skipped = h.skipped ?? [];
    let entry = out[h.recipeId];
    if (!entry) {
      entry = out[h.recipeId] = { last: skipped, runs: Object.fromEntries(skipped.map((id) => [id, 1])) };
      open.set(h.recipeId, new Set(skipped));
      continue;
    }
    const streaking = open.get(h.recipeId)!;
    for (const id of [...streaking]) {
      if (skipped.includes(id)) entry.runs[id] += 1;
      else streaking.delete(id);
    }
  }
  for (const [id, entry] of Object.entries(out)) {
    if (!entry.last.length) delete out[Number(id)];
  }
  return out;
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
      ...(h.version ? { version: snapshotFromDoc(h.version) } : {}),
      ...(h.skipped?.length ? { skipped: h.skipped } : {}),
      ...(h.extras?.length ? { extras: h.extras } : {}),
    };
  });
}
