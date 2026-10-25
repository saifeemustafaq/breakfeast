import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BanIcon, MoonIcon, SunIcon } from "lucide-react";
import { BackButton } from "@/components/navigation";
import { InsightList, NutritionPanel } from "@/components/nutrition";
import { PageSkeleton } from "@/components/page-skeleton";
import { PrepDetails } from "@/components/prep-details";
import { RecipeHeader } from "@/components/recipe-header";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { buttonVariants } from "@/components/ui/button";
import { getAppState, getHistory } from "@/lib/data";
import { INGREDIENTS, RECIPE_BY_ID, RECIPES, dislikedIn, prepKinds, type Recipe } from "@/lib/recipes";
import type { AppState, HistoryEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

export function generateStaticParams() {
  return RECIPES.map((r) => ({ id: String(r.id) }));
}

export default function RecipePage({ params }: PageProps<"/recipes/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <RecipeDetail params={params} />
    </Suspense>
  );
}

/** The recipe itself is a static catalog, so only your ratings and pantry wait on the database. */
async function RecipeDetail({ params }: { params: PageProps<"/recipes/[id]">["params"] }) {
  const { id } = await params;
  const recipe = /^\d+$/.test(id) ? RECIPE_BY_ID[Number(id)] : undefined;
  if (!recipe) notFound();
  const prepped = prepKinds(recipe).some((k) => k !== "none");

  return (
    <article className="flex flex-col gap-6">
      <BackButton fallback="/recipes" />
      <RecipeHeader recipe={recipe} eyebrow={`Breakfast #${recipe.id}`} />
      {recipe.tip && <p className="-mt-3 text-sm text-muted-foreground">{recipe.tip}</p>}

      <div className="grid grid-cols-2 gap-2">
        <Link href={`/?recipe=${recipe.id}&mode=now`} className={cn(buttonVariants(), "h-12 text-base")}>
          <SunIcon />
          Make it now
        </Link>
        <Link
          href={`/?recipe=${recipe.id}&mode=tonight`}
          className={cn(buttonVariants({ variant: "outline" }), "h-12 text-base")}
        >
          <MoonIcon />
          {recipe.prep === "overnight" ? "Prep it tonight" : "Plan for tomorrow"}
        </Link>
      </div>

      <Suspense fallback={<Placeholder className="h-24" />}>
        <Personal recipe={recipe} />
      </Suspense>

      <Accordion defaultValue={["ingredients", "steps"]}>
        {prepped && (
          <AccordionItem value="prep">
            <AccordionTrigger className="text-base">Advance prep</AccordionTrigger>
            <AccordionContent>
              <Suspense fallback={<PrepDetails recipe={recipe} />}>
                <Prep recipe={recipe} />
              </Suspense>
            </AccordionContent>
          </AccordionItem>
        )}

        <AccordionItem value="ingredients">
          <AccordionTrigger className="text-base">Ingredients</AccordionTrigger>
          <AccordionContent>
            <Ingredients recipe={recipe} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="steps">
          <AccordionTrigger className="text-base">
            {recipe.prep === "overnight" ? "In the morning" : "Steps"}
          </AccordionTrigger>
          <AccordionContent>
            <ol className="flex flex-col gap-2.5">
              {recipe.steps.map((s, i) => (
                <li key={i} className="flex gap-3 text-sm leading-relaxed">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                    {i + 1}
                  </span>
                  {s}
                </li>
              ))}
            </ol>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="insights">
          <AccordionTrigger className="text-base">What it does for you</AccordionTrigger>
          <AccordionContent>
            <InsightList recipe={recipe} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="nutrition">
          <AccordionTrigger className="text-base">Nutrition per serving</AccordionTrigger>
          <AccordionContent>
            <NutritionPanel recipe={recipe} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </article>
  );
}

async function Prep({ recipe }: { recipe: Recipe }) {
  const state = await getAppState();
  return <PrepDetails recipe={recipe} stock={state.stock} loadedAt={state.loadedAt} />;
}

/** Your own history with this breakfast, plus a note if it's on your dislike list. */
async function Personal({ recipe }: { recipe: Recipe }) {
  const [state, history] = await Promise.all([getAppState(), getHistory()]);
  const offList = dislikedIn(recipe, state.disliked);
  return (
    <div className="flex flex-col gap-3">
      {offList.length > 0 && (
        <p className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
          <BanIcon className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>
            Hidden from suggestions: it uses{" "}
            {offList.map((i) => INGREDIENTS[i].name.toLowerCase()).join(", ")}.{" "}
            <Link href="/dislikes" className="font-medium underline underline-offset-2">
              Change your dislikes
            </Link>
          </span>
        </p>
      )}
      <YourRatings
        recipeId={recipe.id}
        state={state}
        made={history.filter((h) => h.recipeId === recipe.id)}
      />
    </div>
  );
}

function Placeholder({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-muted", className)} />;
}

function Ingredients({ recipe }: { recipe: Recipe }) {
  const overnight = recipe.prep === "overnight";
  return (
    <ul className="flex flex-col divide-y rounded-xl border bg-card text-sm">
      {recipe.ingredients.map((ri) => (
        <li key={ri.id} className="flex items-baseline justify-between gap-3 p-3">
          <span>
            {INGREDIENTS[ri.id].name}
            {overnight && (
              <span className="ml-2 text-xs text-muted-foreground">
                {(ri.when ?? "morning") === "night" ? "night before" : "morning"}
              </span>
            )}
          </span>
          <span className="text-right font-medium tabular-nums">{ri.qty}</span>
        </li>
      ))}
    </ul>
  );
}

const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

function YourRatings({
  recipeId,
  state,
  made,
}: {
  recipeId: number;
  state: AppState;
  made: HistoryEntry[];
}) {
  const stats = state.stats[recipeId];
  if (!stats?.made) {
    return (
      <p className="rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">
        Not tried yet. Rate it after the first time to start seeing your patterns.
      </p>
    );
  }
  const rows = [
    { label: "Taste", value: stats.taste },
    { label: "Felt afterward", value: stats.feel },
    { label: "Want again", value: stats.again },
  ];
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <p className="text-sm">
        Made {stats.made} {stats.made === 1 ? "time" : "times"}
        {made[0] && <span className="text-muted-foreground">, last on {DATE.format(new Date(made[0].madeAt))}</span>}
      </p>
      {stats.rated > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {rows.map((r) => (
            <div key={r.label} className="flex flex-col items-center rounded-lg bg-muted/60 py-2">
              <span className="text-lg font-semibold tabular-nums">{r.value?.toFixed(1) ?? "-"}</span>
              <span className="text-xs text-muted-foreground">{r.label}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No ratings yet.</p>
      )}
      {stats.lastNote && (
        <p className="text-sm italic text-muted-foreground">&ldquo;{stats.lastNote}&rdquo;</p>
      )}
    </div>
  );
}
