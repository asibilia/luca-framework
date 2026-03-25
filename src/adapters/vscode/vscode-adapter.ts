/**
 * VS Code / GitHub Copilot adapter — compiles Luca definitions to .github/ directory artifacts.
 *
 * Factory function returning an Adapter that compiles agents to `.agent.md` format
 * with richer frontmatter, skills to SKILL.md with required `name`/`description`
 * frontmatter, and rules to single-file sections for `copilot-instructions.md`.
 *
 * CRITICAL: All compilation methods read from `entity.config.frontmatter` and
 * `entity.config.sections` directly. They NEVER call `toClaudeFormat()`.
 * See PREMORTEM.md Risk #1 for rationale.
 *
 * @module
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

import type { Adapter, EmitResult } from "../__schemas/adapter.schemas";
import type { BaseAgent } from "~/agents";
import type { BaseSkill } from "~/skills";
import type { BaseRule } from "~/rules";
import { formatFrontmatter } from "~/shared/__helpers/utils";
import { enforceCharacterBudget } from "../__helpers/character-budget";
import { sectionsToMarkdown } from "../__helpers/format-sections";
import { emitCompiledOutputs } from "../__helpers/adapter-emit";
import { validateVscodeOutput } from "../__helpers/compatibility-validator";

/**
 * Maximum character count for a VS Code agent profile.
 *
 * VS Code / GitHub Copilot enforces a 30,000 character limit per `.agent.md` file.
 * Content exceeding this limit is truncated at section boundaries with a warning.
 */
const VSCODE_AGENT_CHAR_LIMIT = 30_000;

/**
 * Compile an agent definition to VS Code `.agent.md` format.
 *
 * Reads from `agent.config.frontmatter` and `agent.config.sections` directly.
 * NEVER calls `toClaudeFormat()`.
 *
 * VS Code agent frontmatter includes:
 * - `name`: lowercase with hyphens, max 64 chars
 * - `description`: passthrough from agent config
 * - `tools`: always `["*"]`
 * - `user-invocable`: always `true`
 * - `model`: mapped from `model_routing` tier if present
 *
 * Agent profiles are enforced to 30K character budget. Exceeding content
 * is truncated at section boundaries with a warning.
 *
 * @param agent - The agent definition to compile
 * @returns Object with `content` (compiled markdown) and `warning` (truncation warning or null)
 */
function compileVscodeAgent(agent: BaseAgent): {
  content: string;
  warning: string | null;
} {
  const { frontmatter, sections } = agent.config;

  // Build VS Code-specific frontmatter
  const vscodeFields: Record<string, unknown> = {
    name: frontmatter.name.slice(0, 64),
    description: frontmatter.description,
    tools: ["*"],
    "user-invocable": true,
  };

  // Map model_routing tier to model string if present
  if (frontmatter.model_routing?.default_model) {
    vscodeFields.model = frontmatter.model_routing.default_model;
  }

  const yamlFrontmatter = formatFrontmatter(vscodeFields);
  const body = sectionsToMarkdown(sections);
  const fullContent = `${yamlFrontmatter}\n\n${body}`;

  // Enforce 30K character budget
  const { result, warning } = enforceCharacterBudget(
    fullContent,
    VSCODE_AGENT_CHAR_LIMIT,
    `src/agents/${frontmatter.name}`,
  );

  return { content: result, warning };
}

/**
 * Compile a skill definition to VS Code SKILL.md format.
 *
 * Reads from `skill.config.frontmatter` and `skill.config.sections` directly.
 * NEVER calls `toClaudeFormat()`.
 *
 * VS Code requires `name` and `description` in SKILL.md frontmatter
 * (Claude Code does not). This function always prepends the required frontmatter.
 *
 * @param skill - The skill definition to compile
 * @returns Compiled markdown string with name/description frontmatter
 */
function compileVscodeSkill(skill: BaseSkill): string {
  const { frontmatter, sections } = skill.config;

  const vscodeFields: Record<string, unknown> = {
    name: frontmatter.name,
    description: frontmatter.description,
    "user-invocable": true,
  };

  const yamlFrontmatter = formatFrontmatter(vscodeFields);
  const body = sectionsToMarkdown(sections);

  return `${yamlFrontmatter}\n\n${body}`;
}

/**
 * Compile a single rule definition to a VS Code copilot-instructions.md section.
 *
 * Reads from `rule.config.frontmatter` and `rule.config.sections` directly.
 * NEVER calls `toClaudeFormat()`.
 *
 * VS Code uses a single `.github/copilot-instructions.md` file. Each rule
 * compiles to a section: `## {rule.name}\n\n{sections concatenated}`.
 *
 * Rules with `globs` patterns produce a warning because VS Code does not
 * support per-file rule scoping. These rules are NOT included in the
 * copilot-instructions output.
 *
 * @param rule - The rule definition to compile
 * @returns Object with `content` (section markdown or empty string) and `warning` (scoping warning or null)
 */
