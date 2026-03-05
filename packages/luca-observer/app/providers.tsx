"use client";

import { useEffect, useMemo } from "react";
import type { ReactNode } from "react";

import { Provider as JotaiProvider, useAtomValue } from "jotai";
import { SpacetimeDBProvider } from "spacetimedb/react";

import type { ErrorContext } from "~/module_bindings";
import { DbConnection } from "~/module_bindings";
import { SPACETIMEDB_URI, MODULE_NAME } from "~/lib/spacetimedb-config";
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
 * Wraps children with:
 * - Jotai provider for global state management
 * - SpacetimeDBProvider for real-time database subscriptions
 * - Theme sync for dark/light mode
 */
export function Providers({ children }: { children: ReactNode }) {
  const connectionBuilder = useMemo(
    () =>
      DbConnection.builder()
        .withUri(SPACETIMEDB_URI)
        .withDatabaseName(MODULE_NAME)
        .onConnect((conn: DbConnection, _identity, _token: string) => {
          console.info("[SpacetimeDB] Connected");
          conn.subscriptionBuilder().subscribeToAllTables();
        })
        .onConnectError((_ctx: ErrorContext, err: Error) => {
          console.error("[SpacetimeDB] Connection error:", err);
        })
        .onDisconnect((_ctx: ErrorContext) => {
          console.info("[SpacetimeDB] Disconnected");
        }),
    [],
  );

  return (
    <JotaiProvider>
      <SpacetimeDBProvider connectionBuilder={connectionBuilder}>
        <ThemeSync />
        {children}
      </SpacetimeDBProvider>
    </JotaiProvider>
  );
}
