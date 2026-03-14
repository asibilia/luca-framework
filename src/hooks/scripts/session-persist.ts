/**
 * session-persist — Save session state on exit.
 *
 * When a session ends, this hook:
 * 1. Removes the session lock file
 * 2. Writes a session-end marker file
 *
 * Always exits 0 — SessionEnd hooks cannot block termination.
 *
 * @module session-persist
 */

import { unlinkSync } from "fs";

import {
  guardDedup,
  readStdinJson,
  exitSuccess,
  projectDir,
} from "../__helpers/hook-io.ts";
import { readSessionId } from "../__helpers/bridge.ts";

// ─── Dedup guard ─────────────────────────────────────────────────────────────
guardDedup("session-persist");

// ─── Main ────────────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  const data = (await readStdinJson()) || {};
  const pd = projectDir();

  // Extract session end reason
  let endReason = (data.reason as string) || "unknown";

  // SEC-02: Sanitize END_REASON — allow only alphanumeric, spaces, hyphens, underscores, periods
  endReason = endReason.replace(/[^a-zA-Z0-9 _.\-]/g, "").slice(0, 100);

  // Remove session lock (before any other cleanup — most important action)
  try {
    unlinkSync(`${pd}/.claude/.session-lock`);
  } catch {
    // Lock file may not exist
  }

  // Write session-end marker for lu-cognition stale session cleanup
  const sessionId = await readSessionId();
  if (sessionId) {
    const marker = {
      session_id: sessionId,
      ended_at: new Date().toISOString(),
      reason: endReason,
      cleanup_pending: true,
    };

    try {
      await Bun.write(
        `${pd}/.planning/.session-end-marker.json`,
        JSON.stringify(marker, null, 2) + "\n",
      );
    } catch {
      // Best-effort — don't block termination
    }
  }

  return exitSuccess();
};

await main();
