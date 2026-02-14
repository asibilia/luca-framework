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
 * - generateMarketplaceManifest(): Marketplace manifest builder
 * - readVersion(): Package version reader
 * - generateReadme(): Plugin README.md builder
 * - generateAllOutputs(): Unified compilation pipeline
 *
 * Re-exports from src/hooks/index:
 * - generateClaudeHooksConfig(): Claude hooks config builder
 * - generateCursorHooksConfig(): Cursor hooks config builder
 */
import {
  hookRegistry,
  generateCursorHooksConfig,
  generateClaudeHooksConfig,
} from "../src/hooks/index";
import { agentRegistry } from "../src/agents/index";
import { ruleRegistry } from "../src/rules/index";
import { skillRegistry } from "../src/skills/index";
import type { BaseAgent } from "../src/agents/types/agent.types";
import type { BaseSkill } from "../src/skills/types/skill.types";
import type { BaseRule } from "../src/rules/types/rule.types";
import { LuExecutorAgent } from "../src/agents/luca/lu-executor.agent";
import { LuPlannerAgent } from "../src/agents/luca/lu-planner.agent";
import { LuSkill } from "../src/skills/luca/lu.skill";
import { LuWorkflowRule } from "../src/rules/lu-workflow.rule";
import {
  compileAgent,
  compileSkill,
  compileRule,
} from "../src/compilers/compile";
import { generatePluginManifest } from "../src/compilers/plugin.types";
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

// Re-export registries for consumers that need them (e.g., orphan detection tests)
export { agentRegistry, skillRegistry, ruleRegistry, hookRegistry };

// Re-export hook config generators for consumers
export { generateCursorHooksConfig, generateClaudeHooksConfig };

/**
 * Generate all build outputs in memory.
 *
 * Runs every compiler (Cursor, Claude, Plugin) against every registry entity
 * and Luca-specific entity, producing a Map of relative file paths to their
 * generated content strings.
 *
 * Consumers use this Map differently:
 * - build-all.ts: writes each entry to disk
 * - check-drift.ts: compares each entry against committed files
 * - check-drift.test.ts: uses entries for freshness assertions
 *
 * The special key `.claude/settings.json__hooks` contains the hooks config
 * fragment (not a standalone file); build-all.ts merges it into settings.json.
 *
 * @returns Map of relative file paths to content strings
 */
