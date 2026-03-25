---
phase: 4
plan: 1
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 4 Plan 1: DAG Executor, Serializer, Visualizer, Pipeline, Registration

## Objective

Complete the `src/workflow/` domain by implementing the five remaining helpers: checkpoint serializer (A08), topology transformer (A09), reference phase pipeline (A10), wave-based DAG executor (A07), and domain registration (A11). After this phase the workflow domain is fully functional and registered as a T1 Core domain in the boundary enforcement script and architecture docs.

> Appetite: Small (50,000 token ceiling). Three waves keep context load minimal — Wave 1 handles three independent helpers in parallel, Wave 2 delivers the highest-risk executor after its serializer dependency is available, Wave 3 locks in registration.

## Context

- @src/workflow/index.ts — barrel with placeholder comments for A07-A10 that must be replaced
- @src/workflow/\_\_schemas/workflow.schemas.ts — DAGCheckpoint, WorkflowDAG, WorkflowStep, Adapter, StepResult, ExecutionResult types
- @src/workflow/\_\_schemas/contracts.schemas.ts — step contract schemas (Classify/Discuss/Plan/Execute/Verify/Learn/CommitOutput)
- @src/workflow/\_\_helpers/dag-builder.ts — buildPhaseDAG() API used by A10
- @src/workflow/\_\_helpers/dag-sorter.ts — topologicalSort() used by A07
- @src/workflow/\_\_helpers/dag-validator.ts — validateDAG() used by A07
- @scripts/check-domain-boundaries.ts — DOMAIN_TIER record, needs `workflow: 1` added
- @.claude/rules/domain-architecture.md — Archetype B table and T1 tier row
- @.claude/rules/module-boundary.md — T1 Core tier map line
- @.gitignore — ephemeral checkpoint directory must be excluded

## Tasks

### 1. A08 — DAG Serializer

**Type:** auto
**TDD:** false
**Depends on:** (none — prerequisites complete from Phases 2-3)

Create `src/workflow/__helpers/dag-serializer.ts` with three exported functions:

- `saveCheckpoint(checkpoint, basePath?)` — serializes DAGCheckpoint to `.planning/checkpoints/{dagName}.json`. Creates directory if absent via `require("node:fs").mkdirSync`. Writes JSON via `Bun.write()` (bun-preference rule).
- `loadCheckpoint(dagName, basePath?)` — reads with `fs.readFileSync` (synchronous; Bun.file().text() is async). Validates via `DAGCheckpointSchema.safeParse()`. Returns null for missing file, invalid JSON, schema failure, or future `checkpointSchemaVersion`. Logs warnings in warn cases.
- `clearCheckpoint(dagName, basePath?)` — removes the file with `fs.unlinkSync`. Silently succeeds if absent.

Implement verbatim from the todo spec at `.planning/todos/pending/runtime-a08-dag-serializer.md`.

**Files to create/edit:**

- `src/workflow/__helpers/dag-serializer.ts` (create)
- `src/workflow/index.ts` — replace `// Added by A08` placeholder with:

  ```typescript
  // ─── DAG Serializer ──────────────────────────────────────────────────────────

  export {
    saveCheckpoint,
    loadCheckpoint,
    clearCheckpoint,
  } from "./__helpers/dag-serializer.ts";
  ```

**Verification:**

- `bunx --bun tsc --noEmit` passes
- saveCheckpoint creates `.planning/checkpoints/{dagName}.json`
- saveCheckpoint creates the directory if absent
- loadCheckpoint returns a valid DAGCheckpoint for a previously saved file
- loadCheckpoint returns null for nonexistent file, invalid JSON, schema mismatch, and future schema version
- clearCheckpoint removes the file; does not throw for nonexistent file
- Round-trip: saveCheckpoint then loadCheckpoint returns data equal to the input
- Barrel index contains only re-export statements

---

### 2. A09 — DAG-to-Topology Transformer

**Type:** auto
**TDD:** false
**Depends on:** (none — prerequisites complete from Phases 2-3)

Create `src/workflow/__helpers/dag-visualizer.ts` exporting a single pure function:

```typescript
export function dagToTopology(
  dag: WorkflowDAG,
  complexity?: string,
): TopologyResponse;
```

The function transforms a WorkflowDAG into the `WorkflowTopologyResponse` format consumed by luca-observer's React Flow editor. Key implementation details:

- Define local `TopologyNode`, `TopologyEdge`, `TopologyResponse` interfaces that mirror `packages/luca-observer/lib/workflow-types.ts` but avoid a cross-package import (observer validates via Zod at the API boundary).
- `CATEGORY_TO_STAGE` maps step categories to stage strings; gate steps inherit stage from first dependency via `resolveStage()`.
- `resolveNodeType()` returns `"gate"` for gate category, `"skill"` for handlers in `KNOWN_SKILL_HANDLERS`, `"agent"` for all others.
- Container sizing constants (`HEADER_HEIGHT`, `COLUMN_WIDTH`, etc.) are duplicated from `workflow-topology.ts` — stable layout values.
- Stage-group container nodes are built first, stacked vertically with `GROUP_Y_GAP`. Child step nodes carry `parent_id` and `extent: "parent"`.
- Spine edges connect consecutive stage-group containers. Dependency edges come from `step.dependsOn`.

