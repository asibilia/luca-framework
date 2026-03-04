/**
 * Integration test: End-to-end pipeline.
 *
 * Exercises the complete observability data flow:
 *   1. Create fixture event data (simulating what a hook would emit)
 *   2. Write events to session ledger via ledger.appendEntry()
 *   3. Read ledger entries via the observer's readLedgerEntries()
 *   4. Verify the data shape matches what observer hooks expect
 *
 * This is the capstone integration test that validates all Phase 97-100
 * infrastructure works together as a cohesive system.
 *
 * @module __tests__/integration/e2e-pipeline
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Stage 1: Ledger writer (luca-framework)
import {
  appendLedgerEntry,
  _resetSequenceCounter,
  ledgerEntrySchema,
} from "../../packages/luca-framework/src/state/ledger";

// Stage 2: Observer readers (luca-observer)
import {
  readLedgerEntries,
  readWorkflowState,
  readHarnessResult,
} from "../../packages/luca-observer/lib/file-watcher";

// Stage 3: Observer schemas for validation
import {
  LedgerEntrySchema as ObserverLedgerEntrySchema,
  WorkflowSnapshotSchema,
  HarnessResultSnapshotSchema,
  ObserverEventSchema,
} from "../../packages/luca-observer/lib/types";

// Fixtures
import {
  SESSION_START_LEDGER,
  STATE_TRANSITION_LEDGER,
  TYPECHECK_PASS_LEDGER,
  PRE_COMMIT_PASS_LEDGER,
  PRE_COMMIT_PASS_EVENT,
  HARNESS_RESULT_FIXTURE,
  STATE_MD_CONTENT,
  FIXTURE_SESSION_ID,
  FIXTURE_TIMESTAMPS,
  buildLedgerEntry,
} from "./fixtures/hook-event-fixtures";

// ─── Test Setup ──────────────────────────────────────────────────────────────

// Use a temp directory inside the project so observer's resolveProjectDir
// accepts it (it rejects paths outside process.cwd()).
let tempDir: string;
let planningDir: string;
let ledgerPath: string;

beforeEach(() => {
  tempDir = join(
    process.cwd(),
    "__tests__",
    "integration",
    ".tmp",
    `e2e-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  planningDir = join(tempDir, ".planning");
  mkdirSync(planningDir, { recursive: true });
  ledgerPath = join(planningDir, "session-ledger.jsonl");
  _resetSequenceCounter();
});

afterEach(() => {
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Cleanup best-effort
  }
  _resetSequenceCounter();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("End-to-End Pipeline", () => {
  describe("Full pipeline - commit event", () => {
    test("event creation -> ledger write -> observer read -> schema validation", async () => {
      // ─── Stage 1: Create realistic event data ───────────────────────
      // This is what a hook script would emit after a successful commit.
      const commitEvent = PRE_COMMIT_PASS_EVENT;

      // Validate the observer event shape
      const eventParseResult = ObserverEventSchema.safeParse(commitEvent);
      expect(eventParseResult.success).toBe(true);

      // ─── Stage 2: Write to ledger (simulating framework side) ───────
      // The ledger records state machine transitions, not raw events.
      // The commit event triggers a state transition from executing -> committing.
      const ledgerEntry = await appendLedgerEntry(
        PRE_COMMIT_PASS_LEDGER,
        ledgerPath,
      );

      // Validate the framework's ledger entry
      const frameworkParseResult = ledgerEntrySchema.safeParse(ledgerEntry);
      expect(frameworkParseResult.success).toBe(true);
      expect(ledgerEntry.sequence_number).toBe(0);
      expect(ledgerEntry.event_type).toBe("COMMIT_COMPLETE");

      // ─── Stage 3: Read via observer's file-watcher ──────────────────
      // The observer reads the same JSONL file the framework wrote to.
      const observerEntries = await readLedgerEntries(tempDir);

      expect(observerEntries).toHaveLength(1);

      // ─── Stage 4: Validate observer data shape ──────────────────────
      // The observer's LedgerEntrySchema should accept what the framework wrote.
      const observerParseResult = ObserverLedgerEntrySchema.safeParse(
        observerEntries[0],
      );
      expect(observerParseResult.success).toBe(true);

      // Verify the data made it through the pipeline intact
      const observerEntry = observerEntries[0]!;
      expect(observerEntry.event_type).toBe("COMMIT_COMPLETE");
      expect(observerEntry.previous_state).toBe("executing");
      expect(observerEntry.current_state).toBe("committing");
      expect(observerEntry.session_id).toBe(FIXTURE_SESSION_ID);
      expect(observerEntry.sequence_number).toBe(0);
    });
  });

  describe("Full pipeline - session lifecycle", () => {
    test("multiple events flow through the pipeline in order", async () => {
      // ─── Stage 1: Simulate a session lifecycle ──────────────────────
      const lifecycle = [
        SESSION_START_LEDGER, // idle -> preflight (START)
        STATE_TRANSITION_LEDGER, // idle -> executing (PHASE_START)
        TYPECHECK_PASS_LEDGER, // executing -> executing (HARNESS_COMPLETE)
        PRE_COMMIT_PASS_LEDGER, // executing -> committing (COMMIT_COMPLETE)
      ];

      // ─── Stage 2: Write all events to ledger ───────────────────────
      const writtenEntries = [];
      for (const record of lifecycle) {
        const entry = await appendLedgerEntry(record, ledgerPath);
        writtenEntries.push(entry);

        // Each entry validates against the framework schema
        expect(ledgerEntrySchema.safeParse(entry).success).toBe(true);
      }

      // Verify sequence numbers are correct
      expect(writtenEntries[0]!.sequence_number).toBe(0);
      expect(writtenEntries[1]!.sequence_number).toBe(1);
      expect(writtenEntries[2]!.sequence_number).toBe(2);
      expect(writtenEntries[3]!.sequence_number).toBe(3);

      // ─── Stage 3: Read via observer ─────────────────────────────────
      const observerEntries = await readLedgerEntries(tempDir);
      expect(observerEntries).toHaveLength(4);

      // ─── Stage 4: Validate all entries against observer schema ──────
      for (const entry of observerEntries) {
        const parseResult = ObserverLedgerEntrySchema.safeParse(entry);
        expect(parseResult.success).toBe(true);
      }

      // Verify event types preserved in order
      expect(observerEntries[0]!.event_type).toBe("START");
      expect(observerEntries[1]!.event_type).toBe("PHASE_START");
      expect(observerEntries[2]!.event_type).toBe("HARNESS_COMPLETE");
      expect(observerEntries[3]!.event_type).toBe("COMMIT_COMPLETE");

      // Verify DAG chain preserved
      expect(observerEntries[0]!.parent_id).toBeNull();
      expect(observerEntries[1]!.parent_id).toBe(0);
      expect(observerEntries[2]!.parent_id).toBe(1);
      expect(observerEntries[3]!.parent_id).toBe(2);
    });
  });

  describe("Full pipeline - harness result", () => {
    test("harness result file -> observer read -> schema validation", async () => {
      // ─── Stage 1: Write harness result (simulating harness runner) ──
      writeFileSync(
        join(planningDir, "harness-result.json"),
        JSON.stringify(HARNESS_RESULT_FIXTURE, null, 2),
        "utf-8",
      );

      // ─── Stage 2: Read via observer's file-watcher ──────────────────
      const result = await readHarnessResult(tempDir);

      // ─── Stage 3: Validate observer data shape ──────────────────────
      expect(result).not.toBeNull();
      const parseResult = HarnessResultSnapshotSchema.safeParse(result);
      expect(parseResult.success).toBe(true);

      // Verify data integrity
      expect(result!.status).toBe("passed");
      expect(result!.total_errors).toBe(0);
      expect(result!.checks).toHaveLength(4);
      expect(result!.checks[0]!.name).toBe("test");
      expect(result!.checks[0]!.status).toBe("passed");
    });
  });

  describe("Full pipeline - state transition", () => {
    test("STATE.md -> observer readWorkflowState -> schema validation", async () => {
      // ─── Stage 1: Write STATE.md (simulating bridge snapshot) ───────
      writeFileSync(join(planningDir, "STATE.md"), STATE_MD_CONTENT, "utf-8");

      // ─── Stage 2: Read via observer's file-watcher ──────────────────
      const state = await readWorkflowState(tempDir);

      // ─── Stage 3: Validate observer data shape ──────────────────────
      const parseResult = WorkflowSnapshotSchema.safeParse(state);
      expect(parseResult.success).toBe(true);

      // Verify data integrity
      expect(state.workflow_state).toBe("executing");
      expect(state.current_phase).toBe(101);
      expect(state.complexity).toBe("COMPLEX");
      expect(state.ticket_id).toBe("LUCA-44");
      expect(state.session_id).toBe(FIXTURE_SESSION_ID);
    });
  });

  describe("Full pipeline - combined data sources", () => {
    test("ledger + state + harness all readable from same project dir", async () => {
      // ─── Stage 1: Populate all data sources ─────────────────────────
      // Write STATE.md
      writeFileSync(join(planningDir, "STATE.md"), STATE_MD_CONTENT, "utf-8");

      // Write harness result
      writeFileSync(
        join(planningDir, "harness-result.json"),
        JSON.stringify(HARNESS_RESULT_FIXTURE, null, 2),
        "utf-8",
      );

      // Write ledger entries
      await appendLedgerEntry(SESSION_START_LEDGER, ledgerPath);
      await appendLedgerEntry(STATE_TRANSITION_LEDGER, ledgerPath);
      await appendLedgerEntry(TYPECHECK_PASS_LEDGER, ledgerPath);

      // ─── Stage 2: Read all data sources via observer ────────────────
      const [state, entries, harness] = await Promise.all([
        readWorkflowState(tempDir),
        readLedgerEntries(tempDir),
        readHarnessResult(tempDir),
      ]);

      // ─── Stage 3: Validate all data ────────────────────────────────
      expect(WorkflowSnapshotSchema.safeParse(state).success).toBe(true);
      expect(entries).toHaveLength(3);
      for (const entry of entries) {
        expect(ObserverLedgerEntrySchema.safeParse(entry).success).toBe(true);
      }
      expect(harness).not.toBeNull();
      expect(HarnessResultSnapshotSchema.safeParse(harness).success).toBe(true);

      // ─── Stage 4: Cross-reference data consistency ──────────────────
      // The state says we're executing phase 101
      expect(state.current_phase).toBe(101);

      // The ledger shows the PHASE_START event for phase 101
      const phaseStartEntry = entries.find(
        (e) => e.event_type === "PHASE_START",
      );
      expect(phaseStartEntry).toBeDefined();
      expect(phaseStartEntry!.event_data).toHaveProperty("phase_id");

      // The harness result shows all checks passed
      expect(harness!.status).toBe("passed");
    });
  });

  describe("Schema compatibility", () => {
    test("framework LedgerEntry and observer LedgerEntry schemas are compatible", () => {
      // Build a framework ledger entry
      const frameworkEntry = buildLedgerEntry(SESSION_START_LEDGER, 0);

      // Validate against framework schema
      const frameworkResult = ledgerEntrySchema.safeParse(frameworkEntry);
      expect(frameworkResult.success).toBe(true);

      // Validate against observer schema (should also pass)
      const observerResult =
        ObserverLedgerEntrySchema.safeParse(frameworkEntry);
      expect(observerResult.success).toBe(true);
    });

    test("all fixture entries validate against both schemas", () => {
      const entries = [
        buildLedgerEntry(SESSION_START_LEDGER, 0),
        buildLedgerEntry(STATE_TRANSITION_LEDGER, 1),
        buildLedgerEntry(TYPECHECK_PASS_LEDGER, 2),
        buildLedgerEntry(PRE_COMMIT_PASS_LEDGER, 3),
      ];

      for (const entry of entries) {
        expect(ledgerEntrySchema.safeParse(entry).success).toBe(true);
        expect(ObserverLedgerEntrySchema.safeParse(entry).success).toBe(true);
      }
    });
  });
});
