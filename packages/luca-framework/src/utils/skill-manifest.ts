import { z } from "zod";

import type { PresetId } from "../types";

/**
 * Skill tier classification.
 *
 * - **core**: Always installed regardless of preset (~12 skills).
 *   Essential for basic workflow: entry point, git, planning, verification.
 * - **standard**: Installed at standard+ presets (~13 additional skills).
 *   Common workflow extensions: research, session management, code quality.
 * - **extended**: Installed at full preset only (~24 additional skills).
 *   Advanced features: Jira integration, milestones, config profiles, audits.
 */
export const SkillTierSchema = z.enum(["core", "standard", "extended"]);
export type SkillTier = z.infer<typeof SkillTierSchema>;

/**
 * Skill category for organizational grouping.
 */
export const SkillCategorySchema = z.enum([
  "git",
  "planning",
  "verification",
  "session",
  "config",
  "workflow",
  "debugging",
  "analysis",
]);
export type SkillCategory = z.infer<typeof SkillCategorySchema>;

/**
 * Schema for a single skill manifest entry.
 *
 * Classifies a skill by its directory name, tier, category,
 * human-readable description, and optional dependencies.
 *
 * @example
 * ```typescript
 * const entry = SkillManifestEntrySchema.parse({
 *   name: "git-commit",
 *   tier: "core",
 *   category: "git",
 *   description: "Create conventional commits with ticket references",
 * });
 * ```
 */
export const SkillManifestEntrySchema = z.object({
  /** Skill directory name (kebab-case, matches template directory) */
  name: z.string().regex(/^[a-z][a-z0-9-]*$/, "Must be kebab-case"),
  /** Installation tier */
  tier: SkillTierSchema,
  /** Organizational category */
  category: SkillCategorySchema,
  /** One-line description of the skill */
  description: z.string().min(1),
  /** Optional array of skill names this skill requires */
  depends_on: z.array(z.string()).optional().default([]),
});
export type SkillManifestEntry = z.infer<typeof SkillManifestEntrySchema>;

/** Input type for static manifest data (depends_on is optional before parsing) */
export type SkillManifestEntryInput = z.input<typeof SkillManifestEntrySchema>;

/**
 * Schema for the complete skill manifest (array of entries).
 */
export const SkillManifestSchema = z.array(SkillManifestEntrySchema);
export type SkillManifest = z.infer<typeof SkillManifestSchema>;

/**
 * Complete skill manifest classifying all 49 skills into tiers.
 *
 * Tier breakdown:
 * - Core (12): Essential workflow skills always installed
 * - Standard (13): Common extensions installed at standard+ presets
 * - Extended (24): Advanced features installed at full preset only
 */
