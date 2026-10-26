import { Suspense } from "react";
import { notFound } from "next/navigation";
import { BackButton } from "@/components/navigation";
import { PageSkeleton } from "@/components/page-skeleton";
import { VersionEditor } from "@/components/version-editor";
import { getAppState } from "@/lib/data";
import { RECIPE_BY_ID, RECIPES, type Recipe } from "@/lib/recipes";

export function generateStaticParams() {
  return RECIPES.map((r) => ({ id: String(r.id) }));
}

export default function EditVersionPage({ params }: PageProps<"/recipes/[id]/edit">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EditVersion params={params} />
    </Suspense>
  );
}

async function EditVersion({ params }: { params: PageProps<"/recipes/[id]/edit">["params"] }) {
  const { id } = await params;
  const recipe = /^\d+$/.test(id) ? RECIPE_BY_ID[Number(id)] : undefined;
  if (!recipe) notFound();
  return (
    <article className="flex min-h-full flex-col gap-5">
      <BackButton fallback={`/recipes/${recipe.id}`} />
      <header className="flex flex-col gap-1">
        <p className="text-xs font-semibold tracking-wide text-primary uppercase">Your version</p>
        <h1 className="font-heading text-2xl leading-tight font-semibold">{recipe.name}</h1>
        <p className="text-sm text-muted-foreground">
          Add up to 8 things you like. Once saved, your version is what Today suggests and what you make.
        </p>
      </header>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <Editor recipe={recipe} />
      </Suspense>
    </article>
  );
}

async function Editor({ recipe }: { recipe: Recipe }) {
  const { versions, custom, disliked, stock } = await getAppState();
  return <VersionEditor recipe={recipe} state={{ versions, custom, disliked, stock }} />;
}