Implement verbatim from `.planning/todos/pending/runtime-a09-dag-visualizer.md`.

**Files to create/edit:**

- `src/workflow/__helpers/dag-visualizer.ts` (create)
- `src/workflow/index.ts` — replace `// Added by A09` placeholder with:

  ```typescript
  // ─── DAG Visualizer ──────────────────────────────────────────────────────────

  export { dagToTopology } from "./__helpers/dag-visualizer.ts";
  ```

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `dagToTopology()` returns object with `nodes`, `edges`, `stages` arrays
- Each unique stage produces one `stage-group` container node
- Each DAG step produces a child node with `parent_id` referencing its container
- Stage-group containers stacked vertically with GROUP_Y_GAP spacing
- Gate category steps produce `node_type: "gate"`
- Known skill handlers produce `node_type: "skill"`
- All other steps produce `node_type: "agent"`
- dependsOn relationships produce `edge_type: "data-flow"` edges
- Spine edges connect consecutive stage groups
- Barrel index contains only re-export statements

---

### 3. A10 — Reference Phase Pipeline DAG

**Type:** auto
**TDD:** false
**Depends on:** (none — prerequisites complete from Phases 2-3)

Create `src/workflow/__helpers/phase-pipeline.ts` exporting a single frozen constant:

```typescript
export const PHASE_PIPELINE: Readonly<WorkflowDAG>;
```

Built using `buildPhaseDAG("phase-pipeline").version("1.0.0")` with exactly 7 steps in linear dependency order: `classify -> discuss -> plan -> execute -> verify -> learn -> commit`. Each step is wired with the appropriate contract schema (from `contracts.schemas.ts`) as inputSchema/outputSchema, a handler name, and `metadata.category`. The `plan` step includes a guard function checking `ctx.planCount === undefined || ctx.planCount === 0`.

Implement verbatim from `.planning/todos/pending/runtime-a10-phase-pipeline.md`.

**Files to create/edit:**

- `src/workflow/__helpers/phase-pipeline.ts` (create)
- `src/workflow/index.ts` — replace `// Added by A10` placeholder with:

  ```typescript
  // ─── Phase Pipeline ──────────────────────────────────────────────────────────

  export { PHASE_PIPELINE } from "./__helpers/phase-pipeline.ts";
  ```

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `PHASE_PIPELINE.name === "phase-pipeline"` and `PHASE_PIPELINE.version === "1.0.0"`
- `PHASE_PIPELINE.steps.length === 7` with IDs: classify, discuss, plan, execute, verify, learn, commit
- Dependency chain is linear — each step depends exactly on the previous step
- `plan` step has a guard function defined
- All steps have `metadata.category` set
- `Object.isFrozen(PHASE_PIPELINE)` returns true
- `validateDAG(PHASE_PIPELINE)` returns `{ valid: true, errors: [], warnings: [] }` (schema compatibility warnings acceptable)
- Barrel index contains only re-export statements

---

### 4. A07 — DAG Executor with Wave Execution

**Type:** auto
**TDD:** false
**Depends on:** Tasks 1 (A08 serializer must exist before executor can import saveCheckpoint/clearCheckpoint)

Create `src/workflow/__helpers/dag-executor.ts` exporting:

```typescript
export async function executeDAG(
  dag: WorkflowDAG,
  adapter: Adapter,
  context: Record<string, unknown>,
  options?: ExecuteDAGOptions,
): Promise<ExecutionResult>

export interface ExecuteDAGOptions { ... }
```

This is the highest-risk file in Phase 4. Key implementation requirements (all verbatim from `.planning/todos/pending/runtime-a07-dag-executor.md`):

1. Validate DAG via `validateDAG()` — return `status: "failed"` immediately if invalid
2. Topologically sort via `topologicalSort()` — produces wave arrays
3. If checkpoint provided, restore completed/skipped stepResults and accumulatedContext; set `startWave = checkpoint.currentWave`
4. For each wave: evaluate guards (exception = skipped, not crash), execute active steps via `Promise.allSettled` (NOT Promise.all — fail-isolated semantics), collect results, record trace entry, persist checkpoint via `saveCheckpoint()`
5. Clear checkpoint on successful completion via `clearCheckpoint()`
6. `executeStepWithRetry()` — internal function handling AbortController timeout (Temporal pattern), retry loop with configurable backoff (none=0ms, linear=attempt*1000ms, exponential=2^attempt*500ms), input/output schema validation in warn or strict mode
7. XState integration is deferred to Phase B — the executor is a pure execution engine

**Files to create/edit:**

