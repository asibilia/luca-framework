/**
 * Harness runner for the verification system.
 *
 * Reads configuration, executes checks via Bun.spawn, invokes parsers,
 * and returns structured HarnessResult. Can also be run as a standalone
 * CLI entry point.
 */

import type {
  HarnessConfig,
  HarnessResult,
  CheckResult,
  CheckConfig,
  MiddlewareContext,
  MiddlewarePipelineConfig,
} from "../__schemas/harness.schemas";
import {
  HarnessConfigSchema,
  DEFAULT_HARNESS_CONFIG,
  MiddlewareContextSchema,
} from "../__schemas/harness.schemas";
import { parserRegistry } from "../parsers";
import { sanitizeJsonParse } from "~/shared/__helpers/validation-utils";
import {
  composePipeline,
  resolveMiddleware,
  buildMiddlewareResult,
} from "./pipeline";
import { join } from "pathe";

const RAW_OUTPUT_MAX_LINES = 50;

export async function loadHarnessConfig(
  projectDir: string,
): Promise<HarnessConfig> {
  const configPath = join(projectDir, ".planning", "config.json");
  const configFile = Bun.file(configPath);

  if (await configFile.exists()) {
    try {
      const text = await configFile.text();
      const raw = sanitizeJsonParse(text) as Record<string, unknown>;
      if (raw.harness) {
        const result = HarnessConfigSchema.safeParse(raw.harness);
        if (result.success) {
          return result.data;
        }
        // Validation failed — fall through to defaults
      }
    } catch {
      // Invalid JSON — fall through to defaults
    }
  }

  return { ...DEFAULT_HARNESS_CONFIG };
}

