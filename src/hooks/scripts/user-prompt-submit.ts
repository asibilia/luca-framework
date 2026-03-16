/**
 * user-prompt-submit — UserPromptSubmit observation hook.
 *
 * Fires before each user message is processed. Flushes the latest
 * file-system observation to MuninnDB on every user prompt (throttled
 * to once per 5 minutes). This ensures MuninnDB has a snapshot at
 * the start of every work unit.
 *
 * Always exits 0 — async hook, non-blocking.
 *
 * @module user-prompt-submit
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";

import {
  drainStdin,
  exitSuccess,
  projectDir,
  projectHash,
  checkThrottle,
  recordThrottle,
  guardDedup,
} from "../__helpers/hook-io.ts";
import { resolveVault } from "../__helpers/vault.ts";
import { writeMuninnEngram } from "../__helpers/muninn.ts";

// ─── Dedup guard ─────────────────────────────────────────────────────────────
// Prevents double-firing when the hook is registered at both global and project
// level. This is complementary to the per-project throttle below -- guardDedup
// prevents the same hook invocation from running twice within 5s, while the
// throttle prevents repeated observations within 5 min.
guardDedup("user-prompt-submit");

// ─── Main ────────────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  // Drain stdin (standard pattern)
  await drainStdin();

  const hash = projectHash();
  const pd = projectDir();

  // --- Per-project throttle: only fire once per 5 minutes ---
  const throttleFile = `/tmp/.luca-prompt-submit-${hash}-ts`;

  if (checkThrottle(throttleFile, 300)) {
    return exitSuccess();
  }

  // Record throttle timestamp before doing work
  recordThrottle(throttleFile);

  // --- Read context metrics (best-effort) ---
  let zone = "peak";
  let usagePercent = 0;
  const metricsFile = join(pd, ".planning", ".context-metrics.json");
  if (existsSync(metricsFile)) {
    try {
      const metrics = JSON.parse(readFileSync(metricsFile, "utf-8"));
      zone = metrics.zone || "peak";
      usagePercent = metrics.usage_percent || 0;
    } catch {
      // Metrics unreadable — use defaults
    }
  }

  // --- Read git branch (best-effort) ---
  let gitBranch = "";
  try {
    const branchResult = Bun.spawnSync(["git", "branch", "--show-current"], {
      stdout: "pipe",
      stderr: "pipe",
      cwd: pd,
    });
    if (branchResult.exitCode === 0) {
      gitBranch = branchResult.stdout.toString().trim();
    }
  } catch {
    // git not available
  }

  // --- POST lightweight observation to MuninnDB ---
  try {
    const vault = await resolveVault();
    const observation = {
      concept: `session:observation-prompt-${Date.now()}`,
      timestamp: new Date().toISOString(),
      zone,
      usage_percent: usagePercent,
      git_branch: gitBranch,
      source: "user_prompt_submit",
    };

    writeMuninnEngram({
      vault,
      concept: observation.concept,
      content: JSON.stringify(observation),
      type: "observation",
      tags: ["session", "observation", "prompt-submit"],
    });
  } catch {
    // MuninnDB write failed — never throw from hook
  }

  return exitSuccess();
};

await main();
