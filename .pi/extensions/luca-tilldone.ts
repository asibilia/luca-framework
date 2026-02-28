/**
 * Luca TillDone Extension for Pi
 *
 * Provides task-gated work loops — retry commands or checks until they
 * pass, with configurable max iterations, delay, and exit conditions.
 * Implements the "tilldone" pattern for verification-driven development.
 *
 * @security This extension executes shell commands via `execSync`. Commands
 *   are LLM-provided and arbitrary by design. Primary mitigation: Pi's
 *   permission layer requires user approval for every tool invocation.
 *   Full security model: .pi/SECURITY-MODEL.md
 *
 * Source: src/hooks/pi-extensions/luca-tilldone.ts
 * Deployed to: .pi/extensions/luca-tilldone.ts
 */
import { runShellCommand } from "./__helpers/exec";
import { createRegistry } from "./__helpers/registry";
import { createJsonResponse, createTextResponse } from "./__helpers/response";

/** Active loop state. */
interface LoopState {
  name: string;
  command: string;
  maxIterations: number;
  currentIteration: number;
  status: "running" | "passed" | "failed" | "stopped";
  history: Array<{
    iteration: number;
    status: "passed" | "failed";
    output: string;
    duration: number;
  }>;
}

/**
 * Output truncation limit for tilldone loop results.
 * See also: __helpers/exec.ts DEFAULT_MAX_OUTPUT (2000),
 *           __helpers/spawn.ts MAX_OUTPUT_CHARS (8192).
 */
const MAX_OUTPUT_LENGTH = 1500;

/**
 * Pi extension: Retry-until-success command loops.
 *
 * Registers tools for running a command repeatedly until it succeeds,
 * checking loop status, and resetting loops. Used for verification-driven
 * workflows like "run tests until they pass" with configurable max
 * iterations and timeout per attempt.
 *
 * @param pi - Pi ExtensionAPI instance
 */
