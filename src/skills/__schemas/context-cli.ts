/**
 * Standalone CLI for context file operations.
 *
 * Provides bash-friendly commands for reading, writing, and managing
 * the per-skill context files used by the anti-skip enforcement layer.
 * This is the missing Layer 2 Part D bridge that connects skill specs
 * (which the LLM reads as prompts) to the typed context file infrastructure
 * (which lives in TypeScript modules).
 *
 * Usage:
 *   bun src/skills/__schemas/context-cli.ts init <name>
 *   bun src/skills/__schemas/context-cli.ts write <name> '<json-patch>'
 *   bun src/skills/__schemas/context-cli.ts read <name>
 *   bun src/skills/__schemas/context-cli.ts state <name>
 *   bun src/skills/__schemas/context-cli.ts reset <name>
 *
 * Context names: lu, phase-execute, verify, milestone-complete, pr-address
 *
 * All output is JSON to stdout. Errors go to stderr with exit code 2.
 *
 * @example
 * ```bash
 * # Initialize a context file
 * bun src/skills/__schemas/context-cli.ts init lu
 * # Output: {"success":true,"path":"/tmp/lu-context.json"}
 *
 * # Write a state transition
 * bun src/skills/__schemas/context-cli.ts write lu '{"current_state":"routed"}'
 * # Output: {"success":true}
 *
 * # Write sub-agent output
 * bun src/skills/__schemas/context-cli.ts write lu '{"lu_route":{"request_parsed":true}}'
 * # Output: {"success":true}
 *
 * # Read the full context
 * bun src/skills/__schemas/context-cli.ts read lu
 * # Output: {"success":true,"data":{"context_version":1,"current_state":"routed",...}}
 *
 * # Read just the current state
 * bun src/skills/__schemas/context-cli.ts state lu
 * # Output: routed
 *
 * # Reset (delete) the context file
 * bun src/skills/__schemas/context-cli.ts reset lu
 * # Output: {"success":true}
 * ```
 *
 * @module context-cli
 * @see src/skills/__schemas/context-helpers.ts
 */

import { unlinkSync } from "node:fs";

import { createContextHelpers } from "./context-helpers";
import { LuContextSchema, LU_CONTEXT_PATH } from "./lu-context.schemas";
import {
  PhaseExecuteContextSchema,
  PHASE_EXECUTE_CONTEXT_PATH,
} from "./phase-execute-context.schemas";
import {
  VerifyContextSchema,
  VERIFY_CONTEXT_PATH,
} from "./verify-context.schemas";
import {
  MilestoneCompleteContextSchema,
  MILESTONE_COMPLETE_CONTEXT_PATH,
} from "./milestone-complete-context.schemas";
import {
  PrAddressContextSchema,
  PR_ADDRESS_CONTEXT_PATH,
} from "./pr-address-context.schemas";

import type { z } from "zod";
import type { ContextHelpers } from "./context-helpers";

// ─── Bridge Sync ─────────────────────────────────────────────────────────

/**
 * Mapping from lu context `current_state` values to the sequence of
 * bridge events needed to reach that state in the workflow state machine.
 *
 * When the lu orchestrator writes a `current_state` change via context-cli,
 * this mapping fires the corresponding bridge transitions so that
 * `.planning/state.json`'s `value` field stays in sync — which the
 * statusline HUD reads for real-time workflow display.
 *
 * Events are fired in order. XState silently ignores events that are
 * invalid from the current state, so it's safe to fire the full sequence
 * even if the machine has already advanced past some states.
 *
 * @see packages/luca-framework/src/state/machine.ts for the state graph
 * @see src/hooks/scripts/statusline.ts for the HUD that reads state.json
 */
const LU_STATE_TO_BRIDGE_EVENTS: Record<string, string[]> = {
  routed: ["START", "PREFLIGHT_COMPLETE"],
  configured: ["START", "PREFLIGHT_COMPLETE", "ROUTE_COMPLETE"],
  scanned: ["START", "PREFLIGHT_COMPLETE", "ROUTE_COMPLETE"],
  executing: [
    "START",
    "PREFLIGHT_COMPLETE",
    "ROUTE_COMPLETE",
    "DISCUSS_COMPLETE",
    "PLAN_COMPLETE",
  ],
  complete: [
    "PHASE_COMPLETE",
    "VERIFY_PASSED",
    "LEARN_COMPLETE",
    "COMMIT_COMPLETE",
  ],
};

