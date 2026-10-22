"use client";

import { useEffect } from "react";
import { track } from "@/components/activity/logger";
import { Button } from "@/components/ui/button";

export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : null;

  useEffect(() => {
    track("error", error instanceof Error ? error.message : "Render error", { boundary: "app", digest });
  }, [error, digest]);

  return (
    <section className="flex flex-col items-center gap-4 pt-16 text-center" role="alert">
      <h1 className="font-heading text-3xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground">
        This page couldn&apos;t load. Your data is safe.
        {digest && <span className="mt-1 block text-xs">Reference: {digest}</span>}
      </p>
      <Button className="h-11" onClick={() => retry()}>
        Try again
      </Button>
    </section>
  );
}
