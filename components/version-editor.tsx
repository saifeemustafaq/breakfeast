"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LockIcon, PlusIcon, Trash2Icon, UsersIcon } from "lucide-react";
import { resetVersion, saveVersion, setVersionShared } from "@/app/version-actions";
import { toast } from "@/components/activity/toast";
import { AdditionRow, IngredientPicker, newAddition } from "@/components/addition-picker";
import { goBack } from "@/components/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { failureMessage, unwrap } from "@/lib/action-result";
import { ingredientsWith } from "@/lib/ingredients";
import { measureGrams } from "@/lib/measures";
import { recipeNutrition } from "@/lib/nutrition";
import type { Ingredient, Recipe } from "@/lib/recipes";
import type { AppState } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MAX_ADDITIONS, applyAdditions, type AdditionInput } from "@/lib/versions";

export type EditorState = Pick<AppState, "versions" | "custom" | "disliked" | "stock">;

/**
 * Your version of a recipe: the original's ingredients stay locked, and you add up to 8
 * items from your pantry list with an amount (and, for overnight recipes, when they go in).
 */
export function VersionEditor({ recipe, state }: { recipe: Recipe; state: EditorState }) {
  const router = useRouter();
  const saved = state.versions.mine[recipe.id];
  const ingredients = useMemo(() => ingredientsWith(state.custom), [state.custom]);
  const initial = useMemo<AdditionInput[]>(
    () =>
      (saved?.additions ?? [])
        .filter((a) => ingredients[a.ingredientId])
        .map(({ ingredientId, qty, when }) => ({ ingredientId, qty, when })),
    [saved, ingredients],
  );
  const [additions, setAdditions] = useState(initial);
  const [shared, setShared] = useState(saved?.shared ?? false);
  const [picking, setPicking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const overnight = recipe.prep === "overnight";
  const dirty = JSON.stringify(additions) !== JSON.stringify(initial);
  const missingQty = additions.some((a) => !a.qty.trim());
  const back = () => goBack(router, `/recipes/${recipe.id}`);

  const preview = useMemo(
    () =>
      applyAdditions(
        recipe,
        additions
          .filter((a) => a.qty.trim())
          .map((a) => ({
            ...a,
            grams: measureGrams(a.ingredientId, a.qty) ?? null,
          })),
        (id) => ingredients[id]?.name ?? id,
      ),
    [recipe, additions, ingredients],
  );

  function update(id: string, patch: Partial<AdditionInput>) {
    setAdditions((list) => list.map((a) => (a.ingredientId === id ? { ...a, ...patch } : a)));
  }

  function add(item: Ingredient) {
    setAdditions((list) => [...list, newAddition(item.id, overnight ? undefined : "morning")]);
    setPicking(false);
  }

  function save() {
    startTransition(async () => {
      try {
        await unwrap(saveVersion(recipe.id, additions));
        toast.success(
          additions.length ? "Saved. Your version is now the default." : "Back to the original",
        );
        back();
      } catch (err) {
        toast.error(failureMessage(err, "Couldn't save your version. Try again."));
      }
    });
  }

  function remove() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    startTransition(async () => {
      try {
        await unwrap(resetVersion(recipe.id));
        toast("Your version was deleted. You'll see the original.");
        back();
      } catch (err) {
        toast.error(failureMessage(err, "Couldn't delete your version. Try again."));
      }
    });
  }

  function share(on: boolean) {
    setShared(on);
    startTransition(async () => {
      try {
        await unwrap(setVersionShared(recipe.id, on));
        toast(on ? "Shared with your household" : "No longer shared");
      } catch (err) {
        setShared(!on);
        toast.error(failureMessage(err, "Couldn't change sharing. Try again."));
      }
    });
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          <LockIcon className="size-3.5" />
          In the original
        </h2>
        <p className="text-sm text-muted-foreground">
          These stay. You can skip any of them while you&apos;re making it.
        </p>
        <ul className="flex flex-wrap gap-1.5">
          {recipe.ingredients.map((ri) => (
            <li key={ri.id} className="rounded-full bg-muted px-2.5 py-1 text-sm">
              {ingredients[ri.id]?.name ?? ri.id}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            You add
          </h2>
          <span className="text-xs text-muted-foreground tabular-nums">
            {additions.length} of {MAX_ADDITIONS}
          </span>
        </div>
        {additions.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nothing yet. Add anything on your pantry list, like chia seeds or walnuts.
          </p>
        )}
        <ul className="flex flex-col gap-3">
          {additions.map((a) => (
            <AdditionRow
              key={a.ingredientId}
              addition={a}
              item={ingredients[a.ingredientId]}
              overnight={overnight}
              outOfStock={state.stock[a.ingredientId]?.inStock === false}
              onChange={(patch) => update(a.ingredientId, patch)}
              onRemove={() =>
                setAdditions((list) => list.filter((x) => x.ingredientId !== a.ingredientId))
              }
            />
          ))}
        </ul>
        <Button
          variant="outline"
          className="h-11 border-dashed"
          disabled={additions.length >= MAX_ADDITIONS}
          onClick={() => setPicking(true)}
        >
          <PlusIcon />
          {additions.length >= MAX_ADDITIONS
            ? `That's the limit of ${MAX_ADDITIONS}`
            : "Add an ingredient"}
        </Button>
      </section>

      {additions.length > 0 && <NutritionCompare original={recipe} version={preview} />}

      {saved && (
        <section className="flex flex-col gap-2">
          <label
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-xl border bg-card p-3",
              (dirty || pending) && "cursor-not-allowed opacity-60",
            )}
          >
            <Checkbox
              className="mt-0.5 size-5"
              checked={shared}
              disabled={dirty || pending}
              onCheckedChange={(v) => share(!!v)}
            />
            <span className="flex flex-col gap-0.5">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <UsersIcon className="size-3.5" />
                Share with your household
              </span>
              <span className="text-xs text-muted-foreground">
                {dirty
                  ? "Save your changes first."
                  : "They'll see your latest version and can copy it to make their own."}
              </span>
            </span>
          </label>
          <Button
            variant={confirmDelete ? "destructive" : "ghost"}
            className="h-11 text-muted-foreground"
            disabled={pending}
            onClick={remove}
          >
            <Trash2Icon />
            {confirmDelete ? "Tap again to delete your version" : "Delete your version"}
          </Button>
        </section>
      )}

      <div className="sticky bottom-0 -mx-5 mt-auto flex flex-col gap-2 border-t bg-background/95 px-5 pt-3 pb-3">
        <Button className="h-12 text-base" disabled={!dirty || missingQty || pending} onClick={save}>
          {pending ? "Saving…" : saved || additions.length ? "Save your version" : "Save"}
        </Button>
        {missingQty && (
          <p className="text-center text-xs text-muted-foreground">
            Give each of your own items an amount.
          </p>
        )}
      </div>

      <IngredientPicker
        open={picking}
        onOpenChange={setPicking}
        recipe={recipe}
        taken={new Set(additions.map((a) => a.ingredientId))}
        state={state}
        description="Anything on the list, in stock or not. Items you're out of go on the shopping list when you make it."
        onPick={add}
      />
    </div>
  );
}

