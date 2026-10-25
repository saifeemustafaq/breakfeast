"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  MoonIcon,
  RefreshCwIcon,
  ShoppingCartIcon,
  XIcon,
} from "lucide-react";
import { recordPlanCheck } from "@/app/actions";
import { toast } from "@/components/activity/toast";
import { failureMessage, unwrap } from "@/lib/action-result";
import { KitchenChecklist } from "@/components/kitchen-checklist";
import { BackButton, scrollAppToTop } from "@/components/navigation";
import { NutritionLine } from "@/components/nutrition";
import { RecipeBadges } from "@/components/recipe-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  INGREDIENTS,
  RECIPE_BY_ID,
  checkableIds,
  cookedAheadItems,
  rankRecipes,
} from "@/lib/recipes";
import { rememberedInStock } from "@/lib/stock";
import type { AppState, CheckStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

type Step =
  | { name: "count" }
  | { name: "pick" }
  | { name: "check" }
  | { name: "summary"; status: Record<string, CheckStatus> };

export function PlanFlow({ initial }: { initial: AppState }) {
  const ranked = useMemo(
    () => rankRecipes(initial.lastMade, initial.stats, initial.disliked),
    [initial.lastMade, initial.stats, initial.disliked],
  );
  const [step, setScreen] = useState<Step>({ name: "count" });
  const [picked, setPicked] = useState<number[]>([]);
  const [rejected, setRejected] = useState<number[]>([]);
  const [pending, startTransition] = useTransition();

  function setStep(next: Step) {
    setScreen(next);
    scrollAppToTop();
  }

  function choose(n: number) {
    setPicked(ranked.slice(0, n));
    setRejected([]);
    setStep({ name: "pick" });
  }

  function swap(id: number) {
    const nextRejected = [...rejected, id];
    let replacement = ranked.find((r) => !picked.includes(r) && !nextRejected.includes(r));
    if (replacement === undefined) {
      replacement = ranked.find((r) => !picked.includes(r) && r !== id);
      setRejected([id]);
    } else {
      setRejected(nextRejected);
    }
    if (replacement === undefined) return;
    setPicked((p) => p.map((x) => (x === id ? replacement : x)));
  }

  const ingredientIds = [...new Set(picked.flatMap((id) => checkableIds(RECIPE_BY_ID[id])))];
  const usedBy = (ingId: string) =>
    picked.filter((id) => checkableIds(RECIPE_BY_ID[id]).includes(ingId));

  switch (step.name) {
    case "count":
      return (
        <section className="flex flex-col gap-6">
          <div>
            <h1 className="font-heading text-3xl font-semibold">Plan ahead</h1>
            <p className="mt-1 text-muted-foreground">
              Pick a few breakfasts, check the kitchen once, and get one shopping list for all of
              them.
            </p>
          </div>
          <p className="font-medium">How many breakfasts?</p>
          <div className="grid grid-cols-3 gap-3">
            {[3, 4, 5].map((n) => (
              <Button
                key={n}
                variant={n === 3 ? "default" : "outline"}
                className="h-20 flex-col text-2xl font-semibold"
                onClick={() => choose(n)}
              >
                {n}
                <span className="text-xs font-normal opacity-75">breakfasts</span>
              </Button>
            ))}
          </div>
        </section>
      );

    case "pick":
      return (
        <section className="flex flex-col gap-5">
          <BackButton onClick={() => setStep({ name: "count" })} />
          <div>
            <h1 className="font-heading text-2xl font-semibold">Your next {picked.length}</h1>
            <p className="mt-1 text-muted-foreground">
              Chosen from the ones you&apos;ve made least recently. Swap any you don&apos;t want.
            </p>
          </div>
          <ul className="flex flex-col gap-2">
            {picked.map((id, i) => {
              const r = RECIPE_BY_ID[id];
              return (
                <li key={id} className="flex items-start gap-3 rounded-xl border bg-card p-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                    {i + 1}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="font-medium leading-tight">{r.name}</span>
                    <NutritionLine recipe={r} />
                    <RecipeBadges recipe={r} stock={initial.stock} loadedAt={initial.loadedAt} />
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Swap ${r.name}`}
                      onClick={() => swap(id)}
                    >
                      <RefreshCwIcon />
                    </Button>
                    {picked.length > 1 && (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Remove ${r.name}`}
                        onClick={() => setPicked((p) => p.filter((x) => x !== id))}
                      >
                        <XIcon />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="text-sm text-muted-foreground">
            {ingredientIds.length} different ingredients to check.
          </p>
          <Button size="lg" className="h-12 text-base" onClick={() => setStep({ name: "check" })}>
            Go to the kitchen and check
            <ArrowRightIcon />
          </Button>
        </section>
      );

    case "check": {
      const remembered = new Set(
        ingredientIds.filter((id) => rememberedInStock(id, initial.stock, initial.loadedAt)),
      );
      return (
        <section className="flex flex-col gap-5">
          <BackButton onClick={() => setStep({ name: "pick" })} />
          <div>
            <p className="text-xs font-semibold tracking-wide text-primary uppercase">
              Kitchen check
            </p>
            <h1 className="font-heading text-2xl font-semibold">
              Everything for {picked.length} breakfasts
            </h1>
          </div>
          <KitchenChecklist
            items={ingredientIds.map((id) => ({
              id,
              detail: `For ${usedBy(id)
                .map((r) => `#${r}`)
                .join(", ")}`,
            }))}
            initial={Object.fromEntries(
              ingredientIds.map((id) => [id, remembered.has(id) ? "have" : undefined]),
            )}
            remembered={remembered}
            knownInStock={(id) => rememberedInStock(id, initial.stock, initial.loadedAt)}
            submitLabel="Build my shopping list"
            pending={pending}
            onSubmit={(status) =>
              startTransition(async () => {
                const have = Object.keys(status).filter((id) => status[id] === "have");
                const missing = Object.keys(status).filter((id) => status[id] === "missing");
                try {
                  await unwrap(recordPlanCheck({ have, missing, recipeIds: picked }));
                  setStep({ name: "summary", status });
                } catch (err) {
                  toast.error(failureMessage(err, "Couldn't save your kitchen check. Check your connection."));
                }
              })
            }
          />
        </section>
      );
    }

    case "summary": {
      const missingFor = (id: number) =>
        checkableIds(RECIPE_BY_ID[id]).filter((i) => step.status[i] === "missing");
      const ready = picked.filter((id) => missingFor(id).length === 0);
      const blocked = picked.filter((id) => missingFor(id).length > 0);
      const toBuy = Object.keys(step.status).filter(
        (id) => step.status[id] === "missing" && !INGREDIENTS[id].batch,
      );
      const toCook = Object.keys(step.status).filter(
        (id) => step.status[id] === "missing" && INGREDIENTS[id].batch,
      );
      const overnight = picked.filter((id) => RECIPE_BY_ID[id].prep === "overnight");
      const cookedAhead = Object.values(
        picked.reduce<Record<string, ReturnType<typeof cookedAheadItems>[number] & { recipes: number[] }>>(
          (acc, id) => {
            for (const item of cookedAheadItems(RECIPE_BY_ID[id])) {
              acc[item.id] ??= { ...item, recipes: [] };
              acc[item.id].recipes.push(id);
            }
            return acc;
          },
          {},
        ),
      );
      return (
        <section className="flex flex-col gap-5">
          <h1 className="font-heading text-2xl font-semibold">
            {blocked.length === 0 ? "You're stocked!" : "Here's the plan"}
          </h1>

          {ready.length > 0 && (
            <Card size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2Icon className="size-4 text-success" />
                  Ready to make ({ready.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-inside list-disc text-sm">
                  {ready.map((id) => (
                    <li key={id}>{RECIPE_BY_ID[id].name}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {blocked.length > 0 && (
            <Card size="sm">
              <CardHeader>
                <CardTitle>Needs shopping or cooking ({blocked.length})</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                {blocked.map((id) => (
                  <div key={id}>
                    <p className="font-medium">{RECIPE_BY_ID[id].name}</p>
                    <p className="text-muted-foreground">
                      {missingFor(id)
                        .map((i) => INGREDIENTS[i].name)
                        .join(", ")}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {(overnight.length > 0 || cookedAhead.length > 0) && (
            <Card size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MoonIcon className="size-4 text-info" />
                  Prep to remember
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1.5 text-sm">
                {overnight.map((id) => (
                  <p key={id}>
                    <span className="font-medium">{RECIPE_BY_ID[id].name}</span>
                    <span className="text-muted-foreground">: mix it the night before.</span>
                  </p>
                ))}
                {cookedAhead.map((item) => (
                  <p key={item.id}>
                    <span className="font-medium">{item.name}</span>
                    <span className="text-muted-foreground">
                      : cook one batch (about {item.batch.minutes} min, keeps {item.batch.keepsDays}{" "}
                      days) for {item.recipes.map((id) => `#${id}`).join(", ")}.
                    </span>
                  </p>
                ))}
              </CardContent>
            </Card>
          )}

          {(toBuy.length > 0 || toCook.length > 0) && (
            <p className="text-sm text-muted-foreground">
              {toBuy.length} {toBuy.length === 1 ? "item" : "items"} added to your shopping cart
              {toCook.length > 0 &&
                ` and ${toCook.length} batch-cook ${toCook.length === 1 ? "task" : "tasks"}`}
              .
            </p>
          )}

          {toBuy.length + toCook.length > 0 ? (
            <Link href="/cart" className={cn(buttonVariants(), "h-12 text-base")}>
              <ShoppingCartIcon />
              Open shopping cart
            </Link>
          ) : (
            <Link href="/" className={cn(buttonVariants(), "h-12 text-base")}>
              Back to today
            </Link>
          )}
          <Button variant="ghost" className="h-11" onClick={() => setStep({ name: "count" })}>
            Plan another batch
          </Button>
        </section>
      );
    }
  }
}
