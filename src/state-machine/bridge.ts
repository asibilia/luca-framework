/**
 * High-level CLI bridge for the Luca workflow state machine.
 *
 * Provides convenience subcommands targeted at skill/agent prompts
 * and hook scripts. This is a separate entry point from cli.ts,
 * which is the lower-level machine API.
 *
 * Subcommands:
 *   read-complexity  — Read current complexity level (graceful fallback)
 *   read-oversight   — Read current oversight level (graceful fallback)
 *   read-phase       — Read current phase info (graceful fallback)
 *   read-field       — Read an arbitrary context field (errors on missing state)
 *   transition       — Send event + persist + update STATE.md atomically
 *   snapshot         — Generate/update STATE.md from current state
 *   ensure-init      — Initialize state if not already initialized
 *   gate-check       — Check if a named gate is enabled
 *
 * All output is JSON to stdout. Errors go to stderr with exit code 2.
 *
 * Usage:
 *   bun run src/state-machine/bridge.ts read-complexity
 *   bun run src/state-machine/bridge.ts read-oversight
 *   bun run src/state-machine/bridge.ts read-phase
 *   bun run src/state-machine/bridge.ts read-field --field=session_id
 *   bun run src/state-machine/bridge.ts transition --event=START [--data=json]
 *   bun run src/state-machine/bridge.ts snapshot
 *   bun run src/state-machine/bridge.ts ensure-init [--force]
 *   bun run src/state-machine/bridge.ts gate-check --gate=confirm_plan
 *
 * @module state-machine/bridge
 */
import get from "lodash/get";
import {
  persistActor,
  loadPersistedActor,
  createFreshActor,
  stateExists,
} from "./persistence";
import { workflowEventSchema } from "./types";
import { buildTransitionRecord } from "./events";
import { getAllowedEvents } from "./machine";
import { generateSnapshot } from "./snapshot";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Default path for the STATE.md file */
const STATE_MD_PATH = ".planning/STATE.md";

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Extract a named argument from CLI args array.
 *
 * Searches for `--name=value` pattern and returns the value portion.
 *
 * @param args - Array of CLI argument strings
 * @param name - Argument name (without -- prefix)
 * @param defaultValue - Value to return if argument is not found
 * @returns The argument value, or defaultValue if not found
 */
function getArg(
  args: string[],
  name: string,
  defaultValue: string = "",
): string {
  const prefix = `--${name}=`;
  const arg = args.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : defaultValue;
}

/**
 * Check if a boolean flag is present in CLI args.
 *
 * @param args - Array of CLI argument strings
 * @param name - Flag name (without -- prefix)
 * @returns true if the flag is present
 */
function hasFlag(args: string[], name: string): boolean {
  return args.includes(`--${name}`);
}

/**
 * Print usage information to stderr.
 */
function printUsage(): void {
  console.error(`Usage: bun run src/state-machine/bridge.ts <subcommand> [options]

Subcommands:
  read-complexity   Read current complexity level (TRIVIAL if not initialized)
  read-oversight    Read current oversight level (milestone if not initialized)
  read-phase        Read current phase info (null defaults if not initialized)
  read-field        Read an arbitrary context field (errors on missing state)
                    Options: --field=path (required, lodash get path)
  transition        Send event, persist state, and update STATE.md
                    Options: --event=TYPE (required), --data=json (optional)
  snapshot          Generate STATE.md from current machine state
  ensure-init       Initialize state if not already initialized
                    Options: --force (overwrite existing state)
  gate-check        Check if a named gate is enabled
                    Options: --gate=name (required)`);
}

// ─── Read Commands (Graceful Fallback) ──────────────────────────────────────

/**
 * Read the current complexity level.
 *
 * Returns "TRIVIAL" as default if state is not initialized.
 * Never errors on missing state.
 */
async function handleReadComplexity(): Promise<void> {
  const exists = await stateExists();

  if (!exists) {
    console.log(JSON.stringify({ complexity: "TRIVIAL", initialized: false }));
    return;
  }

  const result = await loadPersistedActor();
  if (!result.success) {
    console.log(JSON.stringify({ complexity: "TRIVIAL", initialized: false }));
    return;
  }

  const snapshot = result.data.getSnapshot();
  console.log(
    JSON.stringify({
      complexity: snapshot.context.complexity,
      initialized: true,
    }),
  );
}

/**
 * Read the current oversight level.
 *
 * Returns "milestone" as default if state is not initialized.
 * Never errors on missing state.
 */
