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
 *   read-status      — Read comprehensive workflow status (graceful fallback)
 *   read-field       — Read an arbitrary context field (errors on missing state)
 *   set-field        — Set an allowlisted context field + persist + regenerate STATE.md
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
 *   bun run src/state-machine/bridge.ts read-status
 *   bun run src/state-machine/bridge.ts read-field --field=session_id
 *   bun run src/state-machine/bridge.ts set-field --field=current_milestone --value="v2.0"
 *   bun run src/state-machine/bridge.ts transition --event=START [--data=json]
 *   bun run src/state-machine/bridge.ts snapshot
 *   bun run src/state-machine/bridge.ts ensure-init [--force]
 *   bun run src/state-machine/bridge.ts gate-check --gate=confirm_plan
 *
 * @module state-machine/bridge
 */
import get from "lodash/get";
import set from "lodash/set";
import cloneDeep from "lodash/cloneDeep";
import {
  persistActor,
  loadPersistedActor,
  createFreshActor,
  stateExists,
  STATE_FILE_PATH,
} from "./persistence";
import { workflowContextSchema, workflowEventSchema } from "./types";
import { buildTransitionRecord } from "./events";
import { getAllowedEvents } from "./machine";
import { generateSnapshot } from "./snapshot";
import { getArg, hasFlag } from "../shared/cli-utils.ts";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Default path for the STATE.md file */
const STATE_MD_PATH = ".planning/STATE.md";

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Print usage information to stderr.
 */
