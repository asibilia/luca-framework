"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";

import { Provider as JotaiProvider, useAtomValue } from "jotai";

import { TooltipProvider } from "~/components/ui/tooltip";
import { useSSE } from "~/hooks/use-sse";
import { themeAtom } from "~/stores/theme";

/**
 * Syncs the Jotai theme atom value to the document's `<html>` className.
 *
 * Uses shadcn convention: `.dark` class for dark mode, no class for light.
 * The `:root` CSS variables apply for light mode by default.
 */
function ThemeSync() {
  const theme = useAtomValue(themeAtom);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme]);

  return null;
}

/**
 * Connects to the SSE file-change stream and invalidates Jotai atoms
 * when server-side files change on disk.
 *
 * Renders nothing -- purely a side-effect component, same pattern as
 * `ThemeSync` above.
 */
function SSESync() {
  useSSE();
  return null;
}

/**
 * Client-side providers wrapper.
 *
 * Wraps children with:
 * - Jotai provider for global state management
 * - Theme sync for dark/light mode
 * - SSE sync for live file-change atom invalidation
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <JotaiProvider>
      <TooltipProvider>
        <ThemeSync />
        <SSESync />
        {children}
      </TooltipProvider>
    </JotaiProvider>
  );
}
