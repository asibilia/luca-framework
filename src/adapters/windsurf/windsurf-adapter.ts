/**
 * Windsurf (Codeium) adapter -- compiles Luca definitions to .windsurf/ directory artifacts.
 *
 * Factory function returning an Adapter that compiles rules to Windsurf's
 * workspace rule format (YAML frontmatter with `trigger` field), skills to
 * Windsurf Workflows, and stubs agents (unsupported format).
 *
 * Key constraints:
 * - 12K character limit per workspace rule file
 * - 12K character limit per workflow file
 * - Trigger-based frontmatter mapping (always_on, glob, model_decision)
 * - Compiles from entity.config.frontmatter/sections directly (NOT toClaudeFormat)
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

/**
 * Format version for the Windsurf adapter output.
 *
 * Bumped when Cognition changes the .windsurf/ format specification.
 * Consumers can check this to determine compatibility.
 */
export const FORMAT_VERSION = "2026.03" as const;

/**
 * Maximum characters allowed per workspace rule file in Windsurf.
 */
const WORKSPACE_RULE_CHAR_LIMIT = 12_000;

/**
 * Maximum characters allowed per workflow file in Windsurf.
 */
const WORKFLOW_CHAR_LIMIT = 12_000;

/**
 * Windsurf trigger types for workspace rule frontmatter.
 *
 * Mapped from Luca rule properties:
 * - alwaysApply: true -> always_on
 * - globs present (no alwaysApply) -> glob
 * - neither -> model_decision
 */
type WindsurfTrigger = "always_on" | "glob" | "model_decision";

/**
 * Map a Luca rule's frontmatter properties to the corresponding Windsurf trigger value.
 *
 * Mapping logic:
 * - `alwaysApply: true` produces `always_on`
 * - `globs` array present (without `alwaysApply`) produces `glob`
 * - Neither property set produces `model_decision`
 *
 * @param frontmatter - The rule's frontmatter object
 * @returns The Windsurf trigger string
 */
function mapTrigger(frontmatter: {
  alwaysApply?: boolean;
  globs?: string[];
}): WindsurfTrigger {
  if (frontmatter.alwaysApply === true) {
    return "always_on";
  }
  if (frontmatter.globs && frontmatter.globs.length > 0) {
    return "glob";
  }
  return "model_decision";
}

/**
 * Create the Windsurf (Codeium) adapter.
 *
 * Compiles rules to Windsurf workspace rule format with trigger-based
 * frontmatter, skills to Windsurf Workflows, and stubs agents (no format).
 * Enforces 12K character budget per workspace rule and workflow file.
 *
 * @returns A fully-configured Adapter instance for Windsurf
 *
 * @example
 * ```typescript
 * import { createWindsurfAdapter } from "~/adapters/windsurf/windsurf-adapter";
 * const adapter = createWindsurfAdapter();
 * const ruleMarkdown = adapter.compileRule(myRule);
 * ```
 */
/** Maximum characters allowed for all global (always_on) rules combined. */
const GLOBAL_RULES_CHAR_LIMIT = 6_000;