function compileVscodeRule(rule: BaseRule): {
  content: string;
  warning: string | null;
} {
  const { frontmatter, sections } = rule.config;

  // Rules with globs cannot be represented in single-file format
  if (frontmatter.globs && frontmatter.globs.length > 0) {
    return {
      content: "",
      warning:
        `Rule "${rule.name}" uses glob patterns (${frontmatter.globs.join(", ")}) ` +
        `which VS Code does not support. Per-file scoped rules are excluded from copilot-instructions.md.`,
    };
  }

  const body = sectionsToMarkdown(sections);
  const content = `## ${rule.name}\n\n${body}`;

  return { content, warning: null };
}

/**
 * Create the VS Code / GitHub Copilot adapter.
 *
 * Compiles Luca definitions to `.github/` directory artifacts:
 * - Agents: `.github/agents/{name}.agent.md` with richer frontmatter
 * - Skills: `.github/skills/{name}/SKILL.md` with required name/description
 * - Rules: `.github/copilot-instructions.md` (single file, all alwaysApply rules)
 * - Hooks: `.github/hooks/` (Preview API, marked as unstable)
 *
 * All compilation methods read from `entity.config.frontmatter` and
 * `entity.config.sections` directly. They NEVER call `toClaudeFormat()`.
 *
 * @returns A fully-configured Adapter instance for VS Code / GitHub Copilot
 *
 * @example
 * ```typescript
 * import { createVscodeAdapter } from "~/adapters/vscode/vscode-adapter";
 * const adapter = createVscodeAdapter();
 * const { content, warning } = compileVscodeAgent(myAgent);
 * ```
 */
export function createVscodeAdapter(): Adapter {
  /** Internal buffer: relative path -> compiled content */
  const compiledOutputs = new Map<string, string>();
  /** Warnings accumulated during compile*() calls */
  const ruleWarnings: string[] = [];

  return {
    config: {
      name: "vscode",
      description: "VS Code / GitHub Copilot (.github/ directory artifacts)",
      supportedFeatures: {
        agents: true,
        skills: true,
        rules: true,
        hooks: true,
        workflows: false,
        headless: false,
      },
    },

    compileAgent: (agent: BaseAgent): string => {
      const { content, warning } = compileVscodeAgent(agent);
      compiledOutputs.set(
        `agents/${agent.config.frontmatter.name}.agent.md`,
        content,
      );
      if (warning) {
        ruleWarnings.push(warning);
      }
      return content;
    },

    compileSkill: (skill: BaseSkill): string => {
      const compiled = compileVscodeSkill(skill);
      compiledOutputs.set(`skills/${skill.name}/SKILL.md`, compiled);
      return compiled;
    },

    compileRule: (rule: BaseRule): string => {
      const { content, warning } = compileVscodeRule(rule);
      if (content) {
        compiledOutputs.set(`copilot-instructions/${rule.name}.md`, content);
      }
      if (warning) {
        ruleWarnings.push(warning);
      }
      return content;
    },

    /**
     * Write compiled artifacts to disk.
     *
     * Delegates to the shared emit orchestration helper with a preEmit hook
     * that aggregates all `copilot-instructions/*` entries into a single
     * `copilot-instructions.md` file separated by `\n\n---\n\n`.
     * Clears the buffer and ruleWarnings after emission.
     *
     * @param outputDir - Root directory for output artifacts
     * @returns Emission result with file counts, paths, and warnings
     */
    validate: (emitResult: EmitResult) => validateVscodeOutput(emitResult),

    emit: async (outputDir: string): Promise<EmitResult> => {
      const result = await emitCompiledOutputs(compiledOutputs, outputDir, {
        existingWarnings: [...ruleWarnings],
        preEmit: (entries) => {
          const ruleSections: string[] = [];
          const filteredFiles = new Map<string, string>();

          // Separate copilot-instructions entries from other files
          for (const [relativePath, content] of entries) {
            if (relativePath.startsWith("copilot-instructions/")) {
              ruleSections.push(content);
            } else {
              filteredFiles.set(relativePath, content);
            }
          }

          // Aggregate rules into a single copilot-instructions.md
          const extraFiles: Array<{ path: string; content: string }> = [];
          if (ruleSections.length > 0) {
            extraFiles.push({
              path: "copilot-instructions.md",
              content: ruleSections.join("\n\n---\n\n"),
            });
          }

          return { files: filteredFiles, extraFiles };
        },
      });

      ruleWarnings.length = 0;
      return result;
    },

    detect: (projectRoot: string): boolean => {
      return existsSync(join(projectRoot, ".github", "agents"));
    },
  };
}

// Re-export compile functions for direct use by build pipeline
export { compileVscodeAgent, compileVscodeSkill, compileVscodeRule };
