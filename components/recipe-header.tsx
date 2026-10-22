"use client";

import { useState } from "react";
import { CheckIcon, ClockIcon, CookingPotIcon, InfoIcon, MoonIcon } from "lucide-react";
import { PrepDialog, type PrepFocus } from "@/components/prep-details";
import { Badge } from "@/components/ui/badge";
import { prepKinds, type Recipe } from "@/lib/recipes";
import type { StockEntry } from "@/lib/types";

export function RecipeBadges({
  recipe,
  stock,
  loadedAt,
}: {
  recipe: Recipe;
  stock?: Record<string, StockEntry>;
  loadedAt?: number;
}) {
  const [focus, setFocus] = useState<PrepFocus | null>(null);
  const kinds = prepKinds(recipe);
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge variant="secondary">
        <ClockIcon />
        {recipe.minutes} min
      </Badge>
      {kinds.includes("none") && (
        <Badge variant="outline" className="border-success/40 text-success">
          <CheckIcon />
          No prep needed
        </Badge>
      )}
      {kinds.includes("overnight") && (
        <Badge
          variant="outline"
          className="cursor-pointer border-info/40 text-info hover:bg-info/10"
          render={<button type="button" />}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setFocus("overnight");
          }}
          aria-label={`See the overnight prep for ${recipe.name}`}
        >
          <MoonIcon />
          Prep the night before
          <InfoIcon className="opacity-60" />
        </Badge>
      )}
      {kinds.includes("cookedAhead") && (
        <Badge
          variant="outline"
          className="cursor-pointer border-warning/40 text-warning hover:bg-warning/10"
          render={<button type="button" />}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setFocus("cookedAhead");
          }}
          aria-label={`See what to cook ahead for ${recipe.name}`}
        >
          <CookingPotIcon />
          Uses cooked-ahead
          <InfoIcon className="opacity-60" />
        </Badge>
      )}
      <PrepDialog
        recipe={recipe}
        open={focus !== null}
        onOpenChange={(o) => !o && setFocus(null)}
        focus={focus ?? undefined}
        stock={stock}
        loadedAt={loadedAt}
      />
    </div>
  );
}

export function RecipeHeader({
  recipe,
  eyebrow,
  showBadges = true,
}: {
  recipe: Recipe;
  eyebrow?: string;
  showBadges?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      {eyebrow && (
        <p className="text-xs font-semibold tracking-wide text-primary uppercase">{eyebrow}</p>
      )}
      <h1 className="font-heading text-2xl leading-tight font-semibold">{recipe.name}</h1>
      <p className="text-muted-foreground">{recipe.blurb}</p>
      {showBadges && <RecipeBadges recipe={recipe} />}
    </div>
  );
}
