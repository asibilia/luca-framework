#!/usr/bin/env bun

/**
 * CLI entry point for `bun run eval:run`.
 *
 * Usage:
 *   bun run eval:run                           # Run all suites
 *   bun run eval:run --suite=lu-router         # Run specific suite
 *   bun run eval:run --tag=smoke               # Run cases tagged "smoke" only
 *   bun run eval:run --compare                 # Run and compare against latest baseline
 *   bun run eval:run --dry-run                 # Validate suites without executing
 *   bun run eval:run --report=markdown         # Output format (json | markdown | console)
 *   bun run eval:run --judge-model=haiku       # Override judge model
 *   bun run eval:run --trials=5               # Override default trial count
 *   bun run eval:run --save-baseline           # Save current run as the new baseline
 *   bun run eval:run --verbose                 # Show all cases, not just failures
 *
 * Exit codes:
 *   0 -- all suites passed
 *   1 -- one or more suites had failures
 *   2 -- regression detected (when --compare is used)
 */

import { getArg, hasFlag } from "~/shared/__helpers/cli-utils";
import {
  runEvalSuite,
  createAnthropicAdapter,
  createMockAdapter,
  writeJsonReport,
  formatMarkdownReport,
  printConsoleReport,
  printComparisonReport,
  compareWithLatestBaseline,
  luRouterEvalSuite,
  luVerifierEvalSuite,
  convergenceEvalSuite,
} from "~/eval";
import type { EvalSuite, EvalReport, EvalCase } from "~/eval";
import type { RunEvalOptions } from "~/eval";
import type { ReportFormat } from "~/eval";
import type { LlmAdapter } from "~/eval";

// ─── Argument Parsing ───────────────────────────────────────────────────

const args = Bun.argv.slice(2);
const suiteFilter = getArg(args, "suite", "");
const tagFilter = getArg(args, "tag", "");
const trialsOverride = getArg(args, "trials", "");
const reportFormat = getArg(args, "report", "console") as ReportFormat;
const judgeModel = getArg(args, "judge-model", "");
const compare = hasFlag(args, "compare");
const dryRun = hasFlag(args, "dry-run");
const saveBaseline = hasFlag(args, "save-baseline");
const verbose = hasFlag(args, "verbose");

// ─── Input Validation ───────────────────────────────────────────────────

if (trialsOverride !== "") {
  const parsed = parseInt(trialsOverride, 10);
  if (isNaN(parsed) || parsed < 1) {
    console.error(
      `Error: --trials must be a positive integer, got "${trialsOverride}"`,
    );
    process.exit(1);
  }
}

const VALID_REPORT_FORMATS: ReportFormat[] = ["json", "markdown", "console"];
if (!VALID_REPORT_FORMATS.includes(reportFormat)) {
  console.error(
    `Error: --report must be one of ${VALID_REPORT_FORMATS.join(", ")}, got "${reportFormat}"`,
  );
  process.exit(1);
}

// ─── Suite Registry ─────────────────────────────────────────────────────

const SUITE_REGISTRY: Map<string, EvalSuite> = new Map([
  [luRouterEvalSuite.id, luRouterEvalSuite],
  [luVerifierEvalSuite.id, luVerifierEvalSuite],
  [convergenceEvalSuite.id, convergenceEvalSuite],
]);

// ─── Suite Filtering ────────────────────────────────────────────────────

let suitesToRun: EvalSuite[];

if (suiteFilter !== "") {
  // Match by suite ID or component name
  const matched = [...SUITE_REGISTRY.values()].filter(
    (s) =>
      s.id === suiteFilter ||
      s.component === suiteFilter ||
      s.id.includes(suiteFilter) ||
      s.component.includes(suiteFilter),
  );

  if (matched.length === 0) {
    console.error(`Error: No suite matches filter "${suiteFilter}"`);
    console.error("Available suites:");
    for (const [id, suite] of SUITE_REGISTRY) {
      console.error(`  - ${id} (component: ${suite.component})`);
    }
    process.exit(1);
  }

  suitesToRun = matched;
} else {
  suitesToRun = [...SUITE_REGISTRY.values()];
}

