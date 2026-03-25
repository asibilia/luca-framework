# Phase 5 — Eval Domain (Full Build) — CONTEXT

## Decisions

### Domain Structure [locked]

- Archetype B (Core Domain), T1 tier
- Directory: `src/eval/__schemas/`, `src/eval/__helpers/`, `src/eval/suites/`
- Barrel: `src/eval/index.ts` (pure re-exports only)

### Schema Design [locked]

- All schemas defined in `src/eval/__schemas/eval.schemas.ts`
- snake_case field names per API convention
- Types inferred via `z.infer<typeof Schema>`
- GraderResult, EvalCase, EvalSuite, EvalResult, EvalReport, EvalComparison all specified

### Grader Architecture [locked]

- Three grader types: code (deterministic), llm (LLM-as-judge), composite (weighted combination)
- Factory functions, no classes
- `gradeWithCode()` is synchronous; `gradeWithLlm()` and `gradeWithComposite()` are async
- `LlmAdapter` interface for dependency injection (mock in dev, Anthropic in production)
- Code grader supports 6 strategies: exact_match, contains, regex, set_membership, threshold, custom
- Composite graders do NOT support nesting

### Runner [locked]

- Sequential case execution (rate limit avoidance)
- Sequential trials within each case (independence)
- Supports sampling_rate for partial runs
- Timeout via Promise.race
- `on_trial_complete` callback for progress reporting

### Reporter [locked]

- Three output formats: JSON, markdown, console
- JSON reports stored in `.planning/evals/{component}/{run_id}.json`
- `latest.json` is a file copy (not symlink)
- Console output uses ANSI color codes
- `.planning/evals/` added to `.gitignore`

### Comparator [locked]

- Regression = passed in baseline, failed in current (pass@1 level)
- Verdict: fail (regressions + significant score drop), warn (regressions only), pass (no regressions)
- Default significance threshold: 0.05
- Cases only in one run are excluded from comparison

### Eval Suites [locked]

- lu-router: 25 cases, code-only grading, 5 per complexity level, 3 edge cases with set_membership
- lu-verifier: 25 cases, composite grading (60% code + 40% LLM), includes false positive traps
- convergence: 25 cases, code-only grading, trials=1 (deterministic), tests 2-of-3 stale rule

### CLI Integration [locked]

- Entry: `packages-dev/bun-scripts/eval.ts`
- Script: `bun run eval` via package.json
- Flags: --suite, --tag, --compare, --dry-run, --report, --judge-model, --trials, --save-baseline, --verbose
- Exit codes: 0 (pass), 1 (failures), 2 (regression)
- Graceful fallback to mock adapter when no ANTHROPIC_API_KEY

### Dependencies [locked]

- lodash/get for value extraction in code grader
- Bun.file/Bun.write for file I/O
- Bun.spawn for git hash
- node:crypto randomUUID for run IDs
- fetch for Anthropic API calls

### Domain Registration [locked]

- Add `eval: 1` to DOMAIN_TIER in check-domain-boundaries.ts
- Update domain-architecture.md and module-boundary.md rules

## Deferred Ideas

- Batch API support (flagged in suite config but not implemented)
- Eval result caching (future optimization)
- Parallel case execution (rate limits make this risky)

## Provenance

All decisions sourced from todo specifications (runtime-c01 through c10), which derive from `docs/runtime-architecture/research/agent-evaluation.md`.
