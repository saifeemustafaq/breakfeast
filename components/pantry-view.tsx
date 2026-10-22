"use client";

import { useState, useTransition } from "react";
import { PlusIcon, ShoppingCartIcon } from "lucide-react";
import { addToCart, setStock as saveStock } from "@/app/actions";
import { toast } from "@/components/activity/toast";
import { failureMessage, unwrap } from "@/lib/action-result";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { ALL_INGREDIENTS, AISLE_ORDER, INGREDIENTS } from "@/lib/recipes";
import { rememberedInStock } from "@/lib/stock";
import type { AppState } from "@/lib/types";

export function PantryView({ initial }: { initial: AppState }) {
  const [stock, setStock] = useState(initial.stock);
  const [inCart, setInCart] = useState(() => new Set(initial.cart.map((i) => i.ingredientId)));
  const [, startTransition] = useTransition();
  const now = initial.loadedAt;
  const have = (id: string) => rememberedInStock(id, stock, now);
  const total = ALL_INGREDIENTS.length;
  const stocked = ALL_INGREDIENTS.filter((i) => have(i.id)).length;

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
    const name = INGREDIENTS[id].name;
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

      {AISLE_ORDER.map((aisle) => {
        const group = ALL_INGREDIENTS.filter((i) => i.aisle === aisle);
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
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
