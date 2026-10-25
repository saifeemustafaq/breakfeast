import { Suspense } from "react";
import { ActivityProvider } from "@/components/activity/activity-provider";
import { AppMenu } from "@/components/app-menu";
import { BottomNav } from "@/components/bottom-nav";
import { APP_SCROLL_ID, NavTracker } from "@/components/navigation";
import { Toaster } from "@/components/ui/sonner";
import { getUserPage } from "@/lib/auth/guards";

/**
 * The shell is pinned to the viewport and only `main` scrolls, so rubber-band overscroll can't
 * drag the header or tab bar, and nothing can slide underneath them.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <div className="fixed inset-0 flex flex-col overflow-hidden">
        <Suspense>
          <AppMenu
            identity={
              <Suspense fallback={null}>
                <Identity />
              </Suspense>
            }
          />
        </Suspense>
        <main
          id={APP_SCROLL_ID}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]"
        >
          <div className="mx-auto flex min-h-full w-full max-w-md flex-col px-5 pt-6 pb-10">
            {children}
          </div>
        </main>
        <Suspense>
          <BottomNav />
          <NavTracker />
        </Suspense>
      </div>
      <Suspense>
        <ActivityProvider />
      </Suspense>
      <Toaster position="top-center" theme="light" />
    </>
  );
}

/** Streams in so the menu stays part of the static shell. */
async function Identity() {
  const auth = await getUserPage();
  return auth ? `Signed in as ${auth.user.name}` : null;
}
