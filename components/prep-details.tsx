"use client";

import { CheckCircle2Icon, ChevronRightIcon, CookingPotIcon, MoonIcon, SunIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { INGREDIENTS, cookedAheadItems, prepKinds, recipeItems, type Recipe } from "@/lib/recipes";
import { rememberedInStock } from "@/lib/stock";
import { DAY } from "@/lib/time";
import type { StockEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

export type PrepFocus = "overnight" | "cookedAhead";
export type PrepContext = "now" | "tonight" | "browse";

type StockProps = { stock?: Record<string, StockEntry>; loadedAt?: number };


function batchState(id: string, { stock, loadedAt }: StockProps) {
  const entry = stock?.[id];
  if (!stock || loadedAt === undefined || !entry) return null;
  if (rememberedInStock(id, stock, loadedAt)) {
    const days = Math.floor((loadedAt - Date.parse(entry.updatedAt)) / DAY);
    return { ready: true, text: days < 1 ? "In the fridge, cooked today" : `In the fridge, cooked ${days} ${days === 1 ? "day" : "days"} ago` };
  }
  return { ready: false, text: entry.inStock ? "Past its keep time; cook a fresh batch" : "Not cooked yet" };
}

/** Whether every cooked-ahead item for this recipe is remembered as ready in the fridge. */
export function cookedAheadReady(recipe: Recipe, stock: Record<string, StockEntry>, loadedAt: number) {
  const items = cookedAheadItems(recipe);
  return items.length > 0 && items.every((i) => rememberedInStock(i.id, stock, loadedAt));
}

/**
 * A highlighted banner per kind of advance prep, so it's obvious before
 * committing whether a breakfast can be made right away.
 */
export function PrepStatus({
  recipe,
  context,
  onOpen,
  stock,
  loadedAt,
}: {
  recipe: Recipe;
  context: PrepContext;
  onOpen: (focus: PrepFocus) => void;
} & StockProps) {
  return (
    <div className="flex flex-col gap-2">
      {prepKinds(recipe).map((kind) => {
        if (kind === "none") {
          return (
            <div
              key={kind}
              className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/10 p-3"
            >
              <CheckCircle2Icon className="mt-0.5 size-5 shrink-0 text-success" />
              <div className="flex flex-col">
                <p className="font-semibold text-success">No prep needed</p>
                <p className="text-sm text-success/80">
                  {context === "tonight"
                    ? "Nothing to do tonight. Just confirm the ingredients are here."
                    : `You can make it right now, in about ${recipe.minutes} min.`}
                </p>
              </div>
            </div>
          );
        }
        if (kind === "overnight") {
          return (
            <StatusButton
              key={kind}
              tone="overnight"
              icon={<MoonIcon />}
              title={context === "tonight" ? "Prep tonight" : "Needs prep the night before"}
              detail={
                context === "now"
                  ? "The base soaks overnight, so this only works if you mixed it last night."
                  : context === "tonight"
                    ? "A few minutes of mixing tonight, then finish it in the morning."
                    : `Mix the base the night before; finish in ${recipe.minutes} min in the morning.`
              }
              cta="See the prep"
              onClick={() => onOpen("overnight")}
            />
          );
        }
        const items = cookedAheadItems(recipe);
        const states = items.map((i) => batchState(i.id, { stock, loadedAt }));
        const allReady = states.length > 0 && states.every((s) => s?.ready);
        const minutes = Math.max(...items.map((i) => i.batch.minutes));
        return (
          <StatusButton
            key={kind}
            tone="cooked"
            icon={<CookingPotIcon />}
            title={`Uses cooked-ahead ${items.map((i) => i.name.toLowerCase().replace(/^cooked /, "")).join(" and ")}`}
            detail={
              allReady
                ? "You have it ready in the fridge."
                : `Cook it ahead (about ${minutes} min). It keeps ${items[0].batch.keepsDays} days, so one batch covers a few breakfasts.`
            }
            cta={allReady ? "See details" : "How to cook it"}
            onClick={() => onOpen("cookedAhead")}
          />
        );
      })}
    </div>
  );
}

function StatusButton({
  tone,
  icon,
  title,
  detail,
  cta,
  onClick,
}: {
  tone: "overnight" | "cooked";
  icon: React.ReactNode;
  title: string;
  detail: string;
  cta: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&>svg]:mt-0.5 [&>svg]:size-5 [&>svg]:shrink-0",
        tone === "overnight"
          ? "border-info/30 bg-info/10 hover:bg-info/15 [&>svg]:text-info"
          : "border-warning/40 bg-warning/10 hover:bg-warning/15 [&>svg]:text-warning",
      )}
    >
      {icon}
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={cn(
            "font-semibold",
            tone === "overnight" ? "text-info" : "text-warning",
          )}
        >
          {title}
        </span>
        <span className="text-sm text-foreground/75">{detail}</span>
        <span
          className={cn(
            "mt-1 flex items-center gap-0.5 text-sm font-medium",
            tone === "overnight" ? "text-info" : "text-warning",
          )}
        >
          {cta}
          <ChevronRightIcon className="size-4" />
        </span>
      </span>
    </button>
  );
}

