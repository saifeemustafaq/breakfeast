import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, MoonIcon, SunIcon } from "lucide-react";
import { InsightList, NutritionPanel } from "@/components/nutrition";
import { PageSkeleton } from "@/components/page-skeleton";
import { PrepDetails } from "@/components/prep-details";
import { RecipeHeader } from "@/components/recipe-header";
import { buttonVariants } from "@/components/ui/button";
import { getAppState, getHistory } from "@/lib/data";
import { INGREDIENTS, RECIPE_BY_ID, RECIPES, prepKinds, type Recipe } from "@/lib/recipes";
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

async function RecipeDetail({ params }: { params: PageProps<"/recipes/[id]">["params"] }) {
  const { id } = await params;
  const recipe = /^\d+$/.test(id) ? RECIPE_BY_ID[Number(id)] : undefined;
  if (!recipe) notFound();
  const [state, history] = await Promise.all([getAppState(), getHistory()]);
  const made = history.filter((h) => h.recipeId === recipe.id);

  return (
    <article className="flex flex-col gap-7">
      <Link
        href="/recipes"
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2 self-start text-muted-foreground")}
      >
        <ArrowLeftIcon />
        All recipes
      </Link>
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

      <YourRatings recipeId={recipe.id} state={state} made={made} />

      <Section title="What it does for you">
        <InsightList recipe={recipe} />
      </Section>

      <Section title="Nutrition per serving">
        <NutritionPanel recipe={recipe} />
      </Section>

      {prepKinds(recipe).some((k) => k !== "none") && (
        <Section title="Advance prep">
          <PrepDetails recipe={recipe} stock={state.stock} loadedAt={state.loadedAt} />
        </Section>
      )}

      <Section title="Ingredients">
        <Ingredients recipe={recipe} />
      </Section>

      <Section title={recipe.prep === "overnight" ? "In the morning" : "Steps"}>
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
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
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
