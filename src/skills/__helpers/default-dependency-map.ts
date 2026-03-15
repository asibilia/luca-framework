/**
 * Default dependency map for core Luca workflow skills.
 *
 * Captures the natural ordering constraints between skills in the
 * standard workflow pipeline:
 *
 *   phase-discuss / phase-research -> phase-plan -> phase-execute -> verify -> milestone-complete
 *
 * Also captures mutual exclusion constraints (e.g., git-commit must
 * not run concurrently with phase-execute).
 *
 * T2-compliant: imports only from local schemas (T2).
 */
import type { SkillDependencyMap } from "../__schemas/skill-dependencies.schemas";
import { SkillDependencySchema } from "../__schemas/skill-dependencies.schemas";

/**
 * Build the default dependency map for core workflow skills.
 *
 * Uses SkillDependencySchema.parse() for each entry to apply schema
 * defaults and validate the structure.
 *
 * @returns A validated SkillDependencyMap with core workflow constraints
 *
 * @example
 * ```typescript
 * const deps = createDefaultDependencyMap();
 * const order = buildDependencyOrder(deps, ["phase-execute", "phase-plan"]);
 * // ["phase-plan", "phase-execute"]
 * ```
 */
export function createDefaultDependencyMap(): SkillDependencyMap {
  return {
    "phase-discuss": SkillDependencySchema.parse({
      skill_name: "phase-discuss",
      parallel_safe: true,
    }),

    "phase-research": SkillDependencySchema.parse({
      skill_name: "phase-research",
      parallel_safe: true,
    }),

    "phase-plan": SkillDependencySchema.parse({
      skill_name: "phase-plan",
      required_before: ["phase-discuss", "phase-research"],
      parallel_safe: true,
    }),

    "phase-execute": SkillDependencySchema.parse({
      skill_name: "phase-execute",
      required_before: ["phase-plan"],
      mutually_exclusive: ["git-commit"],
      parallel_safe: false,
    }),

    verify: SkillDependencySchema.parse({
      skill_name: "verify",
      required_before: ["phase-execute"],
      parallel_safe: true,
    }),

    "milestone-complete": SkillDependencySchema.parse({
      skill_name: "milestone-complete",
      required_before: ["verify"],
      parallel_safe: true,
    }),

    "git-commit": SkillDependencySchema.parse({
      skill_name: "git-commit",
      mutually_exclusive: ["phase-execute"],
      parallel_safe: false,
    }),
  };
}
