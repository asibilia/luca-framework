/**
 * CLI interface for the Luca workflow state machine.
 *
 * Provides subcommands for initializing, querying, sending events to,
 * and managing the persisted state machine. All output is JSON to stdout,
 * errors go to stderr with exit code 2.
 *
 * Usage:
 *   luca-state-cli init [--force]
 *   luca-state-cli get [--field=path]
 *   luca-state-cli send --event=TYPE [--data=json]
 *   luca-state-cli status
 *   luca-state-cli resume
 *   luca-state-cli reset
 *   luca-state-cli snapshot
 *
 * @module luca-state/cli
 */
import get from "lodash/get";
import { workflowEventSchema } from "./types";
import {
  persistActor,
  loadPersistedActor,
  createFreshActor,
  clearPersistedState,
  stateExists,
} from "./persistence";
import { getAllowedEvents } from "./machine";
import { buildTransitionRecord } from "./events";
import { generateSnapshot } from "./snapshot";
import { getArg, hasFlag } from "./utils/cli-utils";

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Print usage information to stderr.
 */
function printUsage(): void {
  console.error(`Usage: luca-state-cli <subcommand> [options]

Subcommands:
  init     Create a fresh state machine and persist to state.json
           Options: --force (overwrite existing state)

  get      Get the current state snapshot
           Options: --field=path (lodash get path, e.g., session_id)

  send     Send an event to the state machine
           Options: --event=TYPE (required), --data=json (optional event data)

  status   Show current state, session info, and allowed events

  resume   Load and display the persisted state

  reset    Clear the persisted state file

  snapshot Generate STATE.md from the current machine state`);
}

// ─── Subcommand Handlers ────────────────────────────────────────────────────

/**
 * Initialize a fresh state machine actor and persist it.
 *
 * Creates a new actor from config.json, starts it in the "idle" state,
 * and writes the snapshot to state.json.
 *
 * @param args - CLI arguments (checks for --force flag)
 */
async function handleInit(args: string[]): Promise<void> {
  const force = hasFlag(args, "force");

  if (!force && (await stateExists())) {
    console.error("State file already exists. Use --force to overwrite.");
    process.exit(2);
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
      state: snapshot.value,
      session_id: snapshot.context.session_id,
    }),
  );
}

/**
 * Get the current state snapshot or a specific field from it.
 *
 * Loads the persisted actor and returns either the full context
 * or a specific field accessed via lodash get path.
 *
 * @param args - CLI arguments (checks for --field=path)
 */
async function handleGet(args: string[]): Promise<void> {
  const result = await loadPersistedActor();
  if (!result.success) {
    console.error(result.error);
    process.exit(2);
  }

  const actor = result.data;
  const snapshot = actor.getSnapshot();
  const fieldPath = getArg(args, "field");

  if (fieldPath) {
    const value = get(snapshot.context, fieldPath);
    console.log(JSON.stringify({ field: fieldPath, value }));
  } else {
    console.log(
      JSON.stringify(
        {
          state: snapshot.value,
          context: snapshot.context,
        },
        null,
        2,
      ),
    );
  }
}

/**
 * Send an event to the persisted state machine.
 *
 * Validates the event against workflowEventSchema, loads the persisted
 * actor, sends the event, and re-persists the updated state.
 *
 * @param args - CLI arguments (--event=TYPE required, --data=json optional)
 */
async function handleSend(args: string[]): Promise<void> {
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

/**
 * Show the current status of the state machine.
 *
 * Displays whether state is initialized, and if so, the current state,
 * session ID, complexity, and allowed events.
 */
async function handleStatus(): Promise<void> {
  const exists = await stateExists();

  if (!exists) {
    console.log(JSON.stringify({ initialized: false }));
    return;
  }

  const result = await loadPersistedActor();
  if (!result.success) {
    console.error(result.error);
    process.exit(2);
  }

  const actor = result.data;
  const snapshot = actor.getSnapshot();
  const allowed = getAllowedEvents(snapshot);

  console.log(
    JSON.stringify(
      {
        initialized: true,
        state: snapshot.value,
        session_id: snapshot.context.session_id,
        complexity: snapshot.context.complexity,
        ticket_id: snapshot.context.ticket_id,
        oversight: snapshot.context.oversight,
        allowed_events: allowed,
        verification_attempts: snapshot.context.verification_attempts,
        phase_results_count: snapshot.context.phase_results.length,
      },
      null,
      2,
    ),
  );
}

/**
 * Resume a persisted state machine session.
 *
 * Loads the actor from state.json and displays its current state.
 */
async function handleResume(): Promise<void> {
  const result = await loadPersistedActor();
  if (!result.success) {
    console.error(result.error);
    process.exit(2);
  }

  const actor = result.data;
  const snapshot = actor.getSnapshot();
  const allowed = getAllowedEvents(snapshot);

  console.log(
    JSON.stringify({
      resumed: true,
      state: snapshot.value,
      session_id: snapshot.context.session_id,
      allowed_events: allowed,
    }),
  );
}

/**
 * Reset the persisted state by clearing the state file.
 */
async function handleReset(): Promise<void> {
  const result = await clearPersistedState();
  if (!result.success) {
    console.error(result.error);
    process.exit(2);
  }

  console.log(JSON.stringify({ reset: true }));
}

/**
 * Generate a STATE.md snapshot from the current machine state.
 *
 * Loads the persisted actor, generates a markdown snapshot preserving
 * existing human-authored sections, and writes it to `.planning/STATE.md`.
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

  const stateMdPath = ".planning/STATE.md";
  let existingContent: string | undefined;
  try {
    const stateFile = Bun.file(stateMdPath);
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

  await Bun.write(stateMdPath, markdown);

  console.log(
    JSON.stringify({
      snapshot_written: true,
      path: stateMdPath,
      state: snapshot.value,
    }),
  );
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

if (import.meta.main) {
  const subcommand = Bun.argv[2];
  const args = Bun.argv.slice(3);

  async function run() {
    switch (subcommand) {
      case "init":
        await handleInit(args);
        break;
      case "get":
        await handleGet(args);
        break;
      case "send":
        await handleSend(args);
        break;
      case "status":
        await handleStatus();
        break;
      case "resume":
        await handleResume();
        break;
      case "reset":
        await handleReset();
        break;
      case "snapshot":
        await handleSnapshot();
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
