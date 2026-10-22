import Link from "next/link";
import { BookOpenCheckIcon, ExternalLinkIcon, FlaskConicalIcon, SparklesIcon } from "lucide-react";
import { USDA_FOODS } from "@/lib/nutrition-data";
import {
  MICRO_KEYS,
  NUTRIENTS,
  PORTION_GRAMS,
  SOURCES,
  formatAmount,
  percentDV,
  recipeInsights,
  recipeNutrition,
  shortName,
  topMicros,
  type Insight,
  type NutrientKey,
} from "@/lib/nutrition";
import { INGREDIENTS, type Recipe } from "@/lib/recipes";
import { cn } from "@/lib/utils";

/** One line of headline numbers plus the standout micronutrients. */
export function NutritionSnapshot({ recipe, className }: { recipe: Recipe; className?: string }) {
  const { totals } = recipeNutrition(recipe);
  const micros = topMicros(recipe, 3);
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="grid grid-cols-3 gap-2">
        <Stat value={Math.round(totals.kcal).toString()} label="calories" />
        <Stat value={`${Math.round(totals.protein)} g`} label="protein" />
        <Stat value={`${Math.round(totals.fiber)} g`} label="fiber" />
      </div>
      {micros.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Standouts:</span>
          {micros.map((m) => (
            <span key={m.key} className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
              {NUTRIENTS[m.key].short} {m.percent}%
            </span>
          ))}
          <span className="text-muted-foreground">of a day</span>
        </div>
      )}
    </div>
  );
}

/** A single compact line for lists. */
export function NutritionLine({ recipe, className }: { recipe: Recipe; className?: string }) {
  const { totals } = recipeNutrition(recipe);
  const top = topMicros(recipe, 1)[0];
  return (
    <span className={cn("text-xs text-muted-foreground tabular-nums", className)}>
      {Math.round(totals.kcal)} cal · {Math.round(totals.protein)} g protein ·{" "}
      {Math.round(totals.fiber)} g fiber
      {top && ` · ${NUTRIENTS[top.key].short} ${top.percent}%`}
    </span>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl bg-muted/60 px-2 py-2">
      <span className="text-lg leading-tight font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function firstSentence(text: string) {
  const match = text.match(/^.*?[.!?](\s|$)/);
  return match ? match[0].trim() : text;
}

/** The top reasons to eat this, short enough for a decision screen. */
export function InsightTeaser({ recipe, limit = 2, href }: { recipe: Recipe; limit?: number; href?: string }) {
  const insights = recipeInsights(recipe).slice(0, limit);
  if (!insights.length) return null;
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-primary uppercase">
        <SparklesIcon className="size-3.5" />
        What it does for you
      </p>
      <ul className="flex flex-col gap-2">
        {insights.map((i) => (
          <li key={i.id} className="text-sm">
            <p className="font-medium leading-snug">{i.title}</p>
            <p className="text-muted-foreground">{firstSentence(i.body)}</p>
          </li>
        ))}
      </ul>
      {href && (
        <Link href={href} className="self-start text-sm font-medium text-primary underline-offset-4 hover:underline">
          Full nutrition and all {recipeInsights(recipe).length} reasons
        </Link>
      )}
    </div>
  );
}

