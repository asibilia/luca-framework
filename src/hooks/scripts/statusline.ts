/**
 * statusline — Claude Code status line with real-time context metrics.
 *
 * NOT a lifecycle hook. Called by Claude Code after every API response.
 * Receives full session JSON on stdin, outputs a formatted status line,
 * and writes real token metrics to .planning/.context-metrics.json.
 *
 * Always exits 0 — status line must never fail visibly.
 *
 * @module statusline
 */

import { realpathSync } from "node:fs";
import { resolve } from "path";
import { z } from "zod";
import get from "lodash/get";

import { sanitizeJsonParse } from "../../shared";

import { projectDir } from "../__helpers/hook-io.ts";

// ─── Workflow HUD ────────────────────────────────────────────────────────────

const DisplayStateEnum = z.enum([
  "EXECUTING",
  "PLANNING",
  "VERIFYING",
  "PAUSED",
  "FAILED",
  "idle",
]);

const WorkflowHudStateSchema = z.object({
  displayState: DisplayStateEnum.default("idle"),
  icon: z.string().default("\u25c7"),
  phaseLabel: z.string().default(""),
  complexity: z.string().default(""),
  milestone: z.string().default(""),
  currentWave: z.number().default(0),
  totalWaves: z.number().default(0),
  hasWaveData: z.boolean().default(false),
});

type WorkflowHudState = z.infer<typeof WorkflowHudStateSchema>;

/**
 * Read workflow state from .planning/state.json and normalize for HUD display.
 *
 * Returns null on any failure (file missing, parse error, etc.) for graceful degradation.
 *
 * @param pd - Project directory path
 * @returns Normalized HUD state or null
 */
const readWorkflowState = async (
  pd: string,
): Promise<WorkflowHudState | null> => {
  try {
    const stateFile = Bun.file(`${pd}/.planning/state.json`);
    if (!(await stateFile.exists())) return null;

    const raw = await stateFile.json();

    // Map state.json "value" to display state + icon
    const value = (get(raw, "value", "idle") as string).toLowerCase();

    const stateMap: Record<string, { displayState: string; icon: string }> = {
      executing: { displayState: "EXECUTING", icon: "\u25b8" },
      preflight: { displayState: "PLANNING", icon: "\u25c8" },
      routing: { displayState: "PLANNING", icon: "\u25c8" },
      discussing: { displayState: "PLANNING", icon: "\u25c8" },
      planning: { displayState: "PLANNING", icon: "\u25c8" },
      verifying: { displayState: "VERIFYING", icon: "\u25c9" },
      learning: { displayState: "VERIFYING", icon: "\u25c9" },
      committing: { displayState: "VERIFYING", icon: "\u25c9" },
      paused: { displayState: "PAUSED", icon: "\u25c7" },
      suspended: { displayState: "PAUSED", icon: "\u25c7" },
      failed: { displayState: "FAILED", icon: "\u25c7" },
    };

    const mapped = stateMap[value] || {
      displayState: "idle",
      icon: "\u25c7",
    };

    // Extract phase info from children snapshot
    const phaseId = get(
      raw,
      "children.phase.snapshot.context.phase_id",
      "",
    ) as string;
    const currentWave = get(
      raw,
      "children.phase.snapshot.context.current_wave",
      0,
    ) as number;
    const totalWaves = get(
      raw,
      "children.phase.snapshot.context.total_waves",
      0,
    ) as number;

    // Extract complexity and milestone from context
    const complexity = get(raw, "context.complexity", "") as string;
    const rawMilestone = get(raw, "context.current_milestone", "") as string;
    const milestone = rawMilestone.split(" ")[0] || "";

    const assembled = {
      displayState: mapped.displayState,
      icon: mapped.icon,
      phaseLabel: phaseId ? `P${phaseId}` : "",
      complexity,
      milestone,
      currentWave,
      totalWaves,
      hasWaveData: totalWaves > 0,
    };

    const parseResult = WorkflowHudStateSchema.safeParse(assembled);
    if (!parseResult.success) return null;

    return parseResult.data;
  } catch {
    return null;
  }
};