// Tag filtering: narrow cases within each suite
if (tagFilter !== "") {
  suitesToRun = suitesToRun
    .map((suite) => {
      const filteredCases = suite.cases.filter((c: EvalCase) =>
        c.tags.includes(tagFilter),
      );
      if (filteredCases.length === 0) return null;
      return { ...suite, cases: filteredCases };
    })
    .filter((s): s is EvalSuite => s !== null);

  if (suitesToRun.length === 0) {
    console.error(`Error: No cases match tag "${tagFilter}"`);
    process.exit(1);
  }
}

// ─── Adapter Creation ───────────────────────────────────────────────────

let adapter: LlmAdapter | null = null;
try {
  adapter = createAnthropicAdapter();
} catch {
  console.warn(
    "No ANTHROPIC_API_KEY found. Using mock adapter for LLM-graded cases.",
  );
  adapter = createMockAdapter();
}

// ─── Git Hash ───────────────────────────────────────────────────────────

/**
 * Retrieve the short git hash of the current HEAD commit.
 *
 * Uses Bun.spawn for process execution. Falls back to "unknown"
 * if git is not available or the command fails.
 *
 * @returns Short git hash string (e.g., "abc1234") or "unknown"
 */
async function getGitHash(): Promise<string> {
  try {
    const proc = Bun.spawn(["git", "rev-parse", "--short", "HEAD"], {
      stdout: "pipe",
    });
    const text = await new Response(proc.stdout).text();
    return text.trim();
  } catch {
    return "unknown";
  }
}

// ─── Build Options ──────────────────────────────────────────────────────

const options: RunEvalOptions = {
  adapter,
  trial_override: trialsOverride ? parseInt(trialsOverride, 10) : undefined,
  dry_run: dryRun,
  agent_model: judgeModel || "claude-sonnet-4-20250514",
  agent_version_hash: await getGitHash(),
  on_trial_complete: verbose
    ? (caseId, trial, result) => {
        const status = result.passed
          ? "\x1b[32m\u2713\x1b[0m"
          : "\x1b[31m\u2717\x1b[0m";
        console.log(
          `  ${status} ${caseId} trial ${trial}: ${result.score.toFixed(2)}`,
        );
      }
    : undefined,
};

// ─── Suite Execution ────────────────────────────────────────────────────

console.log(
  `\nRunning ${suitesToRun.length} eval suite(s)${dryRun ? " (dry-run)" : ""}...\n`,
);

const reports: EvalReport[] = [];
let exitCode = 0;

for (const suite of suitesToRun) {
  const report = await runEvalSuite(suite, options);
  reports.push(report);

  // Track failures
  if (report.pass_at_1 < 1.0) {
    exitCode = 1;
  }
}

// ─── Output Reports ─────────────────────────────────────────────────────

for (const report of reports) {
  switch (reportFormat) {
    case "console":
      printConsoleReport(report, verbose);
      break;
    case "json": {
      const path = await writeJsonReport(report);
      console.log(`Report written: ${path}`);
      break;
    }
    case "markdown": {
      const md = formatMarkdownReport(report);
      console.log(md);
      break;
    }
  }
}

// ─── Comparison Mode ────────────────────────────────────────────────────

if (compare) {
  for (const report of reports) {
    const comparison = await compareWithLatestBaseline(report);
    if (comparison === null) {
      console.log(
        `\nNo baseline found for ${report.component}. Use --save-baseline to create one.`,
      );
      continue;
    }

    // Load baseline for comparison display
    const { loadLatestReport } = await import("~/eval");
    const baseline = await loadLatestReport(report.component);
    if (baseline) {
      printComparisonReport(comparison, baseline, report);
    }

    if (comparison.verdict === "fail") {
      exitCode = 2;
    }
  }
}

// ─── Save Baseline ──────────────────────────────────────────────────────

if (saveBaseline) {
  for (const report of reports) {
    const path = await writeJsonReport(report);
    console.log(`Baseline saved: ${path}`);
  }
}

// ─── Exit ───────────────────────────────────────────────────────────────

process.exit(exitCode);
