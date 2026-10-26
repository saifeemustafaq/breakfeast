"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { BottomLinks } from "@/components/today/parts";
import type { TodayFlowState } from "@/components/today/use-today-flow";
import { Button } from "@/components/ui/button";

export function DoneScreen({ flow }: { flow: TodayFlowState }) {
  const { cartCount, restart, start } = flow;
  return (
    <section className="flex flex-col gap-6 pt-6 text-center">
      <SunIcon className="mx-auto size-10 text-primary" />
      <h1 className="font-heading text-2xl font-semibold">Enjoy breakfast</h1>
      <p className="text-muted-foreground">
        Want to get tomorrow ready while you&apos;re in the kitchen?
      </p>
      <Button size="lg" className="h-12 text-base" onClick={() => start("tonight")}>
        <MoonIcon />
        Prep for tomorrow
      </Button>
      <BottomLinks cartCount={cartCount} onRestart={restart} />
    </section>
  );
}
