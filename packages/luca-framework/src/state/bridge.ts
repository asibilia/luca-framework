/**
 * High-level CLI bridge for the Luca workflow state machine.
 *
 * SpacetimeDB-primary: all read functions query SpacetimeDB first with
 * graceful JSON file fallback. Write functions call SpacetimeDB reducers.
 * STATE.md generation is gated by LUCA_EXPORT_MD=true.
 *
 * Subcommands:
 *   read-complexity  — Read current complexity level (graceful fallback)
 *   read-oversight   — Read current oversight level (graceful fallback)
 *   read-phase       — Read current phase info (graceful fallback)
 *   read-status      — Read comprehensive workflow status (graceful fallback)
 *   read-field       — Read an arbitrary context field (errors on missing state)
 *   read-ledger      — Read session ledger entries with optional filters
 *   set-field        — Set an allowlisted context field + persist + regenerate STATE.md
 *   transition       — Send event + persist + update STATE.md atomically
 *   snapshot         — Generate/update STATE.md from current state
 *   ensure-init      — Initialize state if not already initialized
 *   gate-check       — Check if a named gate is enabled
 *   suspend          — Create checkpoint and suspend current phase
 *   resume-phase     — Load checkpoint and resume a suspended phase
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
import { sanitizeJsonParse } from "./sanitize";
import { buildTransitionRecord } from "./events";
import { getAllowedEvents, workflowMachine } from "./machine";
import { generateSnapshot } from "./snapshot";
import { getArg, hasFlag } from "./utils/cli-utils";
import {
  createSuspendCheckpoint,
  loadSuspendCheckpoint,
  clearSuspendCheckpoint,
} from "./suspend-checkpoint";
import { readLedger, appendLedgerEntry } from "./ledger";
import type { LedgerFilters } from "./ledger";
import { callReducer, emitObserverEvent } from "./__helpers/observer-emitter";
import { queryOne } from "./__helpers/spacetimedb-client";
import { readWithFallback } from "./__helpers/read-with-fallback";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Default path for the STATE.md file */
const STATE_MD_PATH = ".planning/STATE.md";

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
 * Print usage information to stderr.
 */
function printUsage(): void {
  console.error(`Usage: luca-state <subcommand> [options]

Subcommands:
  read-complexity   Read current complexity level (TRIVIAL if not initialized)
  read-oversight    Read current oversight level (milestone if not initialized)
  read-phase        Read current phase info (null defaults if not initialized)
  read-status       Read comprehensive workflow status (defaults if not initialized)
  read-field        Read an arbitrary context field (errors on missing state)
                    Options: --field=path (required, lodash get path)
  read-ledger       Read session ledger entries with optional filters
                    Options: --session=id, --event=type, --since=iso, --limit=N, --tail=N
  emit-event        Emit a fire-and-forget observer event to SpacetimeDB
                    Options: --type=eventType (required), --session=id, --agent=name,
                             --tool=name, --file=path, --duration=ms, --data=json
  emit-context-snapshot  Emit a context-window snapshot to SpacetimeDB
                    Options: --session=id (required), --percent=N, --messages=N,
                             --tokens=N, --phase=name
  set-field         Set an allowlisted context field, persist, and regenerate STATE.md
                    Options: --field=name (required), --value=json-or-string (required)
  transition        Send event, persist state, and update STATE.md
                    Options: --event=TYPE (required), --data=json (optional)
  snapshot          Generate STATE.md from current machine state
  ensure-init       Initialize state if not already initialized
                    Options: --force (overwrite existing state)
  gate-check        Check if a named gate is enabled
                    Options: --gate=name (required)
  suspend           Create checkpoint and suspend current phase
                    Options: --phase=N (required), --reason=string, --wave=N, --tasks=id1,id2
  resume-phase      Load checkpoint and resume a suspended phase
                    Options: --phase=N (required), --keep-checkpoint`);
}

// ─── Read Commands (Graceful Fallback) ──────────────────────────────────────

/**
 * Read the current complexity level.
 *
 * SpacetimeDB-primary with JSON file fallback.
 * Returns "TRIVIAL" as default if state is not initialized.
 */
