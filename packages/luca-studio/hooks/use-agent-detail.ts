"use client";

import { AGENT_DETAIL_CONFIG } from "~/hooks/schemas/entity-hook-config";
import { useEntityDetail } from "~/hooks/use-entity-detail";

// ---------------------------------------------------------------------------
// Thin wrapper
// ---------------------------------------------------------------------------

/**
 * Fetches a single agent's full config from `/api/entities/agents/[name]` and
 * populates the corresponding `agentDraftAtom(name)`.
 *
 * Delegates to the generic `useEntityDetail` with agent-specific configuration.
 * Preserves the original API surface for backward compatibility.
 *
 * @param name - Kebab-case agent name, or null to skip fetching.
 * @returns Agent detail data, status indicators, and the ETag for concurrency.
 *
 * @example
 * ```ts
 * const { detail, loading, error, etag, refresh } = useAgentDetail("lu-router");
 * ```
 */
export function useAgentDetail(name: string | null) {
  return useEntityDetail(name, AGENT_DETAIL_CONFIG);
}
