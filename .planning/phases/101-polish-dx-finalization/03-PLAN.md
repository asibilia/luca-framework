---
id: "101-03"
title: "End-to-end integration test: hooks fire -> ledger records -> observer displays"
phase: 101
wave: 2
complexity: COMPLEX
depends_on: ["101-01"]
tasks:
  - id: "101-03-1"
    title: "Create hook event emission test harness"
    goal: "Build a test utility that simulates hook execution (pre-commit-gate, post-edit-typecheck) and verifies that events are emitted to the SSE event system"
    verify: "Test utility can trigger hook scripts in a sandboxed environment and capture emitted events; handles both Claude and Cursor JSON formats"
  - id: "101-03-2"
    title: "Create ledger recording verification test"
    goal: "Build tests verifying that hook-emitted events are correctly recorded in the session ledger (.planning/session-ledger.jsonl) with proper schema validation"
    verify: "Tests verify ledger entries are appended after hook events; entries validate against LedgerEntrySchema; timestamps and event types are correct"
  - id: "101-03-3"
    title: "Create observer API route integration tests"
    goal: "Build tests that populate the ledger with known entries, then verify observer API routes (/api/events-query, /api/ledger, /api/state) return the expected data"
    verify: "Tests write fixture ledger data, call API routes, and verify response shapes match expected schemas; covers all data-serving routes"
  - id: "101-03-4"
    title: "Create end-to-end pipeline test"
    goal: "Build a comprehensive test that exercises the full pipeline: simulate a hook event -> verify ledger recording -> verify observer API returns the data -> verify UI hook receives correct data shape"
    verify: "Single test file exercises hook emission through to observer data layer; all assertions pass; documents the full data flow"
  - id: "101-03-5"
    title: "Add test fixtures for common hook event scenarios"
    goal: "Create a set of test fixtures representing common hook events (pre-commit pass, pre-commit fail, typecheck pass, typecheck fail, session start, context check) for use across integration tests"
    verify: "Fixture file exported from test utils; covers 6+ event scenarios; all fixtures validate against event schemas"
---

# 101-03: End-to-End Integration Test — Hooks Fire -> Ledger Records -> Observer Displays

## Goal

Create a comprehensive end-to-end integration test that validates the full observability pipeline: hook scripts fire events, the ledger records them, and the observer API routes serve them correctly. This is the final verification that all Phase 97-100 infrastructure works together as a cohesive system. Currently, each layer has unit tests but there is no test that exercises the full pipeline from hook execution through to observer display.

## Context

@src/hooks/scripts/pre-commit-gate.sh -- Hook script that emits events on commit
@src/hooks/scripts/context-check-throttled.sh -- Hook script that emits context check events
@src/hooks/scripts/session-start.sh -- Hook script that emits session start events
@packages/luca-framework/src/state/ledger.ts -- Ledger append and read functions
@packages/luca-framework/src/state/bridge.ts -- State bridge CLI
@packages/luca-observer/src/app/api/events-query/route.ts -- Observer event query API
@packages/luca-observer/src/app/api/ledger/route.ts -- Observer ledger API
@packages/luca-observer/src/app/api/state/route.ts -- Observer state API
@packages/luca-observer/src/app/api/stream/route.ts -- Observer SSE stream
@packages/luca-observer/src/lib/types.ts -- Observer Zod schemas (LedgerEntrySchema, ObserverEventSchema)
@packages/luca-observer/src/lib/db.ts -- In-memory event database
@packages/luca-observer/src/hooks/use-event-stream.ts -- React hook consuming SSE stream
@packages/luca-observer/**tests**/utils/test-helpers.ts -- Existing observer test helpers

**Architecture constraints:**

- Integration tests must be deterministic (no network calls, no real SSE connections)
- Tests use fixture data written to temp directories (not real .planning/ directory)
- Observer API routes are tested by importing the handler function directly, not by starting a server
- Hook scripts are tested by simulating stdin/stdout, not by actual tool invocations
- All test utilities use bun:test
- Temp directories cleaned up after tests

