/**
 * Compatibility report orchestration for CLI usage.
 *
 * Provides a single entry-point function that runs the full
 * emit -> validate -> aggregate -> write JSON -> print summary pipeline
 * across all registered adapters. Produces both a machine-readable
 * `dist/compatibility-report.json` and a human-readable terminal summary.
 *
 * @module
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import type {
  AggregatedReport,
  CompatibilityReport,
} from "../__schemas/compatibility-report.schemas";
import type { EmitResult } from "../__schemas/adapter.schemas";
import { listRegisteredAdapters } from "./adapter-registry";
import {
  validateCursorOutput,
  validateWindsurfOutput,
  validateVscodeOutput,
  aggregateReports,
} from "./compatibility-validator";

// ---------------------------------------------------------------------------
// Validator routing map
// ---------------------------------------------------------------------------

/**
 * Maps adapter names to their per-adapter validation functions.
 *
 * Adapters whose names are not in this map will be skipped with a
 * warning during validation (emit results are still collected).
 */
const VALIDATOR_MAP: Record<
  string,
  (emitResult: EmitResult) => Promise<CompatibilityReport>
> = {
  cursor: validateCursorOutput,
  windsurf: validateWindsurfOutput,
  vscode: validateVscodeOutput,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a compatibility report across all registered adapters.
 *
 * Orchestrates the full pipeline:
 * 1. List all registered adapters
 * 2. Call `adapter.emit(projectRoot)` on each
 * 3. Skip validation for adapters that emit zero files
 * 4. Route each EmitResult to the correct per-adapter validator
 * 5. Aggregate all per-adapter reports
 * 6. Write aggregated JSON to `dist/compatibility-report.json`
 * 7. Print a per-adapter status summary to stdout
 *
 * Errors from individual adapters (emit or validation) are logged to
 * stderr and do not halt the pipeline. The returned report will only
 * include adapters that succeeded.
 *
 * @param projectRoot - Absolute path to the project root directory
 * @returns The aggregated compatibility report across all adapters
 *
 * @example
 * ```typescript
 * import "~/adapters/__helpers/register-builtins";
 * import { generateCompatibilityReport } from "~/adapters";
 *
 * const report = await generateCompatibilityReport("/path/to/project");
 * console.log(report.adapters.length); // Number of adapter reports
 * ```
 */
export async function generateCompatibilityReport(
  projectRoot: string,
): Promise<AggregatedReport> {
  const adapters = listRegisteredAdapters();
  const reports: CompatibilityReport[] = [];

  for (const adapter of adapters) {
    const adapterName = adapter.config.name;

    // --- Emit phase ---
    let emitResult: EmitResult;
    try {
      emitResult = await adapter.emit(projectRoot);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[compatibility-report] Adapter '${adapterName}' emit failed: ${message}`,
      );
      continue;
    }

    // Skip validation for adapters that emitted zero files
    if (emitResult.filesPaths.length === 0) {
      continue;
    }

    // --- Validation phase ---
    const validator = VALIDATOR_MAP[adapterName];
    if (!validator) {
      console.error(
        `[compatibility-report] No validator for adapter '${adapterName}', skipping validation`,
      );
      continue;
    }

    try {
      const report = await validator(emitResult);
      reports.push(report);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[compatibility-report] Adapter '${adapterName}' validation failed: ${message}`,
      );
    }
  }

  // --- Aggregation phase ---
  const aggregated = aggregateReports(reports);

  // --- Write JSON phase ---
  const distDir = join(projectRoot, "dist");
  await mkdir(distDir, { recursive: true });
  const outputPath = join(distDir, "compatibility-report.json");
  await Bun.write(outputPath, JSON.stringify(aggregated, null, 2));

  // --- Stdout summary ---
  for (const report of aggregated.adapters) {
    const status = report.fully_compatible ? "COMPATIBLE" : "DEGRADED";
    console.log(
      `${report.adapter_id}: ${status} (${report.total_warnings} warnings)`,
    );
  }

  return aggregated;
}
