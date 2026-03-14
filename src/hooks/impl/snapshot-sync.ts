/**
 * snapshot-sync — Sync STATE.md from state machine (throttled).
 *
 * Regenerates .planning/STATE.md from .planning/state.json on a throttled
 * basis (skip if last sync was within 120 seconds). Ensures STATE.md backward
 * compatibility while the state machine is the source of truth.
 *
 * Always exits 0 — async hook, non-blocking.
 *
 * @module snapshot-sync
 */

import { existsSync, readFileSync, writeFileSync } from "fs";

import {
  guardDedup,
  drainStdin,
  projectHash,
  exitSuccess,
  projectDir,
} from "./__helpers/hook-io.ts";
import { runBridge } from "./__helpers/bridge.ts";

// ─── Dedup guard ─────────────────────────────────────────────────────────────
guardDedup("snapshot-sync");

// ─── Main ────────────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  // Drain stdin (consumed but not parsed)
  await drainStdin();

  // Throttle: skip if last sync was recent
  const hash = projectHash();
  const throttleFile = `/tmp/.luca-snapshot-sync-${hash}-ts`;
  const throttleSeconds = 120;

  if (existsSync(throttleFile)) {
    try {
      const lastSync = parseInt(readFileSync(throttleFile, "utf-8").trim(), 10);
      const now = Math.floor(Date.now() / 1000);
      if (now - lastSync < throttleSeconds) {
        exitSuccess();
      }
    } catch {
      // Can't read throttle file — continue
    }
  }

  // Check if state.json exists
  const stateJsonPath = `${projectDir()}/.planning/state.json`;
  if (!existsSync(stateJsonPath)) {
    exitSuccess();
  }

  // Update throttle timestamp
  writeFileSync(throttleFile, String(Math.floor(Date.now() / 1000)));

  // Regenerate STATE.md snapshot from state machine
  await runBridge(["snapshot"]);

  exitSuccess();
};

await main();
