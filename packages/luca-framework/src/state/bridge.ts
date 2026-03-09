/**
 * High-level CLI bridge for the Luca workflow state machine.
 *
 * All state is persisted to a local JSON file (.planning/state.json).
 * STATE.md generation is gated by LUCA_EXPORT_MD=true.
 *
 * Subcommands (13):
 *   read-complexity        — Read current complexity level
 *   read-oversight         — Read current oversight level
 *   read-phase             — Read current phase info
 *   read-status            — Read comprehensive workflow status
 *   read-field             — Read an arbitrary context field (errors on missing state)
 *   read-ledger            — Read session ledger entries with optional filters
 *   set-field              — Set an allowlisted context field + persist + regenerate STATE.md
 *   transition             — Send event + persist + update STATE.md atomically
 *   snapshot               — Generate/update STATE.md from current state
 *   ensure-init            — Initialize state if not already initialized
 *   gate-check             — Check if a named gate is enabled
 *   suspend                — Create checkpoint and suspend current phase
 *   resume-phase           — Load checkpoint and resume a suspended phase
 *
 * All output is JSON to stdout. Errors go to stderr with exit code 2.
 *
 * Usage:
 *   luca-state read-complexity
 *   luca-state read-oversight
 *   luca-state read-phase
 *   luca-state read-status
 *   luca-state read-field --field=session_id
 *   luca-state read-ledger --tail=5
 *   luca-state read-ledger --session=abc-123 --event=START
 *   luca-state set-field --field=current_milestone --value="v2.0"
 *   luca-state transition --event=START [--data=json]
 *   luca-state snapshot
 *   luca-state ensure-init [--force]
 *   luca-state gate-check --gate=confirm_plan
 *   luca-state suspend --phase=42 [--reason=context_exhaustion] [--wave=1] [--tasks=id1,id2]
 *   luca-state resume-phase --phase=42
 *
 * @module luca-state/bridge
 */
import get from "lodash/get";
import set from "lodash/set";
import cloneDeep from "lodash/cloneDeep";
import type { Actor } from "xstate";
import {
  persistActor,
  loadPersistedActor,
  createFreshActor,
  stateExists,
  STATE_FILE_PATH,
} from "./persistence";
import { workflowContextSchema, workflowEventSchema } from "./types";
import type { TransitionRecord } from "./types";
import { sanitizeJsonParse } from "../utils/sanitize";
import { buildTransitionRecord } from "./events";
import { getAllowedEvents, workflowMachine } from "./machine";
import { generateSnapshot } from "./snapshot";
import { getArg, hasFlag } from "./utils/cli-utils";
import {
  createSuspendCheckpoint,
  loadSuspendCheckpoint,
  clearSuspendCheckpoint,
} from "./suspend-checkpoint";
import type { SuspendCheckpoint } from "./suspend-checkpoint";
import { readLedger, appendLedgerEntry } from "./ledger";
import type { LedgerFilters } from "./ledger";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Default path for the STATE.md file */
const STATE_MD_PATH = ".planning/STATE.md";

// ─── Dual-Write Divergence Detection ────────────────────────────────────────

/**
 * Verify that the local JSON file matches the intended state after a dual-write.
 *
 * Reads the persisted JSON file and compares key fields (state, complexity,
 * phase) against the intended values. Logs a warning if divergence is found.
 * Best-effort only -- never throws.
 *
 * @param intended - The intended field values to verify against
 */