- `src/workflow/__helpers/dag-executor.ts` (create)
- `src/workflow/index.ts` — replace `// Added by A07` placeholder with:

  ```typescript
  // ─── DAG Executor ────────────────────────────────────────────────────────────

  export { executeDAG } from "./__helpers/dag-executor.ts";
  export type { ExecuteDAGOptions } from "./__helpers/dag-executor.ts";
  ```

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Linear pipeline with mock adapter returns `status: "completed"` with all step results
- Guard returning false marks step `status: "skipped"` — does not crash
- Guard throwing exception marks step `status: "skipped"` — does not crash
- Step timeout produces `status: "timeout"` result
- Retry exhaustion produces `status: "failed"` with `retryCount` equal to max-1
- `Promise.allSettled` used — parallel step failure does not cancel sibling steps
- Checkpoint persisted after each wave when `persistCheckpoints: true`
- Checkpoint cleared on successful completion
- Resume from checkpoint skips already-completed steps
- Output schema mismatch in warn mode logs warning but continues
- Output schema mismatch in strict mode fails the step
- Barrel index contains only re-export statements

---

### 5. A11 — Register Workflow Domain

**Type:** auto
**TDD:** false
**Depends on:** Tasks 1, 2, 3, 4 (all A01-A10 must be complete)

Four targeted edits to register the workflow domain in tooling and architecture docs:

1. **`scripts/check-domain-boundaries.ts`** — add `workflow: 1` to the `DOMAIN_TIER` record between `interop: 1` and `agents: 2`

2. **`.claude/rules/domain-architecture.md`** — add `workflow` row to Archetype B table and append `workflow` to the T1 Core row in the Four Dependency Tiers table

3. **`.claude/rules/module-boundary.md`** — append `, workflow` to the T1 Core line in the Dependency Tier Map

4. **`.gitignore`** — add `.planning/checkpoints/` with a comment if not already present (checkpoints are ephemeral local state)

Implement verbatim from `.planning/todos/pending/runtime-a11-domain-registration.md`.

Note: `tsconfig.json` path alias addition is mentioned in the phase prompt but A11's todo spec does not require it — the todo targets the four files above. Do not add a tsconfig path unless it is missing from the existing `~/workflow` alias already established in Phases 1-3.

**Files to create/edit:**

- `scripts/check-domain-boundaries.ts` (edit — add `workflow: 1`)
- `.claude/rules/domain-architecture.md` (edit — Archetype B table and T1 row)
- `.claude/rules/module-boundary.md` (edit — T1 Core line)
- `.gitignore` (edit — add `.planning/checkpoints/` if absent)

**Verification:**

- `bunx --bun tsc --noEmit` passes for the entire project
- `bun run scripts/check-domain-boundaries.ts` passes with zero violations
- `workflow` domain appears at T1 in the boundary script
- `workflow` domain appears in Archetype B table in domain-architecture.md
- `workflow` domain appears in T1 row in both domain-architecture.md and module-boundary.md
- `.planning/checkpoints/` is in .gitignore
- `src/workflow/index.ts` is a pure barrel (re-exports only, no logic)
- No tier violations: workflow only imports from T0 (shared) and T1 peers
- `bun run check:drift` passes

## Verification

Run after all five tasks complete:

```bash
bunx --bun tsc --noEmit
bun run scripts/check-domain-boundaries.ts
bun run check:drift
```

Manually confirm the barrel:

- `src/workflow/index.ts` exports `executeDAG`, `ExecuteDAGOptions`, `saveCheckpoint`, `loadCheckpoint`, `clearCheckpoint`, `dagToTopology`, `PHASE_PIPELINE` alongside all existing exports from Phases 2-3
- All placeholder comments (`// Added by A07` through `// Added by A10`) are replaced with real exports

## Success Criteria

- All five helpers exist under `src/workflow/__helpers/`
- `bunx --bun tsc --noEmit` exits 0
- `bun run scripts/check-domain-boundaries.ts` exits 0 with workflow listed at T1
- `bun run check:drift` exits 0
- `src/workflow/index.ts` is a pure barrel with no placeholder comments remaining
- `.planning/checkpoints/` is in `.gitignore`
- Architecture docs reference workflow as a T1 Core domain

## Output Specification

Files created:

- `/Users/alecsibilia/Github/luca-framework/src/workflow/__helpers/dag-serializer.ts`
- `/Users/alecsibilia/Github/luca-framework/src/workflow/__helpers/dag-visualizer.ts`
- `/Users/alecsibilia/Github/luca-framework/src/workflow/__helpers/phase-pipeline.ts`
- `/Users/alecsibilia/Github/luca-framework/src/workflow/__helpers/dag-executor.ts`

Files modified:

- `/Users/alecsibilia/Github/luca-framework/src/workflow/index.ts` (4 placeholder sections replaced)
- `/Users/alecsibilia/Github/luca-framework/scripts/check-domain-boundaries.ts`
- `/Users/alecsibilia/Github/luca-framework/.claude/rules/domain-architecture.md`
- `/Users/alecsibilia/Github/luca-framework/.claude/rules/module-boundary.md`
- `/Users/alecsibilia/Github/luca-framework/.gitignore`