**Data flow being tested:**

```
Hook Script Fires
    |
    v
Event Emitted (stdout JSON / ledger append)
    |
    v
Session Ledger (.planning/session-ledger.jsonl)
    |
    v
Observer API Route (GET /api/ledger, /api/events-query)
    |
    v
React Hook (useLedger, useEventStream)
    |
    v
UI Component (Dashboard, Workflow page)
```

## Tasks

### Task 101-03-1: Create hook event emission test harness

Create `__tests__/integration/hook-event-emission.test.ts`.

A test utility that simulates hook script execution by piping JSON stdin and capturing stdout/stderr. Verifies that hook scripts produce the expected output format.

**Key features:**

- `simulateHookExecution(scriptPath, stdinJson, env?)` utility function
- Tests both Claude Code and Cursor JSON stdin formats
- Captures exit code, stdout, stderr
- Sandboxed execution in a temp directory

**Test scenarios:**

1. **pre-commit-gate with non-commit command**: Script receives a non-commit bash command, exits 0 immediately (fast path)
2. **context-check-throttled**: Script receives a PostToolUse event, emits context check event
3. **session-start**: Script receives SessionStart event, emits session initialization event

**Steps:**

1. Create a `simulateHookExecution` helper that uses `Bun.spawn` to run shell scripts with piped stdin
2. Write tests for each hook script using the helper
3. Verify stdout matches expected event format

**Verify:**

- [ ] Test file exists at `__tests__/integration/hook-event-emission.test.ts`
- [ ] `simulateHookExecution` utility function works with shell scripts
- [ ] Tests verify both Claude and Cursor JSON input formats
- [ ] All tests pass: `bun test __tests__/integration/hook-event-emission.test.ts`

### Task 101-03-2: Create ledger recording verification test

Create `__tests__/integration/ledger-recording.test.ts`.

Tests verifying that events written to the session ledger are correctly structured and retrievable.

**Key features:**

- Uses temp directory for ledger file (not real .planning/)
- Writes events via the ledger append function
- Reads back and validates against LedgerEntrySchema
- Tests concurrent writes (multiple events in rapid succession)

**Test scenarios:**

1. **Single event append**: Write one event, read it back, validate schema
2. **Multiple event append**: Write 10 events, read all, verify count and order
3. **Schema validation**: Write events with all required fields, verify Zod parse succeeds
4. **Malformed entry handling**: Write an invalid line to the ledger file manually, verify reader skips it gracefully
5. **Empty ledger**: Read from non-existent file, verify empty array returned

**Verify:**

- [ ] Test file exists at `__tests__/integration/ledger-recording.test.ts`
- [ ] Tests use temp directory for isolation
- [ ] All events validate against LedgerEntrySchema
- [ ] Concurrent write test passes
- [ ] Empty/malformed file handling tested
- [ ] All tests pass: `bun test __tests__/integration/ledger-recording.test.ts`

### Task 101-03-3: Create observer API route integration tests

Create `__tests__/integration/observer-api-routes.test.ts`.

Tests that verify observer API routes return correctly shaped data when given known fixture data.

**Key features:**

- Populates the observer data layer with fixture data before each test
- Calls API route handler functions directly (not via HTTP)
- Validates response JSON against observer Zod schemas
- Tests both populated and empty data states

**Test scenarios:**

1. **GET /api/ledger**: Fixture ledger data -> response includes entries array and total_count
2. **GET /api/state**: Fixture state data -> response includes workflow_state, complexity, current_phase
3. **GET /api/harness**: Fixture harness result -> response includes status, checks, total_errors
4. **GET /api/iterations**: Fixture iteration checkpoints -> response includes iterations array
5. **GET /api/planning**: Fixture session plan -> response includes plan and has_plan
6. **Empty state**: No fixture data -> routes return empty/null responses without errors

