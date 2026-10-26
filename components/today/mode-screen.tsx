"use client";

import {
  ArrowRightIcon,
  BookOpenIcon,
  CalendarDaysIcon,
  ChartNoAxesColumnIcon,
  MoonIcon,
  PlayIcon,
  SunIcon,
} from "lucide-react";
import Link from "next/link";
import {
  clearSession,
  describeSession,
  startedAgo,
  type SavedSession,
} from "@/components/flow-session";
import { greeting } from "@/components/today/helpers";
import type { TodayFlowState } from "@/components/today/use-today-flow";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RECIPE_BY_ID, type Recipe } from "@/lib/recipes";
import { cn } from "@/lib/utils";

export function ModeScreen({ flow }: { flow: TodayFlowState }) {
  const { hour, upcoming, saved, pending, madeWith, resume, confirmPrepped, suggestedMode, start } =
    flow;
  const upcomingRecipe = upcoming ? RECIPE_BY_ID[upcoming.recipeId] : null;
  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-3xl font-semibold">{greeting(hour)}</h1>
        <p className="mt-1 text-muted-foreground">What are we doing?</p>
      </div>

      {saved && (
        <ResumeCard
          saved={saved}
          recipe={madeWith(
            saved.recipe.id,
            saved.nav.at.choice,
            saved.progress.recipeId === saved.recipe.id ? saved.progress.extras : [],
          )}
          pending={pending}
          onResume={() => resume(saved)}
          onPrepped={() => confirmPrepped(saved)}
          onDiscard={clearSession}
        />
      )}

      {upcoming && upcomingRecipe && (
        <Card size="sm" className="bg-primary/5 ring-primary/20">
          <CardContent className="flex items-start gap-3">
            <MoonIcon className="mt-0.5 size-4 shrink-0 text-primary" />
            <p className="text-sm">
              {upcoming.needsPrep ? "Prepped for tomorrow: " : "Picked for tomorrow: "}
              <span className="font-medium">{upcomingRecipe.name}</span>
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        <ModeButton
          icon={<SunIcon />}
          title="Make breakfast now"
          description={
            upcomingRecipe
              ? `Finish ${upcomingRecipe.name.toLowerCase()} or pick something quick`
              : "Each pick shows if it's ready to make or needed prep last night"
          }
          suggested={suggestedMode === "now"}
          onClick={() => start("now")}
        />
        <ModeButton
          icon={<MoonIcon />}
          title="Prep for tomorrow morning"
          description="Check ingredients tonight and do any overnight prep"
          suggested={suggestedMode === "tonight"}
          onClick={() => start("tonight")}
        />
      </div>

      <Link
        href="/plan"
        className={cn(buttonVariants({ variant: "outline" }), "h-12 justify-between text-base")}
      >
        <span className="flex items-center gap-2">
          <CalendarDaysIcon />
          Plan 3–4 breakfasts ahead
        </span>
        <ArrowRightIcon />
      </Link>

      <div className="grid grid-cols-2 gap-2">
        <Link
          href="/recipes"
          className={cn(buttonVariants({ variant: "ghost" }), "h-11 justify-start bg-muted/60")}
        >
          <BookOpenIcon />
          All recipes
        </Link>
        <Link
          href="/insights"
          className={cn(buttonVariants({ variant: "ghost" }), "h-11 justify-start bg-muted/60")}
        >
          <ChartNoAxesColumnIcon />
          Your patterns
        </Link>
      </div>
    </section>
  );
}

/** An unfinished breakfast saved on this phone: pick it back up, or say last night's prep got done. */
function ResumeCard({
  saved,
  recipe,
  pending,
  onResume,
  onPrepped,
  onDiscard,
}: {
  saved: SavedSession;
  /** The version being made, so step counts include any added steps. */
  recipe: Recipe;
  pending: boolean;
  onResume: () => void;
  onPrepped: () => void;
  onDiscard: () => void;
}) {
  if (saved.status === "askPrepped") {
    return (
      <Card className="ring-primary/30">
        <CardHeader>
          <CardDescription className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-primary uppercase">
            <MoonIcon className="size-3.5" />
            Last night
          </CardDescription>
          <CardTitle className="text-lg">
            Did you finish prepping {saved.recipe.name.toLowerCase()}?
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Button size="lg" className="h-12 text-base" disabled={pending} onClick={onPrepped}>
            Yes, it&apos;s in the fridge
          </Button>
          <Button variant="outline" size="lg" className="h-11" disabled={pending} onClick={onDiscard}>
            No, I didn&apos;t finish
          </Button>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="ring-primary/30">
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-primary uppercase">
          {saved.nav.at.mode === "tonight" ? (
            <MoonIcon className="size-3.5" />
          ) : (
            <SunIcon className="size-3.5" />
          )}
          {saved.nav.at.mode === "tonight" ? "Prep in progress" : "Breakfast in progress"}
        </CardDescription>
        <CardTitle className="text-lg">Resume: {saved.recipe.name}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {describeSession(saved, recipe)} · {startedAgo(saved)}
        </p>
      </CardHeader>
      <CardContent className="grid grid-cols-[1fr_auto] gap-2">
        <Button size="lg" className="h-12 text-base" onClick={onResume}>
          <PlayIcon />
          Resume
        </Button>
        <Button variant="ghost" size="lg" className="h-12 text-muted-foreground" onClick={onDiscard}>
          Discard
        </Button>
      </CardContent>
    </Card>
  );
}

function ModeButton({
  icon,
  title,
  description,
  suggested,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  suggested: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-start gap-4 rounded-2xl border p-5 text-left transition-colors [&_svg]:size-6",
        suggested
          ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
          : "bg-card hover:bg-muted",
      )}
    >
      <span className="mt-0.5">{icon}</span>
      <span className="flex flex-col gap-1">
        <span className="text-lg font-semibold">{title}</span>
        <span className={cn("text-sm", suggested ? "opacity-85" : "text-muted-foreground")}>
          {description}
        </span>
        {suggested && <span className="text-xs font-medium opacity-75">Suggested for now</span>}
      </span>
    </button>
  );
}
