import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { PreferenceInsights } from "@/components/preference-insights";
import { getAppState, getHistory } from "@/lib/data";
import { analyzePatterns } from "@/lib/patterns";

export const metadata = { title: "Your patterns · Breakfeast" };

export default function InsightsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Insights />
    </Suspense>
  );
}

async function Insights() {
  const [state, history] = await Promise.all([getAppState(), getHistory()]);
  return <PreferenceInsights patterns={analyzePatterns(history, state.stats)} history={history} />;
}
