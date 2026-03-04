/**
 * Output-capture middleware for the harness verification pipeline.
 *
 * After a check executes, saves the raw output to a timestamped file
 * in .planning/harness-runs/. This provides historical harness output
 * for the observer dashboard and debugging.
 *
 * @returns CheckMiddleware function
 *
 * @example
 * ```typescript
 * import { createOutputCaptureMiddleware } from "~/harness/middleware/output-capture";
 *
 * const capture = createOutputCaptureMiddleware();
 * const result = await capture(ctx, next);
 * // ctx.outputPath now contains the path to the saved output file
 * // ctx.metadata contains output_capture_path and output_capture_size_bytes
 * ```
 */

import type {
  CheckMiddleware,
  MiddlewareContext,
  CheckResult,
} from "~/harness/__schemas/harness.schemas";
import { join } from "path";

const HARNESS_RUNS_DIR = ".planning/harness-runs";

/**
 * Generate a filesystem-safe timestamp string for output file naming.
 *
 * @returns Timestamp string in format YYYYMMDD-HHmmss-SSS
 */
function generateTimestamp(): string {
  const now = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
    "-",
    pad(now.getMilliseconds(), 3),
  ].join("");
}

/**
 * Create an output-capture middleware that persists check output to disk.
 *
 * The middleware runs after the check completes (post-processing pattern),
 * writing the raw output to a timestamped file under .planning/harness-runs/.
 * Each file includes a metadata header with check name, command, status,
 * exit code, duration, and error/warning counts.
 *
 * If writing fails, the error is captured in metadata but does not
 * prevent the result from being returned -- output capture is best-effort.
 *
 * @returns A CheckMiddleware function that captures output to disk
 */
export function createOutputCaptureMiddleware(): CheckMiddleware {
  return async (
    ctx: MiddlewareContext,
    next: (ctx: MiddlewareContext) => Promise<CheckResult>,
  ): Promise<CheckResult> => {
    const result = await next(ctx);

    // Only capture output if there is content to save
    if (!result.rawOutput || result.rawOutput.length === 0) {
      return result;
    }

    try {
      const runsDir = join(ctx.projectDir, HARNESS_RUNS_DIR);
      await Bun.$`mkdir -p ${runsDir}`.quiet();

      const timestamp = generateTimestamp();
      const safeName = ctx.check.name.replace(/[^a-z0-9-]/gi, "-");
      const fileName = `${safeName}-${timestamp}.txt`;
      const outputPath = join(runsDir, fileName);

      const header = [
        `# Harness Check Output`,
        `# Check: ${ctx.check.name}`,
        `# Command: ${ctx.check.command}`,
        `# Status: ${result.status}`,
        `# Exit Code: ${result.exitCode}`,
        `# Duration: ${result.duration}ms`,
        `# Timestamp: ${new Date().toISOString()}`,
        `# Errors: ${result.errors.length}`,
        `# Warnings: ${result.warnings.length}`,
        ``,
      ].join("\n");

      await Bun.write(outputPath, header + result.rawOutput);

      ctx.outputPath = outputPath;
      ctx.metadata = {
        ...ctx.metadata,
        output_capture_path: outputPath,
        output_capture_size_bytes: header.length + result.rawOutput.length,
      };
    } catch {
      ctx.metadata = {
        ...ctx.metadata,
        output_capture_error: "Failed to write output file",
      };
    }

    return result;
  };
}
