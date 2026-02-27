/**
 * Luca Harness Extension for Pi
 *
 * Provides verification capabilities to Pi's LLM via the Luca harness
 * system. Registers a `luca_verify` tool that runs test/typecheck checks
 * and auto-triggers verification at agent_end events.
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

export default function lucaHarness(pi: any) {
  const cwd = process.cwd();
  const planningDir = join(cwd, ".planning");
  const configPath = join(planningDir, "config.json");

  /**
   * Load harness configuration from .planning/config.json.
   * Falls back to defaults if config is missing or invalid.
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
   * Run a single check command and return structured results.
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
    async execute(_toolCallId: string, params: { checks?: string }) {
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

      const results = checksToRun.map((check) =>
        runCheck(check.name, check.command, check.timeout),
      );

      const allPassed = results.every((r) => r.status === "passed");
      const summary = {
        status: allPassed ? "passed" : "failed",
        checks: results,
        total_duration: results.reduce((sum, r) => sum + r.duration, 0),
      };

      return createJsonResponse(summary);
    },
  });

  // Auto-verify at agent_end
  pi.on("agent_end", async (_event: any, ctx: any) => {
    const config = loadConfig();
    if (!config.enabled) return;

    // Run quick verification (test + typecheck)
    const results = config.checks.map((check) =>
      runCheck(check.name, check.command, check.timeout),
    );

    const allPassed = results.every((r) => r.status === "passed");
    const failedChecks = results.filter((r) => r.status !== "passed");

    if (allPassed) {
      if (ctx?.ui?.setStatus) {
        ctx.ui.setStatus("luca-harness", "All checks passed");
      }
    } else {
      const failNames = failedChecks.map((c) => c.name).join(", ");
      if (ctx?.ui?.setStatus) {
        ctx.ui.setStatus("luca-harness", `FAILED: ${failNames}`);
      }

      // Surface failures to the LLM for auto-fix
      if (ctx?.addMessage) {
        const errorSummary = failedChecks
          .map(
            (c) =>
              `### ${c.name} (${c.status})\n\`\`\`\n${c.output.slice(-500)}\n\`\`\``,
          )
          .join("\n\n");

        ctx.addMessage(
          "system",
          `Luca verification failed. Please fix the following issues:\n\n${errorSummary}`,
        );
      }
    }
  });
}
