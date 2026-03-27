"use client";

import { SKILL_DETAIL_CONFIG } from "~/hooks/schemas/entity-hook-config";
import { useEntityDetail } from "~/hooks/use-entity-detail";

// ---------------------------------------------------------------------------
// Thin wrapper
// ---------------------------------------------------------------------------

/**
 * Fetches a single skill's full config from `/api/entities/skills/[name]` and
 * populates the corresponding `skillDraftAtom(name)`.
 *
 * Delegates to the generic `useEntityDetail` with skill-specific configuration.
 * Preserves the original API surface for backward compatibility.
 *
 * @param name - Kebab-case skill name, or null to skip fetching.
 * @returns Skill detail data, status indicators, and the ETag for concurrency.
 *
 * @example
 * ```ts
 * const { detail, loading, error, etag, refresh } = useSkillDetail("git-commit");
 * ```
 */
export function useSkillDetail(name: string | null) {
  return useEntityDetail(name, SKILL_DETAIL_CONFIG);
}
