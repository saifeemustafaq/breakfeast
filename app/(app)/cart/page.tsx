import { Suspense } from "react";
import { CartView } from "@/components/cart-view";
import { PageSkeleton } from "@/components/page-skeleton";
import { getAppState } from "@/lib/data";

export const metadata = { title: "Shopping cart · Breakfeast" };

export default function CartPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Cart />
    </Suspense>
  );
}

async function Cart() {
  const state = await getAppState();
  return <CartView initial={state} />;
}
