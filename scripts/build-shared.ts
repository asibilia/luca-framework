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
 * - generateClaudeHooksConfigFromCanonical(): Claude hooks config builder
 * - generateCursorHooksConfigFromCanonical(): Cursor hooks config builder
 */
import {
  hookRegistry,
  resolveCanonicalRegistry,
  generateClaudeHooksConfigFromCanonical,
  generateCursorHooksConfigFromCanonical,
} from "../src/hooks/index";
import { agentRegistry } from "../src/agents/index";
import { ruleRegistry, ProfileConfigSchema } from "../src/rules/index";
import { skillRegistry } from "../src/skills/index";
import {
  compileAgent,
  compileSkill,
  compileRule,
} from "../src/compilers/__helpers/compile";
import { generatePluginManifest } from "../src/compilers/__schemas/compilers.schemas";
import path from "path";

/**
 * Pi extension source files that are copied from src/hooks/pi-extensions/
 * to .pi/extensions/ during build.
 *
 * This is the SINGLE SOURCE OF TRUTH for which extensions exist.
 * Both generatePiSettings() and generatePiOutputs() derive from this list.
 */
export const PI_EXTENSION_FILES: readonly string[] = [
  "luca-hooks.ts",
  "luca-state.ts",
  "luca-harness.ts",
  "luca-complexity.ts",
  "luca-roles.ts",
  "luca-teams.ts",
  "luca-chain.ts",
  "luca-tilldone.ts",
  "luca-query-experts.ts",
  "luca-safety-rules.ts",
  "luca-purpose-gating.ts",
  "luca-subagents.ts",
  "luca-commands.ts",
  "luca-widgets.ts",
  "luca-work-tracking.ts",
  "luca-search.ts",
] as const;

/**
 * Pi extension helper files that are copied from
 * src/hooks/pi-extensions/__helpers/ to .pi/extensions/__helpers/.
 *
 * These are shared utilities imported by multiple extensions.
 * Must be copied alongside extensions for imports to resolve.
 */
export const PI_HELPER_FILES: readonly string[] = [
  "luca-constants.ts",
  "sanitize.ts",
  "response.ts",
  "frontmatter.ts",
  "exec.ts",
  "registry.ts",
  "status.ts",
  "widget-renderers.ts",
  "spawn.ts",
  "subagent-registry.ts",
  "notify.ts",
  "follow-up.ts",
  "model-routing.ts",
  "state-bridge.ts",
  "dialogs.ts",
  "hook-handlers.ts",
  "runtime-detect.ts",
  "throttle.ts",
  "session-init.ts",
] as const;
// Note: index.ts barrel is NOT included — Pi auto-discovers
// .pi/extensions/*/index.ts as extensions. Extensions import
// directly from individual helper files, not the barrel.

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
  // Notes
  note: "Workflow",
  // Reference (auto-invoked rules)
  "rule-lu-workflow": "Reference",
  "rule-complexity-gating": "Reference",
  "rule-harness-verification": "Reference",
  "rule-hook-skill-boundary": "Reference",
  "rule-file-naming": "Reference",
  // Automation
  autopilot: "Automation",
  // Code Quality (repo-level)
  "repo-audit": "Code Quality",
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
  "lu-test-writer": "Quality",
  "qa-plan-generator": "Quality",
  "performance-auditor": "Quality",
  "security-auditor": "Quality",
  // Research
  "lu-phase-researcher": "Research",
  "lu-project-researcher": "Research",
  "lu-research-synthesizer": "Research",
  "lu-codebase-mapper": "Research",
  "lu-discuss-researcher": "Research",
  // Quality (repo-level)
  "lu-repo-architect": "Quality",
  // Roadmap
  "lu-roadmap-architect": "Specialty",
  "lu-roadmap-prioritizer": "Specialty",
  "lu-roadmap-qa": "Quality",
  "lu-roadmap-synthesizer": "Specialty",
  // Specialty
  "lu-roadmapper": "Specialty",
  "lu-pm-planner": "Specialty",
  "lu-debugger": "Specialty",
  // Tier Variants
  "lu-router-fast": "Workflow",
  "lu-verifier-fast": "Workflow",
  "lu-executor-capable": "Workflow",
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
    "Automation",
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
    Automation: "Autonomous orchestration and batch execution",
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
export { resolveCanonicalRegistry } from "../src/hooks/index";

