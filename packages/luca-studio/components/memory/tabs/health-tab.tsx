"use client";

import type { MutableRefObject } from "react";

import { ErrorBoundary } from "~/components/shared/error-boundary";
import { LoadingSkeleton } from "~/components/shared/loading-skeleton";
import { VaultOverview } from "~/components/vault/vault-overview";
import { CoherenceMetrics } from "~/components/vault/coherence-metrics";
import { EngramTypeBreakdown } from "~/components/vault/engram-type-breakdown";
import { StorageInfo } from "~/components/vault/storage-info";
import { useVaultHealth } from "~/hooks/use-vault-health";

/**
 * Health tab for the Memory page.
 *
 * Renders the Vault Health deep-dive (absorbed from the standalone
 * vault page). Mounts useVaultHealth internally so health data is
 * only fetched when this tab is active.
 *
 * @returns The health tab content with overview, coherence, breakdown, and storage
 */
export function HealthTab({ onRefreshRef }: HealthTabProps) {
  const { overview, coherence, typeBreakdown, loading, refresh } =
    useVaultHealth();

  // Expose refresh to parent via mutable ref
  if (onRefreshRef) {
    onRefreshRef.current = refresh;
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <LoadingSkeleton variant="card" />
        <LoadingSkeleton variant="card" />
        <LoadingSkeleton variant="text" rows={6} />
        <LoadingSkeleton variant="card" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview stats cards */}
      <ErrorBoundary name="VaultOverview">
        <VaultOverview overview={overview} />
      </ErrorBoundary>

      {/* Coherence metrics */}
      <ErrorBoundary name="CoherenceMetrics">
        <CoherenceMetrics coherence={coherence} />
      </ErrorBoundary>

      {/* Engram type breakdown */}
      <ErrorBoundary name="EngramTypeBreakdown">
        <EngramTypeBreakdown breakdown={typeBreakdown} />
      </ErrorBoundary>

      {/* Storage details */}
      <ErrorBoundary name="StorageInfo">
        <StorageInfo overview={overview} />
      </ErrorBoundary>
    </div>
  );
}

/** Props for the HealthTab component. */
export interface HealthTabProps {
  /** Mutable ref to expose the tab's refresh function to the parent. */
  onRefreshRef?: MutableRefObject<(() => void) | null>;
}
