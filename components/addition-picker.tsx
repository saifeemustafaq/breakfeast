"use client";

import { useState } from "react";
import { MoonIcon, SearchIcon, SunIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ADDABLE_CATALOG, measuresFor } from "@/lib/measures";
import { AISLE_ORDER, type Ingredient, type Recipe } from "@/lib/recipes";
import type { AppState } from "@/lib/types";
import { cn } from "@/lib/utils";
import { OWN_QTY_MAX, type AdditionInput } from "@/lib/versions";

export type PickerState = Pick<AppState, "custom" | "disliked" | "stock">;

/** Things that usually go in with the overnight base rather than on top in the morning. */
const NIGHT_BY_DEFAULT = new Set([
  "chia",
  "rolled-oats",
  "cocoa",
  "cinnamon",
  "soy-milk",
  "greek-yogurt",
  "silken-tofu",
]);

function defaultQty(id: string) {
  const list = measuresFor(id);
  return (list.find((m) => /^1 tbsp/.test(m.label)) ?? list[0])?.label ?? "";
}

/** A new addition with a sensible amount; `when` is fixed for one-offs and non-overnight recipes. */
export function newAddition(id: string, when?: AdditionInput["when"]): AdditionInput {
  return {
    ingredientId: id,
    qty: defaultQty(id),
    when: when ?? (NIGHT_BY_DEFAULT.has(id) ? "night" : "morning"),
  };
}

export function AdditionRow({
  addition,
  item,
  overnight,
  outOfStock,
  onChange,
  onRemove,
}: {
  addition: AdditionInput;
  item: Ingredient | undefined;
  overnight: boolean;
  outOfStock: boolean;
  onChange: (patch: Partial<AdditionInput>) => void;
  onRemove: () => void;
}) {
  const measures = measuresFor(addition.ingredientId);
  const name = item?.name ?? addition.ingredientId;
  return (
    <li className="flex flex-col gap-3 rounded-xl border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="font-medium leading-tight">{name}</span>
          <span className="text-xs text-muted-foreground">
            {measures.length ? item?.aisle : "Your item, not counted in nutrition"}
            {outOfStock && " · Out of stock"}
          </span>
        </div>
        <Button size="icon" variant="ghost" aria-label={`Remove ${name}`} onClick={onRemove}>
          <XIcon />
        </Button>
      </div>
      {measures.length ? (
        <Chips
          label={`Amount of ${name}`}
          options={measures.map((m) => ({ value: m.label, label: m.label }))}
          value={addition.qty}
          onChange={(qty) => onChange({ qty })}
        />
      ) : (
        <Input
          aria-label={`Amount of ${name}`}
          placeholder="Amount, e.g. a drizzle"
          maxLength={OWN_QTY_MAX}
          value={addition.qty}
          onChange={(e) => onChange({ qty: e.target.value })}
          className="h-11"
        />
      )}
      {overnight && (
        <Chips
          label={`When ${name} goes in`}
          options={[
            { value: "night", label: "Night before", icon: <MoonIcon /> },
            { value: "morning", label: "In the morning", icon: <SunIcon /> },
          ]}
          value={addition.when}
          onChange={(when) => onChange({ when: when as AdditionInput["when"] })}
        />
      )}
    </li>
  );
}

function Chips({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string; icon?: React.ReactNode }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&>svg]:size-3.5",
            o.value === value
              ? "border-primary bg-primary/10 font-medium text-primary"
              : "bg-background hover:bg-muted",
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function IngredientPicker({
  open,
  onOpenChange,
  recipe,
  taken,
  state,
  description,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipe: Recipe;
  taken: Set<string>;
  state: PickerState;
  description: string;
  onPick: (item: Ingredient) => void;
}) {
  const [query, setQuery] = useState("");
  const inRecipe = new Set(recipe.ingredients.map((ri) => ri.id));
  const disliked = new Set(state.disliked);
  const q = query.trim().toLowerCase();
  const items: Ingredient[] = [
    ...ADDABLE_CATALOG.filter((i) => !disliked.has(i.batch?.from ?? i.id)),
    ...state.custom.map((c) => ({ id: c.id, name: c.name, aisle: c.aisle })),
  ]
    .filter(
      (i) => !inRecipe.has(i.id) && !taken.has(i.id) && (!q || i.name.toLowerCase().includes(q)),
    )
    .sort(
      (a, b) =>
        AISLE_ORDER.indexOf(a.aisle) - AISLE_ORDER.indexOf(b.aisle) || a.name.localeCompare(b.name),
    );
  const groups = AISLE_ORDER.map((aisle) => ({
    aisle,
    list: items.filter((i) => i.aisle === aisle),
  })).filter((g) => g.list.length);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setQuery("");
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add from your pantry list</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search your pantry list"
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-11 pl-9"
          />
        </div>
        {groups.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {q
              ? "Nothing on your pantry list matches. Add it on the Pantry tab first."
              : "Everything on your list is already in."}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {groups.map((g) => (
              <section key={g.aisle} className="flex flex-col gap-1.5">
                <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {g.aisle}
                </h3>
                <ul className="flex flex-col divide-y rounded-xl border bg-card">
                  {g.list.map((i) => (
                    <li key={i.id}>
                      <button
                        type="button"
                        onClick={() => onPick(i)}
                        className="flex min-h-12 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted"
                      >
                        <span>{i.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {state.stock[i.id]?.inStock === false
                            ? "Out of stock"
                            : measuresFor(i.id).length
                              ? ""
                              : "Your item"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * "Add something just this time": pick from the pantry list, then set the amount.
 * `when` is fixed by the screen (night prep or the morning).
 */
export function AddOnceDialog({
  open,
  onOpenChange,
  recipe,
  state,
  when,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipe: Recipe;
  state: PickerState;
  when: AdditionInput["when"];
  onAdd: (addition: AdditionInput) => void;
}) {
  const [draft, setDraft] = useState<AdditionInput | null>(null);
  const items: Ingredient[] = [...ADDABLE_CATALOG, ...state.custom];
  const item = draft ? items.find((i) => i.id === draft.ingredientId) : undefined;
  return (
    <>
      <IngredientPicker
        open={open && !draft}
        onOpenChange={onOpenChange}
        recipe={recipe}
        taken={new Set()}
        state={state}
        description="Just for this breakfast. Your saved version doesn't change."
        onPick={(i) => setDraft(newAddition(i.id, when))}
      />
      <Dialog
        open={open && !!draft}
        onOpenChange={(next) => {
          if (!next) {
            setDraft(null);
            onOpenChange(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>How much?</DialogTitle>
            <DialogDescription>Just for this breakfast.</DialogDescription>
          </DialogHeader>
          {draft && (
            <ul>
              <AdditionRow
                addition={draft}
                item={item}
                overnight={false}
                outOfStock={state.stock[draft.ingredientId]?.inStock === false}
                onChange={(patch) => setDraft({ ...draft, ...patch })}
                onRemove={() => setDraft(null)}
              />
            </ul>
          )}
          <Button
            className="h-12 text-base"
            disabled={!draft?.qty.trim()}
            onClick={() => {
              if (!draft) return;
              onAdd({ ...draft, qty: draft.qty.trim() });
              setDraft(null);
              onOpenChange(false);
            }}
          >
            Add to this breakfast
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
