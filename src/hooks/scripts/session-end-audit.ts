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
 * - `/tmp/lu-context.json` (terminal: `complete`)
 * - `/tmp/phase-execute-context.json` (terminal: `committed`, `failed`)
 * - `/tmp/verify-context.json` (terminal: `reviewed`, `diagnosed`, `failed`)
 * - `/tmp/milestone-complete-context.json` (terminal: `finalized`, `failed`)
 * - `/tmp/pr-address-context.json` (terminal: `pushed`, `failed`)
 *
 * @module session-end-audit
 */

import { z } from "zod";

import { guardDedup, emitResult, exitSuccess } from "../__helpers/hook-io.ts";

// ─── Dedup guard ─────────────────────────────────────────────────────────────
guardDedup("session-end-audit");

// ─── Terminal State Definitions ─────────────────────────────────────────────

/**
 * Maps each orchestrator context file to its set of terminal states.
 *
 * A `current_state` value NOT in this set indicates the orchestrator
 * was abandoned mid-flow (non-terminal).
 */
const ORCHESTRATOR_TERMINALS: ReadonlyArray<{
  readonly name: string;
  readonly path: string;
  readonly terminalStates: ReadonlyArray<string>;
}> = [
  {
    name: "lu",
    path: "/tmp/lu-context.json",
    terminalStates: ["complete"],
  },
  {
    name: "phase-execute",
    path: "/tmp/phase-execute-context.json",
    terminalStates: ["committed", "failed"],
  },
  {
    name: "verify",
    path: "/tmp/verify-context.json",
    terminalStates: ["reviewed", "diagnosed", "failed"],
  },
  {
    name: "milestone-complete",
    path: "/tmp/milestone-complete-context.json",
    terminalStates: ["finalized", "failed"],
  },
  {
    name: "pr-address",
    path: "/tmp/pr-address-context.json",
    terminalStates: ["pushed", "failed"],
  },
] as const;

const AuditContextSchema = z
  .object({ current_state: z.string().optional() })
  .passthrough();

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

      const parseResult = AuditContextSchema.safeParse(JSON.parse(raw));
      if (!parseResult.success) continue;

      const currentState = parseResult.data.current_state;

      if (typeof currentState !== "string") continue;
      if (currentState === "") continue;

      const isTerminal = orchestrator.terminalStates.includes(currentState);
      if (!isTerminal) {
        warnings.push(
          `${orchestrator.name}: non-terminal state "${currentState}" ` +
            `(expected one of: ${orchestrator.terminalStates.join(", ")})`,
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
