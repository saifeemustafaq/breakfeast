"use client";

import { useState, useTransition } from "react";
import { PlusIcon, ShoppingCartIcon, Trash2Icon } from "lucide-react";
import { addToCart, removeIngredient, setStock as saveStock } from "@/app/actions";
import { toast } from "@/components/activity/toast";
import { AddIngredientDialog } from "@/components/add-ingredient";
import { SearchField } from "@/components/search-field";
import { failureMessage, unwrap } from "@/lib/action-result";
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
import { Progress } from "@/components/ui/progress";
import { ingredientsWith, isCustomId } from "@/lib/ingredients";
import { ALL_INGREDIENTS, AISLE_ORDER } from "@/lib/recipes";
import { matchesQuery } from "@/lib/search";
import { rememberedInStock } from "@/lib/stock";
import type { AddedIngredient, AppState } from "@/lib/types";

export function PantryView({ initial }: { initial: AppState }) {
  const [stock, setStock] = useState(initial.stock);
  const [inCart, setInCart] = useState(() => new Set(initial.cart.map((i) => i.ingredientId)));
  const [custom, setCustom] = useState(initial.custom);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const now = initial.loadedAt;
  const ings = ingredientsWith(custom);
  const all = [...ALL_INGREDIENTS, ...custom.map((c) => ings[c.id])];
  const have = (id: string) => rememberedInStock(id, stock, now);
  const total = all.length;
  const stocked = all.filter((i) => have(i.id)).length;
  const found = all.filter((i) => matchesQuery(query, i.name, i.aisle));

  function toggle(id: string, value: boolean) {
    const previous = stock;
    const previousCart = inCart;
    setStock((s) => ({ ...s, [id]: { inStock: value, updatedAt: new Date().toISOString() } }));
    if (value) setInCart((c) => new Set([...c].filter((x) => x !== id)));
    startTransition(async () => {
      try {
        await unwrap(saveStock(id, value));
      } catch (err) {
        setStock(previous);
        setInCart(previousCart);
        toast.error(failureMessage(err));
      }
    });
  }

  function cart(id: string) {
    const name = ings[id].name;
    setInCart((c) => new Set([...c, id]));
    startTransition(async () => {
      try {
        await unwrap(addToCart(id));
        toast.success(`Added ${name.toLowerCase()} to the list`);
      } catch (err) {
        setInCart((c) => new Set([...c].filter((x) => x !== id)));
        toast.error(failureMessage(err));
      }
    });
  }

  function added(item: AddedIngredient, toCart: boolean) {
    if (item.isNew) setCustom((c) => [...c, { id: item.id, name: item.name, aisle: item.aisle }]);
    setStock((s) => ({ ...s, [item.id]: { inStock: !toCart, updatedAt: new Date().toISOString() } }));
    setInCart((c) => {
      const next = new Set(c);
      if (toCart) next.add(item.id);
      else next.delete(item.id);
      return next;
    });
    setAdding(null);
    setQuery("");
    const where = toCart ? "your pantry and the cart" : "your pantry";
    toast.success(item.isNew ? `Added ${item.name} to ${where}` : `${item.name} is on ${where}`);
  }

  function remove(id: string) {
    const previous = custom;
    const name = ings[id].name;
    setDeleting(null);
    setCustom((c) => c.filter((x) => x.id !== id));
    startTransition(async () => {
      try {
        await unwrap(removeIngredient(id));
        toast.success(`Deleted ${name}`);
      } catch (err) {
        setCustom(previous);
        toast.error(failureMessage(err));
      }
    });
  }

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-3xl font-semibold">Pantry</h1>
        <p className="mt-1 text-muted-foreground">
          What the app remembers you have. Kitchen checks keep this up to date.
        </p>
      </div>
      <Progress value={(stocked / total) * 100}>
        <span className="text-sm font-medium">
          {stocked} of {total} ingredients in stock
        </span>
      </Progress>

      <Button variant="outline" className="h-11" onClick={() => setAdding("")}>
        <PlusIcon />
        Add an ingredient
      </Button>

      <SearchField
        value={query}
        onChange={setQuery}
        label="Search ingredients"
        placeholder="Search ingredients"
      />

      {found.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <p className="text-sm text-muted-foreground">{`No ingredients match "${query.trim()}".`}</p>
          <Button variant="outline" className="h-11" onClick={() => setAdding(query.trim())}>
            <PlusIcon />
            {`Add "${query.trim()}" to the pantry`}
          </Button>
        </div>
      )}

      {AISLE_ORDER.map((aisle) => {
        const group = found.filter((i) => i.aisle === aisle);
        if (!group.length) return null;
        return (
          <div key={aisle} className="flex flex-col gap-2">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {aisle}
            </p>
            <ul className="flex flex-col divide-y rounded-xl border bg-card">
              {group.map((ing) => {
                const isIn = have(ing.id);
                const batch = ing.batch;
                const expired = !!batch && !!stock[ing.id]?.inStock && !isIn;
                const mine = isCustomId(ing.id);
                return (
                  <li key={ing.id} className="flex items-center gap-3 p-3">
                    <Checkbox
                      className="size-5"
                      checked={isIn}
                      aria-label={`${ing.name} in stock`}
                      onCheckedChange={(v) => toggle(ing.id, !!v)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="leading-tight">{ing.name}</p>
                      {mine && <p className="text-xs text-muted-foreground">Added by you</p>}
                      {expired && batch && (
                        <p className="text-xs text-warning">
                          Older than {batch.keepsDays} days. Cook a fresh batch
                        </p>
                      )}
                    </div>
                    {!isIn &&
                      (inCart.has(ing.id) ? (
                        <ShoppingCartIcon
                          className="size-4 text-muted-foreground"
                          aria-label="In cart"
                        />
                      ) : (
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => cart(ing.id)}
                        >
                          <PlusIcon />
                          {ing.batch ? "To cook" : "Cart"}
                        </Button>
                      ))}
                    {mine && (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="-mr-1 text-muted-foreground"
                        aria-label={`Delete ${ing.name}`}
                        onClick={() => setDeleting(ing.id)}
                      >
                        <Trash2Icon />
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      <AddIngredientDialog
        name={adding}
        onClose={() => setAdding(null)}
        defaultToCart={false}
        known={all}
        onAdded={added}
      />

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          {deleting !== null && ings[deleting] && (
            <>
              <DialogHeader>
                <DialogTitle>Delete {ings[deleting].name}?</DialogTitle>
                <DialogDescription>
                  It comes off your pantry list{inCart.has(deleting) ? " and your shopping cart" : ""}.
                  You can add it again any time.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="destructive" size="lg" className="h-12 text-base" onClick={() => remove(deleting)}>
                  Delete
                </Button>
                <Button variant="outline" size="lg" className="h-11" onClick={() => setDeleting(null)}>
                  Keep it
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
