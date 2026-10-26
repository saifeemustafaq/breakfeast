# Business events

Reviewed October 2026.

A business event is a `workflow` row in `activity_events` that says what a person accomplished (or tried to), as opposed to the clicks and requests around it. The admin sees them on a user's **Activity** tab and on **Live activity**.

## How they're recorded

- **Server Actions** record them. Each action in `app/actions.ts`, `app/household-actions.ts` and `app/preferences-actions.ts` runs through `userAction(event, data, fn)` in `lib/action.ts`, where `event` is a `[success, failure]` pair from the table below. After the response is sent (`after()`), `recordWorkflow` writes the success name, or the failure name with `data.error` set to the message the user saw. Recording never fails the action.
- **The browser joins them to its timeline.** The fetch wrapper in `components/activity/auto-capture.ts` adds `x-bf-page-load`, `x-bf-seq` and `x-bf-path` to every Server Action request, so the server event lands in the same page-load group, in order, right after the click that caused it. Without those headers (an old tab, a script) the event is grouped under `server-<sessionId>`.
- **Client-only workflows** (nothing reaches the server) call `track("workflow", name, data)` from `components/activity/logger.ts`.
- Identity (`userId`, `sessionId`, `deviceId`) always comes from the session, never the client.

## Naming

`domain.past_tense` for success and `domain.<verb>_failed` for failure, both snake_case. Data holds ids and counts only: never free text the person typed (rating notes are `hasNote: true`), never a phone number, never a password.

## Catalog

| Success | Failure | Source | Data |
|---|---|---|---|
| `check.recorded` | `check.record_failed` | `recordCheck` | `have` and `missing` (counts), `recipeIds` |
| `plan.checked` | `plan.check_failed` | `recordPlanCheck` | `have`, `missing`, and `recipeIds` (counts) |
| `plan.set` | `plan.set_failed` | `planTomorrow` | `recipeId`, `needsPrep`, `version` (original, mine, shared or planned), `skipped` and `extras` (counts) |
| `plan.cleared` | `plan.clear_failed` | `clearTomorrow` | none |
| `breakfast.made` | `breakfast.mark_failed` | `markMade` | `recipeId`, `version` (original, mine, shared or planned), `skipped` and `extras` (counts) |
| `breakfast.rated` | `breakfast.rate_failed` | `rateBreakfast` | `taste`, `feel`, `again`, `hasNote` |
| `stock.set` | `stock.set_failed` | `setStock` | `ingredientId`, `inStock` |
| `cart.added` | `cart.add_failed` | `addToCart`, `addManyToCart` | `ingredientIds`, `recipeIds` |
| `cart.removed` | `cart.remove_failed` | `removeFromCart` | `ingredientId` |
| `cart.removed_many` | `cart.remove_many_failed` | `removeManyFromCart` (dropping a breakfast) | `ingredientIds` |
| `pantry.ingredient_added` | `pantry.ingredient_add_failed` | `addIngredient` (your own item, from Pantry or Cart) | `aisle`, `toCart` (the name is not logged) |
| `pantry.ingredient_removed` | `pantry.ingredient_remove_failed` | `removeIngredient` | `ingredientId` |
| `cart.completed` | `cart.complete_failed` | `completeCartItem` | `ingredientId` |
| `household.invited` | `household.invite_failed` | `inviteToHousehold` | none (the number invited is not logged) |
| `household.joined` | `household.join_failed` | `respondToInvite(id, true)` | none |
| `household.declined` | `household.decline_failed` | `respondToInvite(id, false)` | none |
| `household.invite_cancelled` | `household.cancel_failed` | `cancelInvite` | none |
| `household.left` | `household.leave_failed` | `leaveHousehold` | none |
| `breakfast.logged` | `breakfast.log_failed` | `logBreakfast` ("I made this recently") | `recipeId`, `daysAgo`, `rated`, `version` |
| `recipe.note_saved` | `recipe.note_save_failed` | `saveRecipeNote` (an empty note deletes it) | `recipeId` (the text is not logged) |
| `recipe.note_deleted` | `recipe.note_delete_failed` | `deleteRecipeNote` | `recipeId` |
| `recipe.version_saved` | `recipe.version_save_failed` | `saveVersion` (no additions resets it) | `recipeId`, `count` (additions; the items are not logged) |
| `recipe.version_reset` | `recipe.version_reset_failed` | `resetVersion` | `recipeId` |
| `recipe.version_shared` | `recipe.version_share_failed` | `setVersionShared` | `recipeId`, `shared` |
| `recipe.version_copied` | `recipe.version_copy_failed` | `copySharedVersion` | `recipeId` (whose version is not logged) |
| `recipe.version_chosen` | `recipe.version_choose_failed` | `chooseVersion` (the switch on the recipe page and Today) | `recipeId`, `version` (original, mine or shared) |
| `preferences.disliked_set` | `preferences.disliked_set_failed` | `setDisliked` | `count` (the ingredients are not logged) |
| `list.copied` | | `CartView` (client) | `items` (count) |
| `export.created` | | `ExportView` (client) | `preset`, `format`, `delivery` (share, download, copy or print), `rows` (count). The content is not logged |

Sign-in, sign-out, app opens and session revocations are **access events** (`access_events`), not business events. See `admin-panel-instructions.md` section 11.

## Adding one

1. Pick the pair and add a row here in the same PR.
2. Wrap the action: `return userAction(["thing.done", "thing.do_failed"], { id }, async ({ user }) => { ... })`.
3. Return `done(data, message?)` or `fail(message)`; throw `ApiError` from `lib/` for expected failures deeper down.
