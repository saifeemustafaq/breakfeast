"use client";

import { ShoppingCartIcon } from "lucide-react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Exhausted({ back, cartCount }: { back: React.ReactNode; cartCount: number }) {
  return (
    <section className="flex flex-col gap-6">
      {back}
      <h1 className="font-heading text-2xl font-semibold">That&apos;s every option for now</h1>
      <p className="text-muted-foreground">
        There&apos;s nothing left to suggest with what&apos;s in the kitchen right now. Your shopping
        cart has what you need to restock.
      </p>
      <Link href="/cart" className={cn(buttonVariants(), "h-12 text-base")}>
        <ShoppingCartIcon />
        Open shopping cart{cartCount ? ` (${cartCount})` : ""}
      </Link>
    </section>
  );
}

export function BottomLinks({ cartCount, onRestart }: { cartCount: number; onRestart: () => void }) {
  return (
    <div className="flex flex-col gap-2">
      {cartCount > 0 && (
        <Link href="/cart" className={cn(buttonVariants({ variant: "outline" }), "h-12 text-base")}>
          <ShoppingCartIcon />
          Shopping cart ({cartCount})
        </Link>
      )}
      <Button variant="ghost" onClick={onRestart}>
        Back to start
      </Button>
    </div>
  );
}
