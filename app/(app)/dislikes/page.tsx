import { Suspense } from "react";
import { DislikesView } from "@/components/dislikes-view";
import { PageSkeleton } from "@/components/page-skeleton";
import { getAppState } from "@/lib/data";

export const metadata = { title: "Allergies & dislikes · Breakfeast" };

export default function DislikesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Dislikes />
    </Suspense>
  );
}

async function Dislikes() {
  return <DislikesView initial={await getAppState()} />;
}