/**
 * Render a progress bar with filled and empty segments.
 *
 * @param current - Current progress count
 * @param total - Total count
 * @param colorFn - ANSI color function for filled segments
 * @param emptyFn - ANSI color function for empty segments
 * @param width - Bar width in characters (default 10)
 * @returns Formatted progress bar string
 */
const renderProgressBar = (
  current: number,
  total: number,
  colorFn: (s: string) => string,
  emptyFn: (s: string) => string,
  width = 10,
): string => {
  if (total === 0) return emptyFn("\u2591".repeat(width));
  const filled = Math.max(
    0,
    Math.min(width, Math.round((current / total) * width)),
  );
  return (
    colorFn("\u2588".repeat(filled)) + emptyFn("\u2591".repeat(width - filled))
  );
};

/**
 * Render the workflow HUD line from parsed state.
 *
 * @param state - Parsed workflow HUD state
 * @param colors - ANSI color helper functions
 * @returns Formatted HUD line string
 */
const renderHudLine = (
  state: WorkflowHudState,
  colors: {
    green: (s: string) => string;
    yellow: (s: string) => string;
    blue: (s: string) => string;
    red: (s: string) => string;
    gray: (s: string) => string;
    cyan: (s: string) => string;
    boldYellow: (s: string) => string;
  },
): string => {
  if (state.displayState === "idle") {
    return colors.gray(` ${state.icon} idle`);
  }

  // Color mapping for display states
  const stateColorMap: Record<string, (s: string) => string> = {
    EXECUTING: colors.green,
    PLANNING: colors.yellow,
    VERIFYING: colors.blue,
    PAUSED: colors.red,
    FAILED: colors.red,
  };

  const stateColor = stateColorMap[state.displayState] || colors.gray;

  // Complexity color mapping
  const complexityColorMap: Record<string, (s: string) => string> = {
    TRIVIAL: colors.green,
    SIMPLE: colors.green,
    MODERATE: colors.yellow,
    COMPLEX: colors.boldYellow,
    CRITICAL: colors.red,
  };

  const segments: string[] = [];

  // Icon (colored by state)
  segments.push(stateColor(` ${state.icon}`));

  // Phase label in cyan
  if (state.phaseLabel) {
    segments.push(colors.cyan(state.phaseLabel));
  }

  // Display state name
  segments.push(stateColor(state.displayState));

  // Progress bar + wave fraction
  if (state.hasWaveData) {
    const bar = renderProgressBar(
      state.currentWave,
      state.totalWaves,
      stateColor,
      colors.gray,
    );
    segments.push(`${bar}  ${state.currentWave}/${state.totalWaves}`);
  }

  // Complexity
  if (state.complexity) {
    const cColor = complexityColorMap[state.complexity] || colors.gray;
    segments.push(cColor(state.complexity));
  }

  // Milestone version in gray
  if (state.milestone) {
    segments.push(colors.gray(state.milestone));
  }

  return segments.join("  ");
};

