/**
 * session-end-audit — Detect non-terminal orchestrator states on session end.
 *
 * Fires on Stop/SessionEnd events. Checks each orchestrator context file
 * for non-terminal `current_state` values, emitting advisory warnings
 * when an orchestrator appears to have been abandoned mid-flow.
 *
 * This hook is advisory only — it always exits 0 and never blocks session end.
 *
 * **Context files checked:**
 * - `.planning/state.json` (terminal: `complete`, uses computed pipeline position)
 * - `/tmp/phase-execute-context.json` (terminal: `committed`, `failed`)
 * - `/tmp/verify-context.json` (terminal: `reviewed`, `diagnosed`, `failed`)
 * - `/tmp/milestone-complete-context.json` (terminal: `finalized`, `failed`)
 * - `/tmp/pr-address-context.json` (terminal: `pushed`, `failed`)
 *
 * @module session-end-audit
 */

import { sanitizeJsonParse } from "../../shared";

import { guardDedup, emitResult, exitSuccess } from "../__helpers/hook-io.ts";
import {
  ORCHESTRATOR_GATES,
  derivePipelineState,
  resolveGatePath,
} from "../__helpers/orchestrator-gate-config.ts";

// ─── Dedup guard ─────────────────────────────────────────────────────────────
guardDedup("session-end-audit");

// ─── Terminal State Definitions ─────────────────────────────────────────────

/**
 * Derives terminal state entries from the canonical ORCHESTRATOR_GATES config.
 *
 * Maps each gate to `{ name, path, terminal_states, use_computed_position }`
 * so the audit loop can detect non-terminal orchestrator states on session end.
 */
const ORCHESTRATOR_TERMINALS = ORCHESTRATOR_GATES.map((gate) => ({
  name: gate.name,
  path: resolveGatePath(gate.context_path),
  terminal_states: gate.terminal_states,
  use_computed_position: gate.use_computed_position ?? false,
}));

// ─── Main ────────────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  const warnings: string[] = [];

  for (const orchestrator of ORCHESTRATOR_TERMINALS) {
    try {
      const file = Bun.file(orchestrator.path);
      const exists = await file.exists();
      if (!exists) continue;

      const raw = await file.text();
      if (!raw.trim()) continue;

      const parsed = sanitizeJsonParse(raw) as Record<string, unknown>;
      const derived = derivePipelineState(
        parsed,
        orchestrator.use_computed_position,
      );
      if (!derived) continue;

      const { currentState } = derived;
      if (currentState === "") continue;

      const isTerminal = orchestrator.terminal_states.includes(currentState);
      if (!isTerminal) {
        warnings.push(
          `${orchestrator.name}: non-terminal state "${currentState}" ` +
            `(expected one of: ${orchestrator.terminal_states.join(", ")})`,
        );
      }
    } catch {
      // File unreadable or malformed JSON — skip silently
    }
  }

  if (warnings.length > 0) {
    emitResult({
      systemMessage:
        `[session-end-audit] ${warnings.length} orchestrator(s) ended in non-terminal state:\n` +
        warnings.map((w) => `  - ${w}`).join("\n") +
        "\nThis may indicate an orchestrator was abandoned mid-flow.",
    });
  }

  return exitSuccess();
};

await main();