export async function generateAllOutputs(): Promise<Map<string, string>> {
  const generated = new Map<string, string>();

  // --- Agents ---
  for (const [agentName, AgentClass] of Object.entries(agentRegistry)) {
    const instance = new (AgentClass as new () => BaseAgent)();
    generated.set(
      `.claude/agents/${agentName}.md`,
      compileAgent(instance, "CLAUDE"),
    );
    generated.set(
      `.cursor/agents/${agentName}.md`,
      compileAgent(instance, "CURSOR"),
    );
    generated.set(
      `dist/plugin/agents/${agentName}.md`,
      compileAgent(instance, "PLUGIN"),
    );
  }

  // Luca-specific agents
  const luExecutor = new LuExecutorAgent();
  generated.set(
    ".claude/agents/lu-executor.md",
    compileAgent(luExecutor, "CLAUDE"),
  );
  generated.set(
    ".cursor/agents/lu-executor.md",
    compileAgent(luExecutor, "CURSOR"),
  );
  generated.set(
    "dist/plugin/agents/lu-executor.md",
    compileAgent(luExecutor, "PLUGIN"),
  );

  const luPlanner = new LuPlannerAgent();
  generated.set(
    ".claude/agents/lu-planner.md",
    compileAgent(luPlanner, "CLAUDE"),
  );
  generated.set(
    ".cursor/agents/lu-planner.md",
    compileAgent(luPlanner, "CURSOR"),
  );
  generated.set(
    "dist/plugin/agents/lu-planner.md",
    compileAgent(luPlanner, "PLUGIN"),
  );

  // --- Skills ---
  for (const [skillName, SkillClass] of Object.entries(skillRegistry)) {
    const instance = new (SkillClass as new () => BaseSkill)();
    generated.set(
      `.claude/skills/${skillName}/SKILL.md`,
      compileSkill(instance, "CLAUDE"),
    );
    generated.set(
      `.cursor/skills/${skillName}/SKILL.md`,
      compileSkill(instance, "CURSOR"),
    );
    generated.set(
      `dist/plugin/skills/${skillName}/SKILL.md`,
      compileSkill(instance, "PLUGIN"),
    );
  }

  // Luca-specific skill
  const luSkill = new LuSkill();
  generated.set(".claude/skills/lu/SKILL.md", compileSkill(luSkill, "CLAUDE"));
  generated.set(".cursor/skills/lu/SKILL.md", compileSkill(luSkill, "CURSOR"));
  generated.set(
    "dist/plugin/skills/lu/SKILL.md",
    compileSkill(luSkill, "PLUGIN"),
  );

  // --- Rules ---
  for (const [ruleName, RuleClass] of Object.entries(ruleRegistry)) {
    const instance = new (RuleClass as new () => BaseRule)();
    generated.set(
      `.claude/rules/${ruleName}.md`,
      compileRule(instance, "CLAUDE"),
    );
    generated.set(
      `.cursor/rules/${ruleName}.mdc`,
      compileRule(instance, "CURSOR"),
    );
  }

  // Luca-specific rule
  const luWorkflowRule = new LuWorkflowRule();
  generated.set(
    ".claude/rules/lu-workflow.md",
    compileRule(luWorkflowRule, "CLAUDE"),
  );
  generated.set(
    ".cursor/rules/lu-workflow.mdc",
    compileRule(luWorkflowRule, "CURSOR"),
  );

  // --- Hook scripts ---
  const hookScriptsDir = path.join(process.cwd(), "src", "hooks", "scripts");
  for (const [_hookName, hookDef] of Object.entries(hookRegistry)) {
    const srcPath = path.join(hookScriptsDir, hookDef.script);
    const srcFile = Bun.file(srcPath);
    if (await srcFile.exists()) {
      const content = await srcFile.text();
      generated.set(`.claude/hooks/${hookDef.script}`, content);
      generated.set(`.cursor/hooks/${hookDef.script}`, content);
    }
  }

  // --- Settings/hooks configs ---
  // For settings.json, we only store the "hooks" key as a fragment
  const hooksConfig = generateClaudeHooksConfig(hookRegistry, {
    commandPrefix: '"$CLAUDE_PROJECT_DIR"/.claude/hooks',
  });
  generated.set(
    ".claude/settings.json__hooks",
    JSON.stringify(hooksConfig, null, 2),
  );

  const cursorHooksConfig = generateCursorHooksConfig(hookRegistry);
  generated.set(
    ".cursor/hooks.json",
    JSON.stringify(cursorHooksConfig, null, 2) + "\n",
  );

  // --- Plugin commands ---
  for (const [skillName, SkillClass] of Object.entries(skillRegistry)) {
    if (!isCommandSkill(skillName)) continue;
    const instance = new (SkillClass as new () => BaseSkill)();
    generated.set(
      `dist/plugin/commands/${skillName}.md`,
      `---\ndescription: "${instance.description.replace(/"/g, '\\"')}"\n---\n\nInvoke the ${skillName} skill to execute this command.\n`,
    );
  }

  // Luca-specific command
  generated.set(
    "dist/plugin/commands/lu.md",
    `---\ndescription: "${luSkill.description.replace(/"/g, '\\"')}"\n---\n\nInvoke the lu skill to execute this command.\n`,
  );

  // --- Plugin hooks ---
  const pluginHookRegistry = Object.fromEntries(
    Object.entries(hookRegistry).filter(
      ([name]) => !PLUGIN_EXCLUDED_HOOKS.has(name),
    ),
  );

  // Plugin hook scripts
  for (const [_name, def] of Object.entries(pluginHookRegistry)) {
    const srcPath = path.join(hookScriptsDir, def.script);
    const srcFile = Bun.file(srcPath);
    if (await srcFile.exists()) {
      generated.set(`dist/plugin/scripts/${def.script}`, await srcFile.text());
    }
  }

  // Plugin hooks.json
  const pluginHooksConfig = generateClaudeHooksConfig(pluginHookRegistry, {
    commandPrefix: "${CLAUDE_PLUGIN_ROOT}/scripts",
    wrapInHooksKey: true,
  });
  generated.set(
    "dist/plugin/hooks/hooks.json",
    JSON.stringify(pluginHooksConfig, null, 2) + "\n",
  );

  // --- Plugin manifest (plugin.json) ---
  const version = await readVersion();

  const manifest = generatePluginManifest({
    name: "luca",
    version,
    description:
      "Luca - Agentic development framework with cognitive memory and spec-driven workflow",
    author: { name: "Alec Sibilia" },
    keywords: ["agent", "ai", "framework", "luca", "workflow", "cognitive"],
  });

  generated.set(
    "dist/plugin/.claude-plugin/plugin.json",
    JSON.stringify(manifest, null, 2) + "\n",
  );

  // --- Marketplace manifest ---
  const marketplaceManifest = generateMarketplaceManifest(version);

  generated.set(
    "dist/plugin/.claude-plugin/marketplace.json",
    JSON.stringify(marketplaceManifest, null, 2) + "\n",
  );

  // --- README ---
  const pluginAgentNames = [
    ...Object.keys(agentRegistry),
    "lu-executor",
    "lu-planner",
  ];
  const pluginSkillNames = [...Object.keys(skillRegistry), "lu"];
  const pluginHookNames = Object.keys(pluginHookRegistry);

  const readmeContent = generateReadme(
    pluginSkillNames,
    pluginAgentNames,
    pluginHookNames.length,
  );
  generated.set("dist/plugin/README.md", readmeContent);

  return generated;
}
