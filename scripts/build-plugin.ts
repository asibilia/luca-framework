#!/usr/bin/env bun

/**
 * build-plugin.ts — Plugin build script for Claude Code plugin packaging
 *
 * Compiles all agents and skills from registries, generates the plugin
 * manifest (.claude-plugin/plugin.json), copies hook scripts, and produces
 * the plugin hooks configuration. The output is a self-contained directory
 * under dist/plugin/ ready for `claude --plugin-dir` testing.
 *
 * Usage:
 *   bun run build:plugin          # via package.json script
 *   bun ./scripts/build-plugin.ts # direct invocation
 *
 * Prerequisites:
 *   - All agent/skill source classes must compile without errors
 *   - PluginCompiler must be available in src/compilers/
 *
 * Output structure:
 *   dist/plugin/
 *   ├── .claude-plugin/
 *   │   └── plugin.json
 *   ├── agents/
 *   │   ├── code-architect.md
 *   │   └── ... (all agents)
 *   ├── skills/
 *   │   ├── git-commit/
 *   │   │   └── SKILL.md
 *   │   └── ... (all skills)
 *   ├── commands/
 *   │   ├── git-commit.md
 *   │   └── ... (all commands)
 *   ├── hooks/
 *   │   └── hooks.json
 *   └── scripts/
 *       ├── post-edit-format.sh
 *       └── ... (all hook scripts)
 */
import { agentRegistry } from "../src/agents/index";
import { skillRegistry } from "../src/skills/index";
import { hookRegistry } from "../src/hooks/index";
import type { HookDefinition } from "../src/hooks/index";
import type { BaseAgent } from "../src/agents/types/agent.types";
import type { BaseSkill } from "../src/skills/types/skill.types";
import { LuExecutorAgent } from "../src/agents/luca/lu-executor.agent";
import { LuPlannerAgent } from "../src/agents/luca/lu-planner.agent";
import { LuSkill } from "../src/skills/luca/lu.skill";
import { PluginCompiler } from "../src/compilers/plugin.compiler";
import { generatePluginManifest } from "../src/compilers/plugin.types";
import { cleanDirectory, cleanSkillsDirectory, ensureDir } from "./build-utils";
import path from "path";

/**
 * Result returned by buildPlugin for downstream consumption.
 *
 * Plan 19-04 imports this function and uses the result to verify
 * the plugin build was successful.
 */
export interface BuildPluginResult {
  agents: number;
  skills: number;
  commands: number;
  hooks: number;
  failures: string[];
}

/**
 * Skills excluded from command generation.
 *
 * These skills are not exposed as slash commands because they are either:
 * - Internal orchestrator redirects (workflow-start)
 * - Reference/guidance skills for auto-invocation only (rule-* skills)
 */
const COMMAND_EXCLUDED_SKILLS: ReadonlySet<string> = new Set([
  "workflow-start",
  "rule-lu-workflow",
  "rule-complexity-gating",
  "rule-harness-verification",
  "rule-hook-skill-boundary",
  "rule-file-naming",
]);

/**
 * Hooks excluded from plugin builds.
 *
 * pre-commit-drift-check: Development-only hook that checks for
 * src/ -> output drift. References scripts/check-drift.ts which
 * does not exist in plugin context.
 */
const PLUGIN_EXCLUDED_HOOKS: ReadonlySet<string> = new Set([
  "pre-commit-drift-check",
]);

/**
 * Skill category assignments for README generation.
 *
 * Maps skill names to high-level categories for the "What's Included"
 * section. Categories are human-curated; counts auto-update from
 * registry sizes. Skills not in this map are counted as "Other".
 */
