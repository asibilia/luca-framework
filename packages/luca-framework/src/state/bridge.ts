/**
 * High-level CLI bridge for the Luca workflow state machine.
 *
 * All state is persisted to a local JSON file (.planning/state.json).
 * STATE.md generation is gated by LUCA_EXPORT_MD=true.
 *
 * Subcommands (13):
 *   read-complexity        — Read current complexity level
 *   read-phase             — Read current phase info
 *   read-status            — Read comprehensive workflow status
 *   read-field             — Read an arbitrary context field (errors on missing state)
 *   set-field              — Set an allowlisted context field + persist + regenerate STATE.md
 *   transition             — Send event + persist + update STATE.md atomically
 *   snapshot               — Generate/update STATE.md from current state
 *   ensure-init            — Initialize state if not already initialized
 *   gate-check             — Check if a named gate is enabled
 *   suspend                — Create checkpoint and suspend current phase
 *   init-vault             — Guided setup for project MuninnDB vault
 *   write-status           — Write partial data to statusline bus (.planning/.statusline.json)
 *   clear-status           — Remove the statusline bus file
 *
 * All output is JSON to stdout. Errors go to stderr with exit code 2.
 *
 * Usage:
 *   luca-bridge read-complexity
 *   luca-bridge read-phase
 *   luca-bridge read-status
 *   luca-bridge read-field --field=session_id
 *   luca-bridge set-field --field=current_milestone --value="v2.0"
 *   luca-bridge transition --event=START [--data=json]
 *   luca-bridge snapshot
 *   luca-bridge ensure-init [--force]
 *   luca-bridge gate-check --gate=confirm_plan
 *   luca-bridge suspend --phase=42 [--reason=context_exhaustion] [--wave=1] [--tasks=id1,id2]
 *   luca-bridge init-vault
 *   luca-bridge init-vault --vault=my-project --force
 *
 * @module luca-bridge
 */
import { rename, unlink } from "node:fs/promises";
import { z } from "zod";
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
import { computePipelinePosition } from "./__helpers/pipeline-position";
import { createSuspendCheckpoint } from "./suspend-checkpoint";
import { appendLedgerEntry } from "./ledger";
import { emitStateTransition, emitPhaseComplete } from "../emitter";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Default path for the STATE.md file */
const STATE_MD_PATH = ".planning/STATE.md";

/**
 * Path for the statusline bus file (relative to project root).
 * Same cwd-relative convention as STATE_FILE_PATH (".planning/state.json") —
 * the bridge process is always started from the project root.
 */
const STATUS_BUS_PATH = ".planning/.statusline.json";

/**
 * Inline status bus validation schema — mirrors StatusBusSchema in src/shared.
 *
 * DIVERGENCE NOTE: `phase` is z.number().int().nullable().default(null) here
 * vs z.number().int().optional() in StatusBusSchema. The bridge always writes
 * `null` for absent phase values; the shared schema omits the key entirely.
 * Both are valid JSON — the statusline renderer handles either via safeParse.
 */
const BusDataSchema = z.object({
  skill: z.string().default(""),
  stage: z
    .enum(["EXECUTING", "PLANNING", "VERIFYING", "PAUSED", "FAILED", "idle"])
    .default("idle"),
  step: z.string().default(""),
  phase: z.number().int().optional(),
  wave_current: z.number().int().nonnegative().default(0),
  wave_total: z.number().int().nonnegative().default(0),
  complexity: z.string().default(""),
  detail: z.string().default(""),
  updated_at: z.string().default(""),
});

// ─── Dual-Write Divergence Detection ────────────────────────────────────────

/**
 * Verify that the local JSON file matches the intended state after a dual-write.
 *
 * Reads the persisted JSON file and compares key fields (state, complexity,
 * phase) against the intended values. Logs a warning if divergence is found.
 * Best-effort only -- never throws.
 *
 * Gated behind `LUCA_DEBUG` env var to avoid unnecessary I/O on every
 * transition in production use. The check provides no actionable recovery --
 * it only logs warnings -- so it only runs when debugging is enabled.
 *
 * @param intended - The intended field values to verify against
 */
