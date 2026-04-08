/**
 * Doctor check orchestrator.
 *
 * Runs all registered doctor checks in parallel, optionally filtering
 * by scope. Reports results with pass/fail/warning icons and fix suggestions.
 */

import { logger } from "../logger";

import type { DoctorCheck, DoctorScope } from "./types";

/**
 * Execute all registered doctor checks, optionally filtered by scope.
 *
 * @param options - Execution options
 * @param options.verbose - Show detailed check information for passing checks
 * @param options.scope - Filter checks to a specific scope category
 * @returns Exit code: 0 for success (possibly with warnings), 1 for failures
 */
export async function executeDoctor(
  options: { verbose?: boolean; scope?: DoctorScope } = {},
): Promise<number> {
  const { verbose = false, scope } = options;
  logger.info("Running environment diagnostics...\n");

  // Import all checks
  const { bunRuntimeCheck } = await import("./checks/bun-runtime");
  const { muninndbHealthCheck } = await import("./checks/muninndb-health");

  const allChecks: DoctorCheck[] = [
    // Prerequisites
    bunRuntimeCheck,
    // Global
    muninndbHealthCheck,
  ];

  // Filter by scope if provided
  const checks = scope
    ? allChecks.filter((check) => check.scope === scope)
    : allChecks;

  if (checks.length === 0) {
    logger.warn(`No checks found for scope: ${scope}`);
    return 0;
  }

  const scopeLabel = scope ? ` (scope: ${scope})` : "";

  // Run all checks in parallel
  const results = await Promise.all(checks.map((check) => check.run()));

  // Count results
  const passCount = results.filter((r) => r.status === "pass").length;
  const failCount = results.filter((r) => r.status === "fail").length;
  const warningCount = results.filter((r) => r.status === "warning").length;

  // Display results
  logger.info(`Environment Diagnostics${scopeLabel}`);
  logger.info("=".repeat(50));

  for (const result of results) {
    const icon =
      result.status === "pass" ? "+" : result.status === "fail" ? "x" : "!";
    const logLine = `${icon} ${result.name}: ${result.message}`;

    if (result.status === "pass") {
      logger.success(logLine);
    } else if (result.status === "fail") {
      logger.error(logLine);
    } else {
      logger.warn(logLine);
    }

    if (result.details && (verbose || result.status !== "pass")) {
      logger.info(`  ${result.details}`);
    }
  }

  logger.info("");
  logger.info("=".repeat(50));
  logger.info(
    `Results: ${passCount} passing, ${failCount} failing, ${warningCount} warning(s)`,
  );

  // Show fix suggestions for failed checks
  const failedChecks = results.filter(
    (r) => r.status === "fail" && r.fixCommand,
  );

  if (failedChecks.length > 0) {
    logger.info("");
    logger.info("Suggested fixes:");
    logger.info("-".repeat(50));

    for (const check of failedChecks) {
      if (check.fixCommand) {
        logger.info(`  ${check.name}:`);
        logger.info(`  ${check.fixCommand}`);
      }
    }
  }

  logger.info("");

  // Return exit code
  if (failCount > 0) {
    if (!verbose) {
      logger.error("Some checks failed. Run with --verbose for more details.");
    } else {
      logger.error("Some checks failed.");
    }
    return 1;
  }

  if (warningCount > 0) {
    logger.warn("All checks passed with warnings.");
    return 0;
  }

  logger.success("All checks passed! Your environment is ready.");
  return 0;
}
