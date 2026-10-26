"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { CopyIcon, PencilIcon, PlusIcon } from "lucide-react";
import { chooseVersion, copySharedVersion } from "@/app/version-actions";
import { toast } from "@/components/activity/toast";
import { InsightList, NutritionPanel } from "@/components/nutrition";
import { PrepDetails } from "@/components/prep-details";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button, buttonVariants } from "@/components/ui/button";
import { VersionSwitch } from "@/components/version-switch";
import { failureMessage, unwrap } from "@/lib/action-result";
import { ingredientsWith } from "@/lib/ingredients";
import { INGREDIENTS, prepKinds, type Ingredient, type Recipe } from "@/lib/recipes";
import type { AppState, VersionChoice } from "@/lib/types";
import { cn } from "@/lib/utils";
import { defaultChoice, resolveRecipe, versionChoices, type ChoiceOption } from "@/lib/versions";

export type VersionState = Pick<AppState, "versions" | "choices" | "disliked" | "custom" | "stock" | "loadedAt">;

const ORIGINAL_ONLY: ChoiceOption[] = [{ choice: "original", label: "Original", version: null }];

/**
 * Everything below the recipe's header: the version switch, prep, ingredients, steps and
 * nutrition for whichever version is picked. Without `state` (the static shell) it's the original.
 */
export function RecipeBody({ recipe, state }: { recipe: Recipe; state?: VersionState }) {
  const ingredients = useMemo(() => (state ? ingredientsWith(state.custom) : INGREDIENTS), [state]);
  const options = state ? versionChoices(state, recipe.id) : ORIGINAL_ONLY;
  const [picked, setPicked] = useState<VersionChoice | null>(null);
  const [, startTransition] = useTransition();
  const choice =
    picked && options.some((o) => o.choice === picked) ? picked : state ? defaultChoice(state, recipe.id) : "original";
  const resolved = state ? resolveRecipe(state, recipe.id, ingredients, choice) : null;
  const shown = resolved?.recipe ?? recipe;
  const mine = state?.versions.mine[recipe.id];

  function pick(next: VersionChoice) {
    const previous = choice;
    setPicked(next);
    startTransition(async () => {
      try {
        await unwrap(chooseVersion(recipe.id, next));
      } catch (err) {
        setPicked(previous);
        toast.error(failureMessage(err, "Couldn't switch versions. Try again."));
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {state && (
        <VersionBar
          recipeId={recipe.id}
          options={options}
          choice={choice}
          onPick={pick}
          hasMine={!!mine}
          added={shown.ingredients.filter((ri) => ri.added).length}
          onCopied={() => setPicked("mine")}
        />
      )}
      <Body recipe={shown} ingredients={ingredients} stock={state?.stock} loadedAt={state?.loadedAt} />
    </div>
  );
}

function VersionBar({
  recipeId,
  options,
  choice,
  onPick,
  hasMine,
  added,
  onCopied,
}: {
  recipeId: number;
  options: ChoiceOption[];
  choice: VersionChoice;
  onPick: (c: VersionChoice) => void;
  hasMine: boolean;
  added: number;
  onCopied: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const current = options.find((o) => o.choice === choice);
  const owner = choice.startsWith("user:") ? choice.slice("user:".length) : null;
  const editHref = `/recipes/${recipeId}/edit`;

  function copy() {
    if (!owner) return;
    if (hasMine && !confirming) {
      setConfirming(true);
      return;
    }
    startTransition(async () => {
      try {
        const dropped = await unwrap(copySharedVersion(recipeId, owner));
        setConfirming(false);
        onCopied();
        toast.success(
          dropped
            ? `Copied as your version, without ${dropped === 1 ? "1 item" : `${dropped} items`} on your dislikes list`
            : "Copied as your version",
        );
      } catch (err) {
        toast.error(failureMessage(err, "Couldn't copy that version. Try again."));
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <VersionSwitch options={options} value={choice} onChange={onPick} />
      {choice === "mine" && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">
            The original plus {added === 1 ? "1 item" : `${added} items`} you added.
          </span>
          <Link href={editHref} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}>
            <PencilIcon />
            Edit
          </Link>
        </div>
      )}
      {owner && current?.version && (
        <div className="flex flex-col gap-2 rounded-xl bg-muted/60 p-3 text-sm">
          <p className="text-muted-foreground">
            {current.label}, always their latest. Copy it to make changes of your own.
          </p>
          <Button variant="outline" className="h-11 self-start" disabled={pending} onClick={copy}>
            <CopyIcon />
            {confirming ? "Replace your version with this copy?" : "Copy as your version"}
          </Button>
        </div>
      )}
      {choice === "original" && !hasMine && (
        <Link
          href={editHref}
          className="flex h-11 items-center justify-center gap-2 rounded-xl border border-dashed text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <PlusIcon className="size-4" />
          Make your version: add what you like
        </Link>
      )}
    </div>
  );
}

function Body({
  recipe,
  ingredients,
  stock,
  loadedAt,
}: {
  recipe: Recipe;
  ingredients: Record<string, Ingredient>;
  stock?: VersionState["stock"];
  loadedAt?: number;
}) {
  const prepped = prepKinds(recipe).some((k) => k !== "none");
  return (
    <Accordion defaultValue={["ingredients", "steps"]}>
      {prepped && (
        <AccordionItem value="prep">
          <AccordionTrigger className="text-base">Advance prep</AccordionTrigger>
          <AccordionContent>
            <PrepDetails recipe={recipe} stock={stock} loadedAt={loadedAt} ingredients={ingredients} />
          </AccordionContent>
        </AccordionItem>
      )}

      <AccordionItem value="ingredients">
        <AccordionTrigger className="text-base">Ingredients</AccordionTrigger>
        <AccordionContent>
          <IngredientList recipe={recipe} ingredients={ingredients} />
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
          <NutritionPanel recipe={recipe} ingredients={ingredients} />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function IngredientList({ recipe, ingredients }: { recipe: Recipe; ingredients: Record<string, Ingredient> }) {
  const overnight = recipe.prep === "overnight";
  return (
    <ul className="flex flex-col divide-y rounded-xl border bg-card text-sm">
      {recipe.ingredients.map((ri) => (
        <li key={ri.id} className="flex items-baseline justify-between gap-3 p-3">
          <span>
            {ingredients[ri.id]?.name ?? ri.id}
            {ri.added && (
              <span className="ml-2 rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                Added
              </span>
            )}
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
