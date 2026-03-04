# Phase 98 Verification: Verification Pipeline (Middleware)

## Status: PASSED

## Verification Mode: Full (Goal-Backward)

## Phase Goal

Build harness middleware so observer's verification pages have real data to display.

Deliverables:

- CheckMiddleware schemas and type definitions
- Three default middleware implementations (timing, workspace-scope, output-capture)
- Pipeline composition and runner integration
- Comprehensive test suite (57 tests)

---

## Deliverable 1: CheckMiddleware Schemas and Type Definitions

**File:** `src/harness/__schemas/harness.schemas.ts`

### EXISTS: Yes

Four Zod schemas added:

- `MiddlewareContextSchema` (lines 41-57): Context with check config, projectDir, metadata bag, and optional timing/scope/output fields
- `CheckMiddlewareConfigSchema` (lines 60-68): name, enabled (default true), options bag
- `MiddlewarePipelineConfigSchema` (lines 71-79): enabled (default true), ordered middleware array
- `MiddlewareResultSchema` (lines 82-96): pipelineDuration, middlewareTiming, metadata, pipelineStatus, pipelineError

One function type:

- `CheckMiddleware` (lines 109-112): `(ctx, next) => Promise<CheckResult>` -- follows standard middleware "next" pattern

### SUBSTANTIVE: Yes

- All schemas use proper Zod primitives with correct defaults and constraints
- `MiddlewareResultSchema` enforces `nonnegative()` on duration and timing values
- `pipelineStatus` is an enum of `["completed", "error", "skipped"]`
- `z.record(z.string(), z.unknown())` used correctly for Zod v4 compatibility
- The `CheckMiddleware` type is not in Zod (correctly noted: functions are not serializable)
- All types derived via `z.infer<typeof Schema>`

### WIRED: Yes

- `HarnessConfigSchema` extended with optional `middlewarePipeline` field (line 125)
- `CheckResultSchema` extended with optional `middlewareResult` field (line 139)
- `DEFAULT_HARNESS_CONFIG` includes default middleware pipeline with all 3 middleware enabled (lines 192-199)
- All schemas and types exported from barrel `src/harness/index.ts`

---

## Deliverable 2: Three Default Middleware Implementations

### EXISTS: Yes

| File                                            | Factory                            | Lines |
| ----------------------------------------------- | ---------------------------------- | ----- |
| `src/harness/middleware/timing.ts`              | `createTimingMiddleware()`         | 68    |
| `src/harness/middleware/workspace-scope.ts`     | `createWorkspaceScopeMiddleware()` | 95    |
| `src/harness/middleware/output-capture.ts`      | `createOutputCaptureMiddleware()`  | 116   |
| `src/harness/middleware/middleware-registry.ts` | Registry + default order           | 31    |
| `src/harness/middleware/index.ts`               | Pure barrel                        | 13    |

### SUBSTANTIVE: Yes

**timing.ts:**

- Records ISO timestamp (`startedAt`) and `performance.now()` high-resolution time before calling next
- Sets `endedAt`, `timing_end_hr`, and `timing_duration_ms` in metadata after next returns
- Follows pre-/post-processing pattern (outermost wrapper)

**workspace-scope.ts:**

- Runs `git diff --name-only --diff-filter=ACMR HEAD` via `Bun.spawn`
- Attaches changed files to `ctx.scopedFiles` and metadata (`workspace_changed_file_count`, `workspace_changed_files`)
- Gracefully handles non-git directories (returns empty array)
- Follows pre-processing pattern (enriches context before next)

**output-capture.ts:**

- Writes check output with metadata header to timestamped file in `.planning/harness-runs/`
- Uses `Bun.write()` for file output (correct Bun API usage)
- Uses `node:fs/promises` `mkdir` for directory creation (acceptable -- no Bun.mkdir equivalent)
- Best-effort: failures logged in metadata but never block result
- Sanitizes check name in filename (replaces non-alphanumeric with dashes)
- Follows post-processing pattern (captures output after next returns)

**middleware-registry.ts:**

- Maps 3 names to factory functions: `timing`, `workspace-scope`, `output-capture`
- Exports `DEFAULT_MIDDLEWARE_ORDER` array
- Follows same pattern as `src/harness/parsers/parser-registry.ts`

### WIRED: Yes

- All middleware exported from `src/harness/middleware/index.ts` (pure barrel)
- Re-exported from `src/harness/index.ts` (both registry and individual factories)
- Registry used by `resolveMiddleware()` in pipeline.ts

---

## Deliverable 3: Pipeline Composition and Runner Integration

### EXISTS: Yes

| File                                | Functions                                                       | Lines          |
| ----------------------------------- | --------------------------------------------------------------- | -------------- |
| `src/harness/__helpers/pipeline.ts` | `composePipeline`, `resolveMiddleware`, `buildMiddlewareResult` | 108            |
| `src/harness/__helpers/runner.ts`   | `runCheckWithMiddleware` (new)                                  | 253 (modified) |

