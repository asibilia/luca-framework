/**
 * skill-status-exit — Deterministic PostToolUse hook for Skill invocations.
 *
 * Clears the statusline bus when the outermost skill completes. Handles
 * nesting via a depth file so inner skill completions don't prematurely
 * clear the outer skill's status.
 *
 * Always exits 0 — status bus writes must never fail visibly.
 *
 * @module skill-status-exit
 */

import { readStdinJson, exitSuccess } from "../__helpers/hook-io.ts";
import { clearStatusBus } from "../../shared/__helpers/status-bus.ts";

const DEPTH_PATH = ".planning/.skill-depth";

// ─── Main ────────────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  try {
    const data = await readStdinJson();

    // Only act on Skill invocations
    if (!data || data.tool_name !== "Skill") return exitSuccess();

    // Read nesting depth (default 0 if missing)
    const depthFile = Bun.file(DEPTH_PATH);
    let depth = 0;
    try {
      if (await depthFile.exists()) {
        const raw = (await depthFile.text()).trim();
        const parsed = parseInt(raw, 10);
        if (!Number.isNaN(parsed) && parsed >= 0) depth = parsed;
      }
    } catch {
      // Ignore read errors — treat as depth 0
    }

    const newDepth = depth - 1;

    if (newDepth > 0) {
      // Inner skill done, outer still running: decrement and exit
      await Bun.write(DEPTH_PATH, String(newDepth));
      return exitSuccess();
    }

    // Outermost skill done (or already at 0): clean up
    try {
      const { unlink } = await import("node:fs/promises");
      await unlink(DEPTH_PATH);
    } catch {
      // Ignore if file doesn't exist
    }

    await clearStatusBus();
  } catch {
    // Hooks must never fail visibly
  }

  return exitSuccess();
};

await main();
