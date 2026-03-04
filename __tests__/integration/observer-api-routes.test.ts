/**
 * Integration test: Observer API route verification.
 *
 * Tests that observer API routes return correctly shaped data when given
 * known fixture data. Uses temp directories with fixture files to avoid
 * depending on real .planning/ content.
 *
 * Since observer API routes read from the filesystem via file-watcher
 * functions, tests populate temp directories with fixture data and call
 * the file-watcher functions directly (bypassing Next.js routing).
 *
 * @module __tests__/integration/observer-api-routes
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  readWorkflowState,
  readLedgerEntries,
  readHarnessResult,
  readIterationHistory,
  readSessionPlan,
} from "../../packages/luca-observer/lib/file-watcher";

import {
  WorkflowSnapshotSchema,
  LedgerEntrySchema,
  HarnessResultSnapshotSchema,
  IterationRecordSnapshotSchema,
  SessionPlanSnapshotSchema,
} from "../../packages/luca-observer/lib/types";

import {
  insertEvent,
  queryEvents,
  getEventCount,
} from "../../packages/luca-observer/lib/db";

import {
  STATE_MD_CONTENT,
  WORKFLOW_STATE_FIXTURE,
  HARNESS_RESULT_FIXTURE,
  HARNESS_RESULT_FAILED_FIXTURE,
  SESSION_PLAN_FIXTURE,
  ITERATION_RECORD_FIXTURE,
  LEDGER_ENTRIES_BATCH,
  SESSION_START_EVENT,
  TYPECHECK_PASS_EVENT,
  FIXTURE_SESSION_ID,
} from "./fixtures/hook-event-fixtures";

// ─── Test Setup ──────────────────────────────────────────────────────────────

// Use a temp directory inside the project so resolveProjectDir accepts it
// (it rejects paths outside process.cwd() as a security measure).
let tempDir: string;

beforeEach(() => {
  tempDir = join(
    process.cwd(),
    "__tests__",
    "integration",
    ".tmp",
    `observer-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(join(tempDir, ".planning"), { recursive: true });
});

afterEach(() => {
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Cleanup best-effort
  }
});

/**
 * Write fixture data files into the temp project directory.
 */
