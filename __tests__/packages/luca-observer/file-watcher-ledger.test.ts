import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Import the function under test
// Note: readLedgerEntries uses node:fs/promises internally, which works in test context

// Use a temp directory inside the project so resolveProjectDir's
// path traversal check (startsWith(cwd)) passes.
const PROJECT_ROOT = process.cwd();

describe("readLedgerEntries", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(
      PROJECT_ROOT,
      `.tmp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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
    expect(entries[0]!.current_state).toBe("preflight");
    expect(entries[0]!.sequence_number).toBe(0);
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
    expect(entries[0]!.current_state).toBe("routing");
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
    expect(entries[0]!.session_id).toBe("session-a");
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
    expect(entries[0]!.event_type).toBe("START");
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
    expect(entries[0]!.sequence_number).toBe(7);
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
