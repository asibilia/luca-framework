"use client";

import { formatBytes } from "~/lib/format";

import type { VaultOverviewStats } from "~/hooks/use-vault-health";

/**
 * Storage metric row configuration.
 *
 * Maps storage-related fields to display labels and formatters.
 */
const STORAGE_ROWS: Array<{
  label: string;
  getValue: (overview: VaultOverviewStats) => string;
}> = [
  {
    label: "Total Storage",
    getValue: (o) => formatBytes(o.storage_bytes),
  },
  {
    label: "Index Entries",
    getValue: (o) => o.index_size.toLocaleString(),
  },
  {
    label: "Avg Engram Size",
    getValue: (o) =>
      o.engram_count > 0
        ? formatBytes(Math.round(o.storage_bytes / o.engram_count))
        : "--",
  },
];

/**
 * Storage metrics card for the Vault Health Dashboard.
 *
 * Displays detailed storage information including total storage,
 * index entry count, and average engram size. Skips rendering
 * when storage is 0 (no data).
 *
 * @param overview - Vault overview stats from useVaultHealth hook
 */
export function StorageInfo({ overview }: { overview: VaultOverviewStats }) {
  if (overview.storage_bytes === 0 && overview.index_size === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          Storage Details
        </p>
      </div>

      <div className="flex flex-col gap-3 p-4">
        {STORAGE_ROWS.map((row) => (
          <div key={row.label} className="flex items-center justify-between">
            <span className="font-mono text-xs text-muted-foreground">
              {row.label}
            </span>
            <span className="font-mono text-sm font-medium">
              {row.getValue(overview)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
