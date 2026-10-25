import { Suspense } from "react";
import { ExportFlow } from "@/components/export-view";
import { PageSkeleton } from "@/components/page-skeleton";
import { getAppState, getHistory } from "@/lib/data";

export const metadata = { title: "Export & share · Breakfeast" };

export default function ExportPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Export />
    </Suspense>
  );
}

async function Export() {
  const [initial, history] = await Promise.all([getAppState(), getHistory(5000)]);
  return <ExportFlow initial={initial} history={history} />;
}
