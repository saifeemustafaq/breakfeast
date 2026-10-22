import { Suspense } from "react";
import { ActivityProvider } from "@/components/activity/activity-provider";
import { BottomNav } from "@/components/bottom-nav";
import { Toaster } from "@/components/ui/sonner";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-28">
        {children}
      </main>
      <Suspense>
        <BottomNav />
        <ActivityProvider />
      </Suspense>
      <Toaster position="top-center" theme="light" />
    </>
  );
}
