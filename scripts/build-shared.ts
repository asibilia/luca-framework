#!/usr/bin/env bun

/**
 * build-shared.ts — Shared constants and utilities for build scripts
 *
 * Extracted from build-plugin.ts for reuse across:
 * - build-all.ts (unified build pipeline)
 * - check-drift.ts (pre-commit drift detection)
 * - check-drift.test.ts (drift detection tests)
 *
 * Exports:
 * - PLUGIN_EXCLUDED_HOOKS: Hooks excluded from plugin packaging
 * - SKILL_CATEGORIES: Skill-to-category mapping for README generation
 * - AGENT_CATEGORIES: Agent-to-category mapping for README generation
 * - generatePluginHooksConfig(): Plugin hooks.json builder
 * - readVersion(): Package version reader
 * - generateReadme(): Plugin README.md builder
 */
import type { HookDefinition } from "../src/hooks/index";
import path from "path";

/**
 * Hooks excluded from plugin builds.
 *
 * pre-commit-drift-check: Development-only hook that checks for
 * src/ -> output drift. References scripts/check-drift.ts which
 * does not exist in plugin context.
 */
export const PLUGIN_EXCLUDED_HOOKS: ReadonlySet<string> = new Set([
  "pre-commit-drift-check",
]);

/**
 * Skill category assignments for README generation.
 *
 * Maps skill names to high-level categories for the "What's Included"
 * section. Categories are human-curated; counts auto-update from
 * registry sizes. Skills not in this map are counted as "Other".
 */
export const SKILL_CATEGORIES: Record<string, string> = {
  // Workflow
  lu: "Workflow",
  "lu-execute-phase": "Workflow",
  "lu-plan-phase": "Workflow",
  "lu-discuss-phase": "Workflow",
  "lu-research-phase": "Workflow",
  "lu-verify-work": "Workflow",
  "lu-quick": "Workflow",
  "lu-choose": "Workflow",
  "workflow-start": "Workflow",
  // Git
  "git-commit": "Git",
  "git-feature": "Git",
  "git-pr": "Git",
  // Project Management
  "lu-new-project": "Project Management",
  "lu-new-milestone": "Project Management",
  "lu-complete-milestone": "Project Management",
  "lu-audit-milestone": "Project Management",
  "lu-add-phase": "Project Management",
  "lu-insert-phase": "Project Management",
  "lu-remove-phase": "Project Management",
  "lu-plan-milestone-gaps": "Project Management",
  "lu-plan-session": "Project Management",
  "lu-progress": "Project Management",
  "lu-add-todo": "Project Management",
  "lu-check-todos": "Project Management",
  "lu-list-phase-assumptions": "Project Management",
  // Code Quality
  "code-lint": "Code Quality",
  "code-typecheck": "Code Quality",
  "test-run": "Code Quality",
  "qa-consolidate": "Code Quality",
  // Collaboration
  "jira-issue": "Collaboration",
  "lu-address-pr": "Collaboration",
  // Configuration
  "lu-settings": "Configuration",
  "lu-set-profile": "Configuration",
  "lu-help": "Configuration",
  "lu-update": "Configuration",
  "lu-map-codebase": "Configuration",
  // Session Management
  "lu-pause-work": "Session",
  "lu-resume-work": "Session",
  // Debug
  "lu-debug": "Debug",
  // Reference (auto-invoked rules)
  "rule-lu-workflow": "Reference",
  "rule-complexity-gating": "Reference",
  "rule-harness-verification": "Reference",
  "rule-hook-skill-boundary": "Reference",
  "rule-file-naming": "Reference",
};

/**
 * Agent category assignments for README generation.
 */
export const AGENT_CATEGORIES: Record<string, string> = {
  // Development
  "code-architect": "Development",
  "code-developer": "Development",
  "code-simplifier": "Development",
  "dx-advocate": "Development",
  // Workflow
  "lu-executor": "Workflow",
  "lu-planner": "Workflow",
  "lu-router": "Workflow",
  "lu-verifier": "Workflow",
  "lu-learner": "Workflow",
  "lu-cognition": "Workflow",
  // Quality
  "lu-pr-reviewer": "Quality",
  "lu-integration-checker": "Quality",
  "lu-plan-checker": "Quality",
  "qa-plan-generator": "Quality",
  "performance-auditor": "Quality",
  "security-auditor": "Quality",
  // Research
  "lu-phase-researcher": "Research",
  "lu-project-researcher": "Research",
  "lu-research-synthesizer": "Research",
  "lu-codebase-mapper": "Research",
  // Specialty
  "lu-roadmapper": "Specialty",
  "lu-pm-planner": "Specialty",
  "lu-debugger": "Specialty",
  product: "Specialty",
  ui: "Specialty",
  ux: "Specialty",
};

/**
 * Generate the plugin hooks.json configuration.
 *
 * Produces a hooks configuration identical in structure to
 * generateHooksConfig() from src/hooks/index.ts, but uses
 * `${CLAUDE_PLUGIN_ROOT}/scripts/` for command paths instead of
 * `"$CLAUDE_PROJECT_DIR"/.claude/hooks/`.
 *
 * @param registry - The hook registry mapping hook names to definitions
 * @returns A JSON-serialisable hooks configuration object
 */
