/**
 * useHiddenModules — minimal stub.
 *
 * The Sidebar imports this hook for the "Edit menu / hide modules"
 * affordance. The full implementation (server-side per-user persistence
 * in `user.metadata_.sidebar_hidden_modules` with a localStorage cache)
 * landed in the main branch as a TODO and was never merged from its
 * working branch. This stub gives the Sidebar a no-op hook so the app
 * compiles and runs; setHiddenModules writes to localStorage only so
 * the UX still feels stateful within a single browser.
 *
 * Replace with the full server-backed version when wiring is ready.
 */

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'oe.sidebar_hidden_modules';

function readFromStorage(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export interface UseHiddenModulesResult {
  hiddenModules: string[];
  setHiddenModules: (next: string[]) => void;
}

export function useHiddenModules(): UseHiddenModulesResult {
  const [hiddenModules, setLocal] = useState<string[]>(() => readFromStorage());

  // Sync if another tab writes the key.
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setLocal(readFromStorage());
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const setHiddenModules = useCallback((next: string[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore quota / private-mode errors */
    }
    setLocal(next);
  }, []);

  return { hiddenModules, setHiddenModules };
}