**Important:** Since observer API routes read from the filesystem (not from a database), tests need to either:

- Set LUCA_PROJECT_DIR to a temp directory with fixture files
- Mock the file-watcher functions that the routes call

**Verify:**

- [ ] Test file exists at `__tests__/integration/observer-api-routes.test.ts`
- [ ] Tests cover 5+ API routes
- [ ] All responses validate against observer schemas
- [ ] Empty state handled gracefully
- [ ] All tests pass: `bun test __tests__/integration/observer-api-routes.test.ts`

### Task 101-03-4: Create end-to-end pipeline test

Create `__tests__/integration/e2e-pipeline.test.ts`.

A single test file that exercises the complete data flow from event creation to observer data availability. This is the capstone integration test.

**Pipeline being tested:**

```
1. Create fixture event data (simulating what a hook would emit)
2. Write events to session ledger via ledger.appendEntry()
3. Read ledger entries via the observer's readLedgerEntries()
4. Verify the data shape matches what observer hooks (useLedger) expect
```

**Key features:**

- Uses temp project directory with fixture .planning/ structure
- Creates realistic event data matching actual hook output
- Validates data at each stage of the pipeline
- Documents the full data flow with inline comments

**Test scenarios:**

1. **Full pipeline - commit event**: Create a commit event -> write to ledger -> read via observer -> verify shape matches ObserverEventSchema
2. **Full pipeline - harness result**: Create harness result -> write checkpoint -> read via observer readHarnessResult -> verify shape
3. **Full pipeline - state transition**: Create state transition -> write via bridge -> read via observer readWorkflowState -> verify shape

**Verify:**

- [ ] Test file exists at `__tests__/integration/e2e-pipeline.test.ts`
- [ ] Tests exercise the complete pipeline (event creation -> ledger write -> observer read)
- [ ] Data validated at each pipeline stage
- [ ] Uses realistic event data shapes
- [ ] All tests pass: `bun test __tests__/integration/e2e-pipeline.test.ts`

### Task 101-03-5: Add test fixtures for common hook event scenarios

Create `__tests__/integration/fixtures/hook-event-fixtures.ts`.

A set of well-typed test fixtures representing common hook events, used across all integration tests for consistency.

**Fixture scenarios:**

1. **pre-commit pass**: Successful commit gate check (exit 0, no output)
2. **pre-commit fail**: Failed commit gate check (exit 2, deny JSON output)
3. **typecheck pass**: Successful typecheck (typecheck.pass event)
4. **typecheck fail**: Failed typecheck (typecheck.fail event with error details)
5. **session start**: Session initialization event
6. **context check**: Context usage check event with percentage data
7. **state transition**: Workflow state change event (idle -> executing)
8. **harness result**: Complete harness result with check details

**Key features:**

- Each fixture is a typed constant matching the relevant Zod schema
- Fixtures include both the event payload and the expected ledger entry
- Timestamps use deterministic values for test reproducibility
- Export as named constants for easy import

**Verify:**

- [ ] Fixture file exists at `__tests__/integration/fixtures/hook-event-fixtures.ts`
- [ ] 8+ fixture scenarios defined
- [ ] All fixtures validate against their respective schemas
- [ ] Timestamps are deterministic (not Date.now())
- [ ] `bunx --bun tsc --noEmit` passes

## Success Criteria

- [ ] Hook event emission tests verify shell scripts produce correct output format
- [ ] Ledger recording tests verify append/read/validation lifecycle
- [ ] Observer API route tests verify all routes return correctly shaped data
- [ ] End-to-end pipeline test exercises the complete data flow
- [ ] Test fixtures cover 8+ common hook event scenarios
- [ ] All integration tests pass: `bun test __tests__/integration/`
- [ ] Tests are deterministic (no flaky tests, no network calls)
- [ ] `bunx --bun tsc --noEmit` passes
