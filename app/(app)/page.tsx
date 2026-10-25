import { Suspense } from "react";
import { TodayFlow } from "@/components/breakfast-flow";
import { PageSkeleton } from "@/components/page-skeleton";
import { getAppState } from "@/lib/data";

export default function Home() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Today />
    </Suspense>
  );
}

async function Today() {
  return <TodayFlow initial={await getAppState()} />;
}
