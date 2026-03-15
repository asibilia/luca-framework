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

import { existsSync } from "fs";

import {
  guardDedup,
  drainStdin,
  projectHash,
  exitSuccess,
  projectDir,
  checkThrottle,
  recordThrottle,
} from "../__helpers/hook-io.ts";
import { runBridge } from "../__helpers/bridge.ts";

// ─── Dedup guard ─────────────────────────────────────────────────────────────
guardDedup("snapshot-sync");

// ─── Main ────────────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  // Drain stdin (consumed but not parsed)
  await drainStdin();

  // Throttle: skip if last sync was recent
  const hash = projectHash();
  const throttleFile = `/tmp/.luca-snapshot-sync-${hash}-ts`;

  if (checkThrottle(throttleFile, 120)) {
    exitSuccess();
  }

  // Check if state.json exists
  const stateJsonPath = `${projectDir()}/.planning/state.json`;
  if (!existsSync(stateJsonPath)) {
    exitSuccess();
  }

  // Record throttle timestamp before running
  recordThrottle(throttleFile);

  // Regenerate STATE.md snapshot from state machine
  await runBridge(["snapshot"]);

  exitSuccess();
};

await main();
