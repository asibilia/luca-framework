"use client";

import { SKILL_SAVE_CONFIG } from "~/hooks/schemas/entity-hook-config";
import { useEntitySave } from "~/hooks/use-entity-save";

// ---------------------------------------------------------------------------
// Thin wrapper
// ---------------------------------------------------------------------------

/**
 * Save and discard logic for a single skill, including ETag concurrency.
 *
 * Delegates to the generic `useEntitySave` with skill-specific configuration.
 * Preserves the original API surface for backward compatibility.
 *
 * @param name - Kebab-case skill name, or null to return no-ops.
 * @param etag - ETag from the last successful GET, used for If-Match.
 * @returns Object with save and discard callbacks.
 *
 * @example
 * ```ts
 * const { save, discard } = useSkillSave("git-commit", etag);
 * ```
 */
export function useSkillSave(name: string | null, etag: string | null) {
  return useEntitySave(name, etag, SKILL_SAVE_CONFIG);
}
