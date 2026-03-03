import filter from "lodash/filter";

import type { Rebuttal } from "../__schemas/tribunal.schemas";

/**
 * Counts of each rebuttal resolution type.
 *
 * Used by tribunal result builders and consensus summary generators
 * to avoid duplicating the filter-by-resolution pattern.
 */
export interface ResolutionCounts {
  /** Number of rebuttals where the finding was upheld */
  upheld: number;
  /** Number of rebuttals where the finding was withdrawn */
  withdrawn: number;
  /** Number of rebuttals where the finding was modified */
  modified: number;
}

/**
 * Count rebuttals by resolution status.
 *
 * Replaces the repeated pattern of filtering rebuttals three times
 * (upheld/withdrawn/modified) and taking `.length` of each result.
 *
 * @param rebuttals - Array of completed rebuttal records
 * @returns Object with counts for each resolution type
 *
 * @example
 * ```typescript
 * const counts = countResolutions(rebuttals);
 * // { upheld: 3, withdrawn: 1, modified: 2 }
 * ```
 */
export function countResolutions(rebuttals: Rebuttal[]): ResolutionCounts {
  return {
    upheld: filter(rebuttals, (r) => r.resolution === "upheld").length,
    withdrawn: filter(rebuttals, (r) => r.resolution === "withdrawn").length,
    modified: filter(rebuttals, (r) => r.resolution === "modified").length,
  };
}
