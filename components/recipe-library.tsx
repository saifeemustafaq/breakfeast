"use client";

import { useState } from "react";
import Link from "next/link";
import { BanIcon, ChartNoAxesColumnIcon, ChevronRightIcon, HeartIcon, ThumbsDownIcon } from "lucide-react";
import { NutritionLine } from "@/components/nutrition";
import { RecipeBadges } from "@/components/recipe-header";
import { SearchField } from "@/components/search-field";
import { Button } from "@/components/ui/button";
import {
  INGREDIENTS,
  RECIPE_TRAITS,
  RECIPES,
  dislikedIn,
  isDisliked,
  preferenceScore,
  prepKinds,
  visibleRecipes,
  type Recipe,
} from "@/lib/recipes";
import { matchesQuery, recipeSearchText } from "@/lib/search";
import type { AppState } from "@/lib/types";
import { cn } from "@/lib/utils";

type Filter = { id: string; label: string; test: (r: Recipe, s: AppState) => boolean };

const FILTERS: Filter[] = [
  { id: "all", label: "All", test: () => true },
  { id: "none", label: "No prep", test: (r) => prepKinds(r).includes("none") },
  { id: "overnight", label: "Overnight", test: (r) => r.prep === "overnight" },
  { id: "cooked", label: "Cooked-ahead", test: (r) => prepKinds(r).includes("cookedAhead") },
  { id: "sweet", label: "Sweet", test: (r) => RECIPE_TRAITS[r.id].flavor === "Sweet" },
  { id: "savory", label: "Savory", test: (r) => RECIPE_TRAITS[r.id].flavor === "Savory" },
  { id: "untried", label: "Not tried yet", test: (r, s) => !s.stats[r.id]?.made },
  {
    id: "favorites",
    label: "Favorites",
    test: (r, s) => (preferenceScore(s.stats[r.id]) ?? 0) >= 4,
  },
];

export function RecipeLibrary({ state }: { state: AppState }) {
  const [filter, setFilter] = useState("all");
  const [showHidden, setShowHidden] = useState(false);
  const [query, setQuery] = useState("");
  const active = FILTERS.find((f) => f.id === filter) ?? FILTERS[0];
  const visible = visibleRecipes(state.disliked);
  const hiddenCount = RECIPES.length - visible.length;
  const pool = showHidden ? RECIPES : visible;
  const fits = (r: Recipe) => active.test(r, state) && matchesQuery(query, recipeSearchText(r));
  const shown = pool.filter(fits);
  const hiddenMatches = showHidden ? 0 : RECIPES.filter((r) => !visible.includes(r) && fits(r)).length;
  const tried = pool.filter((r) => state.stats[r.id]?.made).length;

  return (
    <section className="flex flex-col gap-5">
      <div>
        <h1 className="font-heading text-3xl font-semibold">Recipes</h1>
        <p className="mt-1 text-muted-foreground">
          {hiddenCount > 0 && !showHidden
            ? `${visible.length} breakfasts you'll eat. You've tried ${tried} so far.`
            : `All ${pool.length} breakfasts. You've tried ${tried} so far.`}
        </p>
        {hiddenCount > 0 && (
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0"
            onClick={() => setShowHidden((v) => !v)}
          >
            {showHidden ? "Hide them again" : `Show hidden (${hiddenCount})`}
          </Button>
        )}
      </div>

      <Link
        href="/insights"
        className="flex items-center gap-3 rounded-xl border bg-primary/5 p-3 text-sm transition-colors hover:bg-primary/10"
      >
        <ChartNoAxesColumnIcon className="size-5 text-primary" />
        <span className="flex-1">
          <span className="font-medium">Your patterns</span>
          <span className="block text-muted-foreground">What you like, what fuels you, what to skip</span>
        </span>
        <ChevronRightIcon className="size-4 text-muted-foreground" />
      </Link>

      <SearchField
        value={query}
        onChange={setQuery}
        label="Search recipes"
        placeholder="Search by name or ingredient"
      />

      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]" role="group" aria-label="Filter recipes">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={f.id === filter}
            onClick={() => setFilter(f.id)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors",
              f.id === filter
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card hover:bg-muted",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {query.trim() ? `No breakfasts match "${query.trim()}".` : "Nothing here yet."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((r) => (
            <RecipeCard key={r.id} recipe={r} state={state} />
          ))}
        </ul>
      )}
      {query.trim() && hiddenMatches > 0 && (
        <Button variant="link" className="self-center" onClick={() => setShowHidden(true)}>
          {hiddenMatches} hidden {hiddenMatches === 1 ? "breakfast matches" : "breakfasts match"}. Show{" "}
          {hiddenMatches === 1 ? "it" : "them"}
        </Button>
      )}
    </section>
  );
}

function RecipeCard({ recipe, state }: { recipe: Recipe; state: AppState }) {
  const stats = state.stats[recipe.id];
  const score = preferenceScore(stats);
  const disliked = isDisliked(stats);
  const offList = dislikedIn(recipe, state.disliked);
  return (
    <li className="relative flex flex-col gap-2 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/50">
      <div className="flex items-start justify-between gap-3">
        <Link
          href={`/recipes/${recipe.id}`}
          className="font-medium leading-snug after:absolute after:inset-0 after:rounded-xl"
        >
          <span className="text-muted-foreground tabular-nums">#{recipe.id} </span>
          {recipe.name}
        </Link>
        {score !== null && (
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
              disliked
                ? "bg-destructive/10 text-destructive"
                : score >= 4
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {disliked ? <ThumbsDownIcon className="size-3" /> : score >= 4 ? <HeartIcon className="size-3" /> : null}
            {score.toFixed(1)}/5
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{recipe.blurb}</p>
      {offList.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-warning">
          <BanIcon className="size-3.5 shrink-0" />
          Hidden: uses {offList.map((id) => INGREDIENTS[id].name.toLowerCase()).join(", ")}
        </p>
      )}
      <NutritionLine recipe={recipe} />
      <div className="relative z-10 flex flex-wrap items-center gap-2 self-start">
        <RecipeBadges recipe={recipe} stock={state.stock} loadedAt={state.loadedAt} />
      </div>
      <p className="text-xs text-muted-foreground">
        {stats?.made
          ? `Made ${stats.made} ${stats.made === 1 ? "time" : "times"}${stats.rated ? `, rated ${stats.rated}` : ""}`
          : "Not tried yet"}
      </p>
    </li>
  );
}
