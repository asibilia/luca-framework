---
phase: 5
plan: 3
type: feature
autonomous: true
wave: 3
depends_on: [2]
---

# Phase 5 Plan 3: Eval Runner and Anthropic Adapter

## Objective

Implement the eval runner (the core execution engine) and its LLM adapter implementations. The runner depends on the Wave 2 graders to route eval cases to the appropriate grading strategy. It also provides mock and real Anthropic adapters for development and production use respectively.

## Context

- @.planning/todos/pending/runtime-c03-eval-runner.md -- runner implementation with timeout, sampling, aggregation
- @src/eval/\_\_helpers/code-grader.ts -- gradeWithCode (from Wave 2)
- @src/eval/\_\_helpers/llm-grader.ts -- gradeWithLlm, LlmAdapter (from Wave 2)
- @src/eval/\_\_helpers/composite-grader.ts -- gradeWithComposite (from Wave 2)
- @src/eval/\_\_schemas/eval.schemas.ts -- EvalSuite, EvalReport, EvalResult schemas

## Tasks

### 1. C03a -- Anthropic adapter and mock adapters

**Type:** auto
**TDD:** false
**Depends on:** (none)

Create `src/eval/__helpers/anthropic-adapter.ts` with three factory functions:

- `createAnthropicAdapter()` -- reads `ANTHROPIC_API_KEY` from env, throws if missing, uses `fetch` to call Anthropic Messages API
- `createMockAdapter()` -- returns canned responses (score 0.8 for judge prompts, generic text otherwise), simulates token usage
- `createMockAdapterWithResponses(responses)` -- allows custom response mapping by user message substring

All return objects implementing the `LlmAdapter` interface. No classes -- factory functions per project conventions.

Implement verbatim from `.planning/todos/pending/runtime-c03-eval-runner.md` (Section 2).

**Files to create/edit:**

- `src/eval/__helpers/anthropic-adapter.ts` (create)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `createAnthropicAdapter` throws when no API key
- `createMockAdapter` returns valid LlmAdapter
- Mock adapter returns judge-format JSON when system prompt contains "evaluator"

### 2. C03b -- Eval runner

**Type:** auto
**TDD:** false
**Depends on:** Task 1

Create `src/eval/__helpers/eval-runner.ts` with two exported functions:

- `runEvalSuite(suite, options)` -- executes a single suite: sampling, sequential case iteration, sequential trial execution, grader routing, timeout enforcement, result aggregation
- `runEvalSuites(suites, options)` -- runs multiple suites (parallel for different components, sequential for same component)

Key implementation details from the spec:

- Sequential cases and trials (rate limit avoidance, reproducibility)
- Timeout via `Promise.race` with `setTimeout` at case boundary per premortem constraint
- Sampling via `Math.random()` when `sampling_rate < 1.0`
- Aggregation: `pass_at_1` (any trial passed per case), `pass_at_k` (all trials passed per case), `avg_score`, `total_cost_usd`, `total_latency_ms`
- Dry-run mode validates suite structure without execution
- `on_trial_complete` callback for progress reporting
- Report self-validates via `EvalReportSchema.safeParse`

Implement verbatim from `.planning/todos/pending/runtime-c03-eval-runner.md` (Section 1).

**Files to create/edit:**

- `src/eval/__helpers/eval-runner.ts` (create)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Code-only suites work with `adapter: null`
- LLM-graded cases without adapter produce error results (not crashes)
- Dry-run returns report with zero results
- `RunEvalOptions` interface exported
- `on_trial_complete` callback invoked after each trial
- Timeout produces error result (not exception)

### 3. Update barrel with Wave 3 exports

**Type:** auto
**TDD:** false
**Depends on:** Tasks 1, 2

Extend `src/eval/index.ts` with re-exports for runner and adapter:

- Runner: `runEvalSuite`, `runEvalSuites`, `RunEvalOptions`
- Adapters: `createAnthropicAdapter`, `createMockAdapter`, `createMockAdapterWithResponses`

**Files to create/edit:**

- `src/eval/index.ts` (edit -- append runner and adapter re-exports)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Barrel remains pure re-exports only
- All runner and adapter functions importable via `~/eval`

## Verification

Run after all tasks complete:

```bash
bunx --bun tsc --noEmit
bun run scripts/check-domain-boundaries.ts
```

Confirm:

- Runner correctly imports from all three graders
- Adapter factory functions return LlmAdapter-compatible objects
- No tier violations

## Success Criteria

- Runner compiles and handles all three grader types (code, llm, composite)
- Mock adapter enables development without API keys
- Anthropic adapter validates API key presence
- Timeout enforcement works at case boundary
- Barrel updated with all new exports

## Output Specification

Files created:

- `src/eval/__helpers/anthropic-adapter.ts`
- `src/eval/__helpers/eval-runner.ts`

Files modified:

- `src/eval/index.ts` (extended with runner and adapter re-exports)
