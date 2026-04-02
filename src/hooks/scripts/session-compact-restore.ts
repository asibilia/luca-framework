/**
 * session-compact-restore — Restore context checkpoint after compaction.
 *
 * Reads checkpoint file, emits systemMessage with restore info, deletes checkpoint.
 *
 * Always exits 0 — session start should never block.
 *
 * @module session-compact-restore
 */

import { existsSync, unlinkSync } from "fs";

import {
  guardDedup,
  drainStdin,
  emitResult,
  exitSuccess,
  projectDir,
} from "../__helpers/hook-io.ts";

// ─── Dedup guard ─────────────────────────────────────────────────────────────
guardDedup("session-compact-restore");

// ─── Main ────────────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  // Consume stdin (standard pattern)
  await drainStdin();

  const pd = projectDir();
  const checkpointFile = `${pd}/.planning/.context-checkpoint.json`;

  // No checkpoint = not a post-compaction restart
  if (!existsSync(checkpointFile)) {
    return exitSuccess();
  }

  // Read checkpoint and format systemMessage
  let restoreMsg = "";
  try {
    const cp = JSON.parse(await Bun.file(checkpointFile).text());
    const pos = cp.position || {};
    const cw = cp.current_work || {};
    const ctx = cp.context_at_compaction;

    const lines: string[] = [
      `[Context Restored] Resuming after ${cp.trigger || "unknown"} compaction.`,
      "",
    ];

    // Branch and issue (if available)
    if (cw.branch || cw.github_issue) {
      const branchPart = cw.branch ? `Branch: ${cw.branch}` : "";
      const issuePart = cw.github_issue ? ` (GitHub ${cw.github_issue})` : "";
      lines.push(branchPart + issuePart);
    }
    if (cw.status) {
      lines.push(`Status: ${cw.status}`);
    }

    lines.push(
      `Position: Phase ${pos.phase || "unknown"}, Complexity: ${pos.complexity || "MODERATE"}, Milestone: ${pos.milestone || "unknown"}`,
    );

    // Context usage at compaction
    if (ctx) {
      lines.push(`Context at compaction: ${ctx.usage_percent}% (${ctx.zone})`);
    }
    lines.push("");

    // Recent files
    if (cp.recent_files && cp.recent_files.length > 0) {
      lines.push(`Recent files: ${cp.recent_files.join(", ")}`);
      lines.push("");
    }

    lines.push("Recent commits:");
    lines.push(cp.completed_summary || "No recent commits recorded");
    lines.push("");
    lines.push(`MuninnDB vault: ${cp.vault || "luca-framework"}`);
    lines.push("");
    lines.push(
      "Run /session-restore for deeper context recovery with semantic recall.",
    );

    restoreMsg = lines.join("\n");
  } catch {
    restoreMsg =
      "[Context Restored] Checkpoint found but could not be parsed. Run /session-restore for manual recovery.";
  }

  // Output systemMessage
  if (restoreMsg) {
    emitResult({ systemMessage: restoreMsg });
  }

  // Clean up checkpoint file
  try {
    unlinkSync(checkpointFile);
  } catch {
    // Best-effort cleanup
  }

  return exitSuccess();
};

await main();
