---
id: "99-05"
title: "SSE event stream and API route integration tests"
phase: 99
wave: 3
complexity: MODERATE
depends_on: ["99-01"]
tasks:
  - id: "99-05-1"
    title: "Test ledger reader with valid, empty, and corrupted JSONL"
    goal: "Unit tests for readLedgerEntries() covering valid data, missing file, corrupted lines, and all filter combinations"
    verify: "bun test passes for all ledger reader test cases"
  - id: "99-05-2"
    title: "Test harness result reader with valid and missing data"
    goal: "Unit tests for readHarnessResult() covering valid JSON, missing file, and invalid JSON"
    verify: "bun test passes for all harness reader test cases"
  - id: "99-05-3"
    title: "Test observer Zod schemas with valid and invalid payloads"
    goal: "Unit tests for LedgerEntrySchema, HarnessResultSnapshotSchema verifying safeParse accepts valid data and rejects invalid shapes"
    verify: "bun test passes for all schema test cases"
  - id: "99-05-4"
    title: "Test SSE event roundtrip: POST event -> SSE broadcast"
    goal: "Integration test verifying POST /api/events inserts into store and SSE /api/stream receives the event"
    verify: "bun test passes for SSE roundtrip test; event posted via API appears in SSE stream"
  - id: "99-05-5"
    title: "Test harness result persistence and observer read"
    goal: "Integration test verifying harness runner writes harness-result.json and the observer reader parses it correctly"
    verify: "bun test passes; harness-result.json written by runner is readable by observer's readHarnessResult()"
---

# 99-05: SSE Event Stream and API Route Integration Tests

## Goal

Create comprehensive tests for the schema bridge, file readers, and SSE event pipeline. These tests validate that the observer correctly reads, parses, and serves data from the framework's persisted files (ledger JSONL, harness JSON) and that the SSE real-time event pipeline works end-to-end.

## Context

@packages/luca-observer/src/lib/file-watcher.ts -- readLedgerEntries, readHarnessResult (from 99-01)
@packages/luca-observer/src/lib/types.ts -- LedgerEntrySchema, HarnessResultSnapshotSchema (from 99-01)
@packages/luca-observer/src/lib/db.ts -- insertEvent, queryEvents (existing)
@packages/luca-observer/src/lib/sse.ts -- broadcastEvent, addSSEClient, removeSSEClient (existing)
@packages/luca-observer/src/app/api/events/route.ts -- POST /api/events (existing)
@packages/luca-observer/src/app/api/stream/route.ts -- GET /api/stream SSE (existing)
@packages/luca-observer/src/app/api/ledger/route.ts -- GET /api/ledger (from 99-01)
@packages/luca-observer/src/app/api/harness/route.ts -- GET /api/harness (from 99-01)
@src/harness/\_\_helpers/runner.ts -- runHarness with harness-result.json persistence (from 99-01)

**Testing approach:**

- Use `bun:test` for all tests (import { test, expect, describe, beforeEach, afterEach } from "bun:test")
- File reader tests use temp directories with test fixtures
- Schema tests are pure unit tests (no I/O)
- SSE tests use the in-memory store directly (not HTTP)
- Integration tests for harness persistence create temp files
- All tests must be independent (no shared state between test cases)

## Tasks

### Task 99-05-1: Test ledger reader with valid, empty, and corrupted JSONL

Create `__tests__/packages/luca-observer/file-watcher-ledger.test.ts`.