export default function lucaTilldone(pi: any) {
  const cwd = process.cwd();

  /** Active loops. */
  const loops = createRegistry<LoopState>("loops");

  /**
   * Run a shell command with the extension's working directory and output limits.
   *
   * Thin wrapper around runShellCommand that applies the extension-scoped
   * cwd and MAX_OUTPUT_LENGTH settings.
   *
   * @param command - Shell command to execute
   * @param timeout - Timeout in seconds
   * @returns Execution result with passed, output, and duration
   *
   * @security CRITICAL (accepted) — execSync command injection vector.
   *   - `command` parameter is LLM-provided and arbitrary **by design**. This
   *     tool exists to run whatever command the LLM specifies as part of a
   *     verification-driven retry loop.
   *   - Pi's permission layer is the primary mitigation — every tool invocation
   *     requires explicit user approval before execution.
   *   - Output is truncated to MAX_OUTPUT_LENGTH (1500 chars) to limit
   *     exfiltration risk.
   *   - Timeout (default 120s) prevents runaway processes.
   *   - Iteration cap (default 5) prevents infinite retry loops.
   *   - Full security model: .pi/SECURITY-MODEL.md
   */
  function runCommand(
    command: string,
    timeout: number,
  ): {
    passed: boolean;
    output: string;
    duration: number;
  } {
    return runShellCommand(command, {
      cwd,
      timeout,
      maxOutput: MAX_OUTPUT_LENGTH,
    });
  }

  // Tool: Run a command in a retry loop until it passes
  pi.registerTool({
    name: "luca_tilldone",
    label: "Run Till Done",
    description:
      "Run a command repeatedly until it succeeds (exit code 0). Returns the result of each attempt. Use for verification-driven loops like 'run tests until they pass'. Does NOT auto-fix — returns failure output so the LLM can fix issues between iterations.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "Loop name for tracking (e.g., 'test-loop', 'typecheck-loop')",
        },
        command: {
          type: "string",
          description:
            "Shell command to run (e.g., 'bun test', 'bunx --bun tsc --noEmit')",
        },
        max_iterations: {
          type: "number",
          description: "Maximum retry attempts (default: 5)",
        },
        timeout: {
          type: "number",
          description: "Timeout per attempt in seconds (default: 120)",
        },
      },
      required: ["name", "command"],
    },
    async execute(
      _toolCallId: string,
      params: {
        name: string;
        command: string;
        max_iterations?: number;
        timeout?: number;
      },
      _signal: AbortSignal | undefined,
      onUpdate:
        | ((update: { content: Array<{ type: "text"; text: string }> }) => void)
        | undefined,
      _ctx: any,
    ) {
      // Hard caps: max 10 iterations, 300s timeout per attempt
      const maxIterations = Math.min(params.max_iterations ?? 5, 10);
      const timeout = Math.min(params.timeout ?? 120, 300);

      // Run single attempt (LLM controls the loop by calling repeatedly)
      const existingLoop = loops.get(params.name);
      const iteration = existingLoop ? existingLoop.currentIteration + 1 : 1;

      if (iteration > maxIterations) {
        return createJsonResponse({
          name: params.name,
          status: "failed",
          message: `Max iterations (${maxIterations}) reached`,
          total_attempts: iteration - 1,
        });
      }

      // Stream progress before running check
      onUpdate?.({
        content: [
          {
            type: "text",
            text: `Iteration ${iteration}/${maxIterations}: running ${params.command.slice(0, 60)}...`,
          },
        ],
      });

      const result = runCommand(params.command, timeout);

      // Stream result after running check
      onUpdate?.({
        content: [
          {
            type: "text",
            text: `Iteration ${iteration}: ${result.passed ? "passed" : "failed"} (${result.duration}ms)`,
          },
        ],
      });

      // Update loop state
      const loopState: LoopState = existingLoop ?? {
        name: params.name,
        command: params.command,
        maxIterations,
        currentIteration: 0,
        status: "running",
        history: [],
      };

      loopState.currentIteration = iteration;
      loopState.history.push({
        iteration,
        status: result.passed ? "passed" : "failed",
        output: result.output,
        duration: result.duration,
      });

      if (result.passed) {
        loopState.status = "passed";
      } else if (iteration >= maxIterations) {
        loopState.status = "failed";
      }

      loops.set(params.name, loopState);

      return createJsonResponse({
        name: params.name,
        iteration,
        max_iterations: maxIterations,
        status: result.passed ? "passed" : "failed",
        loop_status: loopState.status,
        remaining: maxIterations - iteration,
        output: result.output,
        duration_ms: result.duration,
        instructions: result.passed
          ? "Command succeeded. Loop complete."
          : `Command failed (attempt ${iteration}/${maxIterations}). Fix the issues shown in the output, then call luca_tilldone again with the same name to retry.`,
      });
    },
  });

  // Tool: Get loop status
  pi.registerTool({
    name: "luca_loop_status",
    label: "Loop Status",
    description:
      "Get the status of a tilldone loop, including iteration count, pass/fail history, and remaining attempts.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Loop name (omit to list all loops)",
        },
      },
    },
    async execute(_toolCallId: string, params: { name?: string }) {
      if (params.name) {
        const loop = loops.get(params.name);
        if (!loop) {
          return createTextResponse(`Loop "${params.name}" not found`);
        }
        return createJsonResponse({
          name: loop.name,
          command: loop.command,
          status: loop.status,
          iteration: loop.currentIteration,
          max_iterations: loop.maxIterations,
          history: loop.history.map((h) => ({
            iteration: h.iteration,
            status: h.status,
            duration_ms: h.duration,
          })),
        });
      }

      // List all loops
      const allLoops = loops.values().map((l) => ({
        name: l.name,
        status: l.status,
        progress: `${l.currentIteration}/${l.maxIterations}`,
        passed: l.history.filter((h) => h.status === "passed").length > 0,
      }));

      return createJsonResponse(allLoops);
    },
  });

  // Tool: Reset/stop a loop
  pi.registerTool({
    name: "luca_loop_reset",
    label: "Reset Loop",
    description: "Reset or stop a tilldone loop, clearing its iteration state.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Loop name to reset",
        },
      },
      required: ["name"],
    },
    async execute(_toolCallId: string, params: { name: string }) {
      const loop = loops.get(params.name);
      if (!loop) {
        return createTextResponse(`Loop "${params.name}" not found`);
      }

      const previousStatus = loop.status;
      loops.delete(params.name);

      return createTextResponse(
        `Loop "${params.name}" reset (was: ${previousStatus}, ${loop.currentIteration} iterations)`,
      );
    },
  });
}
