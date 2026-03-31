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
 */
import {
  resolveCanonicalRegistry,
  generateClaudeHooksConfigFromCanonical,
} from "../src/hooks/index";
import { generateAllShellWrappers } from "../src/hooks/__helpers/generate-shell-wrappers";
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
import { resolvePackageRoot } from "../src/shared/__helpers/resolve-package-root";

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
  const packageRoot = resolvePackageRoot();
  // Try luca-framework package first (has version field)
  const frameworkPkgPath = path.join(
    packageRoot,
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
  const rootPkgPath = path.join(packageRoot, "package.json");
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

// ─── Domain types for targeted recompilation ─────────────────────────────────

/**
 * Valid domain names for single-domain compilation.
 */
export const VALID_DOMAINS = ["agents", "skills", "rules", "hooks"] as const;

/**
 * Domain type derived from the valid domains constant.
 */
export type Domain = (typeof VALID_DOMAINS)[number];

/**
 * Generate outputs for a single domain into a Map.
 *
 * Used by targeted-recompile.ts for single-domain recompilation
 * without running the full build:all pipeline.
 *
 * @param d - The domain to generate outputs for
 * @returns Map of relative file paths to content strings
 *
 * @example
 * ```typescript
 * const outputs = await generateDomainOutputs("agents");
 * // Map { "dist/claude/agents/lu-router.md" => "...", ... }
 * ```
 */
export async function generateDomainOutputs(
  d: Domain,
): Promise<Map<string, string>> {
  const generated = new Map<string, string>();

  switch (d) {
    case "agents":
      for (const [name, createAgent] of Object.entries(agentRegistry)) {
        const instance = createAgent();
        generated.set(
          `dist/claude/agents/${name}.md`,
          compileAgent(instance, "CLAUDE"),
        );
      }
      break;

    case "skills":
      for (const [name, createSkill] of Object.entries(skillRegistry)) {
        const instance = createSkill();
        generated.set(
          `dist/claude/skills/${name}/SKILL.md`,
          compileSkill(instance, "CLAUDE"),
        );
      }
      break;

    case "rules":
      for (const [name, createRule] of Object.entries(ruleRegistry)) {
        const instance = createRule();
        generated.set(
          `dist/claude/rules/${name}.md`,
          compileRule(instance, "CLAUDE"),
        );
      }
      break;

    case "hooks": {
      // Hooks use the full compile+deploy pipeline since they involve
      // shell wrapper generation and settings.json merging.
      const { generateAllShellWrappers: genWrappers } =
        await import("../src/hooks/__helpers/generate-shell-wrappers");
      const {
        resolveCanonicalRegistry: resolveCanonical,
        generateClaudeHooksConfigFromCanonical: genHooksConfig,
      } = await import("../src/hooks/index");

      const canonical = resolveCanonical();
      const wrappers = genWrappers();
      for (const [outputPath, content] of Object.entries(wrappers)) {
        generated.set(outputPath, content);
      }

      const hooksConfig = genHooksConfig(canonical, {
        commandPrefix: '"$CLAUDE_PROJECT_DIR"/.claude/hooks',
        scriptExtension: ".sh",
      });
      generated.set(
        "dist/claude/settings.json__hooks",
        JSON.stringify(hooksConfig, null, 2),
      );
      break;
    }
  }

  return generated;
}

// Re-export registries for consumers that need them (e.g., orphan detection tests)
export { agentRegistry, skillRegistry, ruleRegistry };
export { resolveCanonicalRegistry } from "../src/hooks/index";

// Re-export hook config generators for consumers
export { generateClaudeHooksConfigFromCanonical };

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
      `dist/claude/agents/${agentName}.md`,
      compileAgent(instance, "CLAUDE"),
    );
    generated.set(
      `dist/plugin/agents/${agentName}.md`,
      compileAgent(instance, "PLUGIN"),
    );
  }
}

