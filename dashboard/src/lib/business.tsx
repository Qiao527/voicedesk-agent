import { createContext, useContext, type ReactNode } from "react";
import { api } from "./api";
import type { Business } from "./types";
import { useAsync } from "./use-async";

interface BusinessState {
  business: Business | undefined;
  timeZone: string;
  loading: boolean;
  error: Error | null;
  setBusiness: (b: Business) => void;
}

const BusinessContext = createContext<BusinessState | null>(null);

/** Loads the signed-in owner's business once; pages use its time zone for display. */
export function BusinessProvider({ children }: { children: ReactNode }) {
  const { data, loading, error, setData } = useAsync(() => api.getBusiness());
  return (
    <BusinessContext.Provider
      value={{
        business: data,
        timeZone: data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
        loading,
        error,
        setBusiness: setData,
      }}
    >
      {children}
    </BusinessContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useBusiness(): BusinessState {
  const ctx = useContext(BusinessContext);
  if (!ctx) throw new Error("useBusiness must be used inside BusinessProvider");
  return ctx;
}