async function handleReadOversight(): Promise<void> {
  const exists = await stateExists();

  if (!exists) {
    console.log(JSON.stringify({ oversight: "milestone", initialized: false }));
    return;
  }

  const result = await loadPersistedActor();
  if (!result.success) {
    console.log(JSON.stringify({ oversight: "milestone", initialized: false }));
    return;
  }

  const snapshot = result.data.getSnapshot();
  console.log(
    JSON.stringify({
      oversight: snapshot.context.oversight,
      initialized: true,
    }),
  );
}

/**
 * Read current phase information.
 *
 * Returns null/empty defaults if state is not initialized.
 * Never errors on missing state.
 */
async function handleReadPhase(): Promise<void> {
  const exists = await stateExists();

  if (!exists) {
    console.log(
      JSON.stringify({
        current_phase: null,
        current_milestone: null,
        current_plan_ids: [],
        current_wave_count: 0,
        initialized: false,
      }),
    );
    return;
  }

  const result = await loadPersistedActor();
  if (!result.success) {
    console.log(
      JSON.stringify({
        current_phase: null,
        current_milestone: null,
        current_plan_ids: [],
        current_wave_count: 0,
        initialized: false,
      }),
    );
    return;
  }

  const snapshot = result.data.getSnapshot();
  const ctx = snapshot.context;
  console.log(
    JSON.stringify({
      current_phase: ctx.current_phase ?? null,
      current_milestone: ctx.current_milestone ?? null,
      current_plan_ids: ctx.current_plan_ids,
      current_wave_count: ctx.current_wave_count,
      initialized: true,
    }),
  );
}

/**
 * Read an arbitrary context field by lodash path.
 *
 * Unlike the read-* convenience commands, this errors on missing state.
 *
 * @param args - CLI arguments (--field=path required)
 */
async function handleReadField(args: string[]): Promise<void> {
  const fieldPath = getArg(args, "field");
  if (!fieldPath) {
    console.error("Missing --field argument");
    process.exit(2);
  }

  const result = await loadPersistedActor();
  if (!result.success) {
    console.error(result.error);
    process.exit(2);
  }

  const snapshot = result.data.getSnapshot();
  const value = get(snapshot.context, fieldPath);
  console.log(JSON.stringify({ field: fieldPath, value }));
}

// ─── Transition Command ─────────────────────────────────────────────────────

/**
 * Send an event, persist state, and atomically update STATE.md.
 *
 * After the event is sent and state.json is persisted, reads the
 * current STATE.md (if it exists), generates a new snapshot preserving
 * existing sections, and writes it.
 *
 * @param args - CLI arguments (--event=TYPE required, --data=json optional)
 */
async function handleTransition(args: string[]): Promise<void> {
  const eventType = getArg(args, "event");
  if (!eventType) {
    console.error("Missing --event argument");
    process.exit(2);
  }

  // Build event object from type + optional data
  let eventObj: Record<string, any> = { type: eventType };
  const dataRaw = getArg(args, "data");
  if (dataRaw) {
    try {
      const parsed = JSON.parse(dataRaw);
      eventObj = { ...parsed, type: eventType };
    } catch {
      console.error("Invalid JSON in --data argument");
      process.exit(2);
    }
  }

  // Validate event against schema
  const validation = workflowEventSchema.safeParse(eventObj);
  if (!validation.success) {
    console.error(
      JSON.stringify({
        error: "Invalid event",
        details: validation.error.issues,
      }),
    );
    process.exit(2);
  }

  // Load actor, send event, persist
  const loadResult = await loadPersistedActor();
  if (!loadResult.success) {
    console.error(loadResult.error);
    process.exit(2);
  }

  const actor = loadResult.data;
  const prevState = actor.getSnapshot().value;
  actor.send(validation.data);
  const nextSnapshot = actor.getSnapshot();

  const persistResult = await persistActor(actor);
  if (!persistResult.success) {
    console.error(persistResult.error);
    process.exit(2);
  }

  // Atomically update STATE.md
  let existingContent: string | undefined;
  try {
    const stateFile = Bun.file(STATE_MD_PATH);
    if (await stateFile.exists()) {
      existingContent = await stateFile.text();
    }
  } catch {
    // No existing STATE.md -- that's fine
  }

  const allowed = getAllowedEvents(nextSnapshot);
  const markdown = generateSnapshot({
    state: String(nextSnapshot.value),
    context: nextSnapshot.context,
    existing_content: existingContent,
    allowed_events: allowed,
  });

  await Bun.write(STATE_MD_PATH, markdown);

  // Output transition record
  const { type: _type, ...eventData } = validation.data;
  const record = buildTransitionRecord(
    String(prevState),
    String(nextSnapshot.value),
    eventType,
    eventData,
    nextSnapshot.context,
  );
  console.log(JSON.stringify(record, null, 2));
}

