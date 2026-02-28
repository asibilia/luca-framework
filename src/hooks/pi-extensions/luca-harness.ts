/**
 * Luca Harness Extension for Pi
 *
 * Provides verification capabilities to Pi's LLM via the Luca harness
 * system. Registers a `luca_verify` tool that runs test/typecheck checks
 * and returns structured results. The Verify widget is rendered by
 * luca-widgets.ts when it intercepts luca_verify tool_result events.
 *
 * @security This extension executes shell commands via `execSync`. Commands
 *   originate from `.planning/config.json` (developer-controlled). Primary
 *   mitigation: Pi's permission layer requires user approval for every tool
 *   invocation. Full security model: .pi/SECURITY-MODEL.md
 *
 * Source: src/hooks/pi-extensions/luca-harness.ts
 * Deployed to: .pi/extensions/luca-harness.ts
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";

import { runShellCommand } from "./__helpers/exec";
import { createJsonResponse, createTextResponse } from "./__helpers/response";

/**
 * Pi extension: Verification harness runner.
 *
 * Registers the luca_verify tool that runs configured quality checks
 * (test, typecheck, lint, build) from .planning/config.json and returns
 * structured pass/fail results with error output and duration.
 *
 * @param pi - Pi ExtensionAPI instance
 */
export default function lucaHarness(pi: any) {
  const cwd = process.cwd();
  const planningDir = join(cwd, ".planning");
  const configPath = join(planningDir, "config.json");

  /**
   * Load harness configuration from .planning/config.json.
   *
   * Reads the `harness` section of the planning config and merges
   * with sensible defaults. Falls back entirely to defaults if the
   * config file is missing, unparseable, or lacks a harness section.
   *
   * @returns Harness config with enabled flag, max fix iterations, and check definitions
   */
  function loadConfig(): {
    enabled: boolean;
    maxFixIterations: number;
    checks: Array<{
      name: string;
      command: string;
      enabled: boolean;
      timeout: number;
    }>;
  } {
    const defaults = {
      enabled: true,
      maxFixIterations: 3,
      checks: [
        {
          name: "test",
          command: "bun test",
          enabled: true,
          timeout: 120,
        },
        {
          name: "typecheck",
          command: "bunx --bun tsc --noEmit",
          enabled: true,
          timeout: 60,
        },
      ],
    };

    if (!existsSync(configPath)) return defaults;

    try {
      const raw = readFileSync(configPath, "utf-8");
      const config = JSON.parse(raw);
      const harness = config?.harness;
      if (!harness) return defaults;

      return {
        enabled: harness.enabled ?? defaults.enabled,
        maxFixIterations: harness.maxFixIterations ?? defaults.maxFixIterations,
        checks: (harness.checks ?? defaults.checks).filter(
          (c: any) => c.enabled !== false,
        ),
      };
    } catch {
      return defaults;
    }
  }

  /**
   * Run a named verification check using the shared shell command executor.
   *
   * Adapts the generic runShellCommand result to include the check name
   * for structured harness reporting.
   *
   * @param name - Check name (e.g., "test", "typecheck")
   * @param command - Shell command to execute
   * @param timeout - Timeout in seconds
   * @returns Named execution result with status, output, and duration
   *
   * @security CRITICAL (accepted) — execSync command injection vector.
   *   - `command` parameter originates from `.planning/config.json`, which is
   *     developer-controlled and checked into version control.
   *   - `checks` parameter (on the tool) filters by check **name** only
   *     (e.g., "test", "typecheck"), not by arbitrary command strings. The LLM
   *     cannot inject commands through the checks parameter.
   *   - Pi's permission layer requires explicit user approval before every tool
   *     invocation, including the commands executed here.
   *   - Output is truncated to 2000 chars; timeout kills runaway processes.
   *   - Full security model: .pi/SECURITY-MODEL.md
   */
  function runCheck(
    name: string,
    command: string,
    timeout: number,
  ): {
    name: string;
    status: "passed" | "failed" | "timeout";
    output: string;
    duration: number;
  } {
    const result = runShellCommand(command, { cwd, timeout, maxOutput: 2000 });
    return { name, ...result };
  }

  // Tool: Run verification harness
  pi.registerTool({
    name: "luca_verify",
    label: "Run Verification",
    description:
      "Run Luca verification harness (test + typecheck). Returns structured results with pass/fail status, error output, and duration for each check. Use after making code changes to validate correctness.",
    parameters: {
      type: "object",
      properties: {
        checks: {
          type: "string",
          description:
            "Comma-separated list of checks to run (test, typecheck). Defaults to all enabled checks.",
        },
      },
    },

    /**
     * Render a human-readable summary of the tool call arguments.
     * Shown in Pi's TUI when the tool is invoked.
     */
    renderCall(args: { checks?: string }, _theme: any) {
      const checks = args.checks ?? "all enabled";
      return `Running verification: ${checks}`;
    },

    /**
     * Render a human-readable summary of the tool result.
     * Shown in Pi's TUI after the tool completes.
     */
    renderResult(result: any, _opts: any, _theme: any) {
      try {
        const data = JSON.parse(result.content?.[0]?.text ?? "{}");
        const icon = data.status === "passed" ? "PASS" : "FAIL";
        const checks = (data.checks ?? [])
          .map(
            (c: any) =>
              `  ${c.status === "passed" ? "+" : "x"} ${c.name} (${c.duration}ms)`,
          )
          .join("\n");
        return `${icon} Verification ${data.status}\n${checks}\nTotal: ${data.total_duration}ms`;
      } catch {
        return "Verification complete";
      }
    },

    async execute(
      _toolCallId: string,
      params: { checks?: string },
      signal: AbortSignal | undefined,
      onUpdate:
        | ((update: { content: Array<{ type: "text"; text: string }> }) => void)
        | undefined,
      ctx: any,
    ) {
      const config = loadConfig();

      if (!config.enabled) {
        return createTextResponse("Harness is disabled in config");
      }

      // Filter checks if specific ones requested
      let checksToRun = config.checks;
      if (params.checks) {
        const requested = params.checks.split(",").map((c) => c.trim());
        checksToRun = config.checks.filter((c) => requested.includes(c.name));
      }

      // Sequential execution with streaming progress via onUpdate
      const results: Array<{
        name: string;
        status: "passed" | "failed" | "timeout";
        output: string;
        duration: number;
      }> = [];

      for (const check of checksToRun) {
        // Check for abort between iterations
        if (signal?.aborted) break;

        // Stream progress before each check
        onUpdate?.({
          content: [{ type: "text", text: `Running check: ${check.name}...` }],
        });

        const result = runCheck(check.name, check.command, check.timeout);
        results.push(result);

        // Stream result after each check
        onUpdate?.({
          content: [
            {
              type: "text",
              text: `${check.name}: ${result.status} (${result.duration}ms)`,
            },
          ],
        });
      }

      const allPassed = results.every((r) => r.status === "passed");
      const summary = {
        status: allPassed ? "passed" : "failed",
        checks: results,
        total_duration: results.reduce((sum, r) => sum + r.duration, 0),
      };

      // Toast notification for verification results
      if (ctx?.ui?.notify) {
        const level = allPassed ? "info" : "error";
        const msg = allPassed
          ? `Verification passed (${results.length} checks, ${summary.total_duration}ms)`
          : `Verification FAILED: ${results
              .filter((r) => r.status !== "passed")
              .map((r) => r.name)
              .join(", ")}`;
        ctx.ui.notify(msg, level);
      }

      return createJsonResponse(summary);
    },
  });

  // NOTE: No auto-verify on agent_end. Verification is triggered explicitly
  // via the luca_verify tool (which renders the Verify widget) or by the
  // pre-commit hook. Auto-running on every agent_end is wasteful for
  // read-only sessions (todo-check, progress, etc.) and cannot reliably
  // distinguish "changes made by this session" from pre-existing uncommitted
  // work in the tree.
}
