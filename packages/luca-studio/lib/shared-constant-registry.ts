/**
 * Shared constant registry for entity files that use `${CONSTANT_NAME}` interpolation.
 *
 * Maps the 4 known shared constants to their import paths and resolved values.
 * Used by the round-trip read path (to resolve interpolations before parsing)
 * and the write path (to detect constant-originating content and emit
 * `${CONSTANT_NAME}` references instead of inline text).
 *
 * The 8 agents that use interpolation:
 * - `code-architect`, `code-simplifier`, `dx-advocate`, `performance-auditor`,
 *   `security-auditor` — use `COLD_ISOLATION_BLOCK`
 * - `lu-completeness-reviewer`, `lu-accuracy-reviewer`, `lu-actionability-reviewer`
 *   — use `RESEARCH_REVIEWER_COLD_ISOLATION`, `RESEARCH_REVIEWER_SCORING`,
 *     `RESEARCH_REVIEWER_OUTPUT_CONTRACT`
 *
 * @module shared-constant-registry
 */

import { COLD_ISOLATION_BLOCK } from "~/agents/__helpers/cold-isolation-block";
import {
  RESEARCH_REVIEWER_COLD_ISOLATION,
  RESEARCH_REVIEWER_SCORING,
  RESEARCH_REVIEWER_OUTPUT_CONTRACT,
} from "~/agents/__helpers/research-reviewer-shared-sections";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Registry entry mapping a constant name to its import path and runtime value. */
export interface SharedConstantEntry {
  /** The import path used in source files (e.g. "~/agents/__helpers/cold-isolation-block") */
  importPath: string;
  /** The resolved string value of the constant at build time */
  value: string;
}

/**
 * Registry type: maps constant names to their import metadata and values.
 *
 * @example
 * ```typescript
 * const entry = SHARED_CONSTANT_REGISTRY["COLD_ISOLATION_BLOCK"];
 * console.log(entry.importPath); // "~/agents/__helpers/cold-isolation-block"
 * console.log(entry.value);      // The full cold isolation block text
 * ```
 */
export type SharedConstantRegistry = Record<string, SharedConstantEntry>;

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Frozen registry of all shared constants used in entity file interpolation.
 *
 * Contains the 4 constants referenced via `${CONSTANT_NAME}` in template
 * literals across the 8 interpolation agents.
 */
export const SHARED_CONSTANT_REGISTRY: Readonly<SharedConstantRegistry> =
  Object.freeze({
    COLD_ISOLATION_BLOCK: {
      importPath: "~/agents/__helpers/cold-isolation-block",
      value: COLD_ISOLATION_BLOCK,
    },
    RESEARCH_REVIEWER_COLD_ISOLATION: {
      importPath: "~/agents/__helpers/research-reviewer-shared-sections",
      value: RESEARCH_REVIEWER_COLD_ISOLATION,
    },
    RESEARCH_REVIEWER_SCORING: {
      importPath: "~/agents/__helpers/research-reviewer-shared-sections",
      value: RESEARCH_REVIEWER_SCORING,
    },
    RESEARCH_REVIEWER_OUTPUT_CONTRACT: {
      importPath: "~/agents/__helpers/research-reviewer-shared-sections",
      value: RESEARCH_REVIEWER_OUTPUT_CONTRACT,
    },
  });

/**
 * Set of all known shared constant names for quick lookup.
 *
 * @example
 * ```typescript
 * if (SHARED_CONSTANT_NAMES.has("COLD_ISOLATION_BLOCK")) {
 *   // This is a known shared constant
 * }
 * ```
 */
export const SHARED_CONSTANT_NAMES: ReadonlySet<string> = new Set(
  Object.keys(SHARED_CONSTANT_REGISTRY),
);

/**
 * Look up a shared constant by name.
 *
 * @param name - The constant name (e.g. "COLD_ISOLATION_BLOCK")
 * @returns The registry entry, or undefined if not a known constant
 *
 * @example
 * ```typescript
 * const entry = lookupSharedConstant("COLD_ISOLATION_BLOCK");
 * if (entry) {
 *   console.log(`Import from: ${entry.importPath}`);
 *   console.log(`Value length: ${entry.value.length} chars`);
 * }
 * ```
 */
export function lookupSharedConstant(
  name: string,
): SharedConstantEntry | undefined {
  return SHARED_CONSTANT_REGISTRY[name];
}