// Re-export hook config generators for consumers
export {
  generateClaudeHooksConfigFromCanonical,
  generateCursorHooksConfigFromCanonical,
};

// Re-export profile infrastructure for build consumers
export { profileRegistry, ProfileConfigSchema } from "../src/rules/index";

/**
 * Get the list of active profile names from config.
 *
 * Reads .planning/config.json and returns the active profile names
 * based on opinionated_guidelines toggle and tech_stack_profiles array.
 * Returns empty array when opinionated_guidelines is false.
 *
 * @returns Array of active profile name strings
 */
export async function getActiveProfileNames(): Promise<string[]> {
  try {
    const configPath = path.join(process.cwd(), ".planning", "config.json");
    const configFile = Bun.file(configPath);
    if (!(await configFile.exists())) return ["typescript"];
    const raw = await configFile.text();
    const config = JSON.parse(raw);
    const workflow = config?.workflow ?? {};

    // Use the already-imported ProfileConfigSchema (re-exported above)
    const parsed = ProfileConfigSchema.parse(workflow);

    if (!parsed.opinionated_guidelines) {
      return [];
    }

    return parsed.tech_stack_profiles;
  } catch {
    // Default: typescript profile active
    return ["typescript"];
  }
}

// ---------------------------------------------------------------------------
// Sub-functions for generateAllOutputs()
// Each handles one entity type, writing to the shared generated Map.
// ---------------------------------------------------------------------------

function generateAgentOutputs(generated: Map<string, string>): void {
  for (const [agentName, createAgent] of Object.entries(agentRegistry)) {
    const instance = createAgent();
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
    generated.set(`.pi/agents/${agentName}.md`, compileAgent(instance, "PI"));
  }
}

function generateSkillOutputs(generated: Map<string, string>): void {
  for (const [skillName, createSkill] of Object.entries(skillRegistry)) {
    const instance = createSkill();
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
    generated.set(
      `.pi/skills/${skillName}/SKILL.md`,
      compileSkill(instance, "PI"),
    );
  }
}

function generateRuleOutputs(generated: Map<string, string>): void {
  // Per-rule compilation for Claude, Cursor, and Pi
  const piRuleSections: string[] = [];

  for (const [ruleName, createRule] of Object.entries(ruleRegistry)) {
    const instance = createRule();
    generated.set(
      `.claude/rules/${ruleName}.md`,
      compileRule(instance, "CLAUDE"),
    );
    generated.set(
      `.cursor/rules/${ruleName}.mdc`,
      compileRule(instance, "CURSOR"),
    );

    // Collect individual Pi rule compilations for AGENTS.md merge
    piRuleSections.push(compileRule(instance, "PI"));
  }

  // Pi merges all rules into a single AGENTS.md (no rules directory)
  const agentsMd = generatePiAgentsMd(piRuleSections);
  generated.set(".pi/AGENTS.md", agentsMd);
}

/**
 * Generate Pi's AGENTS.md by merging all compiled rule sections.
 *
 * Pi has no rules directory — all project rules are combined into a single
 * AGENTS.md file that Pi reads at session start.
 *
 * @param ruleSections - Array of individually compiled rule markdown strings
 * @returns Complete AGENTS.md content
 */
function generatePiAgentsMd(ruleSections: string[]): string {
  const header = `# Project Rules

> Auto-generated by Luca Framework. Do not edit directly.
> Source: src/rules/ → compiled via \`bun run build:all\`

`;
  return header + ruleSections.join("\n\n---\n\n") + "\n";
}

/**
 * Generate Pi settings.json content.
 *
 * Maps Luca project configuration to Pi's settings format. Includes
 * references to generated extensions and project defaults.
 *
 * @returns JSON-serializable Pi settings object
 */
