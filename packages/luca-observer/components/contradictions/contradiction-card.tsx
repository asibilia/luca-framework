"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Card, CardContent } from "~/components/ui/card";

import type { ContradictionPair } from "~/hooks/use-contradictions";

/**
 * Side-by-side card showing a pair of contradicting memories.
 *
 * Displays Memory A on the left, the conflict reason in the center,
 * and Memory B on the right. Each side has a "Forget" action and a
 * "View in Memory" link for cross-view navigation.
 *
 * Responsive: stacks vertically on narrow screens (below md breakpoint).
 *
 * @param contradiction - The contradiction pair data
 * @param onForget - Async callback to forget a specific engram by ID
 * @param forgettingId - The engram ID currently being forgotten (null if idle)
 */
export function ContradictionCard({
  contradiction,
  onForget,
  forgettingId,
}: {
  contradiction: ContradictionPair;
  onForget: (engramId: string) => Promise<boolean>;
  forgettingId: string | null;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col md:flex-row">
        {/* Memory A */}
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">
            {contradiction.concept_a}
          </p>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void onForget(contradiction.id_a)}
              disabled={forgettingId !== null}
              className="text-xs text-destructive hover:underline disabled:opacity-50"
            >
              {forgettingId === contradiction.id_a ? "Forgetting..." : "Forget"}
            </button>
            <Link
              href={`/memory?entity=${encodeURIComponent(contradiction.concept_a)}`}
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              View in Memory
            </Link>
          </div>
        </div>

        {/* Conflict Reason (center) */}
        <div className="my-3 flex flex-shrink-0 flex-col items-center justify-center border-t border-border px-4 pt-3 md:my-0 md:border-l md:border-t-0 md:pt-0">
          <AlertTriangle className="mb-1 h-4 w-4 text-muted-foreground" />
          <p className="max-w-48 text-center text-sm italic text-muted-foreground">
            {contradiction.reason}
          </p>
        </div>

        {/* Memory B */}
        <div className="flex-1 border-t border-border pt-3 md:border-l md:border-t-0 md:pl-4 md:pt-0">
          <p className="text-sm font-semibold text-foreground">
            {contradiction.concept_b}
          </p>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void onForget(contradiction.id_b)}
              disabled={forgettingId !== null}
              className="text-xs text-destructive hover:underline disabled:opacity-50"
            >
              {forgettingId === contradiction.id_b ? "Forgetting..." : "Forget"}
            </button>
            <Link
              href={`/memory?entity=${encodeURIComponent(contradiction.concept_b)}`}
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              View in Memory
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
