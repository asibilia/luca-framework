---
title: "Runtime C09: CLI integration for luca eval"
area: eval
created: 2026-03-24
source: docs/runtime-architecture/research/agent-evaluation.md
depends_on: [C01, C02, C03, C04, C05, C06, C07, C08]
phase: runtime-c
estimated_files: 1
---

## Context

Create the `luca eval` CLI command as a Bun script in `packages-dev/bun-scripts/`. This script imports from `src/eval/` and provides the user-facing interface for running eval suites, comparing results, and saving baselines.

## Files to Create

### 1. `packages-dev/bun-scripts/eval.ts`

```typescript
#!/usr/bin/env bun

/**
 * CLI entry point for `luca eval` (or `bun run eval`).
 *
 * Usage:
 *   bun run eval                           # Run all suites
 *   bun run eval --suite=lu-router         # Run specific suite
 *   bun run eval --tag=smoke               # Run cases tagged "smoke" only
 *   bun run eval --compare                 # Run and compare against latest baseline
 *   bun run eval --dry-run                 # Validate suites without executing
 *   bun run eval --report=markdown         # Output format (json | markdown | console)
 *   bun run eval --judge-model=haiku       # Override judge model
 *   bun run eval --trials=5               # Override default trial count
 *   bun run eval --save-baseline           # Save current run as the new baseline
 *   bun run eval --verbose                 # Show all cases, not just failures
 *
 * Exit codes:
 *   0 — all suites passed
 *   1 — one or more suites had failures
 *   2 — regression detected (when --compare is used)
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
import type { EvalSuite, EvalReport } from "~/eval";
import type { RunEvalOptions } from "~/eval";
import type { ReportFormat } from "~/eval";
```

**Implementation steps:**

1. **Parse arguments** using `getArg` and `hasFlag` from `~/shared/__helpers/cli-utils`:

   ```typescript
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
   ```

2. **Validate arguments**:
   - If `trialsOverride` is set, parse as integer. If NaN or < 1, print error and exit 1.
   - If `reportFormat` is not `"json" | "markdown" | "console"`, print error and exit 1.

3. **Build suite registry**: Map of suite ID to EvalSuite:

   ```typescript
   const SUITE_REGISTRY: Map<string, EvalSuite> = new Map([
     [luRouterEvalSuite.id, luRouterEvalSuite],
     [luVerifierEvalSuite.id, luVerifierEvalSuite],
     [convergenceEvalSuite.id, convergenceEvalSuite],
   ]);
   ```

4. **Filter suites**:
   - If `suiteFilter` is set, find the matching suite by ID or component name. If not found, print available suites and exit 1.
   - If `tagFilter` is set, filter cases within each suite to only include cases with the matching tag. If a suite has zero matching cases after filtering, exclude it.
   - If neither filter is set, run all suites.

5. **Create adapter**:

   ```typescript
   let adapter: LlmAdapter | null = null;
   try {
     adapter = createAnthropicAdapter();
   } catch {
     console.warn(
       "No ANTHROPIC_API_KEY found. Using mock adapter for LLM-graded cases.",
     );
     adapter = createMockAdapter();
   }
   ```

6. **Build RunEvalOptions**:

   ```typescript
   const options: RunEvalOptions = {
     adapter,
     trial_override: trialsOverride ? parseInt(trialsOverride, 10) : undefined,
     dry_run: dryRun,
     agent_model: judgeModel || "claude-sonnet-4-20250514",
     agent_version_hash: await getGitHash(),
     on_trial_complete: (caseId, trial, result) => {
       if (verbose) {
         const status = result.passed ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
         console.log(
           `  ${status} ${caseId} trial ${trial}: ${result.score.toFixed(2)}`,
         );
       }
     },
   };
   ```

7. **Run suites**: Iterate over filtered suites, call `runEvalSuite` for each.

8. **Output reports** based on `reportFormat`:
   - `"console"`: Call `printConsoleReport(report, verbose)` for each report.
   - `"json"`: Call `writeJsonReport(report)` for each report, print the path.
   - `"markdown"`: Call `formatMarkdownReport(report)`, print to stdout.

9. **Comparison mode** (when `--compare` is set):
   - For each report, call `compareWithLatestBaseline(report)`.
   - If comparison exists, call `printComparisonReport(comparison, baseline, current)`.
   - If any comparison verdict is "fail", set exit code to 2.

10. **Save baseline** (when `--save-baseline` is set):
    - Call `writeJsonReport(report)` for each report (this updates `latest.json`).
    - Print confirmation.

11. **Exit code**:
    - `0`: All suites passed (all pass@1 = 1.0).
    - `1`: One or more suites had failures (any pass@1 < 1.0).
    - `2`: Regression detected (comparison verdict = "fail").

**Helper function** (`getGitHash`):

```typescript
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
```

## Modify `package.json`

Add script entry:

```json
{
  "scripts": {
    "eval": "bun packages-dev/bun-scripts/eval.ts"
  }
}
```

## Verification

```bash
# Type-check
bunx --bun tsc --noEmit

# Dry-run validation (no API calls)
bun run eval --dry-run

# Run specific suite with code-only grading (no API key needed)
bun run eval --suite=lu-router-classification --trials=1
```

## Notes

- The CLI gracefully falls back to a mock adapter when no ANTHROPIC_API_KEY is set. This means `bun run eval --suite=lu-router-classification` works out-of-the-box for code-graded suites.
- The `--judge-model` flag accepts model identifiers like `claude-haiku-4-5-20250514`. The default is stored in the suite config, so this flag is only needed for overrides.
- The `SUITE_REGISTRY` map is the place to register new eval suites. As more suites are added (beyond C06-C08), they should be imported and registered here.
- Exit code 2 (regression) takes priority over exit code 1 (failures). If both occur, exit with 2.