function generatePiSettings(): object {
  return {
    model: "gemini-3.1-pro-preview",
    provider: "google",
    compaction: {
      enabled: true,
      threshold: 0.7,
    },
    extensions: [
      // All extensions derived from PI_EXTENSION_FILES (single source of truth)
      ...PI_EXTENSION_FILES.map((f) => `.pi/extensions/${f}`),
    ],
    shell: "/bin/zsh",
  };
}

async function generatePiOutputs(
  generated: Map<string, string>,
): Promise<void> {
  // Pi settings.json
  generated.set(
    ".pi/settings.json",
    JSON.stringify(generatePiSettings(), null, 2) + "\n",
  );

  // Pi workflow extensions (static TypeScript source files)
  const extensionsDir = path.join(
    process.cwd(),
    "src",
    "hooks",
    "pi-extensions",
  );

  // Copy extension source files (derived from PI_EXTENSION_FILES constant)
  for (const fileName of PI_EXTENSION_FILES) {
    const srcPath = path.join(extensionsDir, fileName);
    const srcFile = Bun.file(srcPath);
    if (await srcFile.exists()) {
      generated.set(`.pi/extensions/${fileName}`, await srcFile.text());
    }
  }

  // Copy shared helper files (required for extension imports to resolve)
  const helpersDir = path.join(extensionsDir, "__helpers");
  for (const fileName of PI_HELPER_FILES) {
    const srcPath = path.join(helpersDir, fileName);
    const srcFile = Bun.file(srcPath);
    if (await srcFile.exists()) {
      generated.set(
        `.pi/extensions/__helpers/${fileName}`,
        await srcFile.text(),
      );
    }
  }

  // Copy type definition files (shared interfaces for pi/ctx objects)
  const typesDir = path.join(extensionsDir, "__types");
  const typeFiles = ["pi-context.ts"];
  for (const fileName of typeFiles) {
    const srcPath = path.join(typesDir, fileName);
    const srcFile = Bun.file(srcPath);
    if (await srcFile.exists()) {
      generated.set(`.pi/extensions/__types/${fileName}`, await srcFile.text());
    }
  }
}

async function generateHookOutputs(
  generated: Map<string, string>,
): Promise<void> {
  const hookScriptsDir = path.join(process.cwd(), "src", "hooks", "scripts");
  const canonical = resolveCanonicalRegistry();

  // Copy hook scripts to .claude/ and .cursor/ (Pi uses native extension)
  for (const [_hookName, hookDef] of Object.entries(canonical)) {
    const srcPath = path.join(hookScriptsDir, hookDef.script);
    const srcFile = Bun.file(srcPath);
    if (await srcFile.exists()) {
      const content = await srcFile.text();
      generated.set(`.claude/hooks/${hookDef.script}`, content);
      generated.set(`.cursor/hooks/${hookDef.script}`, content);
    }
  }

  // Copy _lib/ shared library to all output directories
  const libDir = path.join(hookScriptsDir, "_lib");
  const libDirFile = Bun.file(path.join(libDir, "common.sh"));
  if (await libDirFile.exists()) {
    const libFiles = ["common.sh"];
    for (const fileName of libFiles) {
      const srcPath = path.join(libDir, fileName);
      const srcFile = Bun.file(srcPath);
      if (await srcFile.exists()) {
        const content = await srcFile.text();
        generated.set(`.claude/hooks/_lib/${fileName}`, content);
        generated.set(`.cursor/hooks/_lib/${fileName}`, content);
        generated.set(`.pi/hook-scripts/_lib/${fileName}`, content);
        generated.set(`dist/plugin/scripts/_lib/${fileName}`, content);
      }
    }
  }

  // Copy statusline script (NOT a hook — lives at .claude/ root, not .claude/hooks/)
  const statuslineSrcPath = path.join(hookScriptsDir, "statusline.sh");
  const statuslineSrcFile = Bun.file(statuslineSrcPath);
  if (await statuslineSrcFile.exists()) {
    const content = await statuslineSrcFile.text();
    generated.set(".claude/statusline.sh", content);
  }

  // Claude settings.json hooks fragment
  const hooksConfig = generateClaudeHooksConfigFromCanonical(canonical, {
    commandPrefix: '"$CLAUDE_PROJECT_DIR"/.claude/hooks',
  });
  generated.set(
    ".claude/settings.json__hooks",
    JSON.stringify(hooksConfig, null, 2),
  );

  // Cursor hooks.json
  const cursorHooksConfig = generateCursorHooksConfigFromCanonical(canonical);
  generated.set(
    ".cursor/hooks.json",
    JSON.stringify(cursorHooksConfig, null, 2) + "\n",
  );

  // Pi extension: luca-hooks.ts is now a source file in PI_EXTENSION_FILES
  // (copied by generatePiOutputs, no longer generated from hook registry)
}

