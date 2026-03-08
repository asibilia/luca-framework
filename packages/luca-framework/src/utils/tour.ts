import * as p from "@clack/prompts";

import { logger } from "./logger";

import type { LucaConfig, ProjectContext, InstallationStats } from "../types";

/**
 * Tour step configuration for a single informational step.
 *
 * Each step renders a note with a title and body, followed by
 * a confirm prompt to continue or exit the tour.
 */
interface TourStep {
  /** Title shown in the note header */
  title: string;
  /** Body content shown in the note */
  body: string;
}

/**
 * Build the harness display names string from config.
 *
 * Maps harness IDs to their directory names for display.
 *
 * @param harnesses - Array of harness IDs from config
 * @returns Comma-separated harness directory names (e.g., ".claude/, .cursor/")
 */
function formatHarnessNames(harnesses: string[]): string {
  const nameMap: Record<string, string> = {
    claude: ".claude/",
    cursor: ".cursor/",
    pi: ".pi/",
  };
  return harnesses.map((h) => nameMap[h] ?? h).join(", ");
}

/**
 * Build startup instructions per harness.
 *
 * Provides harness-specific instructions for launching the
 * AI assistant after init completes.
 *
 * @param harnesses - Array of harness IDs from config
 * @param commandPrefix - Command prefix from branding (e.g., "lu")
 * @returns Formatted startup instruction string
 */
function buildStartupInstructions(
  harnesses: string[],
  commandPrefix: string,
): string {
  const lines: string[] = [];

  if (harnesses.includes("claude")) {
    lines.push(`  Claude Code: Open terminal, type "claude" to start`);
    lines.push(`    Then use /${commandPrefix} to invoke the router`);
  }
  if (harnesses.includes("cursor")) {
    lines.push(`  Cursor IDE:  Open project in Cursor`);
    lines.push(`    Then use /${commandPrefix} in the AI chat panel`);
  }
  if (harnesses.includes("pi")) {
    lines.push(`  Pi:          Open project in Pi`);
    lines.push(`    Then use /${commandPrefix} to invoke the router`);
  }

  if (lines.length === 0) {
    lines.push(`  Use /${commandPrefix} in your AI assistant to get started`);
  }

  return lines.join("\n");
}

/**
 * Build tour steps based on config, context, and optional installation stats.
 *
 * When stats are provided, Step 2 shows actual file counts.
 * When projectDescription is available, a personalized intro step is prepended.
 *
 * @param config - LucaConfig from the init wizard
 * @param context - Detected project context
 * @param stats - Optional installation stats from generateFiles
 * @returns Array of TourStep objects (4 or 5 depending on context)
 */
function buildTourSteps(
  config: LucaConfig,
  context: ProjectContext,
  stats?: InstallationStats,
): TourStep[] {
  const harnesses = config.harnesses ?? ["claude", "cursor"];
  const harnessNames = formatHarnessNames(harnesses);
  const commandPrefix = config.branding.commandPrefix;
  const frameworkName = config.branding.frameworkName;

  const steps: TourStep[] = [];

  // Step 0 (optional): Personalized intro when projectDescription is available
  if (context.projectDescription) {
    steps.push({
      title: "Welcome",
      body:
        `Setting up ${frameworkName} for "${context.projectDescription}".\n\n` +
        `The next steps will walk you through what was installed\n` +
        `and how to get started.`,
    });
  }

  // Step: BRAIN.md Orientation
  steps.push({
    title: `Step ${steps.length + 1}: Project Identity`,
    body:
      `Your project identity file is at .planning/BRAIN.md\n\n` +
      `This file defines your project's personality for AI agents:\n` +
      `  - Project name and domain\n` +
      `  - Tech stack and frameworks\n` +
      `  - Architecture patterns\n` +
      `  - Code conventions\n\n` +
      `Customize it now or later -- agents will use it for context.`,
  });

  // Step: Generated Files Summary (dynamic or static)
  const step2Body = stats
    ? `Installed ${stats.agent_count} agents, ${stats.skill_count} skills, ` +
      `${stats.rule_count} rules, ${stats.hook_count} hooks into ${harnessNames}\n\n` +
      `  Agents   (orchestration, code review, verification)\n` +
      `  Skills   (git, planning, testing workflows)\n` +
      `  Rules    (code conventions, architecture patterns)\n` +
      `  Hooks    (pre-commit gate, type checking, formatting)\n\n` +
      `These are generated from src/ -- edit sources, then bun run build:all.`
    : `Installed into ${harnessNames}:\n\n` +
      `  Agents   (orchestration, code review, verification)\n` +
      `  Skills   (git, planning, testing workflows)\n` +
      `  Rules    (code conventions, architecture patterns)\n` +
      `  Hooks    (pre-commit gate, type checking, formatting)\n\n` +
      `These are generated from src/ -- edit sources, then bun run build:all.`;

  steps.push({
    title: `Step ${steps.length + 1}: What Was Generated`,
    body: step2Body,
  });

  // Step: Startup Command
  const startupInstructions = buildStartupInstructions(
    harnesses,
    commandPrefix,
  );
  steps.push({
    title: `Step ${steps.length + 1}: Getting Started`,
    body: `To start using ${frameworkName}:\n\n` + startupInstructions,
  });

  // Step: Suggested First Command (uses enhanced context detection)
  const suggestedCommand = context.suggestedFirstCommand ?? `/${commandPrefix}`;
  steps.push({
    title: `Step ${steps.length + 1}: Your First Command`,
    body:
      `Try this first:\n\n` +
      `  ${suggestedCommand}\n\n` +
      `This invokes the intelligent router which will:\n` +
      `  1. Load your BRAIN.md context\n` +
      `  2. Recall relevant patterns from MEMORY.md\n` +
      `  3. Route your request to the right agent`,
  });

  return steps;
}

/**
 * Run the post-init interactive tour.
 *
 * Walks users through informational steps after a successful
 * `bun run luca init`. Each step uses @clack/prompts for a
 * consistent DX with the init wizard. Users can exit at any
 * step by declining the continue prompt or pressing Ctrl+C.
 *
 * When stats are provided, dynamic file counts are shown.
 * When projectDescription is available, a personalized intro is added.
 *
 * This function never throws -- all errors are caught internally
 * and logged as debug messages to avoid interfering with init success.
 *
 * @param config - LucaConfig from the init wizard or args
 * @param context - Detected project context
 * @param stats - Optional installation stats from generateFiles (for dynamic counts)
 *
 * @example
 * ```typescript
 * const config = createConfigFromArgs({});
 * const context = await detectProjectContext();
 * const result = await generateFiles({ config });
 * if (result.success) {
 *   await runTour(config, context, result.stats);
 * }
 * ```
 */
export async function runTour(
  config: LucaConfig,
  context: ProjectContext,
  stats?: InstallationStats,
): Promise<void> {
  try {
    const steps = buildTourSteps(config, context, stats);

    const wantsTour = await p.confirm({
      message: "Would you like a quick tour of what was set up?",
    });

    if (p.isCancel(wantsTour) || !wantsTour) {
      return;
    }

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]!;
      p.note(step.body, step.title);

      // Don't ask to continue after the last step
      if (i < steps.length - 1) {
        const shouldContinue = await p.confirm({
          message: "Continue to next step?",
        });

        if (p.isCancel(shouldContinue) || !shouldContinue) {
          p.outro("Tour ended. You can always check .planning/ for docs.");
          return;
        }
      }
    }

    p.outro("Tour complete! Happy building.");
  } catch (error) {
    // Tour errors are non-fatal -- log and return silently
    logger.debug(
      `Tour encountered an error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
