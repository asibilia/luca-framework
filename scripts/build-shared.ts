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
 * - generateClaudeHooksConfig(): Unified Claude hooks config builder
 * - generateMarketplaceManifest(): Marketplace manifest builder
 * - readVersion(): Package version reader
 * - generateReadme(): Plugin README.md builder
 */
import { NO_MATCHER_SENTINEL, type HookDefinition } from "../src/hooks/index";
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
  "phase-execute": "Workflow",
  "phase-plan": "Workflow",
  "phase-discuss": "Workflow",
  "phase-research": "Workflow",
  verify: "Workflow",
  quick: "Workflow",
  choose: "Workflow",
  "workflow-start": "Workflow",
  // Git
  "git-commit": "Git",
  "git-feature": "Git",
  "git-pr": "Git",
  // Project Management
  "project-new": "Project Management",
  "milestone-new": "Project Management",
  "milestone-complete": "Project Management",
  "milestone-audit": "Project Management",
  "phase-add": "Project Management",
  "phase-insert": "Project Management",
  "phase-remove": "Project Management",
  "milestone-gaps": "Project Management",
  "session-plan": "Project Management",
  progress: "Project Management",
  "todo-add": "Project Management",
  "todo-check": "Project Management",
  "phase-assumptions": "Project Management",
  // Code Quality
  "code-lint": "Code Quality",
  "code-typecheck": "Code Quality",
  "test-run": "Code Quality",
  "qa-consolidate": "Code Quality",
  // Collaboration
  "jira-issue": "Collaboration",
  "pr-address": "Collaboration",
  // Configuration
  "config-settings": "Configuration",
  "config-profile": "Configuration",
  help: "Configuration",
  update: "Configuration",
  "codebase-map": "Configuration",
  // Session Management
  "session-pause": "Session",
  "session-resume": "Session",
  // Debug
  debug: "Debug",
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
 * Skill name prefixes excluded from plugin command generation.
 * These skills are internal/reference and not user-invocable.
 */
export const COMMAND_EXCLUDED_PREFIXES: readonly string[] = [
  "rule-",
  "workflow-start",
];

/**
 * Check whether a skill name should generate a plugin command.
 * Returns false for internal/reference skills.
 */
export const isCommandSkill = (name: string): boolean =>
  !COMMAND_EXCLUDED_PREFIXES.some((prefix) => name.startsWith(prefix));

/**
 * Generate Claude Code hooks configuration from the hook registry.
 *
 * Produces a hooks configuration with command paths based on the
 * provided commandPrefix. Optionally wraps the result in a
 * `{ hooks: ... }` envelope for plugin hooks.json files.
 *
 * @param registry - The hook registry mapping hook names to definitions
 * @param options.commandPrefix - Path prefix for hook script commands
 *   e.g., '"$CLAUDE_PROJECT_DIR"/.claude/hooks' or '${CLAUDE_PLUGIN_ROOT}/scripts'
 * @param options.wrapInHooksKey - If true, returns { hooks: events }; otherwise returns events directly
 * @returns A JSON-serializable hooks configuration object
 */
export function generateClaudeHooksConfig(
  registry: Record<string, HookDefinition>,
  options: {
    commandPrefix: string;
    wrapInHooksKey?: boolean;
  },
): Record<string, unknown> {
  const events: Record<
    string,
    Array<{ matcher?: string; hooks: Array<Record<string, unknown>> }>
  > = {};

  for (const [_name, def] of Object.entries(registry)) {
    if (!events[def.event]) {
      events[def.event] = [];
    }

    const matcherKey = def.matcher ?? NO_MATCHER_SENTINEL;
    let group = events[def.event].find((g) => {
      if (matcherKey === NO_MATCHER_SENTINEL) return !g.matcher;
      return g.matcher === def.matcher;
    });

    if (!group) {
      group = def.matcher ? { matcher: def.matcher, hooks: [] } : { hooks: [] };
      events[def.event].push(group);
    }

    const hookEntry: Record<string, unknown> = {
      type: "command",
      command: `${options.commandPrefix}/${def.script}`,
      timeout: def.timeout,
    };

    if (def.async) hookEntry.async = true;
    if (def.statusMessage) hookEntry.statusMessage = def.statusMessage;

    group.hooks.push(hookEntry);
  }

  return options.wrapInHooksKey ? { hooks: events } : events;
}

/**
 * Generate the marketplace manifest for plugin distribution.
 *
 * Contains metadata for the Claude Code plugin marketplace listing.
 * Centralised here to prevent drift across build-all.ts, check-drift.ts,
 * and check-drift.test.ts.
 *
 * @param version - Semver version string from package.json
 * @returns A JSON-serializable marketplace manifest object
 */
export function generateMarketplaceManifest(version: string): object {
  return {
    $schema: "https://anthropic.com/claude-code/marketplace.schema.json",
    name: "luca-marketplace",
    owner: {
      name: "Alec Sibilia",
    },
    plugins: [
      {
        name: "luca",
        description:
          "Agentic development framework with cognitive memory and spec-driven workflow",
        source: ".",
        category: "development",
        version,
        author: {
          name: "Alec Sibilia",
        },
        homepage: "https://github.com/alecsibilia/luca-framework",
        repository: "https://github.com/alecsibilia/luca-framework",
        license: "MIT",
        keywords: ["agent", "ai", "framework", "luca", "workflow", "cognitive"],
      },
    ],
  };
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
  } catch (err) {
    console.debug(`readVersion: failed to read ${frameworkPkgPath}: ${err}`);
  }

  // Try root package.json
  const rootPkgPath = path.join(process.cwd(), "package.json");
  try {
    const rootPkg = Bun.file(rootPkgPath);
    if (await rootPkg.exists()) {
      const json = JSON.parse(await rootPkg.text());
      if (json.version) return json.version;
    }
  } catch (err) {
    console.debug(`readVersion: failed to read ${rootPkgPath}: ${err}`);
  }

  console.debug(
    "readVersion: no version found in any package.json, using fallback 0.0.1",
  );
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