function generateSkillOutputs(generated: Map<string, string>): void {
  for (const [skillName, createSkill] of Object.entries(skillRegistry)) {
    const instance = createSkill();
    generated.set(
      `dist/claude/skills/${skillName}/SKILL.md`,
      compileSkill(instance, "CLAUDE"),
    );
    generated.set(
      `dist/plugin/skills/${skillName}/SKILL.md`,
      compileSkill(instance, "PLUGIN"),
    );
  }
}

function generateRuleOutputs(generated: Map<string, string>): void {
  for (const [ruleName, createRule] of Object.entries(ruleRegistry)) {
    const instance = createRule();
    generated.set(
      `dist/claude/rules/${ruleName}.md`,
      compileRule(instance, "CLAUDE"),
    );
  }
}

async function generateHookOutputs(
  generated: Map<string, string>,
): Promise<void> {
  const canonical = resolveCanonicalRegistry();

  // Generate shell wrappers from the canonical registry
  const wrappers = generateAllShellWrappers();
  for (const [outputPath, content] of Object.entries(wrappers)) {
    generated.set(outputPath, content);
  }

  // Claude settings.json hooks fragment
  const hooksConfig = generateClaudeHooksConfigFromCanonical(canonical, {
    commandPrefix: '"$CLAUDE_PROJECT_DIR"/.claude/hooks',
    scriptExtension: ".sh",
  });
  generated.set(
    "dist/claude/settings.json__hooks",
    JSON.stringify(hooksConfig, null, 2),
  );
}

async function generatePluginOutputs(
  generated: Map<string, string>,
): Promise<void> {
  const hookScriptsDir = path.join(
    resolvePackageRoot(),
    "src",
    "hooks",
    "scripts",
  );

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
    if (!def.script) continue; // Skip prompt hooks (no script file)
    const srcPath = path.join(hookScriptsDir, def.script);
    const srcFile = Bun.file(srcPath);
    if (await srcFile.exists()) {
      generated.set(`dist/plugin/scripts/${def.script}`, await srcFile.text());
    }
  }

  // Copy hook __helpers/ that plugin scripts import from (../__helpers/)
  const hookHelpersDir = path.join(
    resolvePackageRoot(),
    "src",
    "hooks",
    "__helpers",
  );
  const pluginHelperFiles = [
    "hook-io.ts",
    "bridge.ts",
    "vault.ts",
    "muninn.ts",
    "git-context.ts",
    "commit-utils.ts",
    "session-restore.ts",
  ];
  for (const helperFile of pluginHelperFiles) {
    const helperPath = path.join(hookHelpersDir, helperFile);
    const helperBunFile = Bun.file(helperPath);
    if (await helperBunFile.exists()) {
      generated.set(
        `dist/plugin/__helpers/${helperFile}`,
        await helperBunFile.text(),
      );
    }
  }

  // Copy hook __schemas/ that plugin scripts import from (../__schemas/)
  const hookSchemasDir = path.join(
    resolvePackageRoot(),
    "src",
    "hooks",
    "__schemas",
  );
  const pluginSchemaFiles = ["hook.schemas.ts"];
  for (const schemaFile of pluginSchemaFiles) {
    const schemaPath = path.join(hookSchemasDir, schemaFile);
    const schemaBunFile = Bun.file(schemaPath);
    if (await schemaBunFile.exists()) {
      generated.set(
        `dist/plugin/__schemas/${schemaFile}`,
        await schemaBunFile.text(),
      );
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
 * Runs the Claude and Plugin compilers against every registry entity,
 * producing a Map of relative file paths to their generated content strings.
 * All entities (including Luca-specific ones) are discovered via registries —
 * no special-casing required.
 *
 * Consumers use this Map differently:
 * - build-all.ts: writes each entry to disk
 * - check-drift.ts: compares each entry against committed files
 * - check-drift.test.ts: uses entries for freshness assertions
 *
 * The special key `dist/claude/settings.json__hooks` contains the hooks config
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

  // Async outputs (file I/O for hook scripts, version reading)
  await generateHookOutputs(generated);
  await generatePluginOutputs(generated);

  return generated;
}