async function checkDualWriteDivergence(intended: {
  state: string;
  complexity: string;
  phase: string | number | null;
}): Promise<void> {
  try {
    const file = Bun.file(STATE_FILE_PATH);
    if (!(await file.exists())) return;

    const written = sanitizeJsonParse(await file.text()) as {
      value?: unknown;
      context?: Record<string, unknown>;
    };
    const ctx = written.context ?? {};
    const divergences: string[] = [];

    if (
      written.value !== undefined &&
      String(written.value) !== intended.state
    ) {
      divergences.push(
        `state: json="${String(written.value)}" vs intended="${intended.state}"`,
      );
    }
    if (
      ctx.complexity !== undefined &&
      String(ctx.complexity) !== intended.complexity
    ) {
      divergences.push(
        `complexity: json="${ctx.complexity}" vs intended="${intended.complexity}"`,
      );
    }
    if (
      ctx.current_phase !== undefined &&
      String(ctx.current_phase ?? "") !== String(intended.phase ?? "")
    ) {
      divergences.push(
        `phase: json="${ctx.current_phase}" vs intended="${intended.phase}"`,
      );
    }

    if (divergences.length > 0) {
      console.warn(
        `[dual-write] Divergence detected: ${divergences.join(", ")}`,
      );
    }
  } catch {
    // Divergence check is best-effort
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Read existing STATE.md, generate a fresh snapshot, and write it back.
 *
 * Gated by LUCA_EXPORT_MD env var. If not set to "true", this is a no-op.
 *
 * @param actor - The actor whose snapshot provides state and context
 */
async function updateStateMd(
  actor: Actor<typeof workflowMachine>,
): Promise<void> {
  if (process.env.LUCA_EXPORT_MD !== "true") return;

  const snapshot = actor.getSnapshot();
  const allowed = getAllowedEvents(snapshot);

  let existingContent: string | undefined;
  try {
    const mdFile = Bun.file(STATE_MD_PATH);
    if (await mdFile.exists()) {
      existingContent = await mdFile.text();
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
}

/**
 * All valid subcommand names for the bridge CLI.
 */
const VALID_SUBCOMMANDS = [
  "read-status",
  "read-complexity",
  "read-oversight",
  "read-phase",
  "read-field",
  "read-ledger",
  "set-field",
  "transition",
  "ensure-init",
  "snapshot",
  "gate-check",
  "suspend",
  "resume-phase",
] as const;

/**
 * Formatted help text for the bridge CLI.
 *
 * Organized by command category (read, write, lifecycle)
 * with option descriptions for each subcommand.
 */
const HELP_TEXT = `luca-state — CLI bridge for the Luca workflow state machine

Usage: luca-state <subcommand> [options]

Read commands:
  read-status            Read comprehensive workflow status
  read-complexity        Read current complexity level
  read-oversight         Read current oversight level
  read-phase             Read current phase info
  read-field             Read an arbitrary context field (--field=path)
  read-ledger            Read session ledger entries (--tail=N, --session=id)

Write commands:
  set-field              Set a context field (--field=name --value=json)
  transition             Send workflow event (--event=TYPE [--data=json])

Lifecycle commands:
  ensure-init            Initialize state if not present ([--force])
  snapshot               Generate STATE.md from current state
  gate-check             Check if a gate is enabled (--gate=name)
  suspend                Suspend a phase (--phase=N [--reason=str])
  resume-phase           Resume a suspended phase (--phase=N)

Options:
  --help, -h             Show this help message`;

/**
 * Print help text to stdout (for --help) or stderr (for errors).
 *
 * @param stream - Output stream: "stdout" for --help, "stderr" for errors
 */
function printUsage(stream: "stdout" | "stderr" = "stderr"): void {
  if (stream === "stdout") {
    console.log(HELP_TEXT);
  } else {
    console.error(HELP_TEXT);
  }
}

// ─── Read Helper ────────────────────────────────────────────────────────────

/**
 * Read state from the persisted JSON file.
 *
 * Reads the JSON state file and applies the provided `fromSnapshot` transform
 * to extract the requested data. Returns `defaults` if state is missing or
 * cannot be parsed.
 *
 * @param opts - Options for reading state
 */
async function readFromState<T>(opts: {
  fromSnapshot: (ctx: Record<string, unknown>, stateValue: string) => T | null;
  defaults: T;
}): Promise<T> {
  try {
    const file = Bun.file(STATE_FILE_PATH);
    if (!(await file.exists())) return opts.defaults;
    const raw = sanitizeJsonParse(await file.text()) as {
      value?: unknown;
      context?: Record<string, unknown>;
    };
    if (!raw.context) return opts.defaults;
    const result = opts.fromSnapshot(raw.context, String(raw.value ?? "idle"));
    return result ?? opts.defaults;
  } catch {
    return opts.defaults;
  }
}

// ─── Read Commands ──────────────────────────────────────────────────────────

/**
 * Read the current complexity level.
 *
 * Returns "TRIVIAL" as default if state is not initialized.
 */
async function handleReadComplexity(): Promise<void> {
  const result = await readFromState({
    fromSnapshot: (ctx) => ({
      complexity: ctx.complexity as string,
      initialized: true,
    }),
    defaults: { complexity: "TRIVIAL", initialized: false },
  });
  console.log(JSON.stringify(result));
}

/**
 * Read the current oversight level.
 *
 * Returns "milestone" as default if state is not initialized.
 */
async function handleReadOversight(): Promise<void> {
  const result = await readFromState({
    fromSnapshot: (ctx) => ({
      oversight: ctx.oversight as string,
      initialized: true,
    }),
    defaults: { oversight: "milestone", initialized: false },
  });
  console.log(JSON.stringify(result));
}

/**
 * Read current phase information.
 *
 * Returns null/empty defaults if state is not initialized.
 */
async function handleReadPhase(): Promise<void> {
  const result = await readFromState({
    fromSnapshot: (ctx) => ({
      current_phase: (ctx.current_phase as number | null) ?? null,
      current_milestone: (ctx.current_milestone as string | null) ?? null,
      current_plan_ids: ctx.current_plan_ids as string[],
      current_wave_count: ctx.current_wave_count as number,
      initialized: true,
    }),
    defaults: {
      current_phase: null as number | null,
      current_milestone: null as string | null,
      current_plan_ids: [] as string[],
      current_wave_count: 0,
      initialized: false,
    },
  });
  console.log(JSON.stringify(result));
}

/**
 * Read comprehensive workflow status.
 *
 * Returns key fields from the workflow context in a single JSON object.
 */
async function handleReadStatus(): Promise<void> {
  const statusDefaults = {
    initialized: false,
    state: "idle",
    complexity: "TRIVIAL",
    oversight: "milestone",
    current_phase: null as number | null,
    current_milestone: null as string | null,
    current_plan_ids: [] as string[],
    current_wave_count: 0,
    ticket_id: null as string | null,
    github_issue: null as string | null,
    branch: null as string | null,
    base_branch: "main",
    session_id: null as string | null,
    started_at: null as string | null,
    last_transition_at: null as string | null,
    verification_attempts: 0,
    phase_results_count: 0,
    last_error: null as string | null,
  };

  const result = await readFromState({
    fromSnapshot: (ctx, stateValue) => ({
      initialized: true,
      state: stateValue,
      complexity: (ctx.complexity as string) ?? "TRIVIAL",
      oversight: (ctx.oversight as string) ?? "milestone",
      current_phase: (ctx.current_phase as number | null) ?? null,
      current_milestone: (ctx.current_milestone as string | null) ?? null,
      current_plan_ids: (ctx.current_plan_ids as string[]) ?? [],
      current_wave_count: (ctx.current_wave_count as number) ?? 0,
      ticket_id: (ctx.ticket_id as string | null) ?? null,
      github_issue: (ctx.github_issue as string | null) ?? null,
      branch: (ctx.branch as string | null) ?? null,
      base_branch: (ctx.base_branch as string) ?? "main",
      session_id: (ctx.session_id as string) ?? null,
      started_at: (ctx.started_at as string | null) ?? null,
      last_transition_at: (ctx.last_transition_at as string | null) ?? null,
      verification_attempts: (ctx.verification_attempts as number) ?? 0,
      phase_results_count: Array.isArray(ctx.phase_results)
        ? (ctx.phase_results as unknown[]).length
        : 0,
      last_error: (ctx.last_error as string | null) ?? null,
    }),
    defaults: statusDefaults,
  });
  console.log(JSON.stringify(result));
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

  const result = await readFromState({
    fromSnapshot: (ctx) => ({
      field: fieldPath,
      value: get(ctx, fieldPath),
    }),
    defaults: null as { field: string; value: unknown } | null,
  });

  if (result === null) {
    console.error("State not initialized. Run ensure-init first.");
    process.exit(2);
  }

  console.log(JSON.stringify(result));
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
 * Reads current context from the JSON state file, modifies the requested
 * field, validates the updated context, and persists back to disk.
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
  if (!(SETTABLE_FIELDS as readonly string[]).includes(fieldPath)) {
    console.error(
      `Field "${fieldPath}" is not settable via bridge. Allowed: ${SETTABLE_FIELDS.join(", ")}`,
    );
    process.exit(2);
  }

  // Parse value: try JSON first, fall back to raw string
  let value: unknown;
  try {
    value = sanitizeJsonParse(rawValue);
  } catch {
    value = rawValue;
  }

  // Read current state from JSON file
  let snapshotJson: Record<string, unknown> & {
    context: Record<string, unknown>;
    value?: unknown;
  };

  const stateFile = Bun.file(STATE_FILE_PATH);
  if (!(await stateFile.exists())) {
    console.error("State file not found. Run ensure-init first.");
    process.exit(2);
  }

  try {
    const text = await stateFile.text();
    snapshotJson = sanitizeJsonParse(text) as typeof snapshotJson;
  } catch {
    console.error("State file contains invalid JSON");
    process.exit(2);
  }

  // Capture previous value and set new value
  const previousValue = get(snapshotJson!.context, fieldPath);
  const updatedContext = cloneDeep(snapshotJson!.context);
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

  // Persist updated context to local JSON file
  const updatedJson = { ...snapshotJson!, context: updatedContext };
  await Bun.write(STATE_FILE_PATH, JSON.stringify(updatedJson, null, 2));

  // Optional: update STATE.md gated by env var
  if (process.env.LUCA_EXPORT_MD === "true") {
    const loadResult = await loadPersistedActor();
    if (loadResult.success) {
      await updateStateMd(loadResult.data);
    }
  }

  // Append field change to session ledger (fire-and-forget, non-blocking)
  const fieldRecord: TransitionRecord = {
    previous_state: String(snapshotJson!.value),
    current_state: String(snapshotJson!.value), // State doesn't change on field set
    event_type: "field_set",
    event_data: { field: fieldPath, value },
    actions_executed: [],
    context: {},
    timestamp: new Date().toISOString(),
    session_id: (updatedContext.session_id as string) ?? "",
  };
  appendLedgerEntry(fieldRecord).catch((err) => {
    console.error("[bridge] Failed to append ledger entry for field_set:", err);
  });

  console.log(
    JSON.stringify({
      field: fieldPath,
      value,
      previous_value: previousValue ?? null,
      state: String(snapshotJson!.value),
    }),
  );
}

// ─── Transition Command ─────────────────────────────────────────────────────

/**
 * Send an event, persist state, and atomically update STATE.md.
 *
 * After the event is sent and state is persisted,
 * optionally generates STATE.md (gated by LUCA_EXPORT_MD).
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
  let eventObj: Record<string, unknown> = { type: eventType };
  const dataRaw = getArg(args, "data");
  if (dataRaw) {
    try {
      const parsed = sanitizeJsonParse(dataRaw) as Record<string, unknown>;
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

  // Optionally update STATE.md (gated by env var)
  await updateStateMd(actor);

  // Output transition record
  const { type: _type, ...eventData } = validation.data;
  const record = buildTransitionRecord(
    String(prevState),
    String(nextSnapshot.value),
    eventType,
    eventData,
    nextSnapshot.context,
  );

  // Append to session ledger (fire-and-forget, non-blocking)
  appendLedgerEntry(record).catch((err) => {
    console.error("[bridge] Failed to append ledger entry:", err);
  });

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

  // Force STATE.md generation for explicit snapshot command
  const origEnv = process.env.LUCA_EXPORT_MD;
  process.env.LUCA_EXPORT_MD = "true";
  await updateStateMd(actor);
  process.env.LUCA_EXPORT_MD = origEnv;

  const snapshot = actor.getSnapshot();
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

// ─── Suspend Command ─────────────────────────────────────────────────────────

/**
 * Create a suspend checkpoint and transition the machine to the suspended state.
 *
 * Validates that the current machine state allows SUSPEND before writing the
 * checkpoint. Persists phase progress (wave index, completed tasks) via the
 * suspend-checkpoint module, then sends the SUSPEND event.
 *
 * @param args - CLI arguments:
 *   --phase=N (required) Phase number to suspend
 *   --reason=string (optional) Reason for suspension (default: "manual")
 *   --wave=N (optional) Wave index to resume from (default: 0)
 *   --tasks=id1,id2 (optional) Comma-separated completed task IDs
 */
async function handleSuspend(args: string[]): Promise<void> {
  const phaseStr = getArg(args, "phase");
  if (!phaseStr) {
    console.error("Missing --phase argument");
    process.exit(2);
  }

  const phaseId = parseInt(phaseStr, 10);
  if (!Number.isFinite(phaseId) || phaseId < 0) {
    console.error(`Invalid phase number: ${phaseStr}`);
    process.exit(2);
  }

  // Use || instead of ?? because getArg returns "" for missing values
  const reason = getArg(args, "reason") || "manual";

  const waveStr = getArg(args, "wave");
  const waveIndex = waveStr ? parseInt(waveStr, 10) : 0;
  if (!Number.isFinite(waveIndex) || waveIndex < 0) {
    console.error(`Invalid wave index: ${waveStr}`);
    process.exit(2);
  }

  const tasksRaw = getArg(args, "tasks");
  const completedTaskIds = tasksRaw
    ? tasksRaw.split(",").map((s) => s.trim())
    : [];

  // Load actor to get session_id and validate state allows SUSPEND
  const loadResult = await loadPersistedActor();
  if (!loadResult.success) {
    console.error(loadResult.error);
    process.exit(2);
  }

  const actor = loadResult.data;
  const snapshot = actor.getSnapshot();
  const sessionId = snapshot.context.session_id;

  // Validate that the current state allows SUSPEND before writing checkpoint
  const allowed = getAllowedEvents(snapshot);
  if (!allowed.includes("SUSPEND")) {
    console.error(
      `Cannot suspend: current state "${String(snapshot.value)}" does not allow SUSPEND. ` +
        `Allowed events: ${allowed.join(", ")}`,
    );
    process.exit(2);
  }

  // Send SUSPEND event to state machine first
  const prevState = snapshot.value;
  actor.send({
    type: "SUSPEND" as const,
    reason,
    checkpoint_id: String(phaseId),
  });
  const nextSnapshot = actor.getSnapshot();

  // Verify the transition actually occurred
  if (String(nextSnapshot.value) === String(prevState)) {
    console.error(
      `SUSPEND transition rejected: state remained "${String(prevState)}"`,
    );
    process.exit(2);
  }

  const persistResult = await persistActor(actor);
  if (!persistResult.success) {
    console.error(persistResult.error);
    process.exit(2);
  }

  // Write checkpoint file via suspend-checkpoint module
  // Session memory persists independently via MuninnDB — no file snapshot needed.
  const checkpointPath = await createSuspendCheckpoint({
    phase_id: phaseId,
    wave_index: waveIndex,
    completed_task_ids: completedTaskIds,
    suspended_at: new Date().toISOString(),
    reason,
    session_id: sessionId,
  });

  // Optionally update STATE.md (gated by env var)
  await updateStateMd(actor);

  console.log(
    JSON.stringify({
      suspended: true,
      phase_id: phaseId,
      checkpoint_path: checkpointPath,
      reason,
      wave_index: waveIndex,
      completed_task_ids: completedTaskIds,
      previous_state: String(prevState),
      current_state: String(nextSnapshot.value),
    }),
  );
}

// ─── Resume Phase Command ────────────────────────────────────────────────────

/**
 * Load a suspend checkpoint and resume the phase in the state machine.
 *
 * Loads checkpoint from the file-based checkpoint module.
 *
 * @param args - CLI arguments:
 *   --phase=N (required) Phase number to resume
 *   --keep-checkpoint (optional) Don't delete checkpoint after loading
 */
async function handleResumePhase(args: string[]): Promise<void> {
  const phaseStr = getArg(args, "phase");
  if (!phaseStr) {
    console.error("Missing --phase argument");
    process.exit(2);
  }

  const phaseId = parseInt(phaseStr, 10);
  if (!Number.isFinite(phaseId) || phaseId < 0) {
    console.error(`Invalid phase number: ${phaseStr}`);
    process.exit(2);
  }

  const keepCheckpoint = hasFlag(args, "keep-checkpoint");

  let checkpoint;
  try {
    checkpoint = await loadSuspendCheckpoint(phaseId);
  } catch (err) {
    console.error(
      err instanceof Error ? err.message : `Failed to load checkpoint: ${err}`,
    );
    process.exit(2);
  }

  // Load actor and send RESUME_PHASE event
  const loadResult = await loadPersistedActor();
  if (!loadResult.success) {
    console.error(loadResult.error);
    process.exit(2);
  }

  const actor = loadResult.data;
  const prevState = actor.getSnapshot().value;

  actor.send({
    type: "RESUME_PHASE" as const,
    checkpoint_id: String(phaseId),
  });
  const nextSnapshot = actor.getSnapshot();

  // Verify the transition actually occurred before clearing checkpoint
  const transitioned = String(nextSnapshot.value) !== String(prevState);
  if (!transitioned) {
    console.error(
      `RESUME_PHASE transition rejected: state remained "${String(prevState)}". ` +
        `Checkpoint preserved at .planning/checkpoints/suspend-${phaseId}.json`,
    );
    process.exit(2);
  }

  const persistResult = await persistActor(actor);
  if (!persistResult.success) {
    console.error(persistResult.error);
    process.exit(2);
  }

  // Optionally update STATE.md (gated by env var)
  await updateStateMd(actor);

  // Clear checkpoint only after verified transition
  if (!keepCheckpoint) {
    try {
      await clearSuspendCheckpoint(phaseId);
    } catch {
      // Non-fatal: checkpoint removal failed
    }
  }

  console.log(
    JSON.stringify({
      resumed: true,
      phase_id: phaseId,
      checkpoint: {
        wave_index: checkpoint.wave_index,
        completed_task_ids: checkpoint.completed_task_ids,
        suspended_at: checkpoint.suspended_at,
        reason: checkpoint.reason,
        session_id: checkpoint.session_id,
      },
      previous_state: String(prevState),
      current_state: String(nextSnapshot.value),
      checkpoint_cleared: !keepCheckpoint,
    }),
  );
}

// ─── Read Ledger Command ────────────────────────────────────────────────────

/**
 * Read and filter entries from the session ledger.
 *
 * Delegates to `readLedger()` from the ledger module with CLI-parsed filters.
 * If no filters are specified, defaults to `tail=20` for a quick overview.
 *
 * @param args - CLI arguments:
 *   --session=string (optional) Filter by session ID
 *   --event=string   (optional) Filter by event type
 *   --since=string   (optional) Filter entries with timestamp >= since
 *   --limit=N        (optional) Cap result count
 *   --tail=N         (optional) Read last N entries from file before filtering
 */
async function handleReadLedger(args: string[]): Promise<void> {
  const filters: LedgerFilters = {};
  const sessionArg = getArg(args, "session");
  if (sessionArg) filters.session_id = sessionArg;
  const eventArg = getArg(args, "event");
  if (eventArg) filters.event_type = eventArg;
  const sinceArg = getArg(args, "since");
  if (sinceArg) filters.since = sinceArg;
  const limitArg = getArg(args, "limit");
  if (limitArg) {
    const n = parseInt(limitArg, 10);
    if (!Number.isNaN(n) && n > 0) filters.limit = n;
  }
  const tailArg = getArg(args, "tail");
  if (tailArg) {
    const n = parseInt(tailArg, 10);
    if (!Number.isNaN(n) && n > 0) filters.tail = n;
  }
  // Default to tail=20 if no filters specified
  if (
    !filters.session_id &&
    !filters.event_type &&
    !filters.since &&
    filters.limit === undefined &&
    filters.tail === undefined
  ) {
    filters.tail = 20;
  }
  const entries = await readLedger(filters);
  console.log(JSON.stringify(entries, null, 2));
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

/**
 * Run the bridge CLI dispatcher.
 *
 * Reads subcommand and args from `Bun.argv` (or `process.argv`)
 * and dispatches to the appropriate handler.
 * Exported so `bin/luca-bridge.js` can call it directly.
 */
export async function runBridgeCli(): Promise<void> {
  const subcommand = Bun.argv[2];
  const args = Bun.argv.slice(3);

  // Handle --help / -h anywhere, or no subcommand at all
  if (
    !subcommand ||
    subcommand === "--help" ||
    subcommand === "-h" ||
    args.includes("--help") ||
    args.includes("-h")
  ) {
    printUsage("stdout");
    process.exit(0);
  }

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
    case "suspend":
      await handleSuspend(args);
      break;
    case "resume-phase":
      await handleResumePhase(args);
      break;
    case "read-ledger":
      await handleReadLedger(args);
      break;
    default:
      console.error(
        `Unknown subcommand: "${subcommand}"\n\nValid subcommands: ${VALID_SUBCOMMANDS.join(", ")}\n\nRun with --help for full usage information.`,
      );
      process.exit(2);
  }
}

if (import.meta.main) {
  runBridgeCli().catch((err) => {
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
  handleReadLedger,
  handleSetField,
  handleTransition,
  handleSnapshot,
  handleEnsureInit,
  handleGateCheck,
  handleSuspend,
  handleResumePhase,
  SETTABLE_FIELDS,
  VALID_SUBCOMMANDS,
};
