"use client";

import { EmptyState } from "~/components/shared/empty-state";
import { Card, CardContent } from "~/components/ui/card";
import { formatBytes } from "~/lib/format";

import type { VaultOverviewStats } from "~/hooks/use-vault-health";

/**
 * Stat card configuration for the vault overview grid.
 *
 * Each entry maps a stats field to its display label, formatter,
 * and optional CSS color token for the count value.
 */
const STAT_CARDS: Array<{
  key: keyof VaultOverviewStats;
  label: string;
  colorVar: string | null;
  format: (value: number) => string;
}> = [
  {
    key: "engram_count",
    label: "Engrams",
    colorVar: "var(--color-chart-2)",
    format: (v) => v.toLocaleString(),
  },
  {
    key: "vault_count",
    label: "Vaults",
    colorVar: "var(--color-info)",
    format: (v) => v.toLocaleString(),
  },
  {
    key: "index_size",
    label: "Index Size",
    colorVar: "var(--color-success)",
    format: (v) => v.toLocaleString(),
  },
  {
    key: "storage_bytes",
    label: "Storage",
    colorVar: "var(--color-warning)",
    format: formatBytes,
  },
];

/**
 * Top-level stats cards for the Vault Health Dashboard.
 *
 * Renders 4 cards in a responsive grid showing engram count, vault count,
 * index size, and storage usage. If all counts are 0, renders an EmptyState.
 *
 * @param overview - Vault overview stats from useVaultHealth hook
 */
export function VaultOverview({ overview }: { overview: VaultOverviewStats }) {
  const allZero =
    overview.engram_count === 0 &&
    overview.vault_count === 0 &&
    overview.index_size === 0 &&
    overview.storage_bytes === 0;

  if (allZero) {
    return (
      <EmptyState
        title="No Vault Data"
        message="MuninnDB vault statistics will appear here once available."
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {STAT_CARDS.map((card) => (
        <Card key={card.key} size="sm">
          <CardContent>
            <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              {card.label}
            </p>
            <p
              className="mt-1 font-mono text-2xl font-bold"
              style={card.colorVar ? { color: card.colorVar } : undefined}
            >
              {card.format(overview[card.key])}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
