/**
 * Selective skill scaffolding for profile-based skill loading.
 *
 * Classifies skills as 'core' or 'extended' and filters the skill set
 * based on a profile level (minimal, standard, full).
 *
 * Core skills are essential workflow skills that are always included
 * in minimal and above profiles. Extended skills provide additional
 * functionality for standard and full profiles.
 *
 * @module skills/scaffolding
 */
import { z } from "zod";

// ─── Schemas ───────────────────────────────────────────────────────────────────

/**
 * Skill classification: core skills are essential, extended are optional.
 */
export const skillClassificationSchema = z.enum(["core", "extended"]);
export type SkillClassification = z.infer<typeof skillClassificationSchema>;

/**
 * Profile levels that determine which skills to load.
 */
export const skillProfileSchema = z.enum(["minimal", "standard", "full"]);
export type SkillProfile = z.infer<typeof skillProfileSchema>;

/**
 * Result of scaffolding: filtered skill names with their classifications.
 */
export const scaffoldResultSchema = z.object({
  profile: skillProfileSchema,
  skills: z.array(z.string()),
  core_count: z.number().int().nonnegative(),
  extended_count: z.number().int().nonnegative(),
});
export type ScaffoldResult = z.infer<typeof scaffoldResultSchema>;

// ─── Core Skills ───────────────────────────────────────────────────────────────

/**
 * Core skills that are always included in minimal+ profiles.
 *
 * These are the essential workflow skills for Luca operation:
 * - git-commit: Version control
 * - phase-execute: Phase execution
 * - phase-plan: Phase planning
 * - progress: Progress tracking
 * - lu: Unified entry point
 * - autopilot: Autonomous execution
 */
const CORE_SKILL_NAMES = new Set([
  "git-commit",
  "phase-execute",
  "phase-plan",
  "progress",
  "lu",
  "autopilot",
]);

// ─── Classification ────────────────────────────────────────────────────────────

/**
 * Classify a skill as 'core' or 'extended' based on its name.
 *
 * @param skillName - The kebab-case skill name (e.g., "git-commit", "debug")
 * @returns 'core' if the skill is essential, 'extended' otherwise
 *
 * @example
 * ```typescript
 * classifySkill("git-commit")  // => "core"
 * classifySkill("debug")       // => "extended"
 * ```
 */
export function classifySkill(skillName: string): SkillClassification {
  return CORE_SKILL_NAMES.has(skillName) ? "core" : "extended";
}

// ─── Scaffolding ───────────────────────────────────────────────────────────────

/**
 * Filter a set of skill names based on a profile level.
 *
 * - **minimal**: Only core skills
 * - **standard**: Core + extended skills
 * - **full**: All skills (same as standard, future-proof for additional tiers)
 *
 * @param profile - The skill profile level
 * @param availableSkills - Array of all available skill names
 * @returns Filtered skill names with counts
 *
 * @example
 * ```typescript
 * const result = scaffoldSkillSet("minimal", Object.keys(skillRegistry));
 * // result.skills contains only core skills
 * ```
 */
export function scaffoldSkillSet(
  profile: SkillProfile,
  availableSkills: string[],
): ScaffoldResult {
  const coreSkills: string[] = [];
  const extendedSkills: string[] = [];

  for (const name of availableSkills) {
    if (classifySkill(name) === "core") {
      coreSkills.push(name);
    } else {
      extendedSkills.push(name);
    }
  }

  let skills: string[];

  switch (profile) {
    case "minimal":
      skills = coreSkills;
      break;
    case "standard":
    case "full":
      skills = [...coreSkills, ...extendedSkills];
      break;
  }

  return {
    profile,
    skills,
    core_count: coreSkills.length,
    extended_count: profile === "minimal" ? 0 : extendedSkills.length,
  };
}