function writeFixtureFiles(options: {
  stateMd?: string;
  ledgerEntries?: unknown[];
  harnessResult?: unknown;
  sessionPlan?: unknown;
  iterationRecords?: unknown[];
}) {
  const planningDir = join(tempDir, ".planning");

  if (options.stateMd) {
    writeFileSync(join(planningDir, "STATE.md"), options.stateMd, "utf-8");
  }

  if (options.ledgerEntries) {
    const lines = options.ledgerEntries
      .map((e) => JSON.stringify(e))
      .join("\n");
    writeFileSync(
      join(planningDir, "session-ledger.jsonl"),
      lines + "\n",
      "utf-8",
    );
  }

  if (options.harnessResult) {
    writeFileSync(
      join(planningDir, "harness-result.json"),
      JSON.stringify(options.harnessResult, null, 2),
      "utf-8",
    );
  }

  if (options.sessionPlan) {
    writeFileSync(
      join(planningDir, "session-plan.json"),
      JSON.stringify(options.sessionPlan, null, 2),
      "utf-8",
    );
  }

  if (options.iterationRecords) {
    const checkpointsDir = join(planningDir, "checkpoints");
    mkdirSync(checkpointsDir, { recursive: true });
    for (let i = 0; i < options.iterationRecords.length; i++) {
      writeFileSync(
        join(checkpointsDir, `checkpoint-${i}.json`),
        JSON.stringify(options.iterationRecords[i], null, 2),
        "utf-8",
      );
    }
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Observer API Routes", () => {
  describe("GET /api/state (readWorkflowState)", () => {
    test("returns structured workflow state from STATE.md", async () => {
      writeFixtureFiles({ stateMd: STATE_MD_CONTENT });

      const state = await readWorkflowState(tempDir);

      expect(state.workflow_state).toBe("executing");
      expect(state.current_phase).toBe(101);
      expect(state.current_plan).toBe("03");
      expect(state.complexity).toBe("COMPLEX");
      expect(state.oversight).toBe("milestone");
      expect(state.ticket_id).toBe("LUCA-44");
      expect(state.session_id).toBe(FIXTURE_SESSION_ID);

      // Validate against schema
      const parseResult = WorkflowSnapshotSchema.safeParse(state);
      expect(parseResult.success).toBe(true);
    });

    test("returns defaults when STATE.md is missing", async () => {
      const state = await readWorkflowState(tempDir);

      expect(state.workflow_state).toBe("idle");
      expect(state.current_phase).toBe(0);
      expect(state.complexity).toBe("MODERATE");

      const parseResult = WorkflowSnapshotSchema.safeParse(state);
      expect(parseResult.success).toBe(true);
    });
  });

  describe("GET /api/ledger (readLedgerEntries)", () => {
    test("returns entries array with correct shapes", async () => {
      writeFixtureFiles({ ledgerEntries: LEDGER_ENTRIES_BATCH });

      const entries = await readLedgerEntries(tempDir);

      expect(entries).toHaveLength(5);

      // Each entry validates against LedgerEntrySchema
      for (const entry of entries) {
        const parseResult = LedgerEntrySchema.safeParse(entry);
        expect(parseResult.success).toBe(true);
      }

      // Verify first entry
      expect(entries[0]!.event_type).toBe("START");
      expect(entries[0]!.sequence_number).toBe(0);
      expect(entries[0]!.parent_id).toBeNull();
    });

    test("supports session_id filter", async () => {
      writeFixtureFiles({ ledgerEntries: LEDGER_ENTRIES_BATCH });

      const entries = await readLedgerEntries(tempDir, {
        session_id: FIXTURE_SESSION_ID,
      });

      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(entry.session_id).toBe(FIXTURE_SESSION_ID);
      }
    });

    test("supports event_type filter", async () => {
      writeFixtureFiles({ ledgerEntries: LEDGER_ENTRIES_BATCH });

      const entries = await readLedgerEntries(tempDir, {
        event_type: "START",
      });

      expect(entries).toHaveLength(1);
      expect(entries[0]!.event_type).toBe("START");
    });

    test("supports limit filter", async () => {
      writeFixtureFiles({ ledgerEntries: LEDGER_ENTRIES_BATCH });

      const entries = await readLedgerEntries(tempDir, { limit: 2 });
      expect(entries).toHaveLength(2);
    });

    test("returns empty array when ledger file does not exist", async () => {
      const entries = await readLedgerEntries(tempDir);
      expect(entries).toEqual([]);
    });
  });

  describe("GET /api/harness (readHarnessResult)", () => {
    test("returns harness result with passed status", async () => {
      writeFixtureFiles({ harnessResult: HARNESS_RESULT_FIXTURE });

      const result = await readHarnessResult(tempDir);

      expect(result).not.toBeNull();
      expect(result!.status).toBe("passed");
      expect(result!.total_errors).toBe(0);
      expect(result!.checks).toHaveLength(4);

      // Validate against schema
      const parseResult = HarnessResultSnapshotSchema.safeParse(result);
      expect(parseResult.success).toBe(true);
    });

    test("returns harness result with failed status and errors", async () => {
      writeFixtureFiles({ harnessResult: HARNESS_RESULT_FAILED_FIXTURE });

      const result = await readHarnessResult(tempDir);

      expect(result).not.toBeNull();
      expect(result!.status).toBe("failed");
      expect(result!.total_errors).toBe(1);

      // Check the typecheck failure
      const typecheckCheck = result!.checks.find((c) => c.name === "typecheck");
      expect(typecheckCheck).toBeDefined();
      expect(typecheckCheck!.status).toBe("failed");
      expect(typecheckCheck!.errors).toHaveLength(1);
      expect(typecheckCheck!.errors[0]!.code).toBe("TS2345");
    });

    test("returns null when harness result file does not exist", async () => {
      const result = await readHarnessResult(tempDir);
      expect(result).toBeNull();
    });
  });

  describe("GET /api/iterations (readIterationHistory)", () => {
    test("returns iteration checkpoint records", async () => {
      writeFixtureFiles({
        iterationRecords: [ITERATION_RECORD_FIXTURE],
      });

      const iterations = await readIterationHistory(tempDir);

      expect(iterations).toHaveLength(1);
      expect(iterations[0]!.phase).toBe(101);
      expect(iterations[0]!.loop).toBe("harness");
      expect(iterations[0]!.convergence_status).toBe("improved");

      // Validate against schema
      const parseResult = IterationRecordSnapshotSchema.safeParse(
        iterations[0],
      );
      expect(parseResult.success).toBe(true);
    });

    test("returns empty array when checkpoints directory does not exist", async () => {
      const iterations = await readIterationHistory(tempDir);
      expect(iterations).toEqual([]);
    });
  });

  describe("GET /api/planning (readSessionPlan)", () => {
    test("returns session plan with WSJF items", async () => {
      writeFixtureFiles({ sessionPlan: SESSION_PLAN_FIXTURE });

      const plan = await readSessionPlan(tempDir);

      expect(plan).not.toBeNull();
      expect(plan!.items).toHaveLength(1);
      expect(plan!.items[0]!.wsjf_score).toBe(8.5);
      expect(plan!.total_effort_points).toBe(13);

      // Validate against schema
      const parseResult = SessionPlanSnapshotSchema.safeParse(plan);
      expect(parseResult.success).toBe(true);
    });

    test("returns null when session plan file does not exist", async () => {
      const plan = await readSessionPlan(tempDir);
      expect(plan).toBeNull();
    });
  });

  describe("GET /api/events-query (in-memory db)", () => {
    test("stores and retrieves events from in-memory store", () => {
      const stored = insertEvent(SESSION_START_EVENT);

      expect(stored.id).toBeGreaterThan(0);
      expect(stored.event_type).toBe("session.start");
      expect(stored.timestamp_ms).toBeGreaterThan(0);

      const events = queryEvents({
        event_type: "session.start",
      });

      expect(events.length).toBeGreaterThanOrEqual(1);
      const found = events.find((e) => e.id === stored.id);
      expect(found).toBeDefined();
      expect(found!.event_type).toBe("session.start");
    });

    test("filters by session_id", () => {
      const event1 = insertEvent({
        ...SESSION_START_EVENT,
        session_id: "filter-test-1",
      });
      insertEvent({
        ...TYPECHECK_PASS_EVENT,
        session_id: "filter-test-2",
      });

      const events = queryEvents({ session_id: "filter-test-1" });
      const found = events.find((e) => e.id === event1.id);
      expect(found).toBeDefined();
      expect(found!.session_id).toBe("filter-test-1");
    });

    test("respects limit parameter", () => {
      // Insert several events
      for (let i = 0; i < 5; i++) {
        insertEvent({
          ...SESSION_START_EVENT,
          event_type: `limit-test-${i}`,
          session_id: `limit-session-${Date.now()}`,
        });
      }

      const events = queryEvents({ limit: 2 });
      expect(events).toHaveLength(2);
    });

    test("returns total count", () => {
      const countBefore = getEventCount();
      insertEvent({
        ...SESSION_START_EVENT,
        session_id: "count-test",
      });
      const countAfter = getEventCount();

      expect(countAfter).toBe(countBefore + 1);
    });
  });

  describe("Empty state handling", () => {
    test("all routes return valid (empty/null) responses with no fixture data", async () => {
      // State: defaults
      const state = await readWorkflowState(tempDir);
      expect(WorkflowSnapshotSchema.safeParse(state).success).toBe(true);

      // Ledger: empty array
      const entries = await readLedgerEntries(tempDir);
      expect(entries).toEqual([]);

      // Harness: null
      const harness = await readHarnessResult(tempDir);
      expect(harness).toBeNull();

      // Iterations: empty array
      const iterations = await readIterationHistory(tempDir);
      expect(iterations).toEqual([]);

      // Planning: null
      const plan = await readSessionPlan(tempDir);
      expect(plan).toBeNull();
    });
  });
});