function printUsage(): void {
  console.error(`Usage: bun run src/state-machine/bridge.ts <subcommand> [options]

Subcommands:
  read-complexity   Read current complexity level (TRIVIAL if not initialized)
  read-oversight    Read current oversight level (milestone if not initialized)
  read-phase        Read current phase info (null defaults if not initialized)
  read-status       Read comprehensive workflow status (defaults if not initialized)
  read-field        Read an arbitrary context field (errors on missing state)
                    Options: --field=path (required, lodash get path)
  set-field         Set an allowlisted context field, persist, and regenerate STATE.md
                    Options: --field=name (required), --value=json-or-string (required)
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
 * Read comprehensive workflow status.
 *
 * Returns key fields from the workflow context in a single JSON object.
 * Falls back to sensible defaults if state is not initialized.
 * Never errors on missing state.
 */
async function handleReadStatus(): Promise<void> {
  const defaults = {
    initialized: false,
    state: "idle",
    complexity: "TRIVIAL",
    oversight: "milestone",
    current_phase: null,
    current_milestone: null,
    current_plan_ids: [] as string[],
    current_wave_count: 0,
    ticket_id: null,
    github_issue: null,
    branch: null,
    base_branch: "main",
    session_id: null,
    started_at: null,
    last_transition_at: null,
    verification_attempts: 0,
    phase_results_count: 0,
    last_error: null,
  };

  const exists = await stateExists();
  if (!exists) {
    console.log(JSON.stringify(defaults));
    return;
  }

  const result = await loadPersistedActor();
  if (!result.success) {
    console.log(JSON.stringify(defaults));
    return;
  }

  const snapshot = result.data.getSnapshot();
  const ctx = snapshot.context;
  console.log(
    JSON.stringify({
      initialized: true,
      state: String(snapshot.value),
      complexity: ctx.complexity,
      oversight: ctx.oversight,
      current_phase: ctx.current_phase ?? null,
      current_milestone: ctx.current_milestone ?? null,
      current_plan_ids: ctx.current_plan_ids,
      current_wave_count: ctx.current_wave_count,
      ticket_id: ctx.ticket_id ?? null,
      github_issue: ctx.github_issue ?? null,
      branch: ctx.branch ?? null,
      base_branch: ctx.base_branch,
      session_id: ctx.session_id,
      started_at: ctx.started_at ?? null,
      last_transition_at: ctx.last_transition_at ?? null,
      verification_attempts: ctx.verification_attempts,
      phase_results_count: ctx.phase_results.length,
      last_error: ctx.last_error ?? null,
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

// ─── Set Field Command ──────────────────────────────────────────────────────

/**
 * Allowlisted context fields that can be set via the bridge.
 *
 * Only fields in this list can be mutated directly. All other context
 * changes must go through typed workflow events (transition command).
 */
const SETTABLE_FIELDS = [
  "current_milestone",
  "current_phase",
  "github_issue",
  "branch",
  "base_branch",
  "ticket_id",
  "oversight",
  "complexity",
  "memory_tags",
  "intuition_flags",
] as const;

/**
 * Set an allowlisted context field, persist state, and regenerate STATE.md.
 *
 * This bypasses the event model for fields that don't have a corresponding
 * workflow event. It directly mutates the persisted snapshot context,
 * validates the result against the context schema, and regenerates STATE.md.
 *
 * @param args - CLI arguments (--field=name required, --value=json-or-string required)
 */
async function handleSetField(args: string[]): Promise<void> {
  const fieldPath = getArg(args, "field");
  const rawValue = getArg(args, "value");

  if (!fieldPath) {
    console.error("Missing --field argument");
    process.exit(2);
  }
  if (!rawValue && rawValue !== "0" && rawValue !== "false") {
    console.error("Missing --value argument");
    process.exit(2);
  }

  // Validate field is in allowlist
  if (!SETTABLE_FIELDS.includes(fieldPath as any)) {
    console.error(
      `Field "${fieldPath}" is not settable via bridge. Allowed: ${SETTABLE_FIELDS.join(", ")}`,
    );
    process.exit(2);
  }

  // Parse value: try JSON first, fall back to raw string
  let value: any;
  try {
    value = JSON.parse(rawValue);
  } catch {
    value = rawValue;
  }

  // Load the persisted state file directly (not the actor)
  const stateFile = Bun.file(STATE_FILE_PATH);
  if (!(await stateFile.exists())) {
    console.error("State file not found. Run ensure-init first.");
    process.exit(2);
  }

  let snapshotJson: any;
  try {
    snapshotJson = await stateFile.json();
  } catch {
    console.error("State file contains invalid JSON");
    process.exit(2);
  }

  // Capture previous value and set new value
  const previousValue = get(snapshotJson.context, fieldPath);
  const updatedContext = cloneDeep(snapshotJson.context);
  set(updatedContext, fieldPath, value);

  // Validate the updated context
  const validation = workflowContextSchema.safeParse(updatedContext);
  if (!validation.success) {
    console.error(
      JSON.stringify({
        error: `Invalid value for field "${fieldPath}"`,
        details: validation.error.issues,
      }),
    );
    process.exit(2);
  }

  // Update the timestamp
  updatedContext.last_transition_at = new Date().toISOString();

  // Write back
  snapshotJson.context = updatedContext;
  await Bun.write(STATE_FILE_PATH, JSON.stringify(snapshotJson, null, 2));

  // Regenerate STATE.md
  let existingContent: string | undefined;
  try {
    const mdFile = Bun.file(STATE_MD_PATH);
    if (await mdFile.exists()) {
      existingContent = await mdFile.text();
    }
  } catch {
    // No existing STATE.md
  }

  // Load actor from updated state to get allowed events
  const loadResult = await loadPersistedActor();
  if (loadResult.success) {
    const snapshot = loadResult.data.getSnapshot();
    const allowed = getAllowedEvents(snapshot);
    const markdown = generateSnapshot({
      state: String(snapshot.value),
      context: snapshot.context,
      existing_content: existingContent,
      allowed_events: allowed,
    });
    await Bun.write(STATE_MD_PATH, markdown);
  }

  console.log(
    JSON.stringify({
      field: fieldPath,
      value,
      previous_value: previousValue ?? null,
      state: String(snapshotJson.value),
    }),
  );
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
      case "read-status":
        await handleReadStatus();
        break;
      case "read-field":
        await handleReadField(args);
        break;
      case "set-field":
        await handleSetField(args);
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
  handleReadStatus,
  handleReadField,
  handleSetField,
  handleTransition,
  handleSnapshot,
  handleEnsureInit,
  handleGateCheck,
  SETTABLE_FIELDS,
};