async function generatePluginOutputs(
  generated: Map<string, string>,
): Promise<void> {
  const hookScriptsDir = path.join(process.cwd(), "src", "hooks", "scripts");

  // Plugin commands (from skill registry, excluding internal prefixes)
  for (const [skillName, createSkill] of Object.entries(skillRegistry)) {
    if (!isCommandSkill(skillName)) continue;
    const instance = createSkill();
    generated.set(
      `dist/plugin/commands/${skillName}.md`,
      `---\ndescription: "${instance.description.replace(/"/g, '\\"')}"\n---\n\nInvoke the ${skillName} skill to execute this command.\n`,
    );
  }

  // Plugin hooks (excluding dev-only hooks)
  const canonical = resolveCanonicalRegistry();
  const pluginCanonicalRegistry = Object.fromEntries(
    Object.entries(canonical).filter(
      ([name]) => !PLUGIN_EXCLUDED_HOOKS.has(name),
    ),
  );

  for (const [_name, def] of Object.entries(pluginCanonicalRegistry)) {
    const srcPath = path.join(hookScriptsDir, def.script);
    const srcFile = Bun.file(srcPath);
    if (await srcFile.exists()) {
      generated.set(`dist/plugin/scripts/${def.script}`, await srcFile.text());
    }
  }

  // Plugin hooks.json
  const pluginHooksConfig = generateClaudeHooksConfigFromCanonical(
    pluginCanonicalRegistry,
    {
      commandPrefix: "${CLAUDE_PLUGIN_ROOT}/scripts",
      wrapInHooksKey: true,
    },
  );
  generated.set(
    "dist/plugin/hooks/hooks.json",
    JSON.stringify(pluginHooksConfig, null, 2) + "\n",
  );

  // Plugin manifest (plugin.json)
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

  // Marketplace manifest
  const marketplaceManifest = generateMarketplaceManifest(version);

  generated.set(
    "dist/plugin/.claude-plugin/marketplace.json",
    JSON.stringify(marketplaceManifest, null, 2) + "\n",
  );

  // README (all names now come directly from registries)
  const pluginAgentNames = Object.keys(agentRegistry);
  const pluginSkillNames = Object.keys(skillRegistry);
  const pluginHookCount = Object.keys(pluginCanonicalRegistry).length;

  const readmeContent = generateReadme(
    pluginSkillNames,
    pluginAgentNames,
    pluginHookCount,
  );
  generated.set("dist/plugin/README.md", readmeContent);
}

/**
 * Generate all build outputs in memory.
 *
 * Runs every compiler (Cursor, Claude, Plugin) against every registry entity,
 * producing a Map of relative file paths to their generated content strings.
 * All entities (including Luca-specific ones) are discovered via registries —
 * no special-casing required.
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

  // Synchronous entity compilation
  generateAgentOutputs(generated);
  generateSkillOutputs(generated);
  generateRuleOutputs(generated);

  // Pi-specific outputs (settings.json, workflow extensions; agents, skills,
  // and AGENTS.md are already generated by the entity functions above)
  await generatePiOutputs(generated);

  // Async outputs (file I/O for hook scripts, version reading)
  await generateHookOutputs(generated);
  await generatePluginOutputs(generated);

  return generated;
}
