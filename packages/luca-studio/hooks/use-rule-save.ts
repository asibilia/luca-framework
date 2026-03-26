"use client";

import { RULE_SAVE_CONFIG } from "~/hooks/schemas/entity-hook-config";
import { useEntitySave } from "~/hooks/use-entity-save";

// ---------------------------------------------------------------------------
// Thin wrapper
// ---------------------------------------------------------------------------

/**
 * Save and discard logic for a single rule, including ETag concurrency.
 *
 * Delegates to the generic `useEntitySave` with rule-specific configuration.
 * Preserves the original API surface for backward compatibility.
 *
 * @param name - Kebab-case rule name, or null to return no-ops.
 * @param etag - ETag from the last successful GET, used for If-Match.
 * @returns Object with save and discard callbacks.
 *
 * @example
 * ```ts
 * const { save, discard } = useRuleSave("no-classes", etag);
 * ```
 */
export function useRuleSave(name: string | null, etag: string | null) {
  return useEntitySave(name, etag, RULE_SAVE_CONFIG);
}
