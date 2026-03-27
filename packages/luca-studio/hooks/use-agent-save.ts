"use client";

import { AGENT_SAVE_CONFIG } from "~/hooks/schemas/entity-hook-config";
import { useEntitySave } from "~/hooks/use-entity-save";

// ---------------------------------------------------------------------------
// Thin wrapper
// ---------------------------------------------------------------------------

/**
 * Save and discard logic for a single agent, including ETag concurrency.
 *
 * Delegates to the generic `useEntitySave` with agent-specific configuration.
 * Preserves the original API surface for backward compatibility.
 *
 * @param name - Kebab-case agent name, or null to return no-ops.
 * @param etag - ETag from the last successful GET, used for If-Match.
 * @returns Object with save and discard callbacks.
 *
 * @example
 * ```ts
 * const { save, discard } = useAgentSave("lu-router", etag);
 * ```
 */
export function useAgentSave(name: string | null, etag: string | null) {
  return useEntitySave(name, etag, AGENT_SAVE_CONFIG);
}
