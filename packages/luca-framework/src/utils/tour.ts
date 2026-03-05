import * as p from "@clack/prompts";

import { logger } from "./logger";

import type { LucaConfig, ProjectContext } from "../types";

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
 * Build the 4 tour steps based on config and context.
 *
 * @param config - LucaConfig from the init wizard
 * @param context - Detected project context
 * @returns Array of 4 TourStep objects
 */
function buildTourSteps(
  config: LucaConfig,
  context: ProjectContext,
): TourStep[] {
  const harnesses = config.harnesses ?? ["claude", "cursor"];
  const harnessNames = formatHarnessNames(harnesses);
  const commandPrefix = config.branding.commandPrefix;
  const frameworkName = config.branding.frameworkName;

  // Step 1: BRAIN.md Orientation
  const step1: TourStep = {
    title: "Step 1: Project Identity",
    body:
      `Your project identity file is at .planning/BRAIN.md\n\n` +
      `This file defines your project's personality for AI agents:\n` +
      `  - Project name and domain\n` +
      `  - Tech stack and frameworks\n` +
      `  - Architecture patterns\n` +
      `  - Code conventions\n\n` +
      `Customize it now or later -- agents will use it for context.`,
  };

  // Step 2: Generated Files Summary
  const step2: TourStep = {
    title: "Step 2: What Was Generated",
    body:
      `Installed into ${harnessNames}:\n\n` +
      `  Agents   (orchestration, code review, verification)\n` +
      `  Skills   (git, planning, testing workflows)\n` +
      `  Rules    (code conventions, architecture patterns)\n` +
      `  Hooks    (pre-commit gate, type checking, formatting)\n\n` +
      `These are generated from src/ -- edit sources, then bun run build:all.`,
  };

  // Step 3: Startup Command
  const startupInstructions = buildStartupInstructions(
    harnesses,
    commandPrefix,
  );
  const step3: TourStep = {
    title: "Step 3: Getting Started",
    body: `To start using ${frameworkName}:\n\n` + startupInstructions,
  };

  // Step 4: Suggested First Command
  const suggestedCommand = context.suggestedFirstCommand ?? `/${commandPrefix}`;
  const step4: TourStep = {
    title: "Step 4: Your First Command",
    body:
      `Try this first:\n\n` +
      `  ${suggestedCommand}\n\n` +
      `This invokes the intelligent router which will:\n` +
      `  1. Load your BRAIN.md context\n` +
      `  2. Recall relevant patterns from MEMORY.md\n` +
      `  3. Route your request to the right agent`,
  };

  return [step1, step2, step3, step4];
}

/**
 * Run the post-init interactive tour.
 *
 * Walks users through 4 informational steps after a successful
 * `bun run luca init`. Each step uses @clack/prompts for a
 * consistent DX with the init wizard. Users can exit at any
 * step by declining the continue prompt or pressing Ctrl+C.
 *
 * This function never throws -- all errors are caught internally
 * and logged as debug messages to avoid interfering with init success.
 *
 * @param config - LucaConfig from the init wizard or args
 * @param context - Detected project context
 *
 * @example
 * ```typescript
 * const config = createConfigFromArgs({});
 * const context = await detectProjectContext();
 * await runTour(config, context);
 * ```
 */
export async function runTour(
  config: LucaConfig,
  context: ProjectContext,
): Promise<void> {
  try {
    const steps = buildTourSteps(config, context);

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