/**
 * Fire bridge transitions to sync state.json with the lu context state.
 *
 * Best-effort: all errors are swallowed. Bridge sync must never block
 * the orchestrator or cause context-cli to fail.
 *
 * Some events require data payloads (e.g., ROUTE_COMPLETE needs complexity).
 * This function reads the current complexity from state.json to populate
 * required fields. If state.json is unreadable, falls back to "MODERATE".
 *
 * @param contextState - The new `current_state` value from the lu context
 */
const syncBridgeState = (contextState: string): void => {
  const events = LU_STATE_TO_BRIDGE_EVENTS[contextState];
  if (!events) return;

  // Read current complexity from state.json for events that require it
  let complexity = "MODERATE";
  try {
    const result = Bun.spawnSync(["luca-bridge", "read-complexity"], {
      stdout: "pipe",
      stderr: "ignore",
    });
    if (result.exitCode === 0) {
      const parsed = JSON.parse(result.stdout.toString());
      if (parsed.complexity) complexity = parsed.complexity;
    }
  } catch {
    // Fall back to MODERATE
  }

  // Read current phase from state.json for events that require it
  let phaseId = 0;
  try {
    const phaseResult = Bun.spawnSync(["luca-bridge", "read-phase"], {
      stdout: "pipe",
      stderr: "ignore",
    });
    if (phaseResult.exitCode === 0) {
      const parsed = JSON.parse(phaseResult.stdout.toString());
      if (typeof parsed.phase === "number") phaseId = parsed.phase;
    }
  } catch {
    // Fall back to 0
  }

  // Event data payloads for events that require them
  const eventData: Record<string, string> = {
    ROUTE_COMPLETE: JSON.stringify({ complexity }),
    PHASE_COMPLETE: JSON.stringify({ phase_id: phaseId }),
  };

  for (const event of events) {
    try {
      const args = ["luca-bridge", "transition", `--event=${event}`];
      const data = eventData[event];
      if (data) args.push(`--data=${data}`);

      Bun.spawnSync(args, {
        stdout: "ignore",
        stderr: "ignore",
      });
    } catch {
      // Best-effort: bridge failure must never block the orchestrator
    }
  }
};

// ─── Context Registry ─────────────────────────────────────────────────────

interface ContextEntry {
  path: string;
  helpers: ContextHelpers<z.ZodType>;
}

/**
 * Registry mapping context names to their schemas, paths, and helpers.
 *
 * Each entry reuses the existing `createContextHelpers()` factory,
 * so all file I/O, deep merge, and Zod validation behavior is identical
 * to direct TypeScript usage.
 */
const CONTEXT_REGISTRY: Record<string, ContextEntry> = {
  lu: {
    path: LU_CONTEXT_PATH,
    helpers: createContextHelpers(LU_CONTEXT_PATH, LuContextSchema),
  },
  "phase-execute": {
    path: PHASE_EXECUTE_CONTEXT_PATH,
    helpers: createContextHelpers(
      PHASE_EXECUTE_CONTEXT_PATH,
      PhaseExecuteContextSchema,
    ),
  },
  verify: {
    path: VERIFY_CONTEXT_PATH,
    helpers: createContextHelpers(VERIFY_CONTEXT_PATH, VerifyContextSchema),
  },
  "milestone-complete": {
    path: MILESTONE_COMPLETE_CONTEXT_PATH,
    helpers: createContextHelpers(
      MILESTONE_COMPLETE_CONTEXT_PATH,
      MilestoneCompleteContextSchema,
    ),
  },
  "pr-address": {
    path: PR_ADDRESS_CONTEXT_PATH,
    helpers: createContextHelpers(
      PR_ADDRESS_CONTEXT_PATH,
      PrAddressContextSchema,
    ),
  },
};

const VALID_NAMES = Object.keys(CONTEXT_REGISTRY).join(", ");

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Write JSON to stdout and exit with code 0.
 */
const succeed = (data: unknown): void => {
  console.log(JSON.stringify(data));
  process.exit(0);
};

/**
 * Write error to stderr and exit with code 2.
 */
const fail = (message: string): never => {
  console.error(`Error: ${message}`);
  process.exit(2);
};

