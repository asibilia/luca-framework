/**
 * snapshot-sync — No-op (STATE.md has been eliminated).
 *
 * This hook previously regenerated .planning/STATE.md from state.json.
 * Since state.json is now the sole source of truth and STATE.md has been
 * removed, this hook is a no-op. It remains as a placeholder so existing
 * hook registrations don't error.
 *
 * Always exits 0 — async hook, non-blocking.
 *
 * @module snapshot-sync
 */

import { guardDedup, drainStdin, exitSuccess } from "../__helpers/hook-io.ts";

// ─── Dedup guard ─────────────────────────────────────────────────────────────
guardDedup("snapshot-sync");

// ─── Main ────────────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  await drainStdin();
  // No-op: STATE.md eliminated. state.json is sole source of truth.
  exitSuccess();
};

await main();
