import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BanIcon, MoonIcon, Share2Icon, SunIcon } from "lucide-react";
import { BackButton } from "@/components/navigation";
import { PageSkeleton } from "@/components/page-skeleton";
import { RecipeBody } from "@/components/recipe-body";
import { RecipeHeader } from "@/components/recipe-header";
import { RecipeNoteCard } from "@/components/recipe-note";
import { buttonVariants } from "@/components/ui/button";
import { getAppState, getHistory } from "@/lib/data";
import { INGREDIENTS, RECIPE_BY_ID, RECIPES, dislikedIn, type Recipe } from "@/lib/recipes";
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
        <Link
          href={`/export?preset=recipes&recipes=${recipe.id}`}
          className={cn(buttonVariants({ variant: "ghost" }), "col-span-2 h-11 text-muted-foreground")}
        >
          <Share2Icon />
          Share or print this recipe
        </Link>
      </div>

      <Suspense fallback={<Placeholder className="h-24" />}>
        <Personal recipe={recipe} />
      </Suspense>

      <Suspense fallback={<RecipeBody recipe={recipe} />}>
        <Versioned recipe={recipe} />
      </Suspense>
    </article>
  );
}

/** Your versions, last pick and pantry, so the body can show the version you'd make. */
async function Versioned({ recipe }: { recipe: Recipe }) {
  const { versions, choices, disliked, custom, stock, loadedAt } = await getAppState();
  return <RecipeBody recipe={recipe} state={{ versions, choices, disliked, custom, stock, loadedAt }} />;
}

/** Your own history with this breakfast, the household's note, and a warning if it's on your dislike list. */
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
      <RecipeNoteCard recipeId={recipe.id} note={state.notes[recipe.id]} />
    </div>
  );
}

function Placeholder({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-muted", className)} />;
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
      {stats.lastNote && !state.notes[recipeId] && (
        <p className="text-sm text-muted-foreground">
          From your last rating: <span className="italic">&ldquo;{stats.lastNote}&rdquo;</span>
        </p>
      )}
    </div>
  );
}
