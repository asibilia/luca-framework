import { describe, test, expect } from "bun:test";

import { runShellCommand } from "../exec";

import type { ExecResult } from "../exec";

describe("exec helpers", () => {
  describe("runShellCommand", () => {
    test("successful command returns passed=true, status='passed'", () => {
      const result = runShellCommand("echo hello");
      expect(result.passed).toBe(true);
      expect(result.status).toBe("passed");
      expect(result.output.trim()).toBe("hello");
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    test("failing command returns passed=false, status='failed'", () => {
      const result = runShellCommand("exit 1");
      expect(result.passed).toBe(false);
      expect(result.status).toBe("failed");
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    test("captures stderr on failure", () => {
      const result = runShellCommand("echo 'error message' >&2 && exit 1");
      expect(result.passed).toBe(false);
      expect(result.status).toBe("failed");
      expect(result.output).toContain("error message");
    });

    test("concatenates stdout and stderr on failure", () => {
      const result = runShellCommand(
        "echo 'stdout part' && echo 'stderr part' >&2 && exit 1",
      );
      expect(result.passed).toBe(false);
      expect(result.output).toContain("stdout part");
      expect(result.output).toContain("stderr part");
    });

    test("respects maxOutput truncation", () => {
      // Generate output longer than maxOutput
      const result = runShellCommand("printf '%0.s-' {1..100}", {
        maxOutput: 20,
      });
      expect(result.passed).toBe(true);
      expect(result.output.length).toBeLessThanOrEqual(20);
    });

    test("uses default options when none provided", () => {
      const result = runShellCommand("echo default");
      expect(result.passed).toBe(true);
      expect(result.output.trim()).toBe("default");
    });

    test("respects custom cwd option", () => {
      const result = runShellCommand("pwd", { cwd: "/tmp" });
      expect(result.passed).toBe(true);
      // /tmp may be a symlink on macOS (to /private/tmp)
      expect(
        result.output.trim() === "/tmp" ||
          result.output.trim() === "/private/tmp",
      ).toBe(true);
    });

    test("returns correct ExecResult type shape", () => {
      const result: ExecResult = runShellCommand("echo typed");
      expect(typeof result.passed).toBe("boolean");
      expect(["passed", "failed", "timeout"]).toContain(result.status);
      expect(typeof result.output).toBe("string");
      expect(typeof result.duration).toBe("number");
    });

    test("handles command with no output", () => {
      const result = runShellCommand("true");
      expect(result.passed).toBe(true);
      expect(result.status).toBe("passed");
      // output may be empty string
      expect(typeof result.output).toBe("string");
    });

    test("detects timeout", () => {
      // Use a very short timeout to trigger timeout detection
      const result = runShellCommand("sleep 5", { timeout: 1 });
      expect(result.passed).toBe(false);
      expect(result.status).toBe("timeout");
      expect(result.output).toContain("timed out");
    });
  });
});