// ─── Snapshot Command ───────────────────────────────────────────────────────

/**
 * Generate STATE.md from the current machine state.
 *
 * Reads the current persisted state and writes a fresh STATE.md,
 * preserving existing human-authored sections.
 */
async function handleSnapshot(): Promise<void> {
  const result = await loadPersistedActor();
  if (!result.success) {
    console.error(result.error);
    process.exit(2);
  }

  const actor = result.data;
  const snapshot = actor.getSnapshot();
  const allowed = getAllowedEvents(snapshot);

  let existingContent: string | undefined;
  try {
    const stateFile = Bun.file(STATE_MD_PATH);
    if (await stateFile.exists()) {
      existingContent = await stateFile.text();
    }
  } catch {
    // No existing STATE.md
  }

  const markdown = generateSnapshot({
    state: String(snapshot.value),
    context: snapshot.context,
    existing_content: existingContent,
    allowed_events: allowed,
  });

  await Bun.write(STATE_MD_PATH, markdown);

  console.log(
    JSON.stringify({
      snapshot_written: true,
      path: STATE_MD_PATH,
      state: snapshot.value,
    }),
  );
}

// ─── Ensure Init Command ────────────────────────────────────────────────────

/**
 * Initialize state machine if not already initialized.
 *
 * Unlike cli.ts `init`, this is idempotent: if state already exists,
 * it returns the existing state info without error (unless --force).
 *
 * @param args - CLI arguments (--force to overwrite)
 */
async function handleEnsureInit(args: string[]): Promise<void> {
  const force = hasFlag(args, "force");

  if (!force && (await stateExists())) {
    // State already exists -- return current info
    const loadResult = await loadPersistedActor();
    if (loadResult.success) {
      const snapshot = loadResult.data.getSnapshot();
      console.log(
        JSON.stringify({
          initialized: true,
          already_existed: true,
          state: snapshot.value,
          session_id: snapshot.context.session_id,
        }),
      );
      return;
    }
    // If load fails on existing file, fall through to create fresh
  }

  const result = await createFreshActor();
  if (!result.success) {
    console.error(result.error);
    process.exit(2);
  }

  const actor = result.data;
  const persistResult = await persistActor(actor);
  if (!persistResult.success) {
    console.error(persistResult.error);
    process.exit(2);
  }

  const snapshot = actor.getSnapshot();
  console.log(
    JSON.stringify({
      initialized: true,
      already_existed: false,
      state: snapshot.value,
      session_id: snapshot.context.session_id,
    }),
  );
}

// ─── Gate Check Command ─────────────────────────────────────────────────────

/**
 * Check if a named gate is enabled in the machine context.
 *
 * @param args - CLI arguments (--gate=name required)
 */
async function handleGateCheck(args: string[]): Promise<void> {
  const gateName = getArg(args, "gate");
  if (!gateName) {
    console.error("Missing --gate argument");
    process.exit(2);
  }

  const result = await loadPersistedActor();
  if (!result.success) {
    console.error(result.error);
    process.exit(2);
  }

  const snapshot = result.data.getSnapshot();
  const enabled = snapshot.context.gates[gateName] === true;

  console.log(
    JSON.stringify({
      gate: gateName,
      enabled,
    }),
  );
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

if (import.meta.main) {
  const subcommand = Bun.argv[2];
  const args = Bun.argv.slice(3);

  async function run() {
    switch (subcommand) {
      case "read-complexity":
        await handleReadComplexity();
        break;
      case "read-oversight":
        await handleReadOversight();
        break;
      case "read-phase":
        await handleReadPhase();
        break;
      case "read-field":
        await handleReadField(args);
        break;
      case "transition":
        await handleTransition(args);
        break;
      case "snapshot":
        await handleSnapshot();
        break;
      case "ensure-init":
        await handleEnsureInit(args);
        break;
      case "gate-check":
        await handleGateCheck(args);
        break;
      default:
        printUsage();
        process.exit(2);
    }
  }

  run().catch((err) => {
    console.error("Error:", err instanceof Error ? err.message : String(err));
    process.exit(2);
  });
}

// ─── Exported Functions ─────────────────────────────────────────────────────
// These are exported for programmatic use and testing.

export {
  handleReadComplexity,
  handleReadOversight,
  handleReadPhase,
  handleReadField,
  handleTransition,
  handleSnapshot,
  handleEnsureInit,
  handleGateCheck,
};
