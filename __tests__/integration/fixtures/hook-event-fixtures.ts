/**
 * Test fixtures for common hook event scenarios.
 *
 * Provides deterministic, well-typed fixture data for integration tests
 * across the observability pipeline. Each fixture includes both the event
 * payload and the expected ledger entry shape.
 *
 * All timestamps are deterministic ISO strings (not Date.now()).
 * All fixtures validate against their respective Zod schemas.
 *
 * Uses snake_case for API compatibility.
 *
 * @module __tests__/integration/fixtures/hook-event-fixtures
 */
import type { TransitionRecord } from "../../../packages/luca-framework/src/state/types";
import type {
  ObserverEvent,
  HarnessResultSnapshot,
  WorkflowSnapshot,
  LedgerEntry,
} from "../../../packages/luca-observer/lib/types";

// ─── Deterministic Timestamps ────────────────────────────────────────────────

export const FIXTURE_TIMESTAMPS = {
  t0: "2026-03-04T10:00:00.000Z",
  t1: "2026-03-04T10:01:00.000Z",
  t2: "2026-03-04T10:02:00.000Z",
  t3: "2026-03-04T10:03:00.000Z",
  t4: "2026-03-04T10:04:00.000Z",
  t5: "2026-03-04T10:05:00.000Z",
  t6: "2026-03-04T10:06:00.000Z",
  t7: "2026-03-04T10:07:00.000Z",
} as const;

export const FIXTURE_SESSION_ID = "test-session-abc-123";

// ─── 1. Pre-Commit Pass ─────────────────────────────────────────────────────

/**
 * Successful pre-commit gate check.
 *
 * The pre-commit-gate.sh script exits 0 with no stdout when all checks pass.
 * An observer event is emitted via fire-and-forget curl.
 */
export const PRE_COMMIT_PASS_EVENT: ObserverEvent = {
  event_type: "commit.allowed",
  timestamp: FIXTURE_TIMESTAMPS.t0,
  session_id: FIXTURE_SESSION_ID,
};

export const PRE_COMMIT_PASS_LEDGER: TransitionRecord = {
  previous_state: "executing",
  current_state: "committing",
  event_type: "COMMIT_COMPLETE",
  event_data: { commit_hash: "abc1234" },
  actions_executed: ["commit"],
  context: {},
  timestamp: FIXTURE_TIMESTAMPS.t0,
  session_id: FIXTURE_SESSION_ID,
};

// ─── 2. Pre-Commit Fail ─────────────────────────────────────────────────────

/**
 * Failed pre-commit gate check.
 *
 * The pre-commit-gate.sh script exits 2 with deny JSON when checks fail.
 * An observer event is emitted via fire-and-forget curl.
 */
export const PRE_COMMIT_FAIL_EVENT: ObserverEvent = {
  event_type: "commit.blocked",
  timestamp: FIXTURE_TIMESTAMPS.t1,
  session_id: FIXTURE_SESSION_ID,
  payload: { test_exit: 1, tsc_exit: 0 },
};

/**
 * The deny JSON output from pre-commit-gate.sh on Claude Code.
 */
export const PRE_COMMIT_FAIL_CLAUDE_OUTPUT = {
  hookSpecificOutput: {
    permissionDecision: "deny",
    permissionDecisionReason:
      "Commit blocked by pre-commit quality gate. Fix the following issues before committing:\n## Test Failures\n```\n1 test failed\n```\n",
  },
};

/**
 * The deny JSON output from pre-commit-gate.sh on Cursor.
 */
export const PRE_COMMIT_FAIL_CURSOR_OUTPUT = {
  permission: "deny",
  user_message:
    "Commit blocked by pre-commit quality gate. Fix the following issues before committing:\n## Test Failures\n```\n1 test failed\n```\n",
};

// ─── 3. Typecheck Pass ──────────────────────────────────────────────────────

/**
 * Successful typecheck event.
 */
export const TYPECHECK_PASS_EVENT: ObserverEvent = {
  event_type: "typecheck.pass",
  timestamp: FIXTURE_TIMESTAMPS.t2,
  session_id: FIXTURE_SESSION_ID,
  duration_ms: 3200,
  status: "passed",
};

export const TYPECHECK_PASS_LEDGER: TransitionRecord = {
  previous_state: "executing",
  current_state: "executing",
  event_type: "HARNESS_COMPLETE",
  event_data: { status: "passed", total_errors: 0 },
  actions_executed: ["typecheck"],
  context: {},
  timestamp: FIXTURE_TIMESTAMPS.t2,
  session_id: FIXTURE_SESSION_ID,
};

