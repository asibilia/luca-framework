---
phase: 5
plan: 5
type: feature
autonomous: true
wave: 5
depends_on: [2, 3, 4]
---

# Phase 5 Plan 5: CLI Integration, Barrel Finalization, and Housekeeping

## Objective

Wire the eval domain into the developer experience: create the `luca eval` CLI command, finalize the barrel index with all exports from Waves 1-4, add `.planning/evals/` to `.gitignore`, add the `eval` script to `package.json`, and update the runtime roadmap docs. This is the capstone wave that makes the eval domain user-facing.

## Context

- @.planning/todos/pending/runtime-c09-cli-integration.md -- CLI entry point with flags, validation, exit codes
- @.planning/todos/pending/runtime-c10-domain-barrel-registration.md -- final barrel, .gitignore, doc updates
- @src/eval/index.ts -- barrel to finalize
- @packages-dev/bun-scripts/ -- CLI script location
- @package.json -- script entry to add
- @src/shared/\_\_helpers/cli-utils.ts -- getArg, hasFlag utilities

## Tasks

### 1. C09 -- CLI entry point

**Type:** auto
**TDD:** false
**Depends on:** (none)

Create `scripts/eval.ts` as the CLI entry point for `bun run eval`.

Implements:

- Argument parsing: `--suite`, `--tag`, `--compare`, `--dry-run`, `--report`, `--judge-model`, `--trials`, `--save-baseline`, `--verbose`
- Input validation: trials must be positive integer, report format must be json/markdown/console
- Suite registry: maps suite IDs to imported suite objects (lu-router, lu-verifier, convergence)
- Suite filtering by ID/component name and tag-based case filtering
- Adapter creation: tries `createAnthropicAdapter()`, falls back to `createMockAdapter()` with warning
- Sequential suite execution with `runEvalSuite`
- Output routing: console (printConsoleReport), json (writeJsonReport), markdown (formatMarkdownReport)
- Comparison mode: `compareWithLatestBaseline` + `printComparisonReport`
- Baseline saving: `writeJsonReport` (updates `latest.json`)
- Exit codes: 0 (all passed), 1 (failures), 2 (regression detected)
- Progress callback: per-trial status output when `--verbose`
- Git hash retrieval via `Bun.spawn(["git", "rev-parse", "--short", "HEAD"])`

Implement verbatim from `.planning/todos/pending/runtime-c09-cli-integration.md`.

**Files to create/edit:**

- `scripts/eval.ts` (create)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `bun run eval:run --dry-run` validates suites without executing
- `bun run eval:run --suite=lu-router-classification --trials=1` runs code-only suite without API key
- Unknown `--suite` value prints available suites and exits 1
- Invalid `--trials` value prints error and exits 1

### 2. C09 -- Add eval script to package.json

**Type:** auto
**TDD:** false
**Depends on:** Task 1

Add the `eval:run` script entry to `package.json`:

```json
"eval:run": "bun scripts/eval.ts"
```

**Files to create/edit:**

- `package.json` (edit -- add eval script)

**Verification:**

- `bun run eval:run --dry-run` works via the script alias

### 3. C10 -- Finalize barrel index

**Type:** auto
**TDD:** false
**Depends on:** (none -- barrel was incrementally updated; this is a verification/cleanup step)

Verify `src/eval/index.ts` contains the complete set of re-exports from all waves. The final barrel should match the specification in C10 exactly:

- Schemas: all 17 schema/const exports + 16 type exports from `__schemas/eval.schemas`
- Graders: `gradeWithCode`, `CustomGraderFn`, `gradeWithLlm`, `LlmAdapter`, `gradeWithComposite`
- Runner: `runEvalSuite`, `runEvalSuites`, `RunEvalOptions`
- Adapters: `createAnthropicAdapter`, `createMockAdapter`, `createMockAdapterWithResponses`
- Reporter: `writeJsonReport`, `formatMarkdownReport`, `printConsoleReport`, `printComparisonReport`, `loadLatestReport`, `loadReport`, `ReportFormat`
- Comparator: `compareEvalRuns`, `compareWithLatestBaseline`
- Suites: `luRouterEvalSuite`, `luVerifierEvalSuite`, `convergenceEvalSuite`

If any exports are missing from incremental updates, add them. The barrel must be pure re-exports only.

Implement verbatim from `.planning/todos/pending/runtime-c10-domain-barrel-registration.md` (Section 2).

**Files to create/edit:**

- `src/eval/index.ts` (verify/edit to match final barrel spec)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `grep -v '^export\|^$\|^//' src/eval/index.ts | wc -l` returns 0
- All functions/types importable via `~/eval`

### 4. C10 -- Add .planning/evals/ to .gitignore

**Type:** auto
**TDD:** false
**Depends on:** (none)

Add `.planning/evals/` to `.gitignore` with a descriptive comment. Eval result JSON files are generated per-run and should not be committed. The eval suite source code (in `src/eval/suites/`) IS committed.

**Files to create/edit:**

- `.gitignore` (edit -- add `.planning/evals/` entry)

**Verification:**

- `.planning/evals/` appears in .gitignore
- `git status` does not show eval result files as untracked after a dry run

### 5. C10 -- Update roadmap and architecture docs

**Type:** auto
**TDD:** false
**Depends on:** (none)

Update documentation to reflect the completed eval domain:

- `docs/runtime-architecture/roadmap.md` -- update Phase C status if present
- Verify `.claude/rules/domain-architecture.md` and `.claude/rules/module-boundary.md` already include eval at T1 (done in Wave 1; verify only)

**Files to create/edit:**

- `docs/runtime-architecture/roadmap.md` (edit if phase status marker exists)

**Verification:**

- Architecture docs reference eval as T1 Core domain
- Module boundary docs include eval in T1 tier

### 6. Final comprehensive verification

**Type:** auto
**TDD:** false
**Depends on:** Tasks 1, 2, 3, 4, 5

Run the complete verification battery for the eval domain:

```bash
bunx --bun tsc --noEmit
bun run scripts/check-domain-boundaries.ts
```

Confirm all structural invariants:

- `src/eval/index.ts` is a pure barrel (re-exports only)
- No flat files in `src/eval/` root except `index.ts`
- All files follow kebab-case naming
- eval domain imports only from T0 (shared, complexity) and T1 peers
- `.planning/evals/` is gitignored
- `bun run eval:run --dry-run` succeeds

**Verification:**

- `bunx --bun tsc --noEmit` exits 0
- `bun run scripts/check-domain-boundaries.ts` exits 0
- `bun run eval:run --dry-run` exits 0
- No tier violations

## Verification

Run after all tasks complete:

```bash
bunx --bun tsc --noEmit
bun run scripts/check-domain-boundaries.ts
bun run eval:run --dry-run
bun run eval:run --suite=lu-router-classification --trials=1
```

## Success Criteria

- `bun run eval:run` CLI works end-to-end
- Dry-run validates all 3 suites without API calls
- Code-only suite (lu-router) runs successfully without API key
- All eval domain exports are accessible via `~/eval` barrel
- `.planning/evals/` is gitignored
- Domain boundary check passes
- Architecture docs are current

## Output Specification

Files created:

- `scripts/eval.ts`

Files modified:

- `package.json` (eval script added)
- `src/eval/index.ts` (final barrel verification)
- `.gitignore` (`.planning/evals/` added)
- `docs/runtime-architecture/roadmap.md` (Phase C status updated if applicable)