const SKILL_CATEGORIES: Record<string, string> = {
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
const AGENT_CATEGORIES: Record<string, string> = {
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
 * Generate plugin README.md content from registry counts and categories.
 */
function generateReadme(
  skillNames: string[],
  agentNames: string[],
  commandCount: number,
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

### Commands (${commandCount} total)

All non-reference skills are available as slash commands.

### Hooks (${hookCount} active)

Automated code formatting, type checking, pre-commit validation, context monitoring, and session management.

## License

MIT
`;
}

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
function generatePluginHooksConfig(
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
 * Generate a command markdown file for a skill.
 *
 * Commands are lightweight markdown files that register a skill as a
 * user-invokable slash command. The file contains YAML frontmatter with
 * the command description, which Claude Code uses for command listing
 * and discovery.
 *
 * @param skillName - The skill name (used as the command name)
 * @param description - The skill description (used as command description)
 * @returns Markdown string for the command file
 */
function generateCommandMarkdown(
  skillName: string,
  description: string,
): string {
  return `---\ndescription: ${description}\n---\n`;
}

/**
 * Read the package version from the luca-framework package.
 *
 * Falls back to the root package.json, then to "0.0.1" if no version
 * field is found in either location.
 *
 * @returns Semver version string
 */
async function readVersion(): Promise<string> {
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
 * Build a complete Claude Code plugin package under dist/plugin/.
 *
 * 1. Creates the plugin directory structure
 * 2. Cleans stale files from previous builds
 * 3. Compiles all agents from agentRegistry + Luca-specific agents
 * 4. Compiles all skills from skillRegistry + Luca-specific skill
 * 5. Generates command .md files for all command-eligible skills
 * 6. Copies hook scripts from src/hooks/scripts/
 * 7. Generates hooks/hooks.json with ${CLAUDE_PLUGIN_ROOT} paths
 * 8. Generates .claude-plugin/plugin.json manifest
 *
 * @returns Build result with counts and any failure details
 *
 * @example
 * ```typescript
 * const result = await buildPlugin();
 * console.log(`Built ${result.agents} agents, ${result.skills} skills, ${result.hooks} hooks`);
 * if (result.failures.length > 0) {
 *   console.error('Failures:', result.failures);
 * }
 * ```
 */
export async function buildPlugin(): Promise<BuildPluginResult> {
  const compiler = new PluginCompiler();

  // Define output directories
  const pluginDir = path.join(process.cwd(), "dist", "plugin");
  const manifestDir = path.join(pluginDir, ".claude-plugin");
  const agentsDir = path.join(pluginDir, "agents");
  const skillsDir = path.join(pluginDir, "skills");
  const commandsDir = path.join(pluginDir, "commands");
  const hooksDir = path.join(pluginDir, "hooks");
  const scriptsDir = path.join(pluginDir, "scripts");

  // Ensure all output directories exist
  await Promise.all([
    ensureDir(manifestDir),
    ensureDir(agentsDir),
    ensureDir(skillsDir),
    ensureDir(commandsDir),
    ensureDir(hooksDir),
    ensureDir(scriptsDir),
  ]);

  // Clean stale files before writing
  const [
    removedAgents,
    removedSkills,
    removedCommands,
    removedHooks,
    removedScripts,
  ] = await Promise.all([
    cleanDirectory(agentsDir, [".md"]),
    cleanSkillsDirectory(skillsDir),
    cleanDirectory(commandsDir, [".md"]),
    cleanDirectory(hooksDir, [".json"]),
    cleanDirectory(scriptsDir, [".sh"]),
  ]);

  const totalRemoved =
    removedAgents.length +
    removedSkills.length +
    removedCommands.length +
    removedHooks.length +
    removedScripts.length;

  if (totalRemoved)
    console.log(`Cleaned ${totalRemoved} stale files/directories`);

  let agentCount = 0;
  let skillCount = 0;
  let commandCount = 0;
  let hookCount = 0;
  const failures: string[] = [];
  const agentNames: string[] = [];
  const skillNames: string[] = [];
  const commandNames: string[] = [];
  const hookNames: string[] = [];

  // --- Agents ---

  // General agents from registry
  for (const [agentName, AgentClass] of Object.entries(agentRegistry)) {
    try {
      const instance = new (AgentClass as new () => BaseAgent)();
      const content = compiler.compileAgent(instance, "CLAUDE");

      await Bun.write(path.join(agentsDir, `${agentName}.md`), content);

      console.log(`  Generated agents/${agentName}.md`);
      agentNames.push(agentName);
      agentCount++;
    } catch (error) {
      console.error(`  Failed to generate agents/${agentName}.md:`, error);
      failures.push(`agent/${agentName}`);
    }
  }

  // Luca-specific agents
  try {
    const luExecutor = new LuExecutorAgent();
    await Bun.write(
      path.join(agentsDir, "lu-executor.md"),
      compiler.compileAgent(luExecutor, "CLAUDE"),
    );
    console.log("  Generated agents/lu-executor.md");
    agentNames.push("lu-executor");
    agentCount++;
  } catch (error) {
    console.error("  Failed to generate agents/lu-executor.md:", error);
    failures.push("agent/lu-executor");
  }

  try {
    const luPlanner = new LuPlannerAgent();
    await Bun.write(
      path.join(agentsDir, "lu-planner.md"),
      compiler.compileAgent(luPlanner, "CLAUDE"),
    );
    console.log("  Generated agents/lu-planner.md");
    agentNames.push("lu-planner");
    agentCount++;
  } catch (error) {
    console.error("  Failed to generate agents/lu-planner.md:", error);
    failures.push("agent/lu-planner");
  }

  // --- Skills ---

  // General skills from registry
  for (const [skillName, SkillClass] of Object.entries(skillRegistry)) {
    try {
      const instance = new (SkillClass as new () => BaseSkill)();
      const content = compiler.compileSkill(instance, "CLAUDE");

      const skillDir = path.join(skillsDir, skillName);
      await ensureDir(skillDir);
      await Bun.write(path.join(skillDir, "SKILL.md"), content);

      console.log(`  Generated skills/${skillName}/SKILL.md`);
      skillNames.push(skillName);
      skillCount++;
    } catch (error) {
      console.error(
        `  Failed to generate skills/${skillName}/SKILL.md:`,
        error,
      );
      failures.push(`skill/${skillName}`);
    }
  }

  // Luca-specific skill
  try {
    const luSkill = new LuSkill();
    const luSkillDir = path.join(skillsDir, "lu");
    await ensureDir(luSkillDir);
    await Bun.write(
      path.join(luSkillDir, "SKILL.md"),
      compiler.compileSkill(luSkill, "CLAUDE"),
    );
    console.log("  Generated skills/lu/SKILL.md");
    skillNames.push("lu");
    skillCount++;
  } catch (error) {
    console.error("  Failed to generate skills/lu/SKILL.md:", error);
    failures.push("skill/lu");
  }

  // --- Commands ---

  // Generate commands from general skills (excluding non-command skills)
  for (const [skillName, SkillClass] of Object.entries(skillRegistry)) {
    if (COMMAND_EXCLUDED_SKILLS.has(skillName)) {
      continue;
    }

    try {
      const instance = new (SkillClass as new () => BaseSkill)();
      const commandContent = generateCommandMarkdown(
        skillName,
        instance.description,
      );

      await Bun.write(
        path.join(commandsDir, `${skillName}.md`),
        commandContent,
      );

      console.log(`  Generated commands/${skillName}.md`);
      commandNames.push(skillName);
      commandCount++;
    } catch (error) {
      console.error(`  Failed to generate commands/${skillName}.md:`, error);
      failures.push(`command/${skillName}`);
    }
  }

  // Generate command for luca-specific lu skill
  try {
    const luSkill = new LuSkill();
    const luCommandContent = generateCommandMarkdown("lu", luSkill.description);

    await Bun.write(path.join(commandsDir, "lu.md"), luCommandContent);

    console.log("  Generated commands/lu.md");
    commandNames.push("lu");
    commandCount++;
  } catch (error) {
    console.error("  Failed to generate commands/lu.md:", error);
    failures.push("command/lu");
  }

  // --- Hook Scripts ---

  // Filter hooks for plugin context (exclude development-only hooks)
  const pluginHookRegistry = Object.fromEntries(
    Object.entries(hookRegistry).filter(
      ([name]) => !PLUGIN_EXCLUDED_HOOKS.has(name),
    ),
  );

  if (PLUGIN_EXCLUDED_HOOKS.size > 0) {
    console.log(
      `  Excluded ${PLUGIN_EXCLUDED_HOOKS.size} hook(s): ${[...PLUGIN_EXCLUDED_HOOKS].join(", ")}`,
    );
  }

  const hookScriptsDir = path.join(process.cwd(), "src", "hooks", "scripts");

  for (const [hookName, hookDef] of Object.entries(pluginHookRegistry)) {
    try {
      const srcPath = path.join(hookScriptsDir, hookDef.script);
      const destPath = path.join(scriptsDir, hookDef.script);

      const srcFile = Bun.file(srcPath);
      if (!(await srcFile.exists())) {
        console.error(
          `  Hook script not found: src/hooks/scripts/${hookDef.script}`,
        );
        failures.push(`hook/${hookName}`);
        continue;
      }

      await Bun.write(destPath, srcFile);

      // Make script executable
      const { exitCode } = Bun.spawnSync(["chmod", "+x", destPath]);
      if (exitCode !== 0) {
        console.error(`  Failed to chmod +x ${destPath}`);
      }

      console.log(`  Generated scripts/${hookDef.script}`);
      hookNames.push(hookName);
      hookCount++;
    } catch (error) {
      console.error(`  Failed to copy hook script ${hookDef.script}:`, error);
      failures.push(`hook/${hookName}`);
    }
  }

  // --- Hooks Configuration ---

  const pluginHooksConfig = generatePluginHooksConfig(pluginHookRegistry);
  await Bun.write(
    path.join(hooksDir, "hooks.json"),
    JSON.stringify(pluginHooksConfig, null, 2) + "\n",
  );
  console.log("  Generated hooks/hooks.json");

  // --- Plugin Manifest ---

  const version = await readVersion();

  const manifest = generatePluginManifest({
    name: "luca",
    version,
    description:
      "Luca - Agentic development framework with cognitive memory and spec-driven workflow",
    author: {
      name: "Alec Sibilia",
    },
    keywords: ["agent", "ai", "framework", "luca", "workflow", "cognitive"],
    commands: commandNames,
    agents: agentNames,
    skills: skillNames,
    hooks: hookNames,
  });

  await Bun.write(
    path.join(manifestDir, "plugin.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log("  Generated .claude-plugin/plugin.json");

  // --- Marketplace Manifest ---

  const marketplaceManifest = {
    $schema: "https://anthropic.com/claude-code/marketplace.schema.json",
    name: "luca-marketplace",
    description:
      "Luca - Agentic development framework with cognitive memory and spec-driven workflow",
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

  await Bun.write(
    path.join(manifestDir, "marketplace.json"),
    JSON.stringify(marketplaceManifest, null, 2) + "\n",
  );
  console.log("  Generated .claude-plugin/marketplace.json");

  // --- Summary ---

  const totalFiles = agentCount + skillCount + commandCount + hookCount + 3; // +3 for hooks.json, plugin.json, and marketplace.json

  console.log("\n=== Plugin Build Summary ===");
  console.log(`Agents:   ${agentCount}`);
  console.log(`Skills:   ${skillCount}`);
  console.log(`Commands: ${commandCount}`);
  console.log(`Hooks:    ${hookCount}`);
  console.log(`Manifests:   plugin.json + marketplace.json`);
  console.log(`Total:    ${totalFiles} files`);
  console.log(`Output:   dist/plugin/`);

  if (failures.length > 0) {
    console.error(`\nBuild completed with ${failures.length} failure(s):`);
    for (const f of failures) {
      console.error(`  - ${f}`);
    }
  }

  return {
    agents: agentCount,
    skills: skillCount,
    commands: commandCount,
    hooks: hookCount,
    failures,
  };
}

// --- Standalone entry point ---
if (import.meta.main) {
  buildPlugin()
    .then((result) => {
      if (result.failures.length > 0) {
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error("\n========================================");
      console.error("  BUILD FAILED: build-plugin");
      console.error("========================================\n");
      console.error("What failed:", error.message || error);
      console.error("\nTroubleshooting:");
      console.error(
        "  1. Ensure all source classes in src/ compile: bun build ./src/index.ts",
      );
      console.error("  2. Check that PluginCompiler exists in src/compilers/");
      console.error(
        "  3. Verify the registries export correctly from src/*/index.ts",
      );
      console.error("\nStack trace:");
      console.error(error.stack || error);
      process.exit(1);
    });
}