async function runCheck(
  check: CheckConfig,
  projectDir: string,
): Promise<CheckResult> {
  const startTime = Date.now();

  try {
    const proc = Bun.spawn(["sh", "-c", check.command], {
      cwd: projectDir,
      stdout: "pipe",
      stderr: "pipe",
    });

    const timeoutMs = check.timeout * 1000;
    let timedOut = false;

    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill();
        reject(new Error("timeout"));
      }, timeoutMs);
      // Prevent timer from keeping the process alive in tests
      if (typeof timer === "object" && "unref" in timer) {
        (timer as NodeJS.Timeout).unref();
      }
    });

    let stdout = "";
    let stderr = "";
    let exitCode = 1;

    try {
      const [stdoutText, stderrText] = await Promise.race([
        Promise.all([
          new Response(proc.stdout).text(),
          new Response(proc.stderr).text(),
        ]),
        timeoutPromise,
      ]);
      stdout = stdoutText;
      stderr = stderrText;
      exitCode = await proc.exited;
    } catch (e) {
      if (timedOut) {
        return {
          name: check.name,
          status: "timeout",
          exitCode: -1,
          errors: [],
          warnings: [],
          rawOutput: `Command timed out after ${check.timeout}s`,
          duration: Date.now() - startTime,
        };
      }
      throw e;
    }

    const combinedOutput = stdout + (stderr ? "\n" + stderr : "");
    const outputLines = combinedOutput.split("\n");
    const truncatedOutput = outputLines.slice(-RAW_OUTPUT_MAX_LINES).join("\n");

    const parserThunk =
      parserRegistry[check.parser] ?? parserRegistry["generic"]!;
    const parser = parserThunk();
    const allParsed = parser(combinedOutput);
    const errors = allParsed.filter((e) => e.severity === "error");
    const warnings = allParsed.filter((e) => e.severity === "warning");

    return {
      name: check.name,
      status: exitCode === 0 ? "passed" : "failed",
      exitCode,
      errors,
      warnings,
      rawOutput: truncatedOutput,
      duration: Date.now() - startTime,
    };
  } catch (e) {
    return {
      name: check.name,
      status: "skipped",
      exitCode: -1,
      errors: [],
      warnings: [],
      rawOutput: `Failed to execute: ${(e as Error).message}`,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Wrap a check execution with the middleware pipeline when configured.
 *
 * If no middleware is configured or the pipeline is disabled, calls runCheck
 * directly. On pipeline error, falls back to direct runCheck execution so
 * middleware failures never break the harness.
 *
 * @param check - The check configuration to execute
 * @param projectDir - Working directory for the check
 * @param pipelineConfig - Optional middleware pipeline configuration
 * @returns CheckResult, optionally enriched with middlewareResult metadata
 */
async function runCheckWithMiddleware(
  check: CheckConfig,
  projectDir: string,
  pipelineConfig?: MiddlewarePipelineConfig,
): Promise<CheckResult> {
  // No pipeline or pipeline disabled — direct execution
  if (!pipelineConfig?.enabled || !pipelineConfig.middleware.length) {
    return runCheck(check, projectDir);
  }

  const middlewares = resolveMiddleware(pipelineConfig.middleware);

  // No middleware resolved (all disabled/unknown) — direct execution
  if (middlewares.length === 0) {
    return runCheck(check, projectDir);
  }

  const pipelineStartTime = performance.now();

  try {
    const ctxResult = MiddlewareContextSchema.safeParse({
      check,
      projectDir,
      metadata: {},
    });
    if (!ctxResult.success) {
      // Fall back to direct execution — middleware context is computed, not external input,
      // but safeParse prevents unexpected throws
      console.warn(
        "[harness] Failed to build middleware context:",
        ctxResult.error.message,
      );
      return runCheck(check, projectDir);
    }
    const ctxInput = ctxResult.data;

    const pipeline = composePipeline(middlewares);

    // The core executor is the innermost function — it calls runCheck
    const coreExecutor = async (
      _ctx: MiddlewareContext,
    ): Promise<CheckResult> => runCheck(check, projectDir);

    const result = await pipeline(ctxInput, coreExecutor);
    const middlewareResult = buildMiddlewareResult(ctxInput, pipelineStartTime);

    return { ...result, middlewareResult };
  } catch (e) {
    // Pipeline error — fall back to direct execution (never breaks harness)
    console.warn(
      `[harness] Middleware pipeline error for ${check.name}: ${(e as Error).message} -- falling back to direct execution`,
    );
    return runCheck(check, projectDir);
  }
}

export async function runHarness(
  config: HarnessConfig,
  projectDir: string,
): Promise<HarnessResult> {
  const startTime = Date.now();
  const enabledChecks = config.checks.filter((c) => c.enabled);
  const results: CheckResult[] = [];

  for (const check of enabledChecks) {
    const result = await runCheckWithMiddleware(
      check,
      projectDir,
      config.middlewarePipeline,
    );
    results.push(result);
    if (config.failFast && result.status === "failed") break;
  }

  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
  const totalWarnings = results.reduce((sum, r) => sum + r.warnings.length, 0);
  const overallStatus = results.every(
    (r) => r.status === "passed" || r.status === "skipped",
  )
    ? "passed"
    : "failed";

  const result: HarnessResult = {
    status: overallStatus,
    checks: results,
    totalErrors,
    totalWarnings,
    duration: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  };

  // Persist result for observer consumption
  try {
    const resultPath = join(projectDir, ".planning", "harness-result.json");
    const snakeCaseResult = {
      status: result.status,
      checks: result.checks.map((c) => ({
        name: c.name,
        status: c.status,
        exit_code: c.exitCode,
        errors: c.errors,
        warnings: c.warnings,
        raw_output: c.rawOutput,
        duration: c.duration,
      })),
      total_errors: result.totalErrors,
      total_warnings: result.totalWarnings,
      duration: result.duration,
      timestamp: result.timestamp,
    };
    await Bun.write(resultPath, JSON.stringify(snakeCaseResult, null, 2));
  } catch {
    // Best-effort persistence -- do not fail the harness run
  }

  return result;
}

// CLI entry point
if (import.meta.main) {
  const projectDir =
    process.argv.find((a) => a.startsWith("--project-dir="))?.split("=")[1] ??
    ".";
  const config = await loadHarnessConfig(projectDir);
  const result = await runHarness(config, projectDir);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.status === "passed" ? 0 : 1);
}
