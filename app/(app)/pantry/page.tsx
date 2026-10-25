import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { PantryView } from "@/components/pantry-view";
import { requireUserPage } from "@/lib/auth/guards";
import { getAppState } from "@/lib/data";

export const metadata = { title: "Pantry · Breakfeast" };

export default function PantryPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Pantry />
    </Suspense>
  );
}

async function Pantry() {
  const { user } = await requireUserPage();
  const state = await getAppState();
  // Remount when the household changes so the pantry reloads from the merged data.
  return <PantryView key={user.householdId.toHexString()} initial={state} />;
}
