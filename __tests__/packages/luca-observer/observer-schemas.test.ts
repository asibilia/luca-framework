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
