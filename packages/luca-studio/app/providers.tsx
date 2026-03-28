"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";

import { Provider as JotaiProvider, useAtom, useAtomValue } from "jotai";

import { TooltipProvider } from "~/components/ui/tooltip";
import { useSSE } from "~/hooks/use-sse";
import { themeAtom } from "~/stores/theme";
import { vaultAtom } from "~/stores/vault";

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
 * Auto-detects the repo vault from `/api/config` on first visit.
 *
 * When the vault atom is still "default" (initial value, no user override
 * persisted in localStorage), fetches the project config and updates to
 * the repo vault name (e.g. "luca-framework"). If the user has already
 * selected a vault via the VaultSelector, this is a no-op. Fails silently
 * on network errors — "default" remains as the safe fallback.
 */
function VaultAutoDetect() {
  const [vault, setVault] = useAtom(vaultAtom);

  useEffect(() => {
    if (vault !== "default") return;

    let cancelled = false;

    async function detectVault() {
      try {
        const res = await fetch("/api/config");
        if (!res.ok) return;
        const config = (await res.json()) as Record<string, unknown>;
        const muninn = config.muninn as Record<string, unknown> | undefined;
        const repoVault =
          typeof muninn?.vault === "string" ? muninn.vault : null;

        if (repoVault && repoVault !== "default" && !cancelled) {
          setVault(repoVault);
        }
      } catch {
        // Graceful degradation — keep "default"
      }
    }

    void detectVault();
    return () => {
      cancelled = true;
    };
  }, [vault, setVault]);

  return null;
}

/**
 * Client-side providers wrapper.
 *
 * Wraps children with:
 * - Jotai provider for global state management
 * - Theme sync for dark/light mode
 * - SSE sync for live file-change atom invalidation
 * - Vault auto-detect for repo vault initialization
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <JotaiProvider>
      <TooltipProvider>
        <ThemeSync />
        <SSESync />
        <VaultAutoDetect />
        {children}
      </TooltipProvider>
    </JotaiProvider>
  );
}
