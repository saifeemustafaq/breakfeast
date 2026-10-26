import Link from "next/link";
import { HeartIcon, InfoIcon, ThumbsDownIcon, ZapIcon } from "lucide-react";
import { BackButton } from "@/components/navigation";
import { NutritionLine } from "@/components/nutrition";
import { Progress } from "@/components/ui/progress";
import { NUTRIENTS, percentDV, type NutrientKey } from "@/lib/nutrition";
import { MIN_RATED_TOTAL, type GroupComparison, type Patterns } from "@/lib/patterns";
import { INGREDIENTS, RECIPE_BY_ID } from "@/lib/recipes";
import type { HistoryEntry } from "@/lib/types";

const DATE = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });

export function PreferenceInsights({ patterns, history }: { patterns: Patterns; history: HistoryEntry[] }) {
  const p = patterns;
  return (
    <section className="flex flex-col gap-6">
      <BackButton fallback="/recipes" />
      <div className="-mt-4">
        <h1 className="font-heading text-3xl font-semibold">Your patterns</h1>
        <p className="mt-1 text-muted-foreground">Built from what you&apos;ve made and how you rated it.</p>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border bg-card p-4">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium">Breakfasts tried</span>
          <span className="tabular-nums text-muted-foreground">
            {p.tried} of {p.total}
          </span>
        </div>
        <Progress value={(p.tried / p.total) * 100} aria-label="Breakfasts tried" />
        <p className="text-xs text-muted-foreground">
          {p.tried < p.total
            ? "Try each one at least once, then keep the favorites in rotation."
            : "You've tried them all. Your favorites below are the ones to keep."}
        </p>
      </div>

      {!p.enoughData && (
        <p className="flex items-start gap-2 rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">
          <InfoIcon className="mt-0.5 size-4 shrink-0" />
          Rate at least {MIN_RATED_TOTAL} breakfasts to unlock patterns ({p.ratedMeals} so far). Until
          then, any difference is more likely chance than taste.
        </p>
      )}

      <RecipeGroup
        title="Favorites"
        icon={<HeartIcon className="size-4 text-primary" />}
        ids={p.favorites}
        empty="Breakfasts you rate 4 or higher show up here."
      />
      {p.avoid.length > 0 && (
        <RecipeGroup
          title="Not for you"
          icon={<ThumbsDownIcon className="size-4 text-destructive" />}
          ids={p.avoid}
          note="These drop to the end of suggestions."
        />
      )}

      {p.traits.length > 0 && (
        <Block title="What you tend to like">
          {p.traits.map((c) => (
            <ComparisonRow key={c.id} c={c} unit="overall" />
          ))}
        </Block>
      )}

      {p.feel.length > 0 && (
        <Block title="What leaves you feeling good" icon={<ZapIcon className="size-4 text-warning" />}>
          {p.feel.map((c) => (
            <ComparisonRow key={c.id} c={c} unit="for how you felt" />
          ))}
        </Block>
      )}

      {p.enoughData && p.traits.length === 0 && p.feel.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No clear patterns yet. Your ratings are fairly even across sweet and savory, warm and cold,
          and protein sources.
        </p>
      )}

      {p.recent.count > 0 && <RecentNutrition recent={p.recent} />}

      {history.length > 0 && (
        <Block title="Recent breakfasts">
          <ul className="flex flex-col divide-y rounded-xl border bg-card text-sm">
            {history.slice(0, 14).map((h) => (
              <li key={h.id} className="flex flex-col gap-0.5 p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <Link href={`/recipes/${h.recipeId}`} className="font-medium hover:underline">
                    {RECIPE_BY_ID[h.recipeId]?.name ?? `Breakfast #${h.recipeId}`}
                  </Link>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {DATE.format(new Date(h.madeAt))}
                  </span>
                </div>
                {(h.version || h.skipped?.length || h.extras?.length) && (
                  <span className="text-xs text-muted-foreground">
                    {[
                      h.version && `+ ${h.version.additions.map((a) => a.name.toLowerCase()).join(", ")}`,
                      h.extras?.length &&
                        `+ ${h.extras.map((a) => a.name.toLowerCase()).join(", ")} (just this time)`,
                      h.skipped?.length &&
                        `skipped ${h.skipped.map((id) => (INGREDIENTS[id]?.name ?? h.version?.additions.find((a) => a.ingredientId === id)?.name ?? "an item you added").toLowerCase()).join(", ")}`,
                    ]
                      .filter(Boolean)
                      .join("; ")}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {h.taste !== undefined
                    ? `Taste ${h.taste} · felt ${h.feel} · again ${h.again}`
                    : "Not rated"}
                </span>
                {h.note && <span className="text-xs italic text-muted-foreground">&ldquo;{h.note}&rdquo;</span>}
              </li>
            ))}
          </ul>
        </Block>
      )}

      <p className="text-xs text-muted-foreground">
        Patterns show up once each group has at least two rated breakfasts and a gap of
        three-quarters of a point. They show what goes together in your ratings, not what causes what.
      </p>
    </section>
  );
}

function Block({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 font-heading text-xl font-semibold">
        {icon}
        {title}
      </h2>
      {children}
    </div>
  );
}

function RecipeGroup({
  title,
  icon,
  ids,
  empty,
  note,
}: {
  title: string;
  icon: React.ReactNode;
  ids: number[];
  empty?: string;
  note?: string;
}) {
  return (
    <Block title={title} icon={icon}>
      {ids.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {ids.map((id) => (
            <li key={id}>
              <Link
                href={`/recipes/${id}`}
                className="flex flex-col gap-0.5 rounded-xl border bg-card p-3 transition-colors hover:bg-muted/50"
              >
                <span className="font-medium">{RECIPE_BY_ID[id].name}</span>
                <NutritionLine recipe={RECIPE_BY_ID[id]} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {note && ids.length > 0 && <p className="text-xs text-muted-foreground">{note}</p>}
    </Block>
  );
}

function ComparisonRow({ c, unit }: { c: GroupComparison; unit: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-4 text-sm">
      <p>
        <span className="font-semibold">{c.best.value}</span> beats{" "}
        <span className="font-semibold">{c.worst.value.toLowerCase()}</span> {unit}.
      </p>
      {[c.best, c.worst].map((g) => (
        <div key={g.value} className="flex items-center gap-3">
          <span className="w-36 shrink-0 truncate text-xs text-muted-foreground">{g.value}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full rounded-full bg-primary/80" style={{ width: `${(g.avg / 5) * 100}%` }} />
          </div>
          <span className="w-20 shrink-0 text-right text-xs tabular-nums">
            {g.avg.toFixed(1)}/5 · {g.count}×
          </span>
        </div>
      ))}
    </div>
  );
}

function RecentNutrition({ recent }: { recent: Patterns["recent"] }) {
  const keys: NutrientKey[] = ["protein", "fiber", "magnesium", "iron", "calcium", "potassium", "vitC", "folate"];
  return (
    <Block title={`Your last ${recent.count} ${recent.count === 1 ? "breakfast" : "breakfasts"}, on average`}>
      <div className="grid grid-cols-2 gap-2">
        {keys.map((k) => (
          <div key={k} className="flex flex-col rounded-xl bg-muted/60 p-3">
            <span className="text-lg font-semibold tabular-nums">{percentDV(k, recent.totals[k])}%</span>
            <span className="text-xs text-muted-foreground">of a day&apos;s {NUTRIENTS[k].label.toLowerCase()}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Around {Math.round(recent.totals.kcal)} calories and {Math.round(recent.totals.protein)} g protein
        per breakfast. Breakfast is one meal of several, so a quarter to a third of a day is a solid
        share.
      </p>
    </Block>
  );
}