export function generatePluginHooksConfig(
  registry: Record<string, HookDefinition>,
): Record<string, unknown> {
  const config: Record<
    string,
    Array<{ matcher?: string; hooks: Array<Record<string, unknown>> }>
  > = {};

  for (const [_name, def] of Object.entries(registry)) {
    if (!config[def.event]) {
      config[def.event] = [];
    }

    // Find existing matcher group or create new one
    const matcherKey = def.matcher ?? "__no_matcher__";
    let group = config[def.event].find((g) => {
      if (matcherKey === "__no_matcher__") return !g.matcher;
      return g.matcher === def.matcher;
    });

    if (!group) {
      group = def.matcher ? { matcher: def.matcher, hooks: [] } : { hooks: [] };
      config[def.event].push(group);
    }

    const hookEntry: Record<string, unknown> = {
      type: "command",
      command: `\${CLAUDE_PLUGIN_ROOT}/scripts/${def.script}`,
      timeout: def.timeout,
    };

    if (def.async) hookEntry.async = true;
    if (def.statusMessage) hookEntry.statusMessage = def.statusMessage;

    group.hooks.push(hookEntry);
  }

  return config;
}

/**
 * Read the package version from the luca-framework package.
 *
 * Falls back to the root package.json, then to "0.0.1" if no version
 * field is found in either location.
 *
 * @returns Semver version string
 */
export async function readVersion(): Promise<string> {
  // Try luca-framework package first (has version field)
  const frameworkPkgPath = path.join(
    process.cwd(),
    "packages",
    "luca-framework",
    "package.json",
  );
  try {
    const frameworkPkg = Bun.file(frameworkPkgPath);
    if (await frameworkPkg.exists()) {
      const json = JSON.parse(await frameworkPkg.text());
      if (json.version) return json.version;
    }
  } catch {
    // Fall through
  }

  // Try root package.json
  const rootPkgPath = path.join(process.cwd(), "package.json");
  try {
    const rootPkg = Bun.file(rootPkgPath);
    if (await rootPkg.exists()) {
      const json = JSON.parse(await rootPkg.text());
      if (json.version) return json.version;
    }
  } catch {
    // Fall through
  }

  return "0.0.1";
}

/**
 * Generate plugin README.md content from registry counts and categories.
 *
 * @param skillNames - Array of skill names included in the plugin
 * @param agentNames - Array of agent names included in the plugin
 * @param hookCount - Number of hooks generated
 * @returns Markdown string for the README.md file
 */
export function generateReadme(
  skillNames: string[],
  agentNames: string[],
  hookCount: number,
): string {
  // Count skills by category
  const skillCounts: Record<string, number> = {};
  for (const name of skillNames) {
    const category = SKILL_CATEGORIES[name] ?? "Other";
    skillCounts[category] = (skillCounts[category] ?? 0) + 1;
  }

  // Count agents by category
  const agentCounts: Record<string, number> = {};
  for (const name of agentNames) {
    const category = AGENT_CATEGORIES[name] ?? "Other";
    agentCounts[category] = (agentCounts[category] ?? 0) + 1;
  }

  // Build skill category lines
  const skillCategoryOrder = [
    "Workflow",
    "Git",
    "Project Management",
    "Code Quality",
    "Collaboration",
    "Configuration",
    "Session",
    "Debug",
    "Reference",
    "Other",
  ];
  const skillCategoryDescriptions: Record<string, string> = {
    Workflow: "Phase planning, execution, research, discussion, verification",
    Git: "Commits, feature branches, pull requests",
    "Project Management":
      "Milestones, todos, roadmaps, session planning, phase management",
    "Code Quality": "Linting, type checking, test running, QA consolidation",
    Collaboration: "Jira integration, PR reviews",
    Configuration: "Help, settings, profiles, updates, codebase mapping",
    Session: "Pause and resume work sessions",
    Debug: "Debugging workflows",
    Reference: "Auto-invoked rule guidance (not user commands)",
    Other: "Additional skills",
  };

  const skillLines = skillCategoryOrder
    .filter((cat) => (skillCounts[cat] ?? 0) > 0)
    .map(
      (cat) =>
        `- **${cat}** (${skillCounts[cat]}): ${skillCategoryDescriptions[cat]}`,
    )
    .join("\n");

  // Build agent category lines
  const agentCategoryOrder = [
    "Development",
    "Workflow",
    "Quality",
    "Research",
    "Specialty",
    "Other",
  ];
  const agentCategoryDescriptions: Record<string, string> = {
    Development: "Code architect, developer, simplifier, DX advocate",
    Workflow: "Executor, planner, router, verifier, learner, cognition",
    Quality:
      "PR reviewer, integration checker, plan checker, QA generator, auditors",
    Research:
      "Phase researcher, project researcher, research synthesizer, codebase mapper",
    Specialty: "Roadmapper, PM planner, debugger, product, UI, UX",
    Other: "Additional agents",
  };

  const agentLines = agentCategoryOrder
    .filter((cat) => (agentCounts[cat] ?? 0) > 0)
    .map(
      (cat) =>
        `- **${cat}** (${agentCounts[cat]}): ${agentCategoryDescriptions[cat]}`,
    )
    .join("\n");

  return `# Luca

Agentic development framework with cognitive memory and spec-driven workflow.

## Installation

\`\`\`bash
# From the Luca marketplace
/plugin marketplace add alecsibilia/luca-framework

# Install the plugin
/plugin install luca@luca-marketplace
\`\`\`

## Quick Start

\`\`\`bash
# Start a new project
/lu-new-project

# Begin working on a phase
/lu

# Check progress
/lu-progress
\`\`\`

## What's Included

### Skills (${skillNames.length} total)

${skillLines}

### Agents (${agentNames.length} total)

${agentLines}

### Hooks (${hookCount} active)

Automated code formatting, type checking, pre-commit validation, context monitoring, and session management.

## License

MIT
`;
}
