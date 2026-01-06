"use client";

import { useSyncExternalStore, useEffect, useCallback, useState } from "react";
import { useMemoriContext } from "./MemoriProvider";

/**
 * useMemori Hook
 *
 * Provides a reactive, persistent key-value store interface using Memori.
 * Syncs with localStorage for cross-tab persistence.
 *
 * @param key - The key to store data under.
 * @param defaultValue - The default value if no data exists.
 */
export function useMemori<T = any>(key: string, defaultValue?: T) {
  const memori = useMemoriContext();
  
  // Local loading state to handle hydration/startup
  const [isLoading, setIsLoading] = useState(true);

  // Subscribe to Memori changes
  const subscribe = useCallback(
    (callback: () => void) => {
      if (!memori) return () => {};
      return memori.subscribe((changedKey) => {
        if (changedKey === key) {
          callback();
        }
      });
    },
    [memori, key]
  );

  // Get current value from Memori
  const getSnapshot = () => {
    if (!memori) return defaultValue;
    const val = memori.get<T>(key);
    return val !== undefined ? val : defaultValue;
  };
    
  // Server snapshot for SSR safety
  const getServerSnapshot = () => defaultValue;

  const data = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Hydrate from localStorage on mount and listen for cross-tab updates
  useEffect(() => {
    if (!memori) return;

    const loadFromStorage = () => {
      try {
        const item = localStorage.getItem(key);
        if (item !== null) {
          const parsed = JSON.parse(item);
          // Only update Memori if different to avoid loops/unnecessary updates
          // But Memori.set triggers event, which we want only if value changed.
          // For now, trust Memori/User to handle diff or just set it.
          // We set it so Memori has the data.
           if (JSON.stringify(memori.get(key)) !== item) {
             memori.set(key, parsed);
          }
        } else if (defaultValue !== undefined && memori.get(key) === undefined) {
             // Initialize memori with default if strictly needed
             // memori.set(key, defaultValue);
        }
      } catch (e) {
        console.error(`Error loading key "${key}" from localStorage`, e);
      }
      setIsLoading(false);
    };

    // Initial Load
    loadFromStorage();

    // Cross-tab Sync
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === key && e.newValue !== null) {
        try {
          memori.set(key, JSON.parse(e.newValue));
        } catch (e) {
          // ignore parse error
        }
      } else if (e.key === key && e.newValue === null) {
          memori.delete(key);
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [memori, key, defaultValue]);

  const set = useCallback(
    (newValue: T) => {
      if (!memori) return;
      
      // Update Memori (triggers React update via useSyncExternalStore)
      memori.set(key, newValue);

      // Persist to localStorage
      try {
        localStorage.setItem(key, JSON.stringify(newValue));
        // Note: setItem does NOT trigger 'storage' event in the SAME tab, only others.
      } catch (e) {
        console.error(`Error saving key "${key}" to localStorage`, e);
      }
    },
    [memori, key]
  );

  const remove = useCallback(() => {
    if (!memori) return;
    memori.delete(key);
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.error(`Error removing key "${key}" from localStorage`, e);
    }
  }, [memori, key]);

  return {
    data,
    set,
    remove,
    isLoading: !memori || isLoading,
  };
}
