"use client";

import { RULE_LIST_CONFIG } from "~/hooks/schemas/entity-hook-config";
import { useEntityList } from "~/hooks/use-entity-list";

import type { EntitySummary } from "~/lib/entity-route-helpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UseRuleListReturn = {
  /** Array of rule summaries from the API. */
  rules: EntitySummary[];
  /** Whether the rule list is currently loading. */
  loading: boolean;
  /** Error message if the fetch failed. */
  error: string | null;
  /** Manually refetch the rule list. */
  refresh: () => void;
};

// ---------------------------------------------------------------------------
// Thin wrapper
// ---------------------------------------------------------------------------

/**
 * Fetches the rule list from `/api/entities/rules`.
 *
 * Delegates to the generic `useEntityList` and renames `entities` to
 * `rules` for backward compatibility with existing consumers.
 *
 * @returns Rule list data and status indicators.
 *
 * @example
 * ```ts
 * const { rules, loading, error, refresh } = useRuleList();
 * ```
 */
export function useRuleList(): UseRuleListReturn {
  const { entities, loading, error, refresh } = useEntityList(RULE_LIST_CONFIG);
  return { rules: entities, loading, error, refresh };
}