async function handleReadComplexity(): Promise<void> {
  const result = await readWithFallback({
    label: "read-complexity",
    sql: "SELECT complexity FROM workflow_state WHERE id = 1",
    fromRow: (row: { complexity: string }) => ({
      complexity: row.complexity,
      initialized: true,
    }),
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
 * SpacetimeDB-primary with JSON file fallback.
 * Returns "milestone" as default if state is not initialized.
 */
async function handleReadOversight(): Promise<void> {
  const result = await readWithFallback({
    label: "read-oversight",
    sql: "SELECT oversight FROM workflow_state WHERE id = 1",
    fromRow: (row: { oversight: string }) => ({
      oversight: row.oversight,
      initialized: true,
    }),
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
 * SpacetimeDB-primary with JSON file fallback.
 * Returns null/empty defaults if state is not initialized.
 */
async function handleReadPhase(): Promise<void> {
  const result = await readWithFallback({
    label: "read-phase",
    sql: "SELECT contextJson FROM workflow_state WHERE id = 1",
    fromRow: (row: { contextJson: string }) => {
      if (!row.contextJson) return null;
      const ctx = JSON.parse(row.contextJson);
      return {
        current_phase: ctx.current_phase ?? null,
        current_milestone: ctx.current_milestone ?? null,
        current_plan_ids: ctx.current_plan_ids ?? [],
        current_wave_count: ctx.current_wave_count ?? 0,
        initialized: true,
      };
    },
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
 * SpacetimeDB-primary with JSON file fallback.
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

  const result = await readWithFallback({
    label: "read-status",
    sql: "SELECT * FROM workflow_state WHERE id = 1",
    fromRow: (row: {
      workflowState: string;
      complexity: string;
      oversight: string;
      contextJson: string;
    }) => {
      if (!row.contextJson) return null;
      const ctx = JSON.parse(row.contextJson);
      return {
        initialized: true,
        state: row.workflowState ?? "idle",
        complexity: row.complexity ?? ctx.complexity ?? "TRIVIAL",
        oversight: row.oversight ?? ctx.oversight ?? "milestone",
        current_phase: ctx.current_phase ?? null,
        current_milestone: ctx.current_milestone ?? null,
        current_plan_ids: ctx.current_plan_ids ?? [],
        current_wave_count: ctx.current_wave_count ?? 0,
        ticket_id: ctx.ticket_id ?? null,
        github_issue: ctx.github_issue ?? null,
        branch: ctx.branch ?? null,
        base_branch: ctx.base_branch ?? "main",
        session_id: ctx.session_id ?? null,
        started_at: ctx.started_at ?? null,
        last_transition_at: ctx.last_transition_at ?? null,
        verification_attempts: ctx.verification_attempts ?? 0,
        phase_results_count: Array.isArray(ctx.phase_results)
          ? ctx.phase_results.length
          : 0,
        last_error: ctx.last_error ?? null,
      };
    },
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
 * SpacetimeDB-primary with JSON file fallback.
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

  const result = await readWithFallback({
    label: "read-field",
    sql: "SELECT contextJson FROM workflow_state WHERE id = 1",
    fromRow: (row: { contextJson: string }) => {
      if (!row.contextJson) return null;
      const ctx = JSON.parse(row.contextJson);
      return { field: fieldPath, value: get(ctx, fieldPath) };
    },
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
 * SpacetimeDB-primary: reads context from SpacetimeDB, modifies the field,
 * calls the reducer to persist. Falls back to JSON file read-modify-write.
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
    value = JSON.parse(rawValue);
  } catch {
    value = rawValue;
  }

  // Primary: try SpacetimeDB read-modify-write
  let snapshotJson: Record<string, unknown> & {
    context: Record<string, unknown>;
    value?: unknown;
  };
  let fromSpacetimeDB = false;

  try {
    const row = await queryOne<{ contextJson: string; workflowState: string }>(
      "SELECT * FROM workflow_state WHERE id = 1",
    );
    if (row && row.contextJson) {
      const ctx = JSON.parse(row.contextJson);
      snapshotJson = {
        context: ctx,
        value: row.workflowState ?? "idle",
      } as typeof snapshotJson;
      fromSpacetimeDB = true;
    }
  } catch (err) {
    if (process.env.LUCA_DEBUG) {
      console.error(
        "[bridge] SpacetimeDB unavailable for set-field read, falling back to JSON:",
        (err as Error).message,
      );
    }
  }

  // Fallback: read from JSON file
  if (!fromSpacetimeDB) {
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

  // Write to SpacetimeDB via reducer
  callReducer("update_workflow_state", {
    workflowState: String(snapshotJson!.value),
    currentPhase: (updatedContext.current_phase as string) ?? "",
    complexity: (updatedContext.complexity as string) ?? "TRIVIAL",
    oversight: (updatedContext.oversight as string) ?? "milestone",
    sessionId: (updatedContext.session_id as string) ?? "",
    ticketId: (updatedContext.ticket_id as string) ?? "",
    contextJson: JSON.stringify(updatedContext),
  });

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

  // Emit to observer dashboard (fire-and-forget)
  emitObserverEvent("state.field_set", {
    session_id: (updatedContext.session_id as string) ?? undefined,
    payload: {
      field: fieldPath,
      value,
      previous_value: previousValue ?? null,
      state: String(snapshotJson!.value),
    },
  });
}

// ─── Transition Command ─────────────────────────────────────────────────────

/**
 * Send an event, persist state, and atomically update STATE.md.
 *
 * After the event is sent and state is persisted to SpacetimeDB,
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

  // Emit to observer dashboard (fire-and-forget)
  emitObserverEvent("state.transition", {
    session_id: nextSnapshot.context.session_id,
    phase_id: nextSnapshot.context.current_phase ?? undefined,
    payload: {
      previous_state: String(prevState),
      current_state: String(nextSnapshot.value),
      event_type: eventType,
      complexity: nextSnapshot.context.complexity,
    },
  });
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

  // Read WORKING.md snapshot for checkpoint
  let workingMemorySnapshot = "";
  try {
    const workingFile = Bun.file(".planning/WORKING.md");
    if (await workingFile.exists()) {
      workingMemorySnapshot = await workingFile.text();
    }
  } catch {
    // WORKING.md not available — proceed without snapshot
  }

  // Write checkpoint file via suspend-checkpoint module
  const checkpointPath = await createSuspendCheckpoint({
    phase_id: phaseId,
    wave_index: waveIndex,
    completed_task_ids: completedTaskIds,
    working_memory_snapshot: workingMemorySnapshot,
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

  // Emit to observer dashboard (fire-and-forget)
  emitObserverEvent("state.suspended", {
    session_id: sessionId,
    phase_id: phaseId,
    payload: {
      reason,
      wave_index: waveIndex,
      completed_task_ids: completedTaskIds,
      previous_state: String(prevState),
      current_state: String(nextSnapshot.value),
    },
  });
}

// ─── Resume Phase Command ────────────────────────────────────────────────────

/**
 * Load a suspend checkpoint and resume the phase in the state machine.
 *
 * SpacetimeDB-primary: tries loading checkpoint from SpacetimeDB,
 * falls back to file-based checkpoint module.
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

  // Load checkpoint: try SpacetimeDB first, fall back to file
  let checkpoint;
  try {
    // phaseId is parsed via parseInt(phaseStr, 10) and validated as a finite
    // non-negative integer above — safe to interpolate directly into SQL.
    const row = await queryOne<{ checkpointJson: string }>(
      `SELECT checkpointJson FROM suspend_checkpoints WHERE phaseId = ${phaseId}`,
    );
    if (row && row.checkpointJson) {
      checkpoint = JSON.parse(row.checkpointJson);
    }
  } catch (err) {
    if (process.env.LUCA_DEBUG) {
      console.error(
        "[bridge] SpacetimeDB unavailable for resume-phase checkpoint, falling back to file:",
        (err as Error).message,
      );
    }
  }

  if (!checkpoint) {
    try {
      checkpoint = await loadSuspendCheckpoint(phaseId);
    } catch (err) {
      console.error(
        err instanceof Error
          ? err.message
          : `Failed to load checkpoint: ${err}`,
      );
      process.exit(2);
    }
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
        has_working_memory:
          (checkpoint.working_memory_snapshot ?? "").length > 0,
      },
      previous_state: String(prevState),
      current_state: String(nextSnapshot.value),
      checkpoint_cleared: !keepCheckpoint,
    }),
  );

  // Emit to observer dashboard (fire-and-forget)
  emitObserverEvent("state.resumed", {
    session_id: checkpoint.session_id,
    phase_id: phaseId,
    payload: {
      wave_index: checkpoint.wave_index,
      completed_task_ids: checkpoint.completed_task_ids,
      previous_state: String(prevState),
      current_state: String(nextSnapshot.value),
      checkpoint_cleared: !keepCheckpoint,
    },
  });
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

// ─── Emit Event Command ──────────────────────────────────────────────────────

/**
 * Emit a fire-and-forget observer event to SpacetimeDB via `emitObserverEvent`.
 *
 * Thin CLI wrapper so hooks can call the bridge instead of using raw curl
 * with duplicated URL/format logic.
 *
 * @param args - CLI arguments:
 *   --type=string   (required) Event type (e.g., "session.start")
 *   --session=string (optional) Session ID
 *   --agent=string   (optional) Agent name
 *   --tool=string    (optional) Tool name
 *   --file=string    (optional) File path
 *   --duration=N     (optional) Duration in ms
 *   --data=json      (optional) Additional event data JSON
 */
function handleEmitEvent(args: string[]): void {
  const eventType = getArg(args, "type");
  if (!eventType) {
    console.error("Missing --type argument");
    process.exit(2);
  }

  const sessionId = getArg(args, "session") ?? "";
  const agentName = getArg(args, "agent") ?? "";
  const toolName = getArg(args, "tool") ?? "";
  const filePath = getArg(args, "file") ?? "";
  const durationMs = parseInt(getArg(args, "duration") ?? "0", 10) || 0;

  let extraData: Record<string, unknown> = {};
  const dataArg = getArg(args, "data");
  if (dataArg) {
    try {
      extraData = JSON.parse(dataArg);
    } catch {
      // Not valid JSON — ignore
    }
  }

  emitObserverEvent(eventType, {
    sessionId,
    agentName,
    toolName,
    filePath,
    durationMs,
    ...extraData,
  });

  console.log(JSON.stringify({ emitted: true, eventType, sessionId }));
}

// ─── Emit Context Snapshot Command ──────────────────────────────────────────

/**
 * Emit a context-window snapshot to SpacetimeDB via `snapshotContext`.
 *
 * @param args - CLI arguments:
 *   --session=string  (required) Session ID
 *   --percent=N       (optional) Context usage percentage
 *   --messages=N      (optional) Message count
 *   --tokens=N        (optional) Estimated tokens
 *   --phase=string    (optional) Current phase
 */
function handleEmitContextSnapshot(args: string[]): void {
  const sessionId = getArg(args, "session");
  if (!sessionId) {
    console.error("Missing --session argument");
    process.exit(2);
  }

  const contextPercent = parseInt(getArg(args, "percent") ?? "0", 10) || 0;
  const messageCount = parseInt(getArg(args, "messages") ?? "0", 10) || 0;
  const estimatedTokens = parseInt(getArg(args, "tokens") ?? "0", 10) || 0;
  const phase = getArg(args, "phase") ?? "";

  callReducer("snapshot_context", {
    sessionId,
    contextPercent,
    messageCount,
    estimatedTokens,
    phase,
    timestamp: Date.now(),
  });

  console.log(
    JSON.stringify({ emitted: true, type: "context_snapshot", sessionId }),
  );
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
    case "emit-event":
      handleEmitEvent(args);
      break;
    case "emit-context-snapshot":
      handleEmitContextSnapshot(args);
      break;
    default:
      printUsage();
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
  handleEmitEvent,
  handleEmitContextSnapshot,
  SETTABLE_FIELDS,
};