export const SKILL_MANIFEST: SkillManifestEntryInput[] = [
  // ─── Core skills (~12, always installed) ───────────────────────────
  {
    name: "lu",
    tier: "core",
    category: "workflow",
    description: "Entry point router for all Luca commands",
  },
  {
    name: "help",
    tier: "core",
    category: "workflow",
    description: "Show available commands and usage reference",
  },
  {
    name: "quick",
    tier: "core",
    category: "workflow",
    description: "Execute lightweight tasks without full planning",
  },
  {
    name: "git-commit",
    tier: "core",
    category: "git",
    description: "Create conventional commits with ticket references",
  },
  {
    name: "git-feature",
    tier: "core",
    category: "git",
    description: "Create feature branches from tickets",
  },
  {
    name: "pr-create",
    tier: "core",
    category: "git",
    description: "Create pull requests with structured descriptions",
  },
  {
    name: "phase-plan",
    tier: "core",
    category: "planning",
    description: "Generate execution plans for a phase",
  },
  {
    name: "phase-execute",
    tier: "core",
    category: "planning",
    description: "Execute plans with atomic commits and verification",
  },
  {
    name: "phase-discuss",
    tier: "core",
    category: "planning",
    description: "Interactive discussion to refine phase scope",
  },
  {
    name: "verify",
    tier: "core",
    category: "verification",
    description: "Run verification checks on completed work",
  },
  {
    name: "debug",
    tier: "core",
    category: "debugging",
    description: "Systematic debugging with hypothesis tracking",
  },
  {
    name: "session-resume",
    tier: "core",
    category: "session",
    description: "Resume a previous session with context restoration",
  },

  // ─── Standard skills (~13, installed at standard+) ─────────────────
  {
    name: "phase-research",
    tier: "standard",
    category: "planning",
    description: "Research phase requirements before planning",
  },
  {
    name: "phase-add",
    tier: "standard",
    category: "planning",
    description: "Add a new phase to the project roadmap",
  },
  {
    name: "phase-insert",
    tier: "standard",
    category: "planning",
    description: "Insert a phase between existing phases",
  },
  {
    name: "phase-assumptions",
    tier: "standard",
    category: "planning",
    description: "Document and validate phase assumptions",
  },
  {
    name: "session-pause",
    tier: "standard",
    category: "session",
    description: "Pause current session with state preservation",
  },
  {
    name: "session-plan",
    tier: "standard",
    category: "session",
    description: "Plan the next session based on current progress",
  },
  {
    name: "code-lint",
    tier: "standard",
    category: "verification",
    description: "Run linting checks on the codebase",
  },
  {
    name: "code-typecheck",
    tier: "standard",
    category: "verification",
    description: "Run TypeScript type checking",
  },
  {
    name: "todo-add",
    tier: "standard",
    category: "workflow",
    description: "Add a todo item to the planning backlog",
  },
  {
    name: "todo-check",
    tier: "standard",
    category: "workflow",
    description: "Check and update todo item status",
  },
  {
    name: "progress",
    tier: "standard",
    category: "workflow",
    description: "Show project progress and phase status",
  },
  {
    name: "choose",
    tier: "standard",
    category: "workflow",
    description: "Present options and capture user decisions",
  },
  {
    name: "repo-map",
    tier: "standard",
    category: "analysis",
    description: "Generate a structural map of the codebase",
  },

  // ─── Extended skills (~24, installed at full only) ─────────────────
  {
    name: "jira-issue",
    tier: "extended",
    category: "workflow",
    description: "Mirror Jira tickets to GitHub issues",
    depends_on: ["git-feature"],
  },
  {
    name: "pr-address",
    tier: "extended",
    category: "git",
    description: "Address PR review comments systematically",
    depends_on: ["pr-create"],
  },
  {
    name: "milestone-audit",
    tier: "extended",
    category: "planning",
    description: "Audit milestone progress and health",
  },
  {
    name: "milestone-complete",
    tier: "extended",
    category: "planning",
    description: "Mark a milestone as complete with summary",
  },
  {
    name: "milestone-gaps",
    tier: "extended",
    category: "planning",
    description: "Identify gaps in milestone coverage",
  },
  {
    name: "milestone-new",
    tier: "extended",
    category: "planning",
    description: "Create a new project milestone",
  },
  {
    name: "config-profile",
    tier: "extended",
    category: "config",
    description: "Manage configuration profiles",
  },
  {
    name: "config-settings",
    tier: "extended",
    category: "config",
    description: "View and modify framework settings",
  },
  {
    name: "repo-audit",
    tier: "extended",
    category: "analysis",
    description: "Audit repository structure and conventions",
  },
  {
    name: "project-new",
    tier: "extended",
    category: "workflow",
    description: "Scaffold a new project with Luca integration",
  },
  {
    name: "note",
    tier: "extended",
    category: "workflow",
    description: "Capture quick notes during development",
  },
  {
    name: "phase-remove",
    tier: "extended",
    category: "planning",
    description: "Remove a phase from the project roadmap",
  },
  {
    name: "help-tour",
    tier: "extended",
    category: "workflow",
    description: "Interactive tour after project initialization",
  },
  {
    name: "pr-qa-consolidate",
    tier: "extended",
    category: "verification",
    description: "Consolidate QA results across phases",
  },
  {
    name: "test-run",
    tier: "extended",
    category: "verification",
    description: "Run test suite with structured output",
  },
  {
    name: "update",
    tier: "extended",
    category: "workflow",
    description: "Update framework files to latest version",
  },
  {
    name: "workflow-save",
    tier: "extended",
    category: "workflow",
    description: "Save current workflow state for later resumption",
  },
  {
    name: "jira-start",
    tier: "extended",
    category: "workflow",
    description: "Start a saved workflow from checkpoint",
  },
  {
    name: "rule-complexity-gating",
    tier: "extended",
    category: "config",
    description: "Complexity gating rule configuration",
  },
  {
    name: "rule-file-naming",
    tier: "extended",
    category: "config",
    description: "File naming convention rule configuration",
  },
  {
    name: "rule-harness-verification",
    tier: "extended",
    category: "config",
    description: "Harness verification boundary rule configuration",
  },
  {
    name: "rule-hook-skill-boundary",
    tier: "extended",
    category: "config",
    description: "Hook/skill boundary rule configuration",
  },
  {
    name: "rule-lu-workflow",
    tier: "extended",
    category: "config",
    description: "Luca workflow system rule configuration",
  },
];

/**
 * Mapping of preset IDs to the skill tiers they include.
 *
 * - starter: core only
 * - standard: core + standard
 * - full: core + standard + extended (all skills)
 */
const PRESET_TIERS: Record<PresetId, readonly SkillTier[]> = {
  starter: ["core"],
  standard: ["core", "standard"],
  full: ["core", "standard", "extended"],
};

/**
 * Get the list of skill names to install for a given preset.
 *
 * Returns skill directory names filtered by the tiers included
 * in the specified preset. The full preset always returns all skills
 * for backward compatibility.
 *
 * @param preset - Configuration preset identifier
 * @returns Array of skill directory names to install
 *
 * @example
 * ```typescript
 * const starterSkills = getSkillsForPreset("starter");
 * // Returns ~12 core skills: ["lu", "help", "quick", ...]
 *
 * const standardSkills = getSkillsForPreset("standard");
 * // Returns ~25 skills: core + standard tiers
 *
 * const fullSkills = getSkillsForPreset("full");
 * // Returns all ~49 skills
 * ```
 */
export function getSkillsForPreset(preset: PresetId): string[] {
  const allowedTiers = PRESET_TIERS[preset];
  return SKILL_MANIFEST.filter((entry) =>
    allowedTiers.includes(entry.tier),
  ).map((entry) => entry.name);
}

/**
 * Get a skill manifest entry by name.
 *
 * @param name - Skill directory name (kebab-case)
 * @returns The manifest entry if found, undefined otherwise
 *
 * @example
 * ```typescript
 * const entry = getSkillByName("git-commit");
 * // { name: "git-commit", tier: "core", category: "git", ... }
 * ```
 */
export function getSkillByName(
  name: string,
): SkillManifestEntryInput | undefined {
  return SKILL_MANIFEST.find((entry) => entry.name === name);
}

/**
 * Get all skill names defined in the manifest.
 *
 * @returns Array of all skill directory names
 */
export function getAllSkillNames(): string[] {
  return SKILL_MANIFEST.map((entry) => entry.name);
}
