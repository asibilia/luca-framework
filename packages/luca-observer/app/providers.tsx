"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";

import { Provider as JotaiProvider, useAtomValue } from "jotai";

import { themeAtom } from "~/stores/theme";

/**
 * Syncs the Jotai theme atom value to the document's `<html>` className.
 *
 * Runs as an effect inside the JotaiProvider tree so that the atom
 * value is available. Sets "dark" or "light" class on `<html>`.
 */
function ThemeSync() {
  const theme = useAtomValue(themeAtom);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark", "light");
    root.classList.add(theme);
  }, [theme]);

  return null;
}

/**
 * Client-side providers wrapper.
 *
 * Wraps children with Jotai provider for global state management
 * and syncs the theme class to the document root element.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <JotaiProvider>
      <ThemeSync />
      {children}
    </JotaiProvider>
  );
}
