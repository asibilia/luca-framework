/**
 * pre-compact-checkpoint — Save context checkpoint before compaction.
 *
 * Reads state from bridge + git, builds checkpoint JSON,
 * writes filesystem fallback, fires MuninnDB REST call.
 *
 * Always exits 0 — async hook, non-blocking.
 *
 * @module pre-compact-checkpoint
 */

import { existsSync, readFileSync } from "fs";

import { z } from "zod";

import {
  guardDedup,
  parseHookInput,
  exitSuccess,
  projectDir,
} from "../__helpers/hook-io.ts";
import { runBridge } from "../__helpers/bridge.ts";
import { resolveVault } from "../__helpers/vault.ts";
import { writeMuninnEngram } from "../__helpers/muninn.ts";

// ─── Input Schema ─────────────────────────────────────────────────────────────

const PreCompactInputSchema = z.object({
  trigger: z.string().default("unknown"),
});

// ─── Dedup guard ─────────────────────────────────────────────────────────────
guardDedup("pre-compact-checkpoint", 10);

// ─── Main ────────────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  const data = await parseHookInput(PreCompactInputSchema);
  const trigger = data?.trigger ?? "unknown";

  const pd = projectDir();

  // --- Read state ---

  // Phase info from bridge
  let phase = "";
  try {
    const phaseInfo = await runBridge(["read-phase"]);
    if (phaseInfo) {
      const parsed = JSON.parse(phaseInfo);
      phase = String(parsed.phase || "");
    }
  } catch {
    // Bridge unavailable
  }

  // Complexity from bridge
  let complexity = "MODERATE";
  try {
    const statusInfo = await runBridge(["read-status"]);
    if (statusInfo) {
      const parsed = JSON.parse(statusInfo);
      complexity = parsed.complexity || "MODERATE";
    }
  } catch {
    // Bridge unavailable
  }

  // Read milestone, branch, issue, status from state.json
  let milestone = "";
  let branch = "";
  let githubIssue = "";
  let status = "";
  const stateJsonPath = `${pd}/.planning/state.json`;
  if (existsSync(stateJsonPath)) {
    try {
      const content = readFileSync(stateJsonPath, "utf-8");
      const stateData = JSON.parse(content);
      const ctx = stateData?.context ?? {};
      milestone = ctx.current_milestone ?? "";
      branch = ctx.branch ?? "";
      githubIssue = ctx.github_issue != null ? `#${ctx.github_issue}` : "";
      if (stateData?.value) {
        status =
          typeof stateData.value === "string"
            ? stateData.value
            : typeof stateData.value === "object"
              ? (Object.keys(stateData.value)[0] ?? "")
              : "";
      }
    } catch {
      // state.json unreadable
    }
  }

  // Recent git activity
  let gitLog = "no git history";
  try {
    const result = Bun.spawnSync(["git", "log", "--oneline", "-5"], {
      stdout: "pipe",
      stderr: "pipe",
      cwd: pd,
    });
    if (result.exitCode === 0) {
      gitLog = result.stdout.toString().trim();
    }
  } catch {
    // git not available
  }

  // Recent files changed
  let recentFiles: string[] = [];
  try {
    const result = Bun.spawnSync(
      ["git", "diff", "--name-only", "HEAD~3", "HEAD"],
      { stdout: "pipe", stderr: "pipe", cwd: pd },
    );
    if (result.exitCode === 0) {
      recentFiles = result.stdout
        .toString()
        .trim()
        .split("\n")
        .filter(Boolean)
        .slice(0, 10);
    }
  } catch {
    // git not available or not enough commits
  }

  // Context usage at compaction time
  let ctxZone = "";
  let ctxPercent = "";
  const metricsFile = `${pd}/.planning/.context-metrics.json`;
  if (existsSync(metricsFile)) {
    try {
      const metrics = JSON.parse(await Bun.file(metricsFile).text());
      ctxZone = metrics.zone || "";
      ctxPercent = String(metrics.usage_percent ?? "");
    } catch {
      // Metrics unreadable
    }
  }

  // Resolve vault
  const vault = await resolveVault();

  // --- Build checkpoint JSON ---
  const checkpoint: Record<string, unknown> = {
    position: {
      phase: phase || "unknown",
      complexity,
      milestone: milestone || "unknown",
    },
    current_work: {
      milestone: milestone || "unknown",
      branch: branch || undefined,
      github_issue: githubIssue || undefined,
      status: status || undefined,
    },
    recent_files: recentFiles.length > 0 ? recentFiles : undefined,
    context_at_compaction: ctxZone
      ? { zone: ctxZone, usage_percent: parseInt(ctxPercent || "0", 10) }
      : undefined,
    completed_summary: gitLog,
    trigger,
    saved_at: new Date().toISOString(),
    vault,
  };

  // Write filesystem fallback
  try {
    await Bun.write(
      `${pd}/.planning/.context-checkpoint.json`,
      JSON.stringify(checkpoint, null, 2) + "\n",
    );
  } catch {
    // Checkpoint write failed — continue to MuninnDB attempt
  }

  // --- Write to MuninnDB REST API (fire-and-forget) ---
  await writeMuninnEngram({
    vault,
    concept: "session:checkpoint",
    content: JSON.stringify(checkpoint),
    type: "observation",
    tags: ["checkpoint", "context", "session"],
  });

  return exitSuccess();
};

await main();
