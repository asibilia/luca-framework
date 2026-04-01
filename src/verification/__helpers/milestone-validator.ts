/**
 * Deterministic milestone validator CLI.
 *
 * Aggregates `verification-result.json` files from phase directories
 * to produce a machine-readable milestone verdict. Zero LLM dependency --
 * pure data aggregation with Zod validation.
 *
 * Exit codes:
 * - 0: milestone PASSED (all verified phases passed, zero blocking gaps)
 * - 1: milestone has ISSUES (any phase has ISSUES or any blocking gap)
 * - 2: validation/parse error (invalid JSON, schema mismatch)
 *
 * @example
 * ```bash
 * bun src/verification/__helpers/milestone-validator.ts \
 *   --phases=.planning/phases/258-foo,.planning/phases/259-bar
 * ```
 *
 * @module milestone-validator
 */

import { PhaseVerificationResultSchema } from "../__schemas/verification.schemas";

import type { MilestoneVerdict } from "../__schemas/verification.schemas";

/* -------------------------------------------------------------------------- */
/*  Argument parsing                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Parse --phases=dir1,dir2,... from process.argv.
 *
 * @returns Array of phase directory paths, or null if --help was requested.
 */
const parseArgs = (
  argv: string[],
): { phases: string[] } | { help: true } | { error: string } => {
  const phasesArg = argv.find((a) => a.startsWith("--phases="));

  if (argv.includes("--help") || argv.includes("-h")) {
    return { help: true };
  }

  if (!phasesArg) {
    return {
      error:
        "Missing required argument: --phases=dir1,dir2,...\n" +
        "Usage: bun src/verification/__helpers/milestone-validator.ts --phases=.planning/phases/258-foo,.planning/phases/259-bar",
    };
  }

  const rawValue = phasesArg.slice("--phases=".length);
  const phases = rawValue
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  if (phases.length === 0) {
    return { error: "No phase directories provided after --phases=" };
  }

  return { phases };
};

/* -------------------------------------------------------------------------- */
/*  Core validation logic                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Validate a milestone by aggregating verification-result.json from
 * each phase directory.
 *
 * This function is intentionally deterministic: no LLM calls, no
 * heuristics. It reads JSON files, validates with Zod, and aggregates.
 *
 * @param phaseDirs - Array of phase directory paths to aggregate
 * @returns MilestoneVerdict with aggregated results
 */
export const validateMilestone = async (
  phaseDirs: string[],
): Promise<MilestoneVerdict> => {
  let phasesVerified = 0;
  const phasesMissing: string[] = [];
  let phasesPassed = 0;
  let phasesWithIssues = 0;
  const blockingGaps: string[] = [];

  for (const phaseDir of phaseDirs) {
    const resultPath = `${phaseDir}/verification-result.json`;
    const file = Bun.file(resultPath);

    if (!(await file.exists())) {
      console.error(
        `[milestone-validator] WARN: No verification-result.json in ${phaseDir}`,
      );
      phasesMissing.push(phaseDir);
      continue;
    }

    let rawContent: string;
    try {
      rawContent = await file.text();
    } catch {
      console.error(
        `[milestone-validator] ERROR: Failed to read ${resultPath}`,
      );
      phasesMissing.push(phaseDir);
      continue;
    }

    let rawJson: unknown;
    try {
      rawJson = JSON.parse(rawContent);
    } catch {
      console.error(
        `[milestone-validator] ERROR: Invalid JSON in ${resultPath}`,
      );
      phasesMissing.push(phaseDir);
      continue;
    }

    const parseResult = PhaseVerificationResultSchema.safeParse(rawJson);
    if (!parseResult.success) {
      console.error(
        `[milestone-validator] ERROR: Schema validation failed for ${resultPath}: ${parseResult.error.message}`,
      );
      phasesMissing.push(phaseDir);
      continue;
    }

    const phaseResult = parseResult.data;
    phasesVerified++;

    if (phaseResult.verdict === "PASSED") {
      phasesPassed++;
    } else {
      phasesWithIssues++;
    }

    // Aggregate blocking gaps with phase prefix
    for (const gap of phaseResult.blocking_gaps) {
      blockingGaps.push(`Phase ${phaseResult.phase}: ${gap}`);
    }
  }

  const milestoneVerdict: MilestoneVerdict["milestone_verdict"] =
    phasesVerified > 0 && phasesWithIssues === 0 && blockingGaps.length === 0
      ? "PASSED"
      : "ISSUES";

  return {
    phases_verified: phasesVerified,
    phases_missing: phasesMissing,
    phases_passed: phasesPassed,
    phases_with_issues: phasesWithIssues,
    blocking_gaps: blockingGaps,
    milestone_verdict: milestoneVerdict,
  };
};

/* -------------------------------------------------------------------------- */
/*  CLI entry point                                                           */
/* -------------------------------------------------------------------------- */

const HELP_TEXT = `milestone-validator — Deterministic milestone verification aggregator

Usage:
  bun src/verification/__helpers/milestone-validator.ts --phases=dir1,dir2,...

Options:
  --phases=dir1,dir2,...   Comma-separated phase directory paths
  --help, -h              Show this help message

Exit codes:
  0  Milestone PASSED (all verified phases passed, zero blocking gaps)
  1  Milestone has ISSUES (any phase has ISSUES or any blocking gap)
  2  Validation or parse error

Output:
  JSON to stdout with fields:
    phases_verified, phases_missing, phases_passed, phases_with_issues,
    blocking_gaps, milestone_verdict
`;

if (import.meta.main) {
  const parsed = parseArgs(process.argv.slice(2));

  if ("help" in parsed) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  if ("error" in parsed) {
    console.error(parsed.error);
    process.exit(2);
  }

  try {
    const verdict = await validateMilestone(parsed.phases);
    console.log(JSON.stringify(verdict, null, 2));

    if (verdict.milestone_verdict === "PASSED") {
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (err) {
    console.error(
      `[milestone-validator] Fatal error: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(2);
  }
}
