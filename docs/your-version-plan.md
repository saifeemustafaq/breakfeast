# Your version of a recipe: build plan

Make your own version of any breakfast by adding ingredients from your pantry list. Your version becomes your default everywhere, can be shared live with your household, and while preparing any breakfast you can skip ingredients, which the app remembers next time.

## 1. Decisions

| Topic | Decision |
|---|---|
| Removing core ingredients | Not allowed. Core ingredients can only be **skipped** while preparing |
| What can be added | Anything on the Pantry list (catalog items and your own items), in stock or not. Out-of-stock additions go to the cart like core ingredients |
| Own items as additions | Allowed, with a free-text amount, labeled "not counted in nutrition" |
| Amounts for catalog items | Picked from measures that suit the ingredient (1 tsp, 1 tbsp, 2 tbsp, ¼ cup, 1 piece...), each with a known gram weight |
| Owner | Per person. You can **share** your version with your household |
| Sharing | Others see it as an extra choice ("Mustafa's version"). It is **live**: they always see your latest edits. They can make it as it is, or copy it into their own version, after which their copy is independent |
| Default | If you have your own version, it is your default everywhere from then on |
| Switching | On the recipe page and on Today's suggestion screen (Your version / Original / shared versions). The last pick per recipe is remembered |
| Skips | A Skip button on each ingredient while gathering. Applies to core and added ingredients |
| "Make it anyway without them" | The missing items count as skipped for that meal |
| Skipped last time | Based on the last time **you** made it |
| Repeated skips | After 3 skips in a row of something **you added**, offer to remove it from your version |
| One-time extras while preparing | Built as a follow-up, see section 11 |

## 2. Terms

- **Original**: the catalog recipe in `lib/recipes.ts`. Never changes per user.
- **Version**: a person's list of additions to one recipe. At most one per person per recipe.
- **Addition**: `{ ingredientId, measure, qty, grams, when }`. `grams` is null for your own items (not counted).
- **Effective recipe**: the original plus a version's additions, built by one pure function. Every screen (kitchen check, gather, steps, nutrition, insights, cart, export) works from the effective recipe.
- **Skip**: a per-meal choice. It changes that meal's record and nutrition, never the recipe or the version.
- **Snapshot**: what a logged breakfast actually was (additions with grams and names, plus skipped ids), saved on the history entry so later edits never rewrite the past.

## 3. Data model

### 3.1 New collection `recipe_versions`

```ts
type RecipeVersionDoc = {
  _id?: ObjectId;
  householdId: ObjectId;      // for listing shared versions
  userId: ObjectId;           // owner
  recipeId: number;
  additions: {
    ingredientId: string;     // catalog id or custom-<hex>
    measure: string | null;   // measure id from lib/measures.ts; null for own items
    qty: string;              // "1 tbsp", or the free text for own items
    grams: number | null;     // null = not counted in nutrition
    when: "night" | "morning";
  }[];
  shared: boolean;
  createdAt: Date;
  updatedAt: Date;
};
```

Indexes: unique `{ userId, recipeId }`; `{ householdId, recipeId, shared }`.

Limits: up to 8 additions per version; no duplicates; nothing already in the original; nothing on your avoid list.

### 3.2 History snapshot (`history`)

```ts
type HistoryDoc = {
  ...existing,
  version?: { kind: "mine" | "shared"; ownerId: ObjectId; additions: Snapshot[] }; // absent = original
  skipped?: string[];       // ingredient ids skipped in this meal (core or added)
};
type Snapshot = { ingredientId: string; name: string; qty: string; grams: number | null; when: "night" | "morning" };
```

The server builds the snapshot from the version document at save time (it never trusts grams sent by the phone). `name` is stored so a deleted own item still reads correctly in the diary.

### 3.3 Tomorrow's plan (`upcoming`)

Add `version?: { ownerId: ObjectId } | null` (which version you're making) and `skipped?: string[]` (skips from tonight's gather). The morning's `markMade` merges these with the morning skips.

### 3.4 What the phone receives (`AppState`)

```ts
versions: {
  mine: Record<number, Version>;                                  // your versions
  shared: Record<number, (Version & { ownerName: string })[]>;    // others' shared versions in your household
};
lastSkipped: Record<number, string[]>;     // your most recent meal of each recipe
skipRuns: Record<number, Record<string, number>>; // consecutive skips per added ingredient, from your recent meals
```

Loaded in the same `appState()` round as everything else. `skipRuns` comes from your last 3 meals of each recipe.

## 4. Measures (new `lib/measures.ts`)

