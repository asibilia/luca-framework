---
title: "Runtime C10: Domain barrel + boundary check registration"
area: eval
created: 2026-03-24
source: docs/runtime-architecture/research/agent-evaluation.md
depends_on: [C01, C02, C03, C04, C05, C06, C07, C08]
phase: runtime-c
estimated_files: 3
---

## Context

Register `src/eval/` as a T1 Core domain in the domain boundary checker, finalize the barrel index with all exports, and add `.planning/evals/` to `.gitignore`.

## Files to Modify

### 1. `scripts/check-domain-boundaries.ts`

Add `eval` to the `DOMAIN_TIER` map at tier 1 (T1 Core).

**Exact change**: In the `DOMAIN_TIER` record (around line 22-36), add:

```typescript
eval: 1,
```

After the change, the `DOMAIN_TIER` object should include:

```typescript
const DOMAIN_TIER: Record<string, number> = {
  shared: 0,
  complexity: 0,
  context: 1,
  planner: 1,
  harness: 1,
  iteration: 1,
  observability: 1,
  interop: 1,
  eval: 1, // <-- NEW
  agents: 2,
  skills: 2,
  rules: 2,
  compilers: 3,
  hooks: 3,
};
```

### 2. `src/eval/index.ts`

The final barrel with all exports from C01-C08. This file should contain ONLY re-export statements.

```typescript
// ─── Schemas ─────────────────────────────────────────────────────────────
export {
  // Grader types
  GRADER_TYPES,
  GraderTypeSchema,
  CODE_GRADER_STRATEGIES,
  CodeGraderStrategySchema,
  GraderResultSchema,
  CodeGraderConfigSchema,
  LlmGraderConfigSchema,
  CompositeGraderEntrySchema,
  CompositeGraderConfigSchema,
  // Eval case + suite
  EvalCaseSchema,
  EvalSuiteConfigSchema,
  EvalSuiteSchema,
  // Results + reports
  TokenUsageSchema,
  EvalResultSchema,
  EvalRunMetadataSchema,
  EvalReportSchema,
  // Comparison
  COMPARISON_VERDICTS,
  ComparisonVerdictSchema,
  EvalDeltasSchema,
  EvalComparisonSchema,
} from "./__schemas/eval.schemas";

export type {
  GraderType,
  CodeGraderStrategy,
  GraderResult,
  CodeGraderConfig,
  LlmGraderConfig,
  CompositeGraderEntry,
  CompositeGraderConfig,
  EvalCase,
  EvalSuiteConfig,
  EvalSuite,
  TokenUsage,
  EvalResult,
  EvalRunMetadata,
  EvalReport,
  ComparisonVerdict,
  EvalDeltas,
  EvalComparison,
} from "./__schemas/eval.schemas";

// ─── Helpers: Graders ────────────────────────────────────────────────────
export { gradeWithCode } from "./__helpers/code-grader";
export type { CustomGraderFn } from "./__helpers/code-grader";
export { gradeWithLlm } from "./__helpers/llm-grader";
export type { LlmAdapter } from "./__helpers/llm-grader";
export { gradeWithComposite } from "./__helpers/composite-grader";

// ─── Helpers: Runner ─────────────────────────────────────────────────────
export { runEvalSuite, runEvalSuites } from "./__helpers/eval-runner";
export type { RunEvalOptions } from "./__helpers/eval-runner";
export {
  createAnthropicAdapter,
  createMockAdapter,
  createMockAdapterWithResponses,
} from "./__helpers/anthropic-adapter";

// ─── Helpers: Reporter ───────────────────────────────────────────────────
export {
  writeJsonReport,
  formatMarkdownReport,
  printConsoleReport,
  printComparisonReport,
  loadLatestReport,
  loadReport,
} from "./__helpers/eval-reporter";
export type { ReportFormat } from "./__helpers/eval-reporter";

// ─── Helpers: Comparator ─────────────────────────────────────────────────
export {
  compareEvalRuns,
  compareWithLatestBaseline,
} from "./__helpers/eval-comparator";

// ─── Suites ──────────────────────────────────────────────────────────────
export { luRouterEvalSuite } from "./suites/lu-router.eval";
export { luVerifierEvalSuite } from "./suites/lu-verifier.eval";
export { convergenceEvalSuite } from "./suites/convergence.eval";
```

### 3. `.gitignore`

Add eval results directory to gitignore:

```
# Eval results (generated, per-run)
.planning/evals/
```

## Verification

```bash
# Type-check the entire project
bunx --bun tsc --noEmit

# Domain boundary check passes
bun run scripts/check-domain-boundaries.ts

# Barrel is pure re-exports
grep -v '^export\|^$\|^//' src/eval/index.ts | wc -l
# Expected: 0

# No flat files in domain root except index.ts
ls src/eval/*.ts
# Expected: only index.ts

# File naming follows kebab-case
find src/eval -name "*.ts" | grep -v kebab || echo "All kebab-case"

# eval domain imports only from T0 (shared, complexity) and T1 (other core domains)
# This is verified by check-domain-boundaries.ts
```

## Also Update

### `docs/runtime-architecture/roadmap.md`

If this file has a Phase C status marker, update it to reflect Phase C is in-progress or complete.

### `.claude/rules/domain-architecture.md`

Add `eval` to the T1 Core domains table:

```markdown
| Domain        | Purpose                                                |
| ------------- | ------------------------------------------------------ | ------- |
| planner       | Cost model, scheduler, scoring, todo parsing           |
| iteration     | Budget, checkpoint, classifier, convergence            |
| context       | Context tier resolution, assembler, envelope           |
| observability | Agent scorecard engine, telemetry metrics              |
| interop       | Cross-agent discovery, IDE tool directory scanning     |
| shared        | Cross-cutting utilities (format, validation, CLI)      |
| eval          | Agent evaluation framework (runner, graders, reporter) | <-- NEW |
```

### `.claude/rules/module-boundary.md`

Add `eval` to the T1 Core tier in the Dependency Tier Map:

```
T1 Core:  context, planner, harness, iteration, observability, interop, eval
```

## Notes

- This is the final task in Phase C. It ties everything together by registering the domain and providing the complete barrel.
- The domain boundary script at `scripts/check-domain-boundaries.ts` is the authoritative list of domain tiers. Adding `eval: 1` here makes the eval domain officially part of the T1 Core tier.
- The `.gitignore` entry prevents eval result JSON files from being committed. The eval suites (source code) ARE committed; only the run results are gitignored.
