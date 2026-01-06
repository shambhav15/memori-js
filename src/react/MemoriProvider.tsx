"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Memori, MemoriOptions } from "../core/memory";

const MemoriContext = createContext<Memori | null>(null);

export interface MemoriProviderProps {
  config?: MemoriOptions;
  children: React.ReactNode;
}

export const MemoriProvider: React.FC<MemoriProviderProps> = ({ config = {}, children }) => {
  // Use state to hold the instance.
  // We initialize it lazily or inside an effect if we want strict client-only,
  // but usually Memori (Vector Store) is heavy and might be desired on server too?
  // The user prompt says: "Ensure the Memori instance is initialized inside a useMemo or a useEffect to prevent 'Window is not defined' errors during Server-Side Rendering."
  // Actually, Memori core (sqlite-vec) is Node/Server compatible.
  // But if the user wants it specifically for Client React, we should probably stick to client-side init to avoid serialization issues or double init.
  // Also "Make it 'Client Only' by ensuring the storage driver ... is only accessed after ..." (referring to Hook logic mostly, but let's be safe).

  const [memoriInstance, setMemoriInstance] = useState<Memori | null>(null);

  useEffect(() => {
    // Initialize on client side only
    const instance = new Memori(config);
    setMemoriInstance(instance);
  }, []); // Run once on mount

  // If we want it available immediately during SSR (if compatible), we'd use useMemo.
  // But the prompt explicitly warned about "Window is not defined" and "SSR Guard".
  // So useEffect (Client Side only) is the safest bet for the "Provider" request.
  
  // However, if we return null, children might render before Memori is ready.
  // The user didn't specify a loading state, but standard pattern is to render children only when ready OR provide null context.
  // Let's render children always, but consumers might get null if they access too early (though unlikely if they use the hook which guards usage).

  return (
    <MemoriContext.Provider value={memoriInstance}>
      {children}
    </MemoriContext.Provider>
  );
};

export const useMemoriContext = () => {
  const context = useContext(MemoriContext);
  if (context === undefined) {
    throw new Error("useMemoriContext must be used within a MemoriProvider");
  }
  return context;
};