/**
 * Resolve a context name to its registry entry, or fail with a clear message.
 */
const resolveContext = (name: string | undefined): ContextEntry => {
  if (!name) {
    return fail(`Missing context name. Valid names: ${VALID_NAMES}`);
  }
  const entry = CONTEXT_REGISTRY[name];
  if (!entry) {
    return fail(`Unknown context name: "${name}". Valid names: ${VALID_NAMES}`);
  }
  return entry;
};

// ─── Subcommands ──────────────────────────────────────────────────────────

/**
 * Initialize a context file with `{ context_version: 1, current_state: "idle" }`.
 * Overwrites any existing file.
 */
const handleInit = async (name: string | undefined): Promise<void> => {
  const entry = resolveContext(name);

  // Delete existing file if present (clean init)
  try {
    unlinkSync(entry.path);
  } catch {
    // File doesn't exist — fine
  }

  await entry.helpers.write({ current_state: "idle" } as never);
  succeed({ success: true, path: entry.path });
};

/**
 * Deep-merge a JSON patch into the existing context file.
 * Creates the file if it doesn't exist.
 */
const handleWrite = async (
  name: string | undefined,
  patchJson: string | undefined,
): Promise<void> => {
  const entry = resolveContext(name);

  if (!patchJson) {
    return fail("Missing JSON patch argument. Usage: write <name> '<json>'");
  }

  let patch: Record<string, unknown>;
  try {
    patch = JSON.parse(patchJson) as Record<string, unknown>;
  } catch {
    return fail(`Invalid JSON patch: ${patchJson}`);
  }

  await entry.helpers.write(patch as never);

  // Auto-sync bridge state when lu context's current_state changes.
  // This keeps state.json in sync so the statusline HUD updates in real-time.
  if (name === "lu" && typeof patch.current_state === "string") {
    syncBridgeState(patch.current_state);
  }

  succeed({ success: true });
};

/**
 * Read and Zod-validate the context file. Output full data to stdout.
 */
const handleRead = async (name: string | undefined): Promise<void> => {
  const entry = resolveContext(name);
  const result = await entry.helpers.read();

  if (!result.success) {
    succeed({
      success: false,
      error: result.error.issues.map((i) => i.message).join("; "),
    });
    return;
  }

  succeed({ success: true, data: result.data });
};

/**
 * Read only the `current_state` field. Output as plain text (not JSON)
 * for easy consumption in bash scripts.
 */
const handleState = async (name: string | undefined): Promise<void> => {
  const entry = resolveContext(name);
  const result = await entry.helpers.read();

  if (!result.success) {
    console.log("unknown");
    process.exit(0);
  }

  const state =
    (result.data as Record<string, unknown>).current_state ?? "unknown";
  console.log(String(state));
  process.exit(0);
};

/**
 * Delete the context file (cleanup).
 */
const handleReset = (name: string | undefined): void => {
  const entry = resolveContext(name);

  try {
    unlinkSync(entry.path);
  } catch {
    // File doesn't exist — still success
  }

  succeed({ success: true });
};

// ─── Main ─────────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  const [command, name, ...rest] = Bun.argv.slice(2);

  if (!command || command === "--help" || command === "-h") {
    console.log(`Usage: bun context-cli.ts <command> <name> [args]

Commands:
  init  <name>              Initialize context file (idle state)
  write <name> '<json>'     Deep-merge JSON patch into context
  read  <name>              Read and validate context file (JSON)
  state <name>              Read current_state only (plain text)
  reset <name>              Delete context file

Context names: ${VALID_NAMES}

Examples:
  bun context-cli.ts init lu
  bun context-cli.ts write lu '{"current_state":"routed"}'
  bun context-cli.ts read lu
  bun context-cli.ts state lu
  bun context-cli.ts reset lu`);
    process.exit(0);
  }

  switch (command) {
    case "init":
      await handleInit(name);
      break;
    case "write":
      await handleWrite(name, rest[0]);
      break;
    case "read":
      await handleRead(name);
      break;
    case "state":
      await handleState(name);
      break;
    case "reset":
      handleReset(name);
      break;
    default:
      fail(
        `Unknown command: "${command}". Valid commands: init, write, read, state, reset`,
      );
  }
};

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : String(err));
  process.exit(2);
});