- `ADD_MEASURES: Record<ingredientId, { id: string; label: string; grams: number }[]>` for every addable catalog ingredient, using USDA portion weights (the same source as `PORTION_GRAMS`). Example: chia `1 tsp 4 g, 1 tbsp 12 g, 2 tbsp 24 g`; walnuts `1 tbsp chopped 7 g, 2 tbsp 14 g, ¼ cup 30 g`; strawberries `½ cup 76 g, 1 cup 152 g`; kiwi `1 piece 69 g`.
- **Addable catalog ingredients**: everything on the Pantry list except the raw bases of cooked-ahead items (raw sweet potato, raw chicken, dry quinoa, brown rice, buckwheat). They have no breakfast-ready nutrition; their cooked forms are addable and bring their batch-cook task with them.
- Document the gram sources in `docs/nutrition-methodology.md`.

## 5. Engine (pure, isomorphic)

### 5.1 New `lib/versions.ts`

- `effectiveRecipe(recipe, additions, ingredients)` returns `{ recipe, portions, uncounted }`:
  - Appends additions to `ingredients` with `added: true`. For overnight recipes, `when` decides night or morning; otherwise everything is morning.
  - Appends one generated step per phase, like "Add 1 tbsp chia seeds and 1 tbsp chopped walnuts." (the night step for night additions, the last morning step for the rest).
  - `portions` = `PORTION_GRAMS[recipe.id]` plus the additions' grams. `uncounted` = own items.
  - Drops additions that are now on your avoid list or deleted, and reports them so the UI can explain.
- `versionChoices(recipeId, state)`: Original, yours, and shared ones. `defaultChoice`: yours when it exists.
- `resolve(recipeId, choice, state)`: the effective recipe for a choice.
- `validateAdditions(...)`: shared by the editor and the server action.

### 5.2 `lib/nutrition.ts` refactor

- `recipeNutrition(recipe, portions = PORTION_GRAMS[recipe.id], key = String(recipe.id))`, with the cache keyed by `key` (recipe id plus a signature of the additions and skips).
- Own items add a caveat ("Coffee beans isn't counted") and set confidence to "fair".
- `mealNutrition({ recipeId, version?, skipped? })` for logged meals: original plus snapshot additions, minus skipped ingredients.
- `averageNutrition(meals)` takes meals instead of recipe ids (`lib/patterns.ts`, `lib/export.ts` updated).
- `topMicros`, `recipeInsights` and the oats rule (which reads `PORTION_GRAMS` directly) take portions. So does `components/nutrition.tsx` (line 325).
- Insights then name additions naturally: "Omega-3, mostly from chia seeds and walnuts."

### 5.3 Ingredient lookups that must accept your own items

About 100 places do `INGREDIENTS[id]` assuming a catalog id. Once a recipe can contain `custom-…` ids, these must use `ingredientsWith(state.custom)`: `checkableIds`, `recipeItems` callers, `cookedAheadItems`, `dislikedIn`, `kitchen-checklist.tsx`, `prep-details.tsx`, `GatherList`, `plan-flow.tsx`, `cart.ts`, `export.ts`. This is the riskiest part, so it comes first and is checked on its own before any UI.

## 6. Server actions (new `app/versions-actions.ts`, plus changes in `app/actions.ts`)

| Action | Does | Events |
|---|---|---|
| `saveVersion({ recipeId, additions, shared })` | Validates (pantry list, measures, limits, avoid list, own items owned by the household) and upserts yours | `recipe.version_saved` / `recipe.version_save_failed` (`recipeId`, `additions` count, `shared`) |
| `resetVersion(recipeId)` | Deletes yours ("Reset to original") | `recipe.version_reset` / `recipe.version_reset_failed` |
| `setVersionShared(recipeId, shared)` | Share or stop sharing | `recipe.version_shared` / `recipe.version_share_failed` |
| `copySharedVersion(recipeId, ownerId)` | Copies a household member's shared version into yours (replaces yours after a confirm) | `recipe.version_copied` / `recipe.version_copy_failed` |
| `markMade(recipe, { choice, skipped })` | Saves the snapshot and skips | `breakfast.made` gains `version` and `skipped` count |
| `planTomorrow(recipe, needsPrep, { choice, skipped })` | Remembers the choice and tonight's skips on `upcoming` | `plan.set` gains `version` |
| `logBreakfast` | Uses your default choice; optional choice param | `breakfast.logged` gains `version` |
| `recordCheck`, `recordPlanCheck` | Accept own-item ids via `pantryId` plus `ownsAll` | unchanged |
| `removeIngredient` (delete own item) | Also removes it from every version in the household; the toast says how many | unchanged |

Household merge and leave: versions belong to the person. On merge, the person's versions move with them. On leave (`copyOut`), they keep theirs. Shared versions are only visible inside the current household. `db:reset-app-data` adds `recipe_versions`.

## 7. Screens

### 7.1 Recipe page

