"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  CircleMinusIcon,
  CookingPotIcon,
  CopyIcon,
  PlusIcon,
  ShoppingBasketIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { addToCart, completeCartItem, removeFromCart, removeManyFromCart } from "@/app/actions";
import { track } from "@/components/activity/logger";
import { toast } from "@/components/activity/toast";
import { AddIngredientDialog } from "@/components/add-ingredient";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { failureMessage, unwrap, type ActionResult } from "@/lib/action-result";
import { cartUnlocks, idsToRemoveFor, type CartUnlocks } from "@/lib/cart";
import { ingredientsWith } from "@/lib/ingredients";
import { ALL_INGREDIENTS, AISLE_ORDER, INGREDIENTS, RECIPE_BY_ID, visibleRecipes } from "@/lib/recipes";
import { rememberedInStock } from "@/lib/stock";
import type { AddedIngredient, AppState, CartItem } from "@/lib/types";
import { cn } from "@/lib/utils";

export function CartView({ initial }: { initial: AppState }) {
  const [items, setItems] = useState(initial.cart);
  const [bought, setBought] = useState<string[]>([]);
  const [dropping, setDropping] = useState<number | null>(null);
  const [custom, setCustom] = useState(initial.custom);
  const [adding, setAdding] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const ings = ingredientsWith(custom);
  const known = [...ALL_INGREDIENTS, ...custom.map((c) => ings[c.id])];
  const inStock = (id: string) =>
    bought.includes(id) || rememberedInStock(id, initial.stock, initial.loadedAt);
  const buy = items.filter((i) => i.kind === "buy");
  const cook = items.filter((i) => i.kind === "cook");
  const unlocks = cartUnlocks(items, inStock, visibleRecipes(initial.disliked));

  function run(
    optimistic: CartItem[],
    action: () => Promise<ActionResult>,
    success?: string,
    also?: { apply: () => void; restore: () => void },
  ) {
    const previous = items;
    setItems(optimistic);
    also?.apply();
    startTransition(async () => {
      try {
        await unwrap(action());
        if (success) toast.success(success);
      } catch (err) {
        setItems(previous);
        also?.restore();
        toast.error(failureMessage(err));
      }
    });
  }

  function complete(id: string) {
    const previousBought = bought;
    run(
      items.filter((i) => i.ingredientId !== id),
      () => completeCartItem(id),
      `${ings[id].name} is now in stock`,
      {
        apply: () => setBought((b) => [...b, id]),
        restore: () => setBought(previousBought),
      },
    );
  }

  function remove(id: string) {
    run(
      items.filter((i) => i.ingredientId !== id),
      () => removeFromCart(id),
    );
  }

  function dropBreakfast(id: number) {
    const ids = idsToRemoveFor(id, unlocks, items).remove;
    setDropping(null);
    if (!ids.length) return;
    run(
      items.filter((i) => !ids.includes(i.ingredientId)),
      () => removeManyFromCart(ids),
      `Removed what ${RECIPE_BY_ID[id].name} needed`,
    );
  }

  function addBase(id: string, forRecipes: number[]) {
    if (items.some((i) => i.ingredientId === id)) return;
    run(
      [...items, { ingredientId: id, kind: "buy", forRecipes, addedAt: new Date().toISOString() }],
      () => addToCart(id, forRecipes),
      `Added ${INGREDIENTS[id].name} to the list`,
    );
  }

  function added(item: AddedIngredient, toCart: boolean) {
    if (item.isNew) setCustom((c) => [...c, { id: item.id, name: item.name, aisle: item.aisle }]);
    if (toCart && !items.some((i) => i.ingredientId === item.id)) {
      setItems((list) => [
        ...list,
        {
          ingredientId: item.id,
          kind: INGREDIENTS[item.id]?.batch ? "cook" : "buy",
          forRecipes: [],
          addedAt: new Date().toISOString(),
        },
      ]);
    }
    setAdding(null);
    toast.success(
      toCart ? `Added ${item.name} to the cart and your pantry` : `Added ${item.name} to your pantry`,
    );
  }

  const addDialog = (
    <AddIngredientDialog
      name={adding}
      onClose={() => setAdding(null)}
      defaultToCart
      known={known}
      onAdded={added}
    />
  );

  async function copyList() {
    const lines = AISLE_ORDER.flatMap((aisle) => {
      const group = buy.filter((i) => ings[i.ingredientId].aisle === aisle);
      if (!group.length) return [];
      return [`${aisle}:`, ...group.map((i) => `- ${ings[i.ingredientId].name}`), ""];
    });
    try {
      await navigator.clipboard.writeText(lines.join("\n").trim());
      track("workflow", "list.copied", { items: buy.length });
      toast.success("Shopping list copied");
    } catch {
      toast.error("Couldn't copy on this device");
    }
  }

  if (items.length === 0) {
    return (
      <section className="flex flex-col items-center gap-4 pt-10 text-center">
        <ShoppingBasketIcon className="size-10 text-muted-foreground" />
        <h1 className="font-heading text-2xl font-semibold">Your cart is empty</h1>
        <p className="text-muted-foreground">
          Anything you&apos;re out of during a kitchen check lands here.
        </p>
        <Button className="h-11" onClick={() => setAdding("")}>
          <PlusIcon />
          Add an item
        </Button>
        <Link href="/plan" className={cn(buttonVariants({ variant: "outline" }), "h-11")}>
          Plan 3–4 breakfasts ahead
        </Link>
        {addDialog}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-semibold">Shopping cart</h1>
          <p className="mt-1 text-muted-foreground">
            Tick items as they go in the basket; they&apos;ll be marked in stock.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="icon-lg" aria-label="Add an item" onClick={() => setAdding("")}>
            <PlusIcon />
          </Button>
          {buy.length > 0 && (
            <Button variant="outline" size="icon-lg" aria-label="Copy list" onClick={copyList}>
              <CopyIcon />
            </Button>
          )}
        </div>
      </div>

      <AfterShopping unlocks={unlocks} onDrop={setDropping} />

      {AISLE_ORDER.filter((a) => a !== "Cooked ahead").map((aisle) => {
        const group = buy.filter((i) => ings[i.ingredientId].aisle === aisle);
        if (!group.length) return null;
        return (
          <div key={aisle} className="flex flex-col gap-2">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {aisle}
            </p>
            <ul className="flex flex-col divide-y rounded-xl border bg-card">
              {group.map((item) => {
                const ing = ings[item.ingredientId];
                return (
                  <li key={item.ingredientId} className="flex items-center gap-3 p-3">
                    <Checkbox
                      className="size-5"
                      aria-label={`Bought ${ing.name}`}
                      onCheckedChange={() => complete(item.ingredientId)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium leading-tight">{ing.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[
                          ing.note,
                          item.forRecipes.length
                            ? `For ${item.forRecipes.map((r) => RECIPE_BY_ID[r].name).join(", ")}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Remove ${ing.name}`}
                      onClick={() => remove(item.ingredientId)}
                    >
                      <XIcon />
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      {cook.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Batch cook
          </p>
          {cook.map((item) => {
            const ing = INGREDIENTS[item.ingredientId];
            const batch = ing.batch!;
            const base = INGREDIENTS[batch.from];
            const baseKnownOut =
              !inStock(base.id) &&
              !items.some((i) => i.ingredientId === base.id);
            return (
              <Card key={item.ingredientId} size="sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CookingPotIcon className="size-4 text-warning" />
                    {ing.name}
                  </CardTitle>
                  <CardDescription>
                    ~{batch.minutes} min · keeps {batch.keepsDays} days in the fridge
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <p className="text-sm">{batch.howTo}</p>
                  {baseKnownOut && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="self-start"
                      onClick={() => addBase(base.id, item.forRecipes)}
                    >
                      <PlusIcon />
                      Need {base.name.toLowerCase()}? Add to list
                    </Button>
                  )}
                  <div className="flex gap-2">
                    <Button className="h-10 flex-1" onClick={() => complete(item.ingredientId)}>
                      Cooked, it&apos;s in the fridge
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-lg"
                      aria-label={`Remove ${ing.name}`}
                      onClick={() => remove(item.ingredientId)}
                    >
                      <XIcon />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dropping !== null} onOpenChange={(open) => !open && setDropping(null)}>
        <DialogContent>
          {dropping !== null && (
            <DropBreakfast
              recipeId={dropping}
              removal={idsToRemoveFor(dropping, unlocks, items)}
              onConfirm={() => dropBreakfast(dropping)}
              onCancel={() => setDropping(null)}
            />
          )}
        </DialogContent>
      </Dialog>
      {addDialog}
    </section>
  );
}

function DropBreakfast({
  recipeId,
  removal,
  onConfirm,
  onCancel,
}: {
  recipeId: number;
  removal: { remove: string[]; kept: string[] };
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const names = (ids: string[]) => ids.map((id) => INGREDIENTS[id].name.toLowerCase()).join(", ");
  return (
    <>
      <DialogHeader>
        <DialogTitle>Remove {RECIPE_BY_ID[recipeId].name} from the cart?</DialogTitle>
        <DialogDescription>
          {removal.remove.length
            ? `This takes ${names(removal.remove)} off the list.`
            : "Everything it needs is also needed by another breakfast in the cart, so nothing will be removed."}
          {removal.kept.length
            ? ` Keeping ${names(removal.kept)} for the other breakfasts in the cart.`
            : ""}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="destructive" disabled={!removal.remove.length} onClick={onConfirm}>
          Remove {removal.remove.length} {removal.remove.length === 1 ? "item" : "items"}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Keep it
        </Button>
      </DialogFooter>
    </>
  );
}

function AfterShopping({
  unlocks,
  onDrop,
}: {
  unlocks: CartUnlocks;
  onDrop: (recipeId: number) => void;
}) {
  const { afterShop, readyNow } = unlocks;

  return (
    <Card size="sm" className="bg-success/5 ring-success/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SparklesIcon className="size-4 text-success" />
          {afterShop.length
            ? `After this shop you can make ${afterShop.length} ${afterShop.length === 1 ? "breakfast" : "breakfasts"}`
            : "Nothing new unlocks yet"}
        </CardTitle>
        <CardDescription>
          {afterShop.length
            ? "Counting what's in the cart plus what you've said you have."
            : "Every remaining breakfast still needs something that isn't in the cart or the pantry. Run a kitchen check from Plan to fill the gaps."}
        </CardDescription>
      </CardHeader>
      {(afterShop.length > 0 || readyNow.length > 0) && (
        <CardContent className="flex flex-col gap-3">
          {afterShop.length > 0 && (
            <ul className="flex flex-col gap-2">
              {afterShop.map(({ id, shop, cook }) => (
                <li key={id} className="flex items-start gap-2 text-sm">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="-ml-1 shrink-0 text-muted-foreground"
                    aria-label={`Remove ${RECIPE_BY_ID[id].name} from the cart`}
                    onClick={() => onDrop(id)}
                  >
                    <CircleMinusIcon />
                  </Button>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium leading-tight">{RECIPE_BY_ID[id].name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[
                        shop.length
                          ? `Needs ${shop.map((i) => INGREDIENTS[i].name.toLowerCase()).join(", ")}`
                          : null,
                        cook.length
                          ? `then batch-cook ${cook.map((i) => INGREDIENTS[i].name.toLowerCase().replace(/^cooked /, "")).join(", ")}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {readyNow.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Already makeable now: {readyNow.map((id) => RECIPE_BY_ID[id].name).join(", ")}
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}