// ─── Main ────────────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  const pd = projectDir();
  const home = process.env.HOME || "";

  // --- Read stdin ---
  let input: Record<string, unknown>;
  try {
    input = sanitizeJsonParse(await Bun.stdin.text()) as Record<
      string,
      unknown
    >;
  } catch {
    process.exit(0);
  }

  // --- ANSI helpers ---
  const c = (code: string, text: string): string =>
    `\x1b[${code}m${text}\x1b[0m`;
  const cyan = (t: string) => c("36", t);
  const yellow = (t: string) => c("33", t);
  const magenta = (t: string) => c("35", t);
  const green = (t: string) => c("32", t);
  const red = (t: string) => c("31", t);
  const blue = (t: string) => c("34", t);
  const gray = (t: string) => c("90", t);
  const boldYellow = (t: string) => c("1;33", t);

  // --- Parse fields ---
  const workspace = input?.workspace as Record<string, unknown> | undefined;
  const model = input?.model as Record<string, unknown> | undefined;
  const contextWindow = input?.context_window as
    | Record<string, unknown>
    | undefined;
  const vim = input?.vim as Record<string, unknown> | undefined;

  const rawCwd =
    (workspace?.current_dir as string) || (input?.cwd as string) || "";
  const modelName = (model?.display_name as string) || "";
  const usedPct = contextWindow?.used_percentage as number | undefined;
  const vimMode = (vim?.mode as string) || "";
  const sessionName = (input?.session_name as string) || "";

  // --- Validate cwd against projectDir / HOME to prevent path traversal ---
  let cwd = "";
  if (rawCwd) {
    try {
      const resolvedCwd = realpathSync(resolve(rawCwd));
      if (
        resolvedCwd.startsWith(pd + "/") ||
        resolvedCwd === pd ||
        (home && (resolvedCwd.startsWith(home + "/") || resolvedCwd === home))
      ) {
        cwd = resolvedCwd;
      }
    } catch {
      // resolve/realpathSync failed — discard
    }
  }

  // --- Write context metrics (side effect) ---
  if (contextWindow && typeof contextWindow.used_percentage === "number") {
    const usedPercent = Math.round(contextWindow.used_percentage as number);
    const windowSize = (contextWindow.context_window_size as number) || 0;
    const totalInput = (contextWindow.total_input_tokens as number) || 0;
    const totalOutput = (contextWindow.total_output_tokens as number) || 0;
    const currentUsage =
      (contextWindow.current_usage as Record<string, unknown>) || {};
    const cacheRead = (currentUsage.cache_read_input_tokens as number) || 0;

    let zone = "peak";
    if (usedPercent >= 70) zone = "stop";
    else if (usedPercent >= 50) zone = "degrading";
    else if (usedPercent >= 30) zone = "good";

    const metrics = {
      zone,
      usage_percent: usedPercent,
      context_window_size: windowSize,
      total_input_tokens: totalInput,
      total_output_tokens: totalOutput,
      cache_read_input_tokens: cacheRead,
      checked_at: new Date().toISOString(),
      source: "statusline",
    };

    try {
      await Bun.write(
        `${pd}/.planning/.context-metrics.json`,
        JSON.stringify(metrics, null, 2) + "\n",
      );
    } catch {
      // .planning/ may not exist — skip metrics write
    }
  }

  // --- Workflow HUD state ---
  const hudState = await readWorkflowState(pd);

  // --- Git branch ---
  let gitBranch = "";
  if (cwd) {
    try {
      const result = Bun.spawnSync(
        ["git", "-C", cwd, "symbolic-ref", "--short", "HEAD"],
        { stdout: "pipe", stderr: "pipe" },
      );
      if (result.exitCode === 0) {
        gitBranch = result.stdout.toString().trim();
      } else {
        const fallback = Bun.spawnSync(
          ["git", "-C", cwd, "rev-parse", "--short", "HEAD"],
          { stdout: "pipe", stderr: "pipe" },
        );
        if (fallback.exitCode === 0) {
          gitBranch = fallback.stdout.toString().trim();
        }
      }
    } catch {
      // not a git repo
    }
  }

  // --- Directory display: shorten home to ~ ---
  let dirDisplay = cwd;
  if (home && cwd.startsWith(home)) {
    dirDisplay = "~" + cwd.slice(home.length);
  }

  // --- Context segment with color ---
  let ctxSegment = "";
  if (typeof usedPct === "number") {
    const pct = Math.round(usedPct);
    const colorFn = pct >= 70 ? red : pct >= 50 ? yellow : green;
    ctxSegment = colorFn(`ctx:${pct}%`);
  }

  // --- Vim mode ---
  let vimSegment = "";
  if (vimMode) {
    vimSegment = vimMode === "NORMAL" ? blue("NORMAL") : cyan("INSERT");
  }

  // --- Assemble segments ---
  const parts: string[] = [];
  if (dirDisplay) parts.push(cyan(dirDisplay));
  if (gitBranch) parts.push(yellow(gitBranch));
  if (modelName) parts.push(magenta(modelName));
  if (ctxSegment) parts.push(ctxSegment);
  if (vimSegment) parts.push(vimSegment);
  if (sessionName) parts.push(gray(`[${sessionName}]`));

  const systemLine = parts.join("  |  ");
  if (hudState) {
    const hudLine = renderHudLine(hudState, {
      green,
      yellow,
      blue,
      red,
      gray,
      cyan,
      boldYellow,
    });
    process.stdout.write(hudLine + "\n" + systemLine);
  } else {
    process.stdout.write(systemLine);
  }
};

await main();
process.exit(0);