- **Version switch** under the title: `Your version · Original · Sara's version`. Default is yours. The switch changes the ingredients, steps, nutrition, insights and the Make and Prep buttons (which pass the choice to Today).
- The ingredients, steps and nutrition now depend on the person, so they move into a client `RecipeBody`. The static shell keeps the original as the instant fallback, so the page still paints immediately and swaps to your version as soon as your data arrives.
- Added ingredients show an "Added" tag; your own items show "Not counted in nutrition".
- **"Make it yours"** (or **"Edit your version"**) opens the editor. On a shared version: **"Copy as my version"**.
- Recipe library cards get a small "Your version" tag.

### 7.2 Editor (new route `/recipes/[id]/edit`)

A full page, not a sheet, because the picker, measures and nutrition preview need room.

1. **Core ingredients**, locked: "These stay. You can skip any of them while making it."
2. **Your additions**: each row has measure chips, Night or Morning (overnight recipes only), and remove.
3. **Add from your pantry**: a searchable list of the Pantry list, with greyed-out items explained (already in the recipe, on your avoid list, or a raw base like dry quinoa with "add cooked quinoa instead").
4. **What changes**: a live comparison against the original: calories, protein, fiber and sugars, plus the biggest micronutrient change (e.g. "+4.6 g fiber, omega-3 from 6% to 180% of a day").
5. **Share with your household** switch.
6. **Save**. **Reset to original** with a confirm.

### 7.3 Today

- **Suggestion screen**: version chips when there's more than one choice. The choice lives in the flow's `Frame`, so Back and Resume keep it. Everything after (kitchen check, gather, steps, nutrition snapshot, insight teaser) uses the effective recipe.
- **Kitchen check**: additions are checked like any ingredient; missing ones go to the cart.
- **Gather**: each row gets **Skip**. A skipped row turns muted with "Skipped" and Undo. Rows you skipped last time show "Skipped last time"; added rows show "Added". Skips are saved in the Resume session.
- **Missing, then "Make it anyway without them"**: those items are added to the skips.
- **Steps**: a callout lists what you're skipping; the generated "Add ..." step leaves out skipped additions. Core step text stays as written.
- **Tonight**: night skips and the choice are stored on tomorrow's plan; the morning gather and `markMade` merge them.
- **After serving**: if an added ingredient has now been skipped 3 times in a row: "You've skipped walnuts the last 3 times. Remove it from your version?" with Remove and Keep.
- **"I made this recently"**: logs your default version; version chips appear when there's a choice.

### 7.4 Plan, cart, exports, patterns

