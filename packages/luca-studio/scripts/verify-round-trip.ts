#!/usr/bin/env bun
/**
 * Round-trip verification gate for all entity files.
 *
 * Discovers all `.agent.ts`, `.skill.ts`, and `.rule.ts` files under `src/`,
 * round-trips each (read -> generate -> compare), and reports results.
 *
 * Exit code 0 = all files pass, exit code 1 = at least one failure.
 *
 * The 8 interpolation agents are individually tracked and highlighted in
 * the output to confirm they preserve `${CONSTANT_NAME}` references.
 *
 * @example
 * ```bash
 * bun packages/luca-studio/scripts/verify-round-trip.ts
 * ```
 */
import { roundTripEntityFile } from "../lib/ts-round-trip.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The 8 agents known to use ${CONSTANT_NAME} interpolation. */
const INTERPOLATION_AGENTS = new Set([
  "code-architect",
  "code-simplifier",
  "dx-advocate",
  "performance-auditor",
  "security-auditor",
  "lu-completeness-reviewer",
  "lu-accuracy-reviewer",
  "lu-actionability-reviewer",
]);

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const startTime = Date.now();

  // Discover all entity files
  const patterns = [
    "src/agents/**/*.agent.ts",
    "src/skills/**/*.skill.ts",
    "src/rules/**/*.rule.ts",
  ];

  const files: string[] = [];
  for (const pattern of patterns) {
    const glob = new Bun.Glob(pattern);
    for await (const f of glob.scan(".")) {
      files.push(f);
    }
  }
  files.sort();

  console.log(`\nRound-trip verification gate`);
  console.log(`${"=".repeat(60)}`);
  console.log(`Found ${files.length} entity files\n`);

  // Track results
  let passCount = 0;
  let failCount = 0;
  const failures: Array<{ file: string; error: string }> = [];
  const interpolationResults: Array<{
    file: string;
    agent: string;
    pass: boolean;
  }> = [];

  // Run round-trip on each file
  for (const file of files) {
    const result = await roundTripEntityFile(file);

    // Check if this is an interpolation agent
    const basename =
      file
        .split("/")
        .pop()
        ?.replace(/\.\w+\.ts$/, "") ?? "";
    const isInterpolationAgent = INTERPOLATION_AGENTS.has(basename);

    if (result.success && result.identical) {
      passCount++;
      if (isInterpolationAgent) {
        interpolationResults.push({ file, agent: basename, pass: true });
      }
    } else {
      failCount++;
      const errorMsg = result.error ?? result.diff ?? "Unknown error";
      failures.push({ file, error: errorMsg });
      if (isInterpolationAgent) {
        interpolationResults.push({ file, agent: basename, pass: false });
      }
    }
  }

  // Report results
  console.log(`Results: ${passCount}/${files.length} pass, ${failCount} fail`);
  console.log(`${"=".repeat(60)}`);

  // Report interpolation agents specifically
  if (interpolationResults.length > 0) {
    console.log(
      `\nInterpolation agents (${INTERPOLATION_AGENTS.size} expected):`,
    );
    for (const r of interpolationResults) {
      const status = r.pass ? "PASS" : "FAIL";
      console.log(`  [${status}] ${r.agent} (${r.file})`);
    }
    const interpPass = interpolationResults.filter((r) => r.pass).length;
    console.log(
      `  ${interpPass}/${INTERPOLATION_AGENTS.size} interpolation agents verified`,
    );
  }

  // Report failures
  if (failures.length > 0) {
    console.log(`\nFailures:\n`);
    for (const f of failures) {
      console.log(`  FAIL: ${f.file}`);
      // Indent multi-line error messages
      for (const line of f.error.split("\n")) {
        console.log(`    ${line}`);
      }
      console.log();
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\nCompleted in ${elapsed}s`);

  // Summary line
  if (failCount === 0) {
    console.log(
      `\n${passCount}/${files.length} files pass round-trip verification. All clear.`,
    );
  } else {
    console.log(
      `\n${failCount}/${files.length} files FAILED round-trip verification.`,
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Verification script error:", err);
  process.exit(1);
});