### SUBSTANTIVE: Yes

**pipeline.ts:**

- `composePipeline(middlewares)`: Builds onion-style chain by iterating in reverse. First middleware = outermost wrapper. Empty array = passthrough to next.
- `resolveMiddleware(configs)`: Maps config names to factory functions via registry. Skips disabled entries. Warns on unknown names (never throws).
- `buildMiddlewareResult(ctx, startTime, error?)`: Constructs validated `MiddlewareResult` via `MiddlewareResultSchema.parse()`. Extracts timing data from context metadata.

**runner.ts (`runCheckWithMiddleware`):**

- Falls back to direct `runCheck` when: no pipeline config, pipeline disabled, empty middleware array, all middleware disabled/unknown
- On pipeline error: catches, warns, falls back to direct `runCheck` (middleware never breaks harness)
- Attaches `middlewareResult` to returned `CheckResult`
- `runHarness` now calls `runCheckWithMiddleware` instead of `runCheck` (line 216)

### WIRED: Yes

- `runHarness` passes `config.middlewarePipeline` to `runCheckWithMiddleware` (lines 216-219)
- Pipeline functions exported from `src/harness/index.ts`
- `runCheck` left unchanged as core executor (backward compatible)

---

## Deliverable 4: Comprehensive Test Suite (57 Tests)

### EXISTS: Yes

| File                                                       | Test Count |
| ---------------------------------------------------------- | ---------- |
| `__tests__/src/harness/middleware-schemas.test.ts`         | 21         |
| `__tests__/src/harness/timing-middleware.test.ts`          | 5          |
| `__tests__/src/harness/workspace-scope-middleware.test.ts` | 6          |
| `__tests__/src/harness/output-capture-middleware.test.ts`  | 8          |
| `__tests__/src/harness/pipeline.test.ts`                   | 11         |
| `__tests__/src/harness/runner-middleware.test.ts`          | 6          |
| **Total**                                                  | **57**     |

### SUBSTANTIVE: Yes

- Schema tests cover: valid data parsing, default values, optional fields, rejection of invalid data
- Middleware unit tests verify: context enrichment, metadata attachment, passthrough behavior, error handling, edge cases
- Pipeline tests verify: empty array passthrough, single/multi middleware onion order, short-circuit, error propagation, middleware resolution (known/unknown/disabled)
- Runner integration tests verify: no-middleware backward compat, middlewareResult attachment, disabled pipeline, empty middleware, multi-check scenarios
- Output-capture tests use real filesystem (tmp dirs with afterEach cleanup)
- Workspace-scope tests use real git (project directory)

### WIRED: Yes

- All tests run via `bun test` and pass (0 failures, 149 expect() calls, ~177ms)

---

## Automated Checks

| Check                            | Result            |
| -------------------------------- | ----------------- |
| `bun test` (57 middleware tests) | PASS (0 failures) |
| `bunx --bun tsc --noEmit`        | PASS (0 errors)   |

## Architecture Compliance

| Rule                                  | Status                                                 |
| ------------------------------------- | ------------------------------------------------------ |
| No classes (functional patterns only) | PASS -- all factory functions                          |
| Tier compliance (harness = T1 Core)   | PASS -- imports only from T0 (shared) and intra-domain |
| No upward/cross-entity imports        | PASS -- no agents/skills/rules imports                 |
| Barrel is pure re-exports             | PASS -- `middleware/index.ts` and `harness/index.ts`   |
| File naming (kebab-case)              | PASS                                                   |
| Bun-first APIs                        | PASS -- `Bun.spawn`, `Bun.write`, `performance.now()`  |
| Schema-first parsing                  | PASS -- all contexts/results validated via Zod         |
| JSDoc documentation                   | PASS -- all public functions documented                |

## Minor Observations (Non-Blocking)

1. **`node:fs/promises` mkdir** in output-capture.ts: Acceptable since Bun has no direct `mkdir` equivalent. File writing correctly uses `Bun.write()`.

2. **Timing middleware mutation**: After calling `next()`, the timing middleware mutates `enrichedCtx.endedAt` and `enrichedCtx.metadata` (lines 59-64 of timing.ts). While the context was created via spread (immutable creation), the post-processing mutation is on the same reference. This works correctly since no downstream middleware observes it, but a future refactor could make it fully immutable.

3. **buildMiddlewareResult timing extraction**: Only extracts `timing_duration_ms` from metadata (line 101-103 of pipeline.ts). If additional middleware add timing data, the `middlewareTiming` map would need expansion. Current design is sufficient for the three default middleware.

---

## Verdict: PASSED

All four deliverables exist, are substantive, and are properly wired into the harness module. The 57 tests pass, typecheck is clean, and the implementation follows all project architectural conventions.