- **Plan ahead**: each pick uses your default version (its kitchen check includes additions).
- **Cart**: unchanged; additions arrive through the same checks and keep their "for which breakfast" links.
- **Diary and nutrition report**: computed from each meal's snapshot. New diary columns: Version and Skipped.
- **Recipe book export**: prints your version by default, with an "Originals" option. The backup includes your versions and the meal snapshots.
- **Patterns**: unchanged groupings (a topping doesn't change sweet or savory). Its nutrition averages use meal snapshots.

## 8. Edge cases

- **You delete an own item that's in a version**: it's removed from those versions; old meals keep its name from the snapshot.
- **You later add an addition to your avoid list**: it's hidden from the effective recipe, and the editor shows it struck through with "On your avoid list".
- **The catalog recipe changes in code to include something you'd added**: the duplicate addition is ignored.
- **The owner of a shared version leaves the household**: it disappears for the others. Anyone who copied it keeps their copy.
- **A shared version you were about to make changes mid-flow**: the flow keeps what it loaded; the meal's snapshot records what you actually made.
- **Ranking** stays per recipe; your version doesn't change which breakfast is suggested.
- **Ratings** stay per meal; the diary shows which version each was.

## 9. Build order

1. **Foundations**: types, schema and indexes, `lib/measures.ts`, `lib/versions.ts`, the nutrition refactor, and own-item-safe ingredient lookups. Check with a script that recipe 2 plus 1 tbsp chia and 1 tbsp walnuts comes to about 465 kcal and 12 g fiber, and that every original recipe's numbers are unchanged.
2. **Editing**: the actions, the editor page, the recipe page switch and `RecipeBody`, sharing and copying, and the library tag.
3. **Making it**: version choice in Today and the Resume session, effective recipes through check, gather and steps, Skip, missing counting as skipped, snapshots on `markMade`, `planTomorrow` and `logBreakfast`, "Skipped last time", and the repeated-skip offer.
4. **Everything that reads history**: patterns, the diary, the nutrition report, exports, the backup, and plan ahead.
5. **Wrap-up**: household merge and copy, the admin reset list, `DEVELOPER_GUIDE.md`, `docs/business-events.md`, `docs/nutrition-methodology.md`, then a full typecheck, lint, test and build pass and a walkthrough on a phone-sized screen.

## 10. Smaller points (settled)

- Up to **8 additions** per version.
- The editor is its own page (`/recipes/[id]/edit`).
- The amount of an addition can't be changed while preparing (edit your version instead).
- A shared version is labeled with the owner's name ("Sara's version").
- "I made this recently" doesn't ask about skips.
- **The last version you picked for a recipe is remembered** (per person, in `preferences.choices`). The default is: your last pick if it still exists, otherwise your version, otherwise the original. Saving your version sets your pick back to "Your version", so a freshly made version is the default from then on.

## 11. One-off extras (follow-up build)

Something you add while preparing that counts for that breakfast only and never changes a saved version.

### 11.1 Decisions

| Topic | Decision |
|---|---|
| Where | The gather screen only, for morning breakfasts and night prep. Not the kitchen check, not "I made this recently" |
| What can be added | Anything on the Pantry list, in stock or not, same as the editor. Out-of-stock items are tagged in the picker but nothing goes to the cart, since you're already making it |
| Amounts | Same as the editor: preset measures for catalog items, a short typed amount for your own items (not counted in nutrition) |
| Limit | The version's additions plus one-offs share the limit of **8** for that breakfast |
| Not allowed | Anything already in the recipe or the chosen version, and your dislikes (hidden from the picker) |
| Night or morning | Night prep extras are "night"; extras added in the morning are always "morning", including the morning after prep |
| Changing your mind | A one-off row has **Remove**, not Skip. One-offs never count toward "Skipped last time" or the repeated-skip offer |
| Keeping it | The finished screen offers "Add x to your version?" (Add / Not now) for each one-off. Add puts it in **your** version, starting one if you don't have one, even if you made the original or someone's shared version. Hidden when your version is already at 8 |

### 11.2 Data model

- `history` and `upcoming` gain `extras?: (Addition & { name })[]`, stored next to `version` and `skipped`, never inside the version snapshot. So "Original plus a one-off" needs no fake owner, and the snapshot still says exactly whose version it was.
- `HistoryEntry.extras?` and `Upcoming.extras` on the phone.
- `Progress.extras: AdditionInput[]` in the Resume session, so an interrupted breakfast keeps them. The serve step gains `extras?` for the keep offer.
- `RecipeIngredient.oneOff?: true` marks them in the effective recipe.

### 11.3 Engine (`lib/versions.ts`)

- `withExtras(recipe, extras, nameOf)` rebuilds from the original with the chosen version's additions **plus** the one-offs in one pass of `applyAdditions`, so there is still a single "Add your extras" step and one variant key. One-off ingredients get `oneOff: true`.
- `recipeFromSnapshot(id, snapshot, skipped, extras)` and `mealRecipe(entry)` include them, so patterns, nutrition, the diary and exports pick them up without further changes. `namesWith` also takes names from `extras`.
- `validateAdditions` gains a `max` option; the server passes 8 minus the version's usable additions.

### 11.4 Server

| Action | Change | Events |
|---|---|---|
| `markMade(recipe, { choice, skipped, extras })` | Validates against the chosen version, stores `extras` with names | `breakfast.made` gains `extras` (count) |
| `planTomorrow(recipe, needsPrep, { choice, skipped, extras })` | Stores night extras on `upcoming`; `$unset` when none | `plan.set` gains `extras` (count) |
| Morning after prep (`choice: "planned"`) | The plan's extras carry into the history entry, plus any morning extras | as above |
| Keep offer | Uses `saveVersion` with your current additions plus the item | `recipe.version_saved` |
| Household merge and leave | `extras` copied with history and the plan, like `version` and `skipped` | none |

### 11.5 Screens

- **Gather**: an "Add something just this time" button under the list opens the editor's ingredient picker, then the amount chips. The row shows a "Just this time" tag and Remove. The button hides at the limit with "Up to 8 extras per breakfast".
- **Steps**: the "Add your extras" step includes them.
- **Serve**: nutrition includes them; the keep offer sits above the rating, next to the repeated-skip offer.
- **Last night's plan**: "+ x (just this time)" under the version line.
- **History readers**: insights' recent breakfasts and the diary's "Added or skipped" column show "x (just this time)".
- **Shared code**: the ingredient picker and the amount chooser move out of `version-editor.tsx` into `components/addition-picker.tsx` so the editor and gather share them.

### 11.6 Build order

1. Types, schema fields, `withExtras`, the snapshot and `mealRecipe` changes, the `max` option on validation, and moving the picker out.
2. Gather UI, Resume session, `markMade` and `planTomorrow`, the morning-after carry-over, and steps and serve.
3. The keep offer, history readers and exports, household copy and merge, docs (`DEVELOPER_GUIDE.md`, `docs/business-events.md`), then typecheck, lint, tests and build.
