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
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import orderBy from "lodash/orderBy";

import type { Adapter, EmitResult } from "../__schemas/adapter.schemas";
import type { BaseAgent } from "~/agents";
import type { BaseSkill } from "~/skills";
import type { BaseRule } from "~/rules";
import { enforceCharacterBudget } from "../__helpers/character-budget";

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
 * Build the Windsurf workspace rule frontmatter block.
 *
 * Format:
 * ```yaml
 * ---
 * trigger: always_on | glob | model_decision
 * description: {description}
 * globs: {glob patterns, only if trigger is "glob"}
 * ---
 * ```
 *
 * @param trigger - The resolved Windsurf trigger value
 * @param description - The rule description
 * @param globs - Optional glob patterns (included only when trigger is "glob")
 * @returns The YAML frontmatter string including delimiters
 */
function buildWindsurfFrontmatter(
  trigger: WindsurfTrigger,
  description: string,
  globs?: string[],
): string {
  const lines: string[] = ["---"];
  lines.push(`trigger: ${trigger}`);
  lines.push(`description: ${description}`);
  if (trigger === "glob" && globs && globs.length > 0) {
    lines.push(`globs: ${globs.join(", ")}`);
  }
  lines.push("---");
  return lines.join("\n") + "\n";
}

/**
 * Compile a Luca rule's sections into a body string.
 *
 * Sections are ordered by their `order` field (ascending, defaulting to 0),
 * then concatenated with `## Title` headings for sections that have titles.
 *
 * CRITICAL: This reads directly from rule.config.sections, NOT toClaudeFormat().
 *
 * @param sections - The rule's config sections
 * @returns The compiled body string
 */
function compileSectionsToBody(
  sections: ReadonlyArray<{ title: string; content: string; order?: number }>,
): string {
  return orderBy(sections, [(s) => s.order ?? 0], ["asc"])
    .map((section) => {
      if (section.title) {
        return `## ${section.title}\n\n${section.content}`;
      }
      return section.content;
    })
    .join("\n\n")
    .trim();
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
export function createWindsurfAdapter(): Adapter {
  /** Internal buffer: relative path -> compiled content */
  const compiledOutputs = new Map<string, string>();

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
      const sectionsBody = compileSectionsToBody(sections);

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

      // Build Windsurf frontmatter
      const windsurfFrontmatter = buildWindsurfFrontmatter(
        trigger,
        frontmatter.description,
        frontmatter.globs,
      );

      // Compile sections to body (directly from config, NOT toClaudeFormat)
      const body = compileSectionsToBody(sections);

      // Assemble full rule content
      const compiled = windsurfFrontmatter + "\n" + body + "\n";

      // Enforce character budget
      const { result } = enforceCharacterBudget(
        compiled,
        WORKSPACE_RULE_CHAR_LIMIT,
        `rules/${rule.name}`,
      );

      compiledOutputs.set(`rules/${rule.name}.md`, result);
      return result;
    },

    /**
     * Write compiled artifacts to disk.
     *
     * Iterates all entries accumulated by compile*() calls, writes each
     * to the corresponding path under `outputDir`, and returns a populated
     * EmitResult. Clears the buffer after emission.
     *
     * @param outputDir - Root directory for output artifacts
     * @returns Emission result with file counts, paths, and warnings
     */
    emit: async (outputDir: string): Promise<EmitResult> => {
      const filesPaths: string[] = [];
      const warnings: string[] = [];

      for (const [relativePath, content] of compiledOutputs) {
        const absolutePath = join(outputDir, relativePath);
        await mkdir(dirname(absolutePath), { recursive: true });
        await Bun.write(absolutePath, content);
        filesPaths.push(absolutePath);
      }

      const result: EmitResult = {
        filesWritten: filesPaths.length,
        filesPaths,
        warnings,
      };

      compiledOutputs.clear();
      return result;
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