```typescript
import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Import the function under test
// Note: readLedgerEntries uses node:fs/promises internally, which works in test context

describe("readLedgerEntries", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(
      tmpdir(),
      `observer-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(join(tmpDir, ".planning"), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("returns empty array when ledger file does not exist", async () => {
    // Import dynamically to avoid module resolution issues in monorepo
    const { readLedgerEntries } =
      await import("../../../packages/luca-observer/src/lib/file-watcher");
    const entries = await readLedgerEntries(tmpDir);
    expect(entries).toEqual([]);
  });

  test("parses valid JSONL entries", async () => {
    const { readLedgerEntries } =
      await import("../../../packages/luca-observer/src/lib/file-watcher");

    const validEntry = {
      previous_state: "idle",
      current_state: "preflight",
      event_type: "START",
      event_data: {},
      actions_executed: [],
      context: {},
      timestamp: "2026-03-03T12:00:00Z",
      session_id: "test-session",
      sequence_number: 0,
      parent_id: null,
    };

    const ledgerPath = join(tmpDir, ".planning", "session-ledger.jsonl");
    writeFileSync(ledgerPath, JSON.stringify(validEntry) + "\n");

    const entries = await readLedgerEntries(tmpDir);
    expect(entries).toHaveLength(1);
    expect(entries[0].current_state).toBe("preflight");
    expect(entries[0].sequence_number).toBe(0);
  });

  test("skips corrupted lines without throwing", async () => {
    const { readLedgerEntries } =
      await import("../../../packages/luca-observer/src/lib/file-watcher");

    const validEntry = {
      previous_state: "idle",
      current_state: "routing",
      event_type: "START",
      event_data: {},
      actions_executed: [],
      context: {},
      timestamp: "2026-03-03T12:00:00Z",
      session_id: "test-session",
      sequence_number: 0,
      parent_id: null,
    };

    const ledgerPath = join(tmpDir, ".planning", "session-ledger.jsonl");
    writeFileSync(
      ledgerPath,
      "NOT VALID JSON\n" + JSON.stringify(validEntry) + "\n" + "{bad json\n",
    );

    const entries = await readLedgerEntries(tmpDir);
    expect(entries).toHaveLength(1);
    expect(entries[0].current_state).toBe("routing");
  });

  test("filters by session_id", async () => {
    const { readLedgerEntries } =
      await import("../../../packages/luca-observer/src/lib/file-watcher");

    const entry1 = {
      previous_state: "idle",
      current_state: "routing",
      event_type: "START",
      event_data: {},
      actions_executed: [],
      context: {},
      timestamp: "2026-03-03T12:00:00Z",
      session_id: "session-a",
      sequence_number: 0,
      parent_id: null,
    };
    const entry2 = { ...entry1, session_id: "session-b", sequence_number: 1 };

    const ledgerPath = join(tmpDir, ".planning", "session-ledger.jsonl");
    writeFileSync(
      ledgerPath,
      JSON.stringify(entry1) + "\n" + JSON.stringify(entry2) + "\n",
    );

    const entries = await readLedgerEntries(tmpDir, {
      session_id: "session-a",
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].session_id).toBe("session-a");
  });

  test("filters by event_type", async () => {
    const { readLedgerEntries } =
      await import("../../../packages/luca-observer/src/lib/file-watcher");

    const entry1 = {
      previous_state: "idle",
      current_state: "routing",
      event_type: "START",
      event_data: {},
      actions_executed: [],
      context: {},
      timestamp: "2026-03-03T12:00:00Z",
      session_id: "test",
      sequence_number: 0,
      parent_id: null,
    };
    const entry2 = {
      ...entry1,
      event_type: "ROUTE_COMPLETE",
      sequence_number: 1,
    };

    const ledgerPath = join(tmpDir, ".planning", "session-ledger.jsonl");
    writeFileSync(
      ledgerPath,
      JSON.stringify(entry1) + "\n" + JSON.stringify(entry2) + "\n",
    );

    const entries = await readLedgerEntries(tmpDir, { event_type: "START" });
    expect(entries).toHaveLength(1);
    expect(entries[0].event_type).toBe("START");
  });

  test("applies tail filter before parsing", async () => {
    const { readLedgerEntries } =
      await import("../../../packages/luca-observer/src/lib/file-watcher");

    const lines: string[] = [];
    for (let i = 0; i < 10; i++) {
      lines.push(
        JSON.stringify({
          previous_state: "idle",
          current_state: "routing",
          event_type: "START",
          event_data: {},
          actions_executed: [],
          context: {},
          timestamp: "2026-03-03T12:00:00Z",
          session_id: "test",
          sequence_number: i,
          parent_id: i > 0 ? i - 1 : null,
        }),
      );
    }

    const ledgerPath = join(tmpDir, ".planning", "session-ledger.jsonl");
    writeFileSync(ledgerPath, lines.join("\n") + "\n");

    const entries = await readLedgerEntries(tmpDir, { tail: 3 });
    expect(entries).toHaveLength(3);
    expect(entries[0].sequence_number).toBe(7);
  });

  test("applies limit filter", async () => {
    const { readLedgerEntries } =
      await import("../../../packages/luca-observer/src/lib/file-watcher");

    const lines: string[] = [];
    for (let i = 0; i < 10; i++) {
      lines.push(
        JSON.stringify({
          previous_state: "idle",
          current_state: "routing",
          event_type: "START",
          event_data: {},
          actions_executed: [],
          context: {},
          timestamp: "2026-03-03T12:00:00Z",
          session_id: "test",
          sequence_number: i,
          parent_id: i > 0 ? i - 1 : null,
        }),
      );
    }

    const ledgerPath = join(tmpDir, ".planning", "session-ledger.jsonl");
    writeFileSync(ledgerPath, lines.join("\n") + "\n");

    const entries = await readLedgerEntries(tmpDir, { limit: 5 });
    expect(entries).toHaveLength(5);
  });
});
```

**Steps:**

1. Create the test file at `__tests__/packages/luca-observer/file-watcher-ledger.test.ts`
2. Each test creates a temp directory, writes test fixtures, and cleans up
3. Tests cover: missing file, valid data, corrupted lines, all four filters

**Verify:**

- [ ] Test file exists
- [ ] All tests pass: `bun test __tests__/packages/luca-observer/file-watcher-ledger.test.ts`
- [ ] Tests are independent (no shared state)
- [ ] Temp directories cleaned up after each test

### Task 99-05-2: Test harness result reader with valid and missing data

Create `__tests__/packages/luca-observer/file-watcher-harness.test.ts`.

```typescript
import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("readHarnessResult", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(
      tmpdir(),
      `observer-harness-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(join(tmpDir, ".planning"), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("returns null when harness-result.json does not exist", async () => {
    const { readHarnessResult } =
      await import("../../../packages/luca-observer/src/lib/file-watcher");
    const result = await readHarnessResult(tmpDir);
    expect(result).toBeNull();
  });

  test("parses valid harness result JSON", async () => {
    const { readHarnessResult } =
      await import("../../../packages/luca-observer/src/lib/file-watcher");

    const validResult = {
      status: "passed",
      checks: [
        {
          name: "test",
          status: "passed",
          exit_code: 0,
          errors: [],
          warnings: [],
          raw_output: "All tests passed",
          duration: 5000,
        },
      ],
      total_errors: 0,
      total_warnings: 0,
      duration: 5000,
      timestamp: "2026-03-03T12:00:00Z",
    };

    const resultPath = join(tmpDir, ".planning", "harness-result.json");
    writeFileSync(resultPath, JSON.stringify(validResult));

    const result = await readHarnessResult(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.status).toBe("passed");
    expect(result!.checks).toHaveLength(1);
    expect(result!.total_errors).toBe(0);
  });

  test("returns null for invalid JSON", async () => {
    const { readHarnessResult } =
      await import("../../../packages/luca-observer/src/lib/file-watcher");

    const resultPath = join(tmpDir, ".planning", "harness-result.json");
    writeFileSync(resultPath, "NOT VALID JSON {{{");

    const result = await readHarnessResult(tmpDir);
    expect(result).toBeNull();
  });

  test("returns null for JSON with wrong shape", async () => {
    const { readHarnessResult } =
      await import("../../../packages/luca-observer/src/lib/file-watcher");

    const wrongShape = { foo: "bar", status: "unknown_value" };

    const resultPath = join(tmpDir, ".planning", "harness-result.json");
    writeFileSync(resultPath, JSON.stringify(wrongShape));

    const result = await readHarnessResult(tmpDir);
    expect(result).toBeNull();
  });
});
```

**Verify:**

- [ ] Test file exists
- [ ] All tests pass: `bun test __tests__/packages/luca-observer/file-watcher-harness.test.ts`
- [ ] Covers: missing file, valid data, invalid JSON, wrong shape

### Task 99-05-3: Test observer Zod schemas with valid and invalid payloads

Create `__tests__/packages/luca-observer/observer-schemas.test.ts`.

```typescript
import { test, expect, describe } from "bun:test";

describe("Observer Zod schemas", () => {
  describe("LedgerEntrySchema", () => {
    test("accepts valid ledger entry", async () => {
      const { LedgerEntrySchema } =
        await import("../../../packages/luca-observer/src/lib/types");

      const valid = {
        previous_state: "idle",
        current_state: "preflight",
        event_type: "START",
        event_data: {},
        actions_executed: [],
        context: {},
        timestamp: "2026-03-03T12:00:00Z",
        session_id: "test-session",
        sequence_number: 0,
        parent_id: null,
      };

      const result = LedgerEntrySchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    test("requires sequence_number", async () => {
      const { LedgerEntrySchema } =
        await import("../../../packages/luca-observer/src/lib/types");

      const missing = {
        previous_state: "idle",
        current_state: "preflight",
        event_type: "START",
      };

      const result = LedgerEntrySchema.safeParse(missing);
      expect(result.success).toBe(false);
    });

    test("applies defaults for optional fields", async () => {
      const { LedgerEntrySchema } =
        await import("../../../packages/luca-observer/src/lib/types");

      const minimal = {
        previous_state: "idle",
        current_state: "preflight",
        event_type: "START",
        sequence_number: 0,
      };

      const result = LedgerEntrySchema.safeParse(minimal);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.event_data).toEqual({});
        expect(result.data.actions_executed).toEqual([]);
        expect(result.data.parent_id).toBeNull();
      }
    });
  });

  describe("HarnessResultSnapshotSchema", () => {
    test("accepts valid harness result", async () => {
      const { HarnessResultSnapshotSchema } =
        await import("../../../packages/luca-observer/src/lib/types");

      const valid = {
        status: "passed",
        checks: [
          {
            name: "test",
            status: "passed",
            exit_code: 0,
            errors: [],
            warnings: [],
            raw_output: "",
            duration: 5000,
          },
        ],
        total_errors: 0,
        total_warnings: 0,
        duration: 5000,
        timestamp: "2026-03-03T12:00:00Z",
      };

      const result = HarnessResultSnapshotSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    test("rejects invalid status value", async () => {
      const { HarnessResultSnapshotSchema } =
        await import("../../../packages/luca-observer/src/lib/types");

      const invalid = {
        status: "unknown",
        checks: [],
      };

      const result = HarnessResultSnapshotSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    test("validates nested check result structure", async () => {
      const { HarnessResultSnapshotSchema } =
        await import("../../../packages/luca-observer/src/lib/types");

      const withErrors = {
        status: "failed",
        checks: [
          {
            name: "typecheck",
            status: "failed",
            exit_code: 1,
            errors: [
              {
                file: "src/index.ts",
                line: 10,
                column: 5,
                message: "Type error",
                severity: "error",
              },
            ],
            warnings: [],
            raw_output: "error output",
            duration: 3000,
          },
        ],
        total_errors: 1,
        total_warnings: 0,
        duration: 3000,
        timestamp: "2026-03-03T12:00:00Z",
      };

      const result = HarnessResultSnapshotSchema.safeParse(withErrors);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.checks[0].errors).toHaveLength(1);
        expect(result.data.checks[0].errors[0].file).toBe("src/index.ts");
      }
    });
  });
});
```

**Verify:**

- [ ] Test file exists
- [ ] All tests pass: `bun test __tests__/packages/luca-observer/observer-schemas.test.ts`
- [ ] Covers valid, invalid, and default cases for both schemas

### Task 99-05-4: Test SSE event roundtrip: POST event -> SSE broadcast

Create `__tests__/packages/luca-observer/sse-roundtrip.test.ts`.

Tests the in-memory SSE pipeline directly (store + broadcaster), without HTTP.

```typescript
import { test, expect, describe } from "bun:test";

describe("SSE event roundtrip", () => {
  test("insertEvent stores and broadcasts event", async () => {
    const { insertEvent, queryEvents } =
      await import("../../../packages/luca-observer/src/lib/db");
    const { broadcastEvent, addSSEClient, removeSSEClient } =
      await import("../../../packages/luca-observer/src/lib/sse");

    // Track broadcast events
    const received: unknown[] = [];
    const controller = {
      enqueue: (data: Uint8Array) => {
        const text = new TextDecoder().decode(data);
        // SSE format: "data: {...}\n\n"
        const jsonStr = text.replace("data: ", "").trim();
        if (jsonStr) {
          try {
            received.push(JSON.parse(jsonStr));
          } catch {
            // heartbeat or non-JSON
          }
        }
      },
    } as unknown as ReadableStreamDefaultController<Uint8Array>;

    addSSEClient(controller);

    // Insert and broadcast
    const stored = insertEvent({
      event_type: "test.roundtrip",
      session_id: "test-session",
    });

    broadcastEvent(stored);

    // Verify stored in database
    const events = queryEvents({ event_type: "test.roundtrip" });
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].event_type).toBe("test.roundtrip");

    // Verify broadcast received
    expect(received).toHaveLength(1);
    expect((received[0] as Record<string, unknown>).event_type).toBe(
      "test.roundtrip",
    );

    removeSSEClient(controller);
  });

  test("broadcast silently handles disconnected clients", async () => {
    const { insertEvent } =
      await import("../../../packages/luca-observer/src/lib/db");
    const { broadcastEvent, addSSEClient } =
      await import("../../../packages/luca-observer/src/lib/sse");

    // Create a controller that throws (simulating disconnected client)
    const badController = {
      enqueue: () => {
        throw new Error("Client disconnected");
      },
    } as unknown as ReadableStreamDefaultController<Uint8Array>;

    addSSEClient(badController);

    const stored = insertEvent({
      event_type: "test.disconnect",
    });

    // Should not throw
    expect(() => broadcastEvent(stored)).not.toThrow();
  });
});
```

**Verify:**

- [ ] Test file exists
- [ ] All tests pass: `bun test __tests__/packages/luca-observer/sse-roundtrip.test.ts`
- [ ] Tests event storage, broadcast, and disconnected client handling

### Task 99-05-5: Test harness result persistence and observer read

Create `__tests__/packages/luca-observer/harness-persistence.test.ts`.

Integration test verifying the harness runner's result file can be read by the observer's reader.

```typescript
import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("Harness result persistence roundtrip", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(
      tmpdir(),
      `harness-persist-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(join(tmpDir, ".planning"), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("harness-result.json written in snake_case is readable by observer", async () => {
    const { readHarnessResult } =
      await import("../../../packages/luca-observer/src/lib/file-watcher");

    // Simulate what the harness runner writes (snake_case)
    const harnessOutput = {
      status: "failed",
      checks: [
        {
          name: "test",
          status: "passed",
          exit_code: 0,
          errors: [],
          warnings: [],
          raw_output: "All 42 tests passed",
          duration: 4500,
        },
        {
          name: "typecheck",
          status: "failed",
          exit_code: 1,
          errors: [
            {
              file: "src/index.ts",
              line: 15,
              column: 3,
              message: "Property 'foo' does not exist on type 'Bar'",
              code: "TS2339",
              severity: "error",
            },
          ],
          warnings: [],
          raw_output: "src/index.ts(15,3): error TS2339",
          duration: 8000,
        },
      ],
      total_errors: 1,
      total_warnings: 0,
      duration: 12500,
      timestamp: "2026-03-03T12:00:00Z",
    };

    const resultPath = join(tmpDir, ".planning", "harness-result.json");
    await Bun.write(resultPath, JSON.stringify(harnessOutput, null, 2));

    // Verify file was written
    expect(existsSync(resultPath)).toBe(true);

    // Read via observer utility
    const result = await readHarnessResult(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.status).toBe("failed");
    expect(result!.checks).toHaveLength(2);
    expect(result!.checks[0].status).toBe("passed");
    expect(result!.checks[1].status).toBe("failed");
    expect(result!.checks[1].errors).toHaveLength(1);
    expect(result!.checks[1].errors[0].file).toBe("src/index.ts");
    expect(result!.checks[1].errors[0].line).toBe(15);
    expect(result!.total_errors).toBe(1);
  });
});
```

**Verify:**

- [ ] Test file exists
- [ ] Test passes: `bun test __tests__/packages/luca-observer/harness-persistence.test.ts`
- [ ] Validates the full roundtrip: harness writes snake_case JSON, observer reads and parses it

## Success Criteria

- [ ] All 5 test files created under `__tests__/packages/luca-observer/`
- [ ] All tests pass: `bun test __tests__/packages/luca-observer/`
- [ ] Tests cover: ledger reader (6 tests), harness reader (4 tests), schemas (5 tests), SSE roundtrip (2 tests), persistence (1 test)
- [ ] Tests are independent and clean up after themselves
- [ ] No flaky tests (no timing dependencies, no shared state)