async function checkDualWriteDivergence(intended: {
  state: string;
  complexity: string;
  phase: string | number | null;
}): Promise<void> {
  if (!process.env.LUCA_DEBUG) return;

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
  "read-phase",
  "read-field",
  "set-field",
  "transition",
  "ensure-init",
  "snapshot",
  "gate-check",
  "suspend",
  "init-vault",
  "write-status",
  "clear-status",
] as const;

/**
 * Formatted help text for the bridge CLI.
 *
 * Organized by command category (read, write, lifecycle)
 * with option descriptions for each subcommand.
 */
const HELP_TEXT = `luca-bridge — CLI bridge for the Luca workflow state machine

Usage: luca-bridge <subcommand> [options]

Read commands:
  read-status            Read comprehensive workflow status
  read-complexity        Read current complexity level
  read-phase             Read current phase info
  read-field             Read an arbitrary context field (--field=path)

Write commands:
  set-field              Set a context field (--field=name --value=json)
  transition             Send workflow event (--event=TYPE [--data=json])

Lifecycle commands:
  ensure-init            Initialize state if not present ([--force])
  snapshot               Generate STATE.md from current state
  gate-check             Check if a gate is enabled (--gate=name)
  suspend                Suspend a phase (--phase=N [--reason=str])

Vault commands:
  init-vault             Guided setup for project MuninnDB vault ([--vault=name] [--force])

Status bus commands:
  write-status           Write to statusline bus (.planning/.statusline.json)
    --skill=NAME         Active skill name (e.g., "lu", "scout", "pr-address")
    --stage=STAGE        High-level stage (e.g., "EXECUTING", "PLANNING")
    --step=STEP          Sub-step within stage (e.g., "research", "plan", "execute")
    --phase=N            Phase number
    --wave-current=N     Current wave number
    --wave-total=N       Total wave count
    --complexity=LEVEL   Complexity level
    --detail=TEXT        Free-form detail
  clear-status           Remove the statusline bus file

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
    appetite_level: "Medium" as string,
    appetite_token_ceiling: 100000,
    appetite_context_percent: 50,
    appetite_used_tokens: 0,
    dag_execution: null as unknown,
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
      appetite_level: (ctx.appetite_level as string) ?? "Medium",
      appetite_token_ceiling: (ctx.appetite_token_ceiling as number) ?? 100000,
      appetite_context_percent: (ctx.appetite_context_percent as number) ?? 50,
      appetite_used_tokens: (ctx.appetite_used_tokens as number) ?? 0,
      dag_execution: ctx.dag_execution ?? null,
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
    fromSnapshot: (ctx, stateValue) => {
      // Virtual computed field: derive pipeline_position from XState value
      if (fieldPath === "pipeline_position") {
        return {
          field: fieldPath,
          value: computePipelinePosition(stateValue),
        };
      }
      return {
        field: fieldPath,
        value: get(ctx, fieldPath),
      };
    },
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
  "appetite_level",
  "appetite_token_ceiling",
  "appetite_context_percent",
  "appetite_used_tokens",
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

  // Emit field change to MuninnDB (fire-and-forget)
  void emitStateTransition({
    previous_state: String(snapshotJson!.value),
    current_state: String(snapshotJson!.value), // State unchanged on field set
    event_type: "field_set",
    session_id: (updatedContext.session_id as string) ?? "",
    metadata: {
      milestone: (updatedContext.current_milestone as string) ?? undefined,
      phase: (updatedContext.current_phase as number) ?? undefined,
      complexity: (updatedContext.complexity as string) ?? undefined,
    },
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

  // Emit state transition to MuninnDB (fire-and-forget, non-blocking)
  void emitStateTransition({
    previous_state: String(prevState),
    current_state: String(nextSnapshot.value),
    event_type: eventType,
    session_id: nextSnapshot.context.session_id,
    metadata: {
      milestone: nextSnapshot.context.current_milestone ?? undefined,
      phase: nextSnapshot.context.current_phase ?? undefined,
      complexity: nextSnapshot.context.complexity,
      branch: nextSnapshot.context.branch ?? undefined,
    },
  });

  // Best-effort status bus update for statusline HUD
  try {
    let busData: Record<string, unknown> = {};
    try {
      const busFile = Bun.file(STATUS_BUS_PATH);
      if (await busFile.exists()) busData = await busFile.json();
    } catch {
      /* start fresh */
    }

    const ctx = nextSnapshot.context as Record<string, unknown>;
    busData.stage = String(nextSnapshot.value).toUpperCase();
    busData.complexity = ctx.complexity ?? busData.complexity ?? "";
    if (ctx.current_phase !== undefined && ctx.current_phase !== null) {
      busData.phase = ctx.current_phase;
    }
    // Clear skill/step when transitioning to idle state
    if (String(nextSnapshot.value) === "idle") {
      busData.skill = "";
      busData.step = "";
    }
    busData.updated_at = new Date().toISOString();

    const tmpBus = `${STATUS_BUS_PATH}.tmp`;
    await Bun.write(tmpBus, JSON.stringify(busData, null, 2) + "\n");
    await rename(tmpBus, STATUS_BUS_PATH);
  } catch {
    // Status bus update is best-effort — never fail the transition
  }

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

  // Emit phase suspend to MuninnDB (fire-and-forget)
  void emitPhaseComplete({
    phase_id: phaseId,
    status: "suspended",
    session_id: sessionId,
    metadata: {
      milestone: nextSnapshot.context.current_milestone ?? undefined,
      phase: phaseId,
      complexity: nextSnapshot.context.complexity,
    },
  });

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

// ─── Init Vault Command ─────────────────────────────────────────────────────

/**
 * Guided setup wizard for configuring a project-specific MuninnDB vault.
 *
 * Detects the repo name from git remote (or falls back to the directory name),
 * outputs step-by-step Web UI instructions for vault creation and API key
 * generation, writes the vault name to `.planning/config.json`, and attempts
 * a best-effort connectivity check.
 *
 * This handler does NOT interact with the XState workflow state machine.
 * It is a standalone utility command that reads/writes config.json only.
 *
 * @param args - CLI arguments:
 *   --vault=name (optional) Override detected vault name
 *   --force (optional) Reconfigure even if vault is already set
 *
 * @example
 * ```bash
 * luca-bridge init-vault
 * luca-bridge init-vault --vault=my-project
 * luca-bridge init-vault --force
 * ```
 */
async function handleInitVault(args: string[]): Promise<void> {
  const configPath = ".planning/config.json";

  // Step 1: Check if already configured
  const configFile = Bun.file(configPath);
  let config: Record<string, unknown> = {};
  if (await configFile.exists()) {
    try {
      config = await configFile.json();
    } catch {
      // Invalid JSON -- start fresh
    }
  }

  const existingVault = get(config, "muninn.vault") as string | undefined;
  if (existingVault && !hasFlag(args, "force")) {
    console.log(
      JSON.stringify({
        already_configured: true,
        vault: existingVault,
        message: `Vault already configured: "${existingVault}". Use --force to reconfigure.`,
      }),
    );
    return;
  }

  // Step 2: Detect repo name from git remote, fallback to directory name
  let repoName = "";
  try {
    const remote = await Bun.$`git remote get-url origin 2>/dev/null`.text();
    repoName =
      remote
        .trim()
        .split("/")
        .pop()
        ?.replace(/\.git$/, "") || "";
  } catch {
    /* no git remote available */
  }
  if (!repoName) {
    repoName = process.cwd().split("/").pop() || "unknown";
  }

  // Allow explicit override via --vault=<name>
  const vaultName = getArg(args, "vault") || repoName;

  // Step 3: Output guided setup instructions
  const baseUrl = process.env.MUNINN_DB_URL ?? "http://127.0.0.1:8476";
  console.log(
    JSON.stringify({
      wizard: true,
      detected_repo: repoName,
      suggested_vault: vaultName,
      steps: [
        `Open MuninnDB Web UI: ${baseUrl}`,
        `Create a new vault named "${vaultName}"`,
        `Generate an API key for the "${vaultName}" vault`,
        `Add MUNINN_DB_API_KEY=<key> to your .env file`,
      ],
      config_path: configPath,
    }),
  );

  // Step 4: Write vault name to config (read-modify-write)
  const muninnConfig = (config.muninn as Record<string, unknown>) || {};
  config.muninn = { ...muninnConfig, vault: vaultName };
  await Bun.write(configPath, JSON.stringify(config, null, 2) + "\n");

  // Step 5: Verify connectivity (best-effort, non-blocking)
  const apiKey = process.env.MUNINN_DB_API_KEY ?? "";
  let connectivity: "verified" | "not_verified" = "not_verified";
  try {
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
    const res = await fetch(
      `${baseUrl}/api/engrams?limit=1&vault=${encodeURIComponent(vaultName)}`,
      {
        headers,
        signal: AbortSignal.timeout(5000),
      },
    );
    if (res.ok) {
      connectivity = "verified";
    }
  } catch {
    /* connectivity check failed -- non-fatal */
  }

  console.log(
    JSON.stringify({
      configured: true,
      vault: vaultName,
      config_written: configPath,
      connectivity,
    }),
  );
}

// ─── Status Bus Commands ─────────────────────────────────────────────────────

/**
 * Handle `write-status` — write partial data to the statusline bus file.
 *
 * Merges provided fields with existing bus data, sets updated_at, and
 * writes atomically via tmp+rename. Self-contained — no external imports.
 *
 * @param args - CLI arguments with --skill, --stage, --step, --phase, etc.
 */
async function handleWriteStatus(args: string[]): Promise<void> {
  // Read existing bus data for merge
  let existing: Record<string, unknown> = {};
  try {
    const file = Bun.file(STATUS_BUS_PATH);
    if (await file.exists()) {
      existing = await file.json();
    }
  } catch {
    // Start fresh on read error
  }

  // Parse args and merge
  const skill = getArg(args, "skill");
  const stage = getArg(args, "stage");
  const step = getArg(args, "step");
  const phase = getArg(args, "phase");
  const waveCurrent = getArg(args, "wave-current");
  const waveTotal = getArg(args, "wave-total");
  const complexity = getArg(args, "complexity");
  const detail = getArg(args, "detail");

  const update: Record<string, unknown> = {};
  if (skill !== undefined) update.skill = skill;
  if (stage !== undefined) update.stage = stage;
  if (step !== undefined) update.step = step;
  if (phase !== undefined) {
    const n = parseInt(phase, 10);
    if (!isNaN(n)) update.phase = n;
  }
  if (waveCurrent !== undefined) {
    const n = parseInt(waveCurrent, 10);
    if (!isNaN(n)) update.wave_current = n;
  }
  if (waveTotal !== undefined) {
    const n = parseInt(waveTotal, 10);
    if (!isNaN(n)) update.wave_total = n;
  }
  if (complexity !== undefined) update.complexity = complexity;
  if (detail !== undefined) update.detail = detail;

  const merged = {
    ...existing,
    ...update,
    updated_at: new Date().toISOString(),
  };

  // Validate merged data against bus schema before writing
  const validated = BusDataSchema.safeParse(merged);
  if (!validated.success) {
    console.error(
      JSON.stringify({
        error: "Invalid bus data",
        issues: validated.error.issues,
      }),
    );
    process.exit(2);
  }

  // Atomic write via tmp+rename
  const tmpPath = `${STATUS_BUS_PATH}.tmp`;
  await Bun.write(tmpPath, JSON.stringify(validated.data, null, 2) + "\n");
  await rename(tmpPath, STATUS_BUS_PATH);

  console.log(JSON.stringify(validated.data));
}

/**
 * Handle `clear-status` — remove the statusline bus file.
 */
async function handleClearStatus(): Promise<void> {
  try {
    await unlink(STATUS_BUS_PATH);
  } catch {
    // Ignore if file doesn't exist
  }
  console.log(JSON.stringify({ cleared: true }));
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
    case "init-vault":
      await handleInitVault(args);
      break;
    case "write-status":
      await handleWriteStatus(args);
      break;
    case "clear-status":
      await handleClearStatus();
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
  handleReadPhase,
  handleReadStatus,
  handleReadField,
  handleSetField,
  handleTransition,
  handleSnapshot,
  handleEnsureInit,
  handleGateCheck,
  handleSuspend,
  handleInitVault,
  handleWriteStatus,
  handleClearStatus,
  SETTABLE_FIELDS,
  VALID_SUBCOMMANDS,
};
