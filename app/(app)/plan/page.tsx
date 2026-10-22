import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { PlanFlow } from "@/components/plan-flow";
import { getAppState } from "@/lib/data";

export const metadata = { title: "Plan ahead · Breakfeast" };

export default function PlanPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Plan />
    </Suspense>
  );
}

async function Plan() {
  const state = await getAppState();
  return <PlanFlow initial={state} />;
}