// ─── 4. Typecheck Fail ──────────────────────────────────────────────────────

/**
 * Failed typecheck event with error details.
 */
export const TYPECHECK_FAIL_EVENT: ObserverEvent = {
  event_type: "typecheck.fail",
  timestamp: FIXTURE_TIMESTAMPS.t3,
  session_id: FIXTURE_SESSION_ID,
  duration_ms: 4100,
  status: "failed",
  payload: {
    error_count: 3,
    errors: [
      "src/lib/utils.ts(42,5): error TS2345: Argument of type 'string' is not assignable.",
    ],
  },
};

export const TYPECHECK_FAIL_LEDGER: TransitionRecord = {
  previous_state: "executing",
  current_state: "executing",
  event_type: "HARNESS_COMPLETE",
  event_data: { status: "failed", total_errors: 3 },
  actions_executed: ["typecheck"],
  context: {},
  timestamp: FIXTURE_TIMESTAMPS.t3,
  session_id: FIXTURE_SESSION_ID,
};

// ─── 5. Session Start ───────────────────────────────────────────────────────

/**
 * Session initialization event from session-start.sh.
 */
export const SESSION_START_EVENT: ObserverEvent = {
  event_type: "session.start",
  timestamp: FIXTURE_TIMESTAMPS.t4,
  session_id: FIXTURE_SESSION_ID,
  payload: { runtime: "bun", created: "STATE.md config.json BRAIN.md" },
};

export const SESSION_START_LEDGER: TransitionRecord = {
  previous_state: "idle",
  current_state: "preflight",
  event_type: "START",
  event_data: { ticket_id: "LUCA-44" },
  actions_executed: ["initialize"],
  context: {},
  timestamp: FIXTURE_TIMESTAMPS.t4,
  session_id: FIXTURE_SESSION_ID,
};

// ─── 6. Context Check ───────────────────────────────────────────────────────

/**
 * Context usage check event with percentage data.
 */
export const CONTEXT_CHECK_EVENT: ObserverEvent = {
  event_type: "context.check",
  timestamp: FIXTURE_TIMESTAMPS.t5,
  session_id: FIXTURE_SESSION_ID,
  payload: {
    usage_percent: 42,
    zone: "good",
    token_count: 84000,
    max_tokens: 200000,
  },
};

// ─── 7. State Transition ────────────────────────────────────────────────────

/**
 * Workflow state change event (idle -> executing).
 */
export const STATE_TRANSITION_LEDGER: TransitionRecord = {
  previous_state: "idle",
  current_state: "executing",
  event_type: "PHASE_START",
  event_data: { phase_id: 101 },
  actions_executed: ["start_phase"],
  context: { current_phase: 101, complexity: "COMPLEX" },
  timestamp: FIXTURE_TIMESTAMPS.t6,
  session_id: FIXTURE_SESSION_ID,
};

// ─── 8. Harness Result ──────────────────────────────────────────────────────

/**
 * Complete harness result with check details.
 */
export const HARNESS_RESULT_FIXTURE: HarnessResultSnapshot = {
  status: "passed",
  checks: [
    {
      name: "test",
      status: "passed",
      exit_code: 0,
      errors: [],
      warnings: [],
      raw_output: "42 tests passed",
      duration: 5200,
    },
    {
      name: "typecheck",
      status: "passed",
      exit_code: 0,
      errors: [],
      warnings: [],
      raw_output: "",
      duration: 3100,
    },
    {
      name: "lint",
      status: "skipped",
      exit_code: 0,
      errors: [],
      warnings: [],
      raw_output: "",
      duration: 0,
    },
    {
      name: "build",
      status: "skipped",
      exit_code: 0,
      errors: [],
      warnings: [],
      raw_output: "",
      duration: 0,
    },
  ],
  total_errors: 0,
  total_warnings: 0,
  duration: 8300,
  timestamp: FIXTURE_TIMESTAMPS.t7,
};

export const HARNESS_RESULT_FAILED_FIXTURE: HarnessResultSnapshot = {
  status: "failed",
  checks: [
    {
      name: "test",
      status: "passed",
      exit_code: 0,
      errors: [],
      warnings: [],
      raw_output: "42 tests passed",
      duration: 5200,
    },
    {
      name: "typecheck",
      status: "failed",
      exit_code: 1,
      errors: [
        {
          file: "src/lib/utils.ts",
          line: 42,
          column: 5,
          message:
            "Argument of type 'string' is not assignable to parameter of type 'number'.",
          code: "TS2345",
          severity: "error",
        },
      ],
      warnings: [],
      raw_output: "src/lib/utils.ts(42,5): error TS2345",
      duration: 3100,
    },
  ],
  total_errors: 1,
  total_warnings: 0,
  duration: 8300,
  timestamp: FIXTURE_TIMESTAMPS.t7,
};

