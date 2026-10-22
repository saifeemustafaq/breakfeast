"use client";

import { createContext, useContext, useState } from "react";
import { Toaster } from "sonner";
import { ReauthProvider } from "./reauth";

const PortalContext = createContext<HTMLElement | null>(null);

/** Overlays render inside the admin root so they inherit its tokens. */
export const usePortalContainer = () => useContext(PortalContext);

export function AdminRoot({ children }: { children: React.ReactNode }) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  return (
    <div data-admin-root ref={setRoot}>
      <PortalContext.Provider value={root}>
        <ReauthProvider>{children}</ReauthProvider>
        <Toaster position="bottom-right" duration={4000} theme="light" />
      </PortalContext.Provider>
    </div>
  );
}
