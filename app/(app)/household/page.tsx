import { Suspense } from "react";
import { HouseholdSection } from "@/components/household-section";
import { BackButton } from "@/components/navigation";
import { PageSkeleton } from "@/components/page-skeleton";
import { getHouseholdView } from "@/lib/household-data";

export const metadata = { title: "Household · Breakfeast" };

export default function HouseholdPage() {
  return (
    <section className="flex flex-col gap-5">
      <BackButton />
      <div className="-mt-3">
        <h1 className="font-heading text-3xl font-semibold">Household</h1>
        <p className="mt-1 text-muted-foreground">
          Share the pantry, cart, tomorrow&apos;s plan and breakfast history with someone else.
        </p>
      </div>
      <Suspense fallback={<PageSkeleton />}>
        <Household />
      </Suspense>
    </section>
  );
}

async function Household() {
  return <HouseholdSection view={await getHouseholdView()} />;
}
