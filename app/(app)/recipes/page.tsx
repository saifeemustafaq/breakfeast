import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { RecipeLibrary } from "@/components/recipe-library";
import { getAppState } from "@/lib/data";

export const metadata = { title: "Recipes · Breakfeast" };

export default function RecipesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Library />
    </Suspense>
  );
}

async function Library() {
  const state = await getAppState();
  return <RecipeLibrary state={state} />;
}
