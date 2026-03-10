"use client";

import { Badge } from "~/components/ui/badge";

/**
 * MuninnDB connection status indicator.
 *
 * Shows a green "Connected" or gray "Disconnected" badge
 * based on whether MuninnDB is reachable.
 */
export function ConnectionStatus({ configured }: { configured: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="h-2 w-2 rounded-full"
        style={{
          backgroundColor: configured
            ? "var(--color-success)"
            : "var(--color-muted-foreground)",
        }}
      />
      <span className="font-mono text-xs text-muted-foreground">
        {configured ? "MuninnDB Connected" : "MuninnDB Disconnected"}
      </span>
    </div>
  );
}
