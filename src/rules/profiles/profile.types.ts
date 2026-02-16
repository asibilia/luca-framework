/**
 * Tech Stack Profile types for the Luca Framework
 *
 * Profiles group tech-stack-specific rules (e.g. TypeScript, Python, Go)
 * so they can be toggled on/off via config. Each profile contains a set of
 * rule factories keyed by rule name.
 */
import type { BaseRule } from "../types/rule.types";

/**
 * A tech stack profile that bundles related rules.
 *
 * @example
 * ```typescript
 * const typescriptProfile: TechStackProfile = {
 *   name: "typescript",
 *   description: "TypeScript/JavaScript conventions and best practices",
 *   rules: {
 *     "no-classes": () => new NoClassesRule(),
 *     "import-standards": () => new ImportStandardsRule(),
 *   },
 * }
 * ```
 */
export interface TechStackProfile {
  /** Unique identifier for the profile (e.g. "typescript", "python") */
  name: string;
  /** Human-readable description of what this profile covers */
  description: string;
  /** Map of rule name to factory function that creates the rule instance */
  rules: Record<string, () => BaseRule>;
}
