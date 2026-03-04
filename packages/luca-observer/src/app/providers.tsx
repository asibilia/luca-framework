"use client";

import { Provider as JotaiProvider } from "jotai";

import type { ReactNode } from "react";

/**
 * Client-side providers wrapper.
 *
 * Wraps children with Jotai provider for global state management.
 */
export function Providers({ children }: { children: ReactNode }) {
  return <JotaiProvider>{children}</JotaiProvider>;
}
