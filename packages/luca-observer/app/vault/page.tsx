"use client";

import { PageContainer } from "~/components/layout/page-container";
import { ErrorBoundary } from "~/components/shared/error-boundary";
import { LoadingSkeleton } from "~/components/shared/loading-skeleton";
import { VaultOverview } from "~/components/vault/vault-overview";
import { CoherenceMetrics } from "~/components/vault/coherence-metrics";
import { EngramTypeBreakdown } from "~/components/vault/engram-type-breakdown";
import { StorageInfo } from "~/components/vault/storage-info";
import { useVaultHealth } from "~/hooks/use-vault-health";
import { relativeTime } from "~/lib/format";

/**
 * Vault Health Dashboard page.
 *
 * Displays operational health metrics for MuninnDB: overview stats,
 * coherence scores, engram type breakdown, and storage details.
 * Follows the Learning Evolution page pattern: PageContainer with
 * actions bar (last updated + refresh), loading skeletons, and
 * ErrorBoundary wrappers.
 */
export default function VaultPage() {
  const { overview, coherence, typeBreakdown, loading, lastUpdated, refresh } =
    useVaultHealth();

  const lastUpdatedText = lastUpdated
    ? `Last updated: ${relativeTime(lastUpdated)}`
    : null;

  return (
    <PageContainer
      title="Vault"
      subtitle="MuninnDB Vault Health"
      actions={
        <div className="flex items-center gap-3">
          {lastUpdatedText && (
            <span className="font-mono text-xs text-muted-foreground/60">
              {lastUpdatedText}
            </span>
          )}

          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      }
    >
      {loading ? (
        <div className="space-y-6">
          <LoadingSkeleton variant="card" />
          <LoadingSkeleton variant="card" />
          <LoadingSkeleton variant="text" rows={6} />
          <LoadingSkeleton variant="card" />
        </div>
      ) : (
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
      )}
    </PageContainer>
  );
}