export function InsightCard({ insight }: { insight: Insight }) {
  return (
    <li className="flex flex-col gap-2 rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold leading-snug">{insight.title}</p>
        <EvidenceTag evidence={insight.evidence} />
      </div>
      <p className="text-sm leading-relaxed">{insight.body}</p>
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {insight.sources.map((s) => (
          <a
            key={s.url}
            href={s.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {s.label}
            <ExternalLinkIcon className="size-3" />
          </a>
        ))}
      </p>
    </li>
  );
}

function EvidenceTag({ evidence }: { evidence: Insight["evidence"] }) {
  return evidence === "established" ? (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
      <BookOpenCheckIcon className="size-3" />
      Well established
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
      <FlaskConicalIcon className="size-3" />
      Seen in studies
    </span>
  );
}

export function InsightList({ recipe }: { recipe: Recipe }) {
  return (
    <ul className="flex flex-col gap-3">
      {recipeInsights(recipe).map((i) => (
        <InsightCard key={i.id} insight={i} />
      ))}
    </ul>
  );
}

/** The full estimated nutrition for one serving, with sources and caveats. */
export function NutritionPanel({ recipe }: { recipe: Recipe }) {
  const n = recipeNutrition(recipe);
  const micros = [...MICRO_KEYS].sort(
    (a, b) => (percentDV(b, n.totals[b]) ?? 0) - (percentDV(a, n.totals[a]) ?? 0),
  );
  const limits: NutrientKey[] = ["sodium", "satFat", "sugars"];
  const vitaminKeys: NutrientKey[] = ["fiber", ...micros];
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-4 gap-2">
        <Stat value={Math.round(n.totals.kcal).toString()} label="calories" />
        <Stat value={`${Math.round(n.totals.protein)} g`} label="protein" />
        <Stat value={`${Math.round(n.totals.carbs)} g`} label="carbs" />
        <Stat value={`${Math.round(n.totals.fat)} g`} label="fat" />
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Vitamins, minerals and fiber · % of a day
        </p>
        <ul className="flex flex-col gap-2">
          {vitaminKeys.map((k) => (
            <NutrientBar key={k} nutrient={k} amount={n.totals[k]} unknownIn={n.unknownIn[k]} />
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Worth keeping an eye on
        </p>
        <ul className="flex flex-col gap-2">
          {limits.map((k) => (
            <NutrientBar key={k} nutrient={k} amount={n.totals[k]} unknownIn={n.unknownIn[k]} limit />
          ))}
        </ul>
      </div>

      <EstimateNotes recipe={recipe} />
    </div>
  );
}

function NutrientBar({
  nutrient,
  amount,
  unknownIn,
  limit,
}: {
  nutrient: NutrientKey;
  amount: number;
  unknownIn?: string[];
  limit?: boolean;
}) {
  const def = NUTRIENTS[nutrient];
  const pct = percentDV(nutrient, amount);
  const width = Math.min(pct ?? 0, 100);
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">
          {def.label}
          {unknownIn?.length ? <span className="text-muted-foreground"> *</span> : null}
        </span>
        <span className="tabular-nums text-muted-foreground">
          {formatAmount(nutrient, amount)}
          {pct !== null && (
            <span className={cn("ml-2 font-semibold", limit ? "text-foreground" : "text-primary")}>
              {pct}%{def.reference === "AI" ? " AI" : ""}
            </span>
          )}
        </span>
      </div>
      {pct !== null && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div
            className={cn("h-full rounded-full", limit ? "bg-warning/70" : "bg-primary/80")}
            style={{ width: `${width}%` }}
          />
        </div>
      )}
      {unknownIn?.length ? (
        <p className="text-xs text-muted-foreground">
          * USDA doesn&apos;t report this for {unknownIn.map(shortName).join(", ")}, so it may read low.
        </p>
      ) : null}
    </li>
  );
}

function EstimateNotes({ recipe }: { recipe: Recipe }) {
  const n = recipeNutrition(recipe);
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-muted/50 p-4 text-sm">
      <p>
        <span className="font-semibold">
          Estimate quality: {n.confidence === "good" ? "Good" : "Fair"}.
        </span>{" "}
        {n.confidence === "good"
          ? "Every ingredient maps closely to a USDA record."
          : "At least one ingredient depends heavily on the brand you buy."}
      </p>
      {n.caveats.length > 0 && (
        <ul className="flex list-disc flex-col gap-1 pl-5 text-muted-foreground">
          {n.caveats.map((c) => (
            <li key={c.id}>{c.text}</li>
          ))}
        </ul>
      )}
      {n.variableQty.length > 0 && (
        <p className="text-muted-foreground">
          Loose amounts ({n.variableQty.map(shortName).join(", ")}) use a typical portion.
        </p>
      )}
      <details className="group">
        <summary className="cursor-pointer font-medium">Per ingredient (USDA records)</summary>
        <table className="mt-2 w-full text-xs">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">Ingredient</th>
              <th className="py-1 text-right font-medium">Grams</th>
              <th className="py-1 text-right font-medium">Cal</th>
              <th className="py-1 text-right font-medium">Protein</th>
            </tr>
          </thead>
          <tbody>
            {recipe.ingredients.map((ri) => {
              const food = USDA_FOODS[ri.id];
              const g = n.contributions.kcal.find((c) => c.id === ri.id);
              const p = n.contributions.protein.find((c) => c.id === ri.id);
              return (
                <tr key={ri.id} className="border-t border-border/60">
                  <td className="py-1.5 pr-2">
                    {food ? (
                      <a
                        href={`https://fdc.nal.usda.gov/food-details/${food.fdcId}/nutrients`}
                        target="_blank"
                        rel="noreferrer"
                        className="underline-offset-2 hover:underline"
                        title={food.description}
                      >
                        {INGREDIENTS[ri.id].name}
                      </a>
                    ) : (
                      INGREDIENTS[ri.id].name
                    )}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{gramsOf(recipe, ri.id)}</td>
                  <td className="py-1.5 text-right tabular-nums">{Math.round(g?.amount ?? 0)}</td>
                  <td className="py-1.5 text-right tabular-nums">{(p?.amount ?? 0).toFixed(1)} g</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </details>
      <p className="text-xs text-muted-foreground">
        Estimated for one serving from{" "}
        <a href={SOURCES.fdc.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
          USDA FoodData Central
        </a>
        . Percentages use{" "}
        <a href={SOURCES.dv.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
          FDA Daily Values
        </a>{" "}
        for adults (omega-3 uses the NIH Adequate Intake). For general education, not medical
        advice.
      </p>
    </div>
  );
}

function gramsOf(recipe: Recipe, id: string) {
  const g = PORTION_GRAMS[recipe.id]?.[id] ?? 0;
  return g < 1 ? g.toFixed(1) : Math.round(g).toString();
}
