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

import { realpathSync } from "fs";
import { resolve } from "path";

import { projectDir } from "../__helpers/hook-io.ts";

// ─── Main ────────────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  const pd = projectDir();
  const home = process.env.HOME || "";

  // --- Read stdin ---
  let input: Record<string, unknown>;
  try {
    input = JSON.parse(await Bun.stdin.text());
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

  process.stdout.write(parts.join("  |  "));
};

await main();
process.exit(0);
