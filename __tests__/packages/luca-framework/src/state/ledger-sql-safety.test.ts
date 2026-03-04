/**
 * Tests for ledger SQL injection prevention via validateLedgerFilters().
 *
 * Validates that malicious input is rejected before reaching the SQL
 * query builder, and that valid input passes through correctly.
 */
import { test, expect, describe } from "bun:test";

import { validateLedgerFilters } from "../../../../../packages/luca-framework/src/state/ledger";

// ─── SQL Injection Rejection ─────────────────────────────────────────────────

describe("ledger SQL safety", () => {
  describe("session_id validation", () => {
    test("rejects SQL injection in session_id", () => {
      expect(() =>
        validateLedgerFilters({
          session_id: "'; DROP TABLE ledger_entries; --",
        }),
      ).toThrow("Invalid session_id format");
    });

    test("rejects session_id with embedded SQL", () => {
      expect(() =>
        validateLedgerFilters({
          session_id: "abc' OR '1'='1",
        }),
      ).toThrow("Invalid session_id format");
    });

    test("rejects session_id with spaces", () => {
      expect(() =>
        validateLedgerFilters({
          session_id: "has spaces in it",
        }),
      ).toThrow("Invalid session_id format");
    });

    test("rejects session_id with semicolons", () => {
      expect(() =>
        validateLedgerFilters({
          session_id: "abc;def",
        }),
      ).toThrow("Invalid session_id format");
    });

    test("accepts valid UUID session_id", () => {
      const result = validateLedgerFilters({
        session_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      });
      expect(result.session_id).toBe("a1b2c3d4-e5f6-7890-abcd-ef1234567890");
    });

    test("accepts alphanumeric-hyphen session_id", () => {
      const result = validateLedgerFilters({
        session_id: "session-A",
      });
      expect(result.session_id).toBe("session-A");
    });

    test("accepts session_id with underscores", () => {
      const result = validateLedgerFilters({
        session_id: "session_abc_123",
      });
      expect(result.session_id).toBe("session_abc_123");
    });
  });

  describe("event_type validation", () => {
    test("rejects SQL injection in event_type", () => {
      expect(() =>
        validateLedgerFilters({
          event_type: "phase_started'; DROP TABLE --",
        }),
      ).toThrow("Invalid event_type");
    });

    test("rejects unknown event_type", () => {
      expect(() =>
        validateLedgerFilters({
          event_type: "malicious_event",
        }),
      ).toThrow("Invalid event_type");
    });

    test("accepts valid event types", () => {
      const validTypes = [
        "phase_started",
        "phase_completed",
        "transition",
        "error",
        "checkpoint",
        "metric",
        "decision",
        "field_set",
        "START",
        "PLAN_LOADED",
        "PHASE_STARTED",
        "PHASE_COMPLETED",
        "VERIFY_START",
        "VERIFY_PASS",
        "VERIFY_FAIL",
        "FIX_APPLIED",
        "COMPLETE",
        "SUSPEND",
        "RESUME_PHASE",
        "RESET",
      ];

      for (const eventType of validTypes) {
        const result = validateLedgerFilters({ event_type: eventType });
        expect(result.event_type).toBe(eventType);
      }
    });
  });

  describe("since validation", () => {
    test("rejects SQL injection in since", () => {
      expect(() =>
        validateLedgerFilters({
          since: "2024-01-01'; DELETE FROM --",
        }),
      ).toThrow("Invalid since format");
    });

    test("rejects non-date since value", () => {
      expect(() =>
        validateLedgerFilters({
          since: "not-a-date",
        }),
      ).toThrow("Invalid since format");
    });

    test("accepts valid ISO8601 date", () => {
      const result = validateLedgerFilters({ since: "2024-01-15" });
      expect(result.since).toBe("2024-01-15");
    });

    test("accepts valid ISO8601 datetime with timezone", () => {
      const result = validateLedgerFilters({
        since: "2024-01-15T10:30:00Z",
      });
      expect(result.since).toBe("2024-01-15T10:30:00Z");
    });

    test("accepts valid ISO8601 datetime with offset", () => {
      const result = validateLedgerFilters({
        since: "2024-01-15T10:30:00+05:30",
      });
      expect(result.since).toBe("2024-01-15T10:30:00+05:30");
    });

    test("accepts valid ISO8601 datetime with milliseconds", () => {
      const result = validateLedgerFilters({
        since: "2024-01-15T10:30:00.123Z",
      });
      expect(result.since).toBe("2024-01-15T10:30:00.123Z");
    });
  });

  describe("limit validation", () => {
    test("caps limit at 1000", () => {
      expect(() => validateLedgerFilters({ limit: 1001 })).toThrow(
        "Invalid limit",
      );
    });

    test("rejects negative limit", () => {
      expect(() => validateLedgerFilters({ limit: -1 })).toThrow(
        "Invalid limit",
      );
    });

    test("rejects zero limit", () => {
      expect(() => validateLedgerFilters({ limit: 0 })).toThrow(
        "Invalid limit",
      );
    });

    test("rejects non-integer limit", () => {
      expect(() => validateLedgerFilters({ limit: 1.5 })).toThrow(
        "Invalid limit",
      );
    });

    test("accepts valid limit", () => {
      const result = validateLedgerFilters({ limit: 50 });
      expect(result.limit).toBe(50);
    });

    test("accepts limit of 1", () => {
      const result = validateLedgerFilters({ limit: 1 });
      expect(result.limit).toBe(1);
    });

    test("accepts limit of 1000", () => {
      const result = validateLedgerFilters({ limit: 1000 });
      expect(result.limit).toBe(1000);
    });
  });

  describe("tail validation", () => {
    test("caps tail at 1000", () => {
      expect(() => validateLedgerFilters({ tail: 1001 })).toThrow(
        "Invalid tail",
      );
    });

    test("rejects negative tail", () => {
      expect(() => validateLedgerFilters({ tail: -5 })).toThrow("Invalid tail");
    });

    test("accepts valid tail", () => {
      const result = validateLedgerFilters({ tail: 20 });
      expect(result.tail).toBe(20);
    });
  });

  describe("session_id edge cases", () => {
    test("rejects unicode characters in session_id", () => {
      expect(() =>
        validateLedgerFilters({
          session_id: "session\u0041\u0042\u4e2d\u6587",
        }),
      ).toThrow("Invalid session_id format");
    });

    test("rejects percent-encoded single quote in session_id", () => {
      // Double-encoding attack: %27 is URL-encoded single quote
      expect(() =>
        validateLedgerFilters({
          session_id: "abc%27def",
        }),
      ).toThrow("Invalid session_id format");
    });

    test("rejects null byte in session_id", () => {
      expect(() =>
        validateLedgerFilters({
          session_id: "abc\x00def",
        }),
      ).toThrow("Invalid session_id format");
    });

    test("rejects session_id longer than 256 characters", () => {
      const longId = "a".repeat(257);
      expect(() => validateLedgerFilters({ session_id: longId })).toThrow(
        "Invalid session_id format",
      );
    });

    test("accepts session_id of exactly 256 characters", () => {
      const maxId = "a".repeat(256);
      const result = validateLedgerFilters({ session_id: maxId });
      expect(result.session_id).toBe(maxId);
    });
  });

  describe("event_type edge cases", () => {
    test("rejects event_type with uppercase casing variation", () => {
      // The allowlist is case-sensitive; 'start' is not in the list
      expect(() => validateLedgerFilters({ event_type: "start" })).toThrow(
        "Invalid event_type",
      );
    });

    test("rejects event_type with mixed casing", () => {
      expect(() =>
        validateLedgerFilters({ event_type: "Phase_Started" }),
      ).toThrow("Invalid event_type");
    });

    test("rejects event_type with leading whitespace", () => {
      expect(() => validateLedgerFilters({ event_type: " START" })).toThrow(
        "Invalid event_type",
      );
    });
  });

  describe("combined filters", () => {
    test("validates all filters together", () => {
      const result = validateLedgerFilters({
        session_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        event_type: "transition",
        since: "2024-01-15T00:00:00Z",
        limit: 50,
        tail: 10,
      });

      expect(result.session_id).toBe("a1b2c3d4-e5f6-7890-abcd-ef1234567890");
      expect(result.event_type).toBe("transition");
      expect(result.since).toBe("2024-01-15T00:00:00Z");
      expect(result.limit).toBe(50);
      expect(result.tail).toBe(10);
    });

    test("returns empty object for empty filters", () => {
      const result = validateLedgerFilters({});
      expect(result).toEqual({});
    });

    test("only includes provided filters in result", () => {
      const result = validateLedgerFilters({ limit: 10 });
      expect(result).toEqual({ limit: 10 });
      expect(result.session_id).toBeUndefined();
      expect(result.event_type).toBeUndefined();
      expect(result.since).toBeUndefined();
      expect(result.tail).toBeUndefined();
    });
  });
});
