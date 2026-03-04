"use client";

import type { ReactNode } from "react";

import { Provider as JotaiProvider } from "jotai";

/**
 * Client-side providers wrapper.
 *
 * Wraps children with Jotai provider for global state management.
 */
export function Providers({ children }: { children: ReactNode }) {
  return <JotaiProvider>{children}</JotaiProvider>;
}
