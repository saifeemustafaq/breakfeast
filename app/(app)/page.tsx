import { Suspense } from "react";
import { BreakfastFlow, type Mode } from "@/components/breakfast-flow";
import { PageSkeleton } from "@/components/page-skeleton";
import { getAppState } from "@/lib/data";
import { RECIPE_BY_ID } from "@/lib/recipes";

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Today searchParams={searchParams} />
    </Suspense>
  );
}

async function Today({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const [state, params] = await Promise.all([getAppState(), searchParams]);
  const recipeId = Number(params.recipe);
  const mode: Mode = params.mode === "tonight" ? "tonight" : "now";
  const startWith = RECIPE_BY_ID[recipeId] ? { recipeId, mode } : undefined;
  return (
    <BreakfastFlow
      key={startWith ? `${recipeId}-${mode}` : "today"}
      initial={state}
      startWith={startWith}
    />
  );
}
