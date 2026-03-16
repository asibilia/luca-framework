/**
 * context-monitor — Warn when context usage appears high (Stop event).
 *
 * Checks context usage via statusline metrics or transcript file size
 * heuristics. Emits warning systemMessage when thresholds are exceeded.
 *
 * Always exits 0 — context check is advisory.
 *
 * @module context-monitor
 */

import { existsSync, statSync, realpathSync } from "fs";

import {
  guardDedup,
  readStdinJson,
  emitResult,
  exitSuccess,
  projectDir,
  isClaude,
} from "../__helpers/hook-io.ts";

// ─── Dedup guard ─────────────────────────────────────────────────────────────
guardDedup("context-monitor");

// ─── Main ────────────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  const data = (await readStdinJson()) || {};

  // Check stop_hook_active (Claude) or loop_count (Cursor) to prevent infinite loops
  const stopActive =
    data.stop_hook_active || (data.loop_count as number) > 0 || false;
  if (stopActive) {
    return exitSuccess();
  }

  // Extract transcript path
  const transcriptPath = (data.transcript_path as string) || "";
  let validTranscriptPath = "";

  // SEC-01: Validate transcript path — reject relative paths and paths outside $HOME
  // Uses realpathSync to resolve symlinks (prevents symlink-based traversal)
  if (transcriptPath) {
    if (transcriptPath.startsWith("/")) {
      const home = process.env.HOME || "";
      if (home) {
        try {
          const resolved = realpathSync(transcriptPath);
          if (resolved.startsWith(home + "/")) {
            validTranscriptPath = resolved;
          }
        } catch {
          // realpathSync throws if path doesn't exist or is a broken symlink — reject
        }
      }
    }
  }

  // --- Primary check: Prefer real metrics from statusline ---
  let level = "NONE";
  let msg = "";
  let usedStatusline = false;

  const pd = projectDir();
  const metricsFile = `${pd}/.planning/.context-metrics.json`;

  if (existsSync(metricsFile)) {
    try {
      const metrics = JSON.parse(await Bun.file(metricsFile).text());
      if (metrics.source === "statusline") {
        const checkedAt = new Date(metrics.checked_at).getTime();
        const now = Date.now();
        if (now - checkedAt <= 120000) {
          const pct = metrics.usage_percent || 0;
          const inputTokens = metrics.total_input_tokens || 0;
          const windowSize = metrics.context_window_size || 0;

          const formatNum = (n: number): string => {
            if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
            if (n >= 1e3) return Math.round(n / 1e3) + "K";
            return String(n);
          };

          const inputStr = formatNum(inputTokens);
          const windowStr = formatNum(windowSize);

          if (pct >= 70) {
            level = "CRITICAL";
            msg = `Context at ${pct}% (${inputStr}/${windowStr} tokens). Quality may be degrading. Consider running /compact to free context space, or start a new session.`;
          } else if (pct >= 50) {
            level = "HIGH";
            msg = `Context at ${pct}% (${inputStr}/${windowStr} tokens). Consider running /compact soon to maintain response quality.`;
          } else if (pct >= 30) {
            level = "MODERATE";
            msg = `Context at ${pct}% (${inputStr}/${windowStr} tokens). No action needed yet, but be mindful of context limits.`;
          }
          usedStatusline = true;
        }
      }
    } catch {
      // Metrics file unreadable — fall through
    }
  }

  // Fallback: transcript file size heuristic
  if (
    !usedStatusline &&
    validTranscriptPath &&
    existsSync(validTranscriptPath)
  ) {
    try {
      const fileSize = statSync(validTranscriptPath).size;
      const warnThreshold = parseInt(process.env.CONTEXT_WARN || "100000", 10);
      const alertThreshold = parseInt(
        process.env.CONTEXT_ALERT || "200000",
        10,
      );
      const criticalThreshold = parseInt(
        process.env.CONTEXT_CRITICAL || "300000",
        10,
      );

      if (fileSize >= criticalThreshold) {
        level = "CRITICAL";
        msg = `Context usage is very high (~${fileSize} bytes transcript). Quality may be degrading. Consider running /compact to free context space, or start a new session.`;
      } else if (fileSize >= alertThreshold) {
        level = "HIGH";
        msg = `Context usage is high (~${fileSize} bytes transcript). Consider running /compact soon to maintain response quality.`;
      } else if (fileSize >= warnThreshold) {
        level = "MODERATE";
        msg = `Context usage is moderate (~${fileSize} bytes transcript). No action needed yet, but be mindful of context limits.`;
      }
    } catch {
      // Can't stat file — skip
    }
  }

  // Exit if NONE
  if (level === "NONE") {
    return exitSuccess();
  }

  // Output warning message
  const text = `[Context Monitor: ${level}] ${msg}`;
  if (isClaude()) {
    emitResult({
      systemMessage: text,
    });
  } else {
    emitResult({
      followupMessage: text,
    });
  }

  return exitSuccess();
};

await main();
