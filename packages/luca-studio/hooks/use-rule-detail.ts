"use client";

import { RULE_DETAIL_CONFIG } from "~/hooks/schemas/entity-hook-config";
import { useEntityDetail } from "~/hooks/use-entity-detail";

// ---------------------------------------------------------------------------
// Thin wrapper
// ---------------------------------------------------------------------------

/**
 * Fetches a single rule's full config from `/api/entities/rules/[name]` and
 * populates the corresponding `ruleDraftAtom(name)`.
 *
 * Delegates to the generic `useEntityDetail` with rule-specific configuration.
 * Preserves the original API surface for backward compatibility.
 *
 * @param name - Kebab-case rule name, or null to skip fetching.
 * @returns Rule detail data, status indicators, and the ETag for concurrency.
 *
 * @example
 * ```ts
 * const { detail, loading, error, etag, refresh } = useRuleDetail("no-classes");
 * ```
 */
export function useRuleDetail(name: string | null) {
  return useEntityDetail(name, RULE_DETAIL_CONFIG);
}