// ─── Workflow State Fixtures ────────────────────────────────────────────────

/**
 * Workflow state snapshot for testing observer state API.
 */
export const WORKFLOW_STATE_FIXTURE: WorkflowSnapshot = {
  workflow_state: "executing",
  current_phase: 101,
  current_plan: "03",
  complexity: "COMPLEX",
  oversight: "milestone",
  ticket_id: "LUCA-44",
  branch: "44--v2.7.0-observability-verification",
  session_id: FIXTURE_SESSION_ID,
  errors: [],
};

/**
 * STATE.md content matching WORKFLOW_STATE_FIXTURE.
 */
export const STATE_MD_CONTENT = `# Project State

## Current Position

**Workflow State:** executing
**Current Phase:** 101
**Current Plan:** 03
**Task Complexity:** COMPLEX
**Oversight Level:** milestone

## Session

**Ticket:** LUCA-44
**Branch:** 44--v2.7.0-observability-verification
**Session ID:** ${FIXTURE_SESSION_ID}
`;

// ─── Session Plan Fixture ───────────────────────────────────────────────────

export const SESSION_PLAN_FIXTURE = {
  generated_at: FIXTURE_TIMESTAMPS.t0,
  session_cap_minutes: 180,
  total_effort_points: 13,
  items: [
    {
      todo_path: ".planning/phases/101/03-PLAN.md",
      title: "End-to-end integration tests",
      area: "observability",
      wsjf_score: 8.5,
      complexity: "COMPLEX",
      dependency_free: true,
      assigned_zone: "peak" as const,
    },
  ],
  big_rock_index: 0,
  rationale: "Integration tests are highest priority for observer validation.",
};

// ─── Iteration Record Fixture ───────────────────────────────────────────────

export const ITERATION_RECORD_FIXTURE = {
  tag: "phase-101-harness-1",
  phase: 101,
  loop: "harness" as const,
  iteration: 1,
  error_count: 0,
  error_delta: -3,
  convergence_status: "improved" as const,
  stale_count: 0,
  permanent_errors: [],
  correctable_errors: [],
  transient_errors: [],
  artifacts_delta: 2,
  agent_invoked: "lu-executor",
  duration_ms: 12000,
  timestamp: FIXTURE_TIMESTAMPS.t6,
};

// ─── Ledger Entry Fixtures (fully constructed with sequence numbers) ────────

/**
 * Build a complete LedgerEntry from a TransitionRecord and sequence number.
 */
export function buildLedgerEntry(
  record: TransitionRecord,
  sequenceNumber: number,
): LedgerEntry {
  return {
    ...record,
    sequence_number: sequenceNumber,
    parent_id: sequenceNumber === 0 ? null : sequenceNumber - 1,
  };
}

/**
 * A batch of ledger entries representing a typical session lifecycle.
 */
export const LEDGER_ENTRIES_BATCH: LedgerEntry[] = [
  buildLedgerEntry(SESSION_START_LEDGER, 0),
  buildLedgerEntry(STATE_TRANSITION_LEDGER, 1),
  buildLedgerEntry(TYPECHECK_PASS_LEDGER, 2),
  buildLedgerEntry(TYPECHECK_FAIL_LEDGER, 3),
  buildLedgerEntry(PRE_COMMIT_PASS_LEDGER, 4),
];

// ─── Claude Code & Cursor Stdin Fixtures ────────────────────────────────────

/**
 * Claude Code stdin for a git commit command (PreToolUse event).
 */
export const CLAUDE_CODE_COMMIT_STDIN = {
  tool_input: {
    command: 'git commit -m "feat(101-03): add integration tests #44"',
  },
};

/**
 * Cursor stdin for a git commit command (beforeShellExecution event).
 */
export const CURSOR_COMMIT_STDIN = {
  command: 'git commit -m "feat(101-03): add integration tests #44"',
};

/**
 * Claude Code stdin for a non-commit command (should fast-exit).
 */
export const CLAUDE_CODE_NON_COMMIT_STDIN = {
  tool_input: {
    command: "bun test __tests__/integration/",
  },
};

/**
 * Cursor stdin for a non-commit command (should fast-exit).
 */
export const CURSOR_NON_COMMIT_STDIN = {
  command: "ls -la",
};
