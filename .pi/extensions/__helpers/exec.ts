/**
 * Shared shell command execution helper for Pi extensions.
 *
 * Provides a unified `runShellCommand` function that consolidates the
 * duplicated `execSync` wrappers in luca-harness.ts (L92-134) and
 * luca-tilldone.ts (L57-87).
 *
 * @security This module executes shell commands via `execSync`. Commands
 *   originate from developer-controlled config or LLM-provided input
 *   (Pi's permission layer requires user approval). See .pi/SECURITY-MODEL.md.
 *
 * Source: src/hooks/pi-extensions/__helpers/exec.ts
 */
import { execSync } from "child_process";

/**
 * Result of a shell command execution.
 */
export interface ExecResult {
  /** Whether the command succeeded (exit code 0) */
  passed: boolean;
  /** "passed", "failed", or "timeout" */
  status: "passed" | "failed" | "timeout";
  /** Truncated stdout+stderr output */
  output: string;
  /** Execution time in milliseconds */
  duration: number;
}

/**
 * Options for shell command execution.
 */
export interface ExecOptions {
  /** Working directory (default: process.cwd()) */
  cwd?: string;
  /** Timeout in seconds (default: 120) */
  timeout?: number;
  /** Maximum output characters to retain (default: 2000) */
  maxOutput?: number;
}

/**
 * Execute a shell command with timeout, output truncation, and structured result.
 *
 * Consolidates the shared pattern from luca-harness `runCheck` and
 * luca-tilldone `runCommand`:
 * - `execSync` with cwd, timeout, stdio pipe, utf-8 encoding
 * - Output truncation (configurable via maxOutput)
 * - Error handling: stdout + stderr concatenation on failure
 * - Timeout detection via duration comparison
 *
 * @security CRITICAL (accepted) -- execSync command injection vector.
 *   Commands originate from developer-controlled config or LLM-provided input
 *   (Pi's permission layer requires user approval). See .pi/SECURITY-MODEL.md.
 *
 * @param command - Shell command string to execute
 * @param options - Execution options (cwd, timeout, maxOutput)
 * @returns Structured execution result
 *
 * @example
 * ```typescript
 * // Basic usage
 * const result = runShellCommand("bun test");
 * if (result.passed) {
 *   console.log("Tests passed in", result.duration, "ms");
 * }
 *
 * // With options
 * const result = runShellCommand("bunx --bun tsc --noEmit", {
 *   cwd: "/path/to/project",
 *   timeout: 60,
 *   maxOutput: 1500,
 * });
 * ```
 */
export function runShellCommand(
  command: string,
  options?: ExecOptions,
): ExecResult {
  const cwd = options?.cwd ?? process.cwd();
  const timeout = options?.timeout ?? 120;
  const maxOutput = options?.maxOutput ?? 2000;

  const start = Date.now();
  try {
    const result = execSync(command, {
      cwd,
      timeout: timeout * 1000,
      stdio: ["pipe", "pipe", "pipe"],
      encoding: "utf-8",
    });
    return {
      passed: true,
      status: "passed",
      output: typeof result === "string" ? result.slice(-maxOutput) : "",
      duration: Date.now() - start,
    };
  } catch (err: any) {
    const duration = Date.now() - start;
    if (duration >= timeout * 1000 - 100) {
      return {
        passed: false,
        status: "timeout",
        output: `Command timed out after ${timeout}s`,
        duration,
      };
    }
    const output = (err.stdout || "") + "\n" + (err.stderr || "");
    return {
      passed: false,
      status: "failed",
      output: output.slice(-maxOutput),
      duration,
    };
  }
}
