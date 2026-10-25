"use client";

import { useId, useState, useTransition } from "react";
import { addIngredient } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { failureMessage, unwrap } from "@/lib/action-result";
import { CUSTOM_AISLES, nameKey } from "@/lib/ingredients";
import type { Aisle, Ingredient } from "@/lib/recipes";
import { matchesQuery } from "@/lib/search";
import type { AddedIngredient } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Adds something the recipes don't cover. It always goes in the pantry list; the checkbox
 * decides whether it's also on the shopping list (out of stock) or simply in stock.
 */
export function AddIngredientDialog({
  name,
  onClose,
  defaultToCart,
  known,
  onAdded,
}: {
  /** The name to start with; `null` keeps the dialog closed. */
  name: string | null;
  onClose: () => void;
  defaultToCart: boolean;
  /** Everything already in the pantry list, suggested instead of making a duplicate. */
  known: Ingredient[];
  onAdded: (item: AddedIngredient, toCart: boolean) => void;
}) {
  return (
    <Dialog open={name !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {name !== null && (
          <AddForm
            initialName={name}
            defaultToCart={defaultToCart}
            known={known}
            onAdded={onAdded}
            onCancel={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AddForm({
  initialName,
  defaultToCart,
  known,
  onAdded,
  onCancel,
}: {
  initialName: string;
  defaultToCart: boolean;
  known: Ingredient[];
  onAdded: (item: AddedIngredient, toCart: boolean) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(initialName);
  const [aisle, setAisle] = useState<Aisle>("Pantry");
  const [toCart, setToCart] = useState(defaultToCart);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const typed = name.trim();
  const exact = typed ? known.find((i) => nameKey(i.name) === nameKey(typed)) : undefined;
  const suggestions =
    typed.length >= 2 && !exact ? known.filter((i) => matchesQuery(typed, i.name)).slice(0, 4) : [];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        onAdded(await unwrap(addIngredient({ name, aisle, toCart })), toCart);
      } catch (err) {
        setError(failureMessage(err));
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Add to your pantry</DialogTitle>
        <DialogDescription>
          For anything the recipes don&apos;t cover. It stays on your pantry list so you can restock
          it any time.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-name`}>What is it?</Label>
        <Input
          id={`${id}-name`}
          autoFocus
          autoComplete="off"
          enterKeyHint="done"
          maxLength={60}
          placeholder="e.g. Coffee beans"
          value={name}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => setName(e.target.value)}
          className="h-12 text-base md:text-base"
        />
        {exact && (
          <p role="status" className="text-xs text-muted-foreground">
            {exact.name} is already on your pantry list. Adding it again just updates it.
          </p>
        )}
        {suggestions.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Already listed:</span>
            {suggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                className="rounded-full border bg-card px-2.5 py-1 hover:bg-muted"
                onClick={() => setName(s.name)}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {!exact && (
        <div className="flex flex-col gap-2">
          <p id={`${id}-aisle`} className="text-sm font-medium">
            Where does it live?
          </p>
          <div role="radiogroup" aria-labelledby={`${id}-aisle`} className="flex flex-wrap gap-2">
            {CUSTOM_AISLES.map((a) => (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={a === aisle}
                onClick={() => setAisle(a)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm transition-colors",
                  a === aisle
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-card hover:bg-muted",
                )}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-card p-3">
        <Checkbox
          className="mt-0.5 size-5"
          checked={toCart}
          onCheckedChange={(v) => setToCart(!!v)}
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">Also add to the shopping cart</span>
          <span className="text-xs text-muted-foreground">
            {toCart
              ? "It's marked as out of stock and goes on your list."
              : "It's marked as in stock."}
          </span>
        </span>
      </label>

      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <DialogFooter>
        <Button type="submit" size="lg" className="h-12 text-base" disabled={!typed || pending}>
          {pending ? "Adding…" : toCart ? "Add to pantry and cart" : "Add to pantry"}
        </Button>
        <Button type="button" variant="outline" size="lg" className="h-11" onClick={onCancel}>
          Cancel
        </Button>
      </DialogFooter>
    </form>
  );
}