const ROWS = [
  { key: "kcal", label: "Calories", unit: "" },
  { key: "protein", label: "Protein", unit: " g" },
  { key: "fiber", label: "Fiber", unit: " g" },
] as const;

/** Original next to your version, so the trade-off is visible before saving. */
function NutritionCompare({ original, version }: { original: Recipe; version: Recipe }) {
  const a = recipeNutrition(original).totals;
  const b = recipeNutrition(version).totals;
  const uncounted = version.variant?.uncounted.length ?? 0;
  return (
    <section className="flex flex-col gap-2 rounded-xl bg-muted/50 p-4">
      <h2 className="text-sm font-semibold">Per serving</h2>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr>
            <th className="py-1 font-medium" />
            <th className="py-1 text-right font-medium">Original</th>
            <th className="py-1 text-right font-medium">Yours</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => {
            const diff = Math.round(b[r.key]) - Math.round(a[r.key]);
            return (
              <tr key={r.key} className="border-t border-border/60">
                <td className="py-1.5">{r.label}</td>
                <td className="py-1.5 text-right tabular-nums">
                  {Math.round(a[r.key])}
                  {r.unit}
                </td>
                <td className="py-1.5 text-right font-medium tabular-nums">
                  {Math.round(b[r.key])}
                  {r.unit}
                  {diff !== 0 && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({diff > 0 ? "+" : ""}
                      {diff})
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {uncounted > 0 && (
        <p className="text-xs text-muted-foreground">
          {uncounted === 1 ? "1 of your own items isn't" : `${uncounted} of your own items aren't`}{" "}
          counted: there&apos;s no nutrition data for them.
        </p>
      )}
    </section>
  );
}