export function createWindsurfAdapter(): Adapter {
  /** Internal buffer: relative path -> compiled content */
  const compiledOutputs = new Map<string, string>();
  /** Track always_on rule paths for global budget enforcement at emit time */
  const alwaysOnRulePaths = new Set<string>();

  return {
    config: {
      name: "windsurf",
      description: "Windsurf / Codeium (.windsurf/ directory artifacts)",
      supportedFeatures: {
        agents: false,
        skills: true,
        rules: true,
        hooks: true,
        workflows: false,
        headless: false,
      },
    },

    /**
     * Compile an agent definition.
     *
     * Windsurf has no agent profile format. Returns empty string.
     *
     * @param _agent - The agent definition (unused)
     * @returns Empty string
     */
    compileAgent: (_agent: BaseAgent): string => {
      return "";
    },

    /**
     * Compile a skill definition to Windsurf Workflow format.
     *
     * Output format:
     * ```markdown
     * # {name}
     *
     * {description}
     *
     * ## Steps
     *
     * {sections concatenated}
     * ```
     *
     * Enforces 12K character budget per workflow.
     *
     * @param skill - The skill definition to compile
     * @returns Compiled Windsurf Workflow markdown string
     */
    compileSkill: (skill: BaseSkill): string => {
      const { frontmatter, sections } = skill.config;

      // Build workflow body from sections
      const sectionsBody = sectionsToMarkdown(sections);

      // Assemble Windsurf Workflow format
      const workflow = [
        `# ${frontmatter.name}`,
        "",
        frontmatter.description,
        "",
        "## Steps",
        "",
        sectionsBody,
      ].join("\n");

      // Enforce character budget
      const { result } = enforceCharacterBudget(
        workflow,
        WORKFLOW_CHAR_LIMIT,
        `skills/${skill.name}`,
      );

      compiledOutputs.set(`workflows/${skill.name}.md`, result);
      return result;
    },

    /**
     * Compile a rule definition to Windsurf workspace rule format.
     *
     * CRITICAL: Reads from rule.config.frontmatter and rule.config.sections
     * directly -- NEVER calls toClaudeFormat().
     *
     * Produces YAML frontmatter with trigger mapping, followed by the
     * rule body. Enforces 12K character budget per workspace rule file.
     *
     * @param rule - The rule definition to compile
     * @returns Compiled Windsurf workspace rule markdown string
     */
    compileRule: (rule: BaseRule): string => {
      const { frontmatter, sections } = rule.config;

      // Map Luca rule properties to Windsurf trigger
      const trigger = mapTrigger(frontmatter);

      // Build frontmatter fields object
      const fields: Record<string, unknown> = {
        trigger,
        description: frontmatter.description,
      };
      if (
        trigger === "glob" &&
        frontmatter.globs &&
        frontmatter.globs.length > 0
      ) {
        fields.globs = frontmatter.globs.join(", ");
      }

      const windsurfFrontmatter = formatFrontmatter(fields);

      // Compile sections to body (directly from config, NOT toClaudeFormat)
      const body = sectionsToMarkdown(sections);

      // Assemble full rule content
      const compiled = windsurfFrontmatter + "\n\n" + body + "\n";

      // Enforce character budget
      const { result } = enforceCharacterBudget(
        compiled,
        WORKSPACE_RULE_CHAR_LIMIT,
        `rules/${rule.name}`,
      );

      const rulePath = `rules/${rule.name}.md`;
      compiledOutputs.set(rulePath, result);
      if (trigger === "always_on") {
        alwaysOnRulePaths.add(rulePath);
      }
      return result;
    },

    /**
     * Write compiled artifacts to disk.
     *
     * Delegates to the shared emit orchestration helper.
     * Clears the buffer after emission.
     *
     * @param outputDir - Root directory for output artifacts
     * @returns Emission result with file counts, paths, and warnings
     */
    emit: async (outputDir: string): Promise<EmitResult> => {
      return emitCompiledOutputs(compiledOutputs, outputDir, {
        preEmit: (outputs) => {
          const warnings: string[] = [];

          // Enforce 6K global rules budget across all always_on rules
          let globalTotal = 0;
          for (const path of alwaysOnRulePaths) {
            const content = outputs.get(path);
            if (content) globalTotal += content.length;
          }
          if (globalTotal > GLOBAL_RULES_CHAR_LIMIT) {
            warnings.push(
              `Global always_on rules total ${globalTotal} chars exceeds ${GLOBAL_RULES_CHAR_LIMIT} char limit (${alwaysOnRulePaths.size} rules)`,
            );
          }

          return { files: outputs, warnings };
        },
      });
    },

    /**
     * Detect whether a .windsurf/ directory exists at the project root.
     *
     * @param projectRoot - Absolute path to the project root
     * @returns true if .windsurf/ directory is found
     */
    detect: (projectRoot: string): boolean => {
      return existsSync(join(projectRoot, ".windsurf"));
    },
  };
}
