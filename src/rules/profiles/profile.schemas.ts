/**
 * Zod schemas for tech stack profile configuration.
 *
 * These schemas validate the profile-related fields in .planning/config.json,
 * specifically the workflow section's opinionated_guidelines toggle and
 * tech_stack_profiles array.
 *
 * **CRITICAL**: Uses snake_case for config properties per API conventions.
 */
import { z } from "zod";

import type { BaseRule } from "../types/rule.schemas";

/**
 * Schema for profile configuration within the workflow section of config.json.
 *
 * @example
 * ```json
 * {
 *   "opinionated_guidelines": true,
 *   "tech_stack_profiles": ["typescript"]
 * }
 * ```
 */
export const ProfileConfigSchema = z.object({
  /** Whether opinionated tech-stack guidelines are active. Default: true */
  opinionated_guidelines: z.boolean().default(true),
  /** Which tech stack profiles to load. Default: ["typescript"] */
  tech_stack_profiles: z.array(z.string()).default(["typescript"]),
});

/** Inferred TypeScript type from the profile config schema */
export type ProfileConfig = z.infer<typeof ProfileConfigSchema>;

/**
 * A tech stack profile that bundles related rules.
 *
 * @example
 * ```typescript
 * const typescriptProfile: TechStackProfile = {
 *   name: "typescript",
 *   description: "TypeScript/JavaScript conventions and best practices",
 *   rules: {
 *     "no-classes": () => noClassesRule,
 *     "import-standards": () => importStandardsRule,
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
