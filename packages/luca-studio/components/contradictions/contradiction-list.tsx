"use client";

import { useState } from "react";

import { EmptyState } from "~/components/shared/empty-state";
import { ErrorBoundary } from "~/components/shared/error-boundary";
import { ContradictionCard } from "~/components/contradictions/contradiction-card";

import type { ContradictionPair } from "~/hooks/use-contradictions";

/**
 * Container list for contradiction pair cards.
 *
 * Renders a summary count, then a vertical list of ContradictionCard
 * components. Manages the `forgettingId` state so only one forget
 * operation runs at a time across all cards.
 *
 * Shows EmptyState when no contradictions exist.
 *
 * @param contradictions - Array of contradiction pairs from the hook
 * @param onForget - Async callback to forget an engram (from useContradictions)
 */
export function ContradictionList({
  contradictions,
  onForget,
}: {
  contradictions: ContradictionPair[];
  onForget: (engramId: string) => Promise<boolean>;
}) {
  const [forgettingId, setForgettingId] = useState<string | null>(null);

  if (contradictions.length === 0) {
    return (
      <EmptyState
        title="No Contradictions"
        message="No contradictions found -- your knowledge base is consistent."
      />
    );
  }

  const handleForget = async (engramId: string): Promise<boolean> => {
    setForgettingId(engramId);
    try {
      const result = await onForget(engramId);
      return result;
    } finally {
      setForgettingId(null);
    }
  };

  const count = contradictions.length;

  return (
    <div role="region" aria-label="Contradiction list">
      {/* Summary */}
      <p className="mb-4 text-sm text-muted-foreground">
        {count} {count === 1 ? "contradiction" : "contradictions"} found
      </p>

      {/* Card list */}
      <div className="space-y-4">
        {contradictions.map((pair) => (
          <ErrorBoundary
            key={`${pair.id_a}-${pair.id_b}`}
            name={`Contradiction:${pair.id_a}-${pair.id_b}`}
          >
            <ContradictionCard
              contradiction={pair}
              onForget={handleForget}
              forgettingId={forgettingId}
            />
          </ErrorBoundary>
        ))}
      </div>
    </div>
  );
}
