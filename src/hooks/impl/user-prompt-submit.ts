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

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

import {
  drainStdin,
  exitSuccess,
  projectDir,
  projectHash,
} from "./_lib/hook-io.ts";
import { resolveVault } from "./_lib/vault.ts";
import { writeMuninnEngram } from "./_lib/muninn.ts";

// ─── Main ────────────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  // Drain stdin (standard pattern)
  await drainStdin();

  const hash = projectHash();
  const pd = projectDir();

  // --- Per-project throttle: only fire once per 5 minutes ---
  const throttleFile = `/tmp/.luca-prompt-submit-${hash}-ts`;
  const throttleSeconds = 300;

  if (existsSync(throttleFile)) {
    try {
      const lastRun = parseInt(readFileSync(throttleFile, "utf-8").trim(), 10);
      const now = Math.floor(Date.now() / 1000);
      if (now - lastRun < throttleSeconds) {
        return exitSuccess();
      }
    } catch {
      // Can't read throttle file — continue
    }
  }

  // Update throttle timestamp
  writeFileSync(throttleFile, String(Math.floor(Date.now() / 1000)));

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