/** What has to happen in advance, and how to do it. */
export function PrepDetails({
  recipe,
  focus,
  stock,
  loadedAt,
}: { recipe: Recipe; focus?: PrepFocus } & StockProps) {
  const kinds = prepKinds(recipe).filter((k) => k !== "none");
  const ordered = focus ? [focus, ...kinds.filter((k) => k !== focus)] : kinds;
  if (!ordered.length) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle2Icon className="size-4 text-success" />
        No advance prep. Everything happens in the morning.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      {ordered.map((kind) =>
        kind === "overnight" ? (
          <OvernightDetails key={kind} recipe={recipe} />
        ) : (
          <CookedAheadDetails key={kind} recipe={recipe} stock={stock} loadedAt={loadedAt} />
        ),
      )}
    </div>
  );
}

function OvernightDetails({ recipe }: { recipe: Recipe }) {
  const night = recipeItems(recipe, "night");
  const morning = recipeItems(recipe, "morning");
  return (
    <section className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 font-semibold">
        <MoonIcon className="size-4 text-info" />
        The night before
      </h3>
      <ul className="flex flex-col divide-y rounded-xl border bg-card text-sm">
        {night.map((ri) => (
          <li key={ri.id} className="flex justify-between gap-3 p-2.5">
            <span>{INGREDIENTS[ri.id].name}</span>
            <span className="text-right font-medium tabular-nums">{ri.qty}</span>
          </li>
        ))}
      </ul>
      <ol className="flex flex-col gap-2 text-sm">
        {(recipe.nightSteps ?? []).map((s, i) => (
          <li key={i} className="flex gap-2">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-info/15 text-xs font-semibold text-info">
              {i + 1}
            </span>
            {s}
          </li>
        ))}
      </ol>
      {morning.length > 0 && (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <SunIcon className="mt-0.5 size-4 shrink-0" />
          In the morning ({recipe.minutes} min): add{" "}
          {morning.map((ri) => INGREDIENTS[ri.id].name.toLowerCase()).join(", ")}.
        </p>
      )}
    </section>
  );
}

function CookedAheadDetails({ recipe, stock, loadedAt }: { recipe: Recipe } & StockProps) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 font-semibold">
        <CookingPotIcon className="size-4 text-warning" />
        Cooked ahead
      </h3>
      {cookedAheadItems(recipe).map((item) => {
        const state = batchState(item.id, { stock, loadedAt });
        return (
          <div key={item.id} className="flex flex-col gap-2 rounded-xl border bg-card p-3 text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-medium">{item.name}</p>
              <p className="text-xs text-muted-foreground">You need {item.qty}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              About {item.batch.minutes} min · keeps {item.batch.keepsDays} days in the fridge · made
              from {INGREDIENTS[item.batch.from].name.toLowerCase()}
            </p>
            <p>{item.batch.howTo}</p>
            {state && (
              <p
                className={cn(
                  "flex items-center gap-1.5 text-xs font-medium",
                  state.ready ? "text-success" : "text-warning",
                )}
              >
                {state.ready ? <CheckCircle2Icon className="size-3.5" /> : <CookingPotIcon className="size-3.5" />}
                {state.text}
              </p>
            )}
          </div>
        );
      })}
    </section>
  );
}

export function PrepDialog({
  recipe,
  open,
  onOpenChange,
  focus,
  stock,
  loadedAt,
  actions,
}: {
  recipe: Recipe;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  focus?: PrepFocus;
  actions?: React.ReactNode;
} & StockProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{focus === "cookedAhead" ? "What to cook ahead" : "What prep it needs"}</DialogTitle>
          <DialogDescription>{recipe.name}</DialogDescription>
        </DialogHeader>
        <PrepDetails recipe={recipe} focus={focus} stock={stock} loadedAt={loadedAt} />
        {actions && <DialogFooter>{actions}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
