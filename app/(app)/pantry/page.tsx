import { Suspense } from "react";
import { HouseholdSection } from "@/components/household-section";
import { PageSkeleton } from "@/components/page-skeleton";
import { PantryView } from "@/components/pantry-view";
import { requireUserPage } from "@/lib/auth/guards";
import { getAppState } from "@/lib/data";
import { getHouseholdView } from "@/lib/household-data";

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
  const [household, state] = await Promise.all([getHouseholdView(), getAppState()]);
  return (
    <div className="flex flex-col gap-8">
      <HouseholdSection view={household} />
      {/* Remount when the household changes so the pantry reloads from the merged data. */}
      <PantryView key={user.householdId.toHexString()} initial={state} />
    </div>
  );
}
