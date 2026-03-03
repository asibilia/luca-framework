---
id: 91-A
title: "Ground truth tracking for debate measurement"
phase: 91
wave: 1
complexity: MODERATE
todo: 41
---

# 91-A: Ground Truth Tracking for Debate Measurement

## Objective

Add measurement infrastructure to track iteration outcomes, plan quality, review findings, and convergence behavior. This provides the ground truth data needed to measure whether debate mechanisms (91-B, 91-C) actually improve outcomes compared to the non-debate baseline.

Without measurement, we cannot know if debates help. This plan must land before debate mechanisms are evaluated.

## Context

@src/iteration/**schemas/iteration.schemas.ts -- ConvergenceResult, IterationRecord, LoopResult schemas
@src/iteration/**helpers/convergence.ts -- assessConvergence, computeConvergenceSignals
@src/iteration/**helpers/budget.ts -- BudgetState, assessBudget
@src/iteration/**helpers/checkpoint.ts -- createCheckpoint, IterationRecord persistence
@src/planner/**schemas/planner.schemas.ts -- WSJFInput, WSJFScoredItem, SessionPlan
@src/planner/**helpers/scoring.ts -- computeWSJF, rankByWSJF
@src/memory/\_\_schemas/memory.schemas.ts -- MemoryEntry schema, compression strategies
@src/skills/general/phase-execute.skill.ts -- Orchestrator: Loop A (harness fix), Loop B (verify fix), code review spawning

The iteration system already tracks per-iteration data via IterationRecord and checkpoint JSON files. The planner already computes WSJF scores. What is missing is:

1. Aggregated metrics across sessions (not just per-checkpoint)
2. Plan quality correlation (WSJF score vs actual execution time/outcome)
3. Review finding counts (baseline for pre-debate vs post-debate comparison)
4. Convergence event tracking (stall/halt decisions as ground truth for 91-B)

## Tasks

### Task 1: Define metrics schemas

**Goal:** Create Zod schemas for the four metric categories in a new `src/iteration/__schemas/metrics.schemas.ts` file.

**Files:** `src/iteration/__schemas/metrics.schemas.ts` (new)

**Steps:**

1. Create `metrics.schemas.ts` in `src/iteration/__schemas/`
2. Define `iterationMetricsSchema` with fields:
   - `phase`: number
   - `loop`: "harness" | "verify"
   - `predicted_stall_point`: number (from stale_threshold config)
   - `actual_iteration_count`: number
   - `outcome`: LoopOutcome (from existing schema)
   - `stall_events`: array of `{ iteration: number, stale_count: number, halted: boolean }`
   - `debate_changed_outcome`: boolean (default false, set by 91-B when active)
   - `timestamp`: string (ISO 8601)
3. Define `planQualityMetricsSchema` with fields:
   - `plan_id`: string (e.g., "91-A")
   - `phase`: number
   - `wsjf_score`: number
   - `complexity`: string
   - `execution_duration_ms`: number
   - `outcome`: "success" | "partial" | "failed"
   - `gap_count`: number (from verifier)
   - `timestamp`: string
4. Define `reviewMetricsSchema` with fields:
   - `phase`: number
   - `reviewer_count`: number
   - `total_issues`: number
   - `issues_by_severity`: `{ critical: number, high: number, medium: number, low: number }`
   - `issues_by_agent`: record of agent name to count
   - `debate_enabled`: boolean (default false, set by 91-C when active)
   - `disagreements_detected`: number (default 0, populated by 91-C)
   - `timestamp`: string
5. Define `convergenceMetricsSchema` with fields:
   - `phase`: number
   - `loop`: "harness" | "verify"
   - `premature_halt`: boolean
   - `halt_iteration`: number
   - `total_stale_count`: number
   - `signals_at_halt`: ConvergenceSignals (from existing schema)
   - `debate_override`: boolean (default false, set by 91-B when active)
   - `timestamp`: string
6. Define `metricsFileSchema` as the top-level structure:
   - `version`: literal "1.0"
   - `iteration_metrics`: array of iterationMetricsSchema
   - `plan_quality_metrics`: array of planQualityMetricsSchema
   - `review_metrics`: array of reviewMetricsSchema
   - `convergence_metrics`: array of convergenceMetricsSchema

**Verification:**

- [ ] All schemas use snake_case per API conventions
- [ ] All schemas have JSDoc documentation
- [ ] Types are exported via `z.infer`
- [ ] File follows kebab-case naming

### Task 2: Create metrics collection helpers

**Goal:** Create pure functions to build metric entries from existing data structures and append them to the metrics file.

**Files:** `src/iteration/__helpers/metrics-collector.ts` (new)

**Steps:**

1. Create `metrics-collector.ts` in `src/iteration/__helpers/`
2. Implement `buildIterationMetrics(loopResult: LoopResult, config: LoopConfig): IterationMetrics` -- extracts metrics from the existing LoopResult that phase-execute already produces at loop termination
3. Implement `buildPlanQualityMetrics(planId: string, phase: number, wsjfScore: number, complexity: string, durationMs: number, outcome: string, gapCount: number): PlanQualityMetrics`
4. Implement `buildReviewMetrics(phase: number, reviewerResults: Array<{agent: string, issues: Array<{severity: string}>}>): ReviewMetrics`
5. Implement `buildConvergenceMetrics(phase: number, convergenceResult: ConvergenceResult, loop: LoopType, debateOverride: boolean): ConvergenceMetrics`
6. Implement `appendMetrics(metricsPath: string, entry: Record<string, unknown>, category: string): Promise<void>` -- reads existing file, appends entry to the appropriate array, writes back. Creates file with empty structure if it does not exist.
7. Add CLI entry point (`if (import.meta.main)`) for manual metric recording:
   - `bun run src/iteration/__helpers/metrics-collector.ts append --category=iteration_metrics --data='...'`

**Verification:**

- [ ] All functions are pure (except appendMetrics which does file I/O)
- [ ] appendMetrics handles missing file gracefully (creates new)
- [ ] appendMetrics handles concurrent writes safely (read-modify-write with validation)
- [ ] No classes used (functional pattern)

### Task 3: Update iteration barrel exports

**Goal:** Export new schemas and helpers from the iteration module barrel.

**Files:** `src/iteration/index.ts`

**Steps:**

1. Add re-exports for all new schemas from `metrics.schemas.ts`
2. Add re-exports for all new types from `metrics.schemas.ts`
3. Add re-exports for all builder functions from `metrics-collector.ts`

**Verification:**

- [ ] `index.ts` contains only re-export statements (barrel invariant)
- [ ] All new public types and functions are accessible via `~/iteration`

### Task 4: Write tests for metrics infrastructure

**Goal:** Verify schema validation and builder functions work correctly.

**Files:** `__tests__/src/iteration/metrics-collector.test.ts` (new), `__tests__/src/iteration/metrics-schemas.test.ts` (new)

**Steps:**

1. Create schema tests:
   - Valid metric entries parse successfully
   - Missing required fields cause parse failure
   - Default values (debate_changed_outcome: false, debate_enabled: false) are applied
   - metricsFileSchema validates the complete structure
2. Create builder function tests:
   - `buildIterationMetrics` extracts correct values from a mock LoopResult
   - `buildPlanQualityMetrics` constructs valid schema-conformant entries
   - `buildReviewMetrics` correctly aggregates issues by severity and agent
   - `buildConvergenceMetrics` correctly maps convergence signals
3. Create appendMetrics tests:
   - Appends to existing file correctly
   - Creates new file when none exists
   - Validates entries before writing (rejects invalid data)

**Verification:**

- [ ] `bun test __tests__/src/iteration/metrics-collector.test.ts` passes
- [ ] `bun test __tests__/src/iteration/metrics-schemas.test.ts` passes
- [ ] Tests use `bun:test` imports

### Task 5: Document metrics system

**Goal:** Add JSDoc to all new functions and create a brief architecture note.

**Files:** All new files from Tasks 1-2

**Steps:**

1. Ensure all exported functions have JSDoc with @param, @returns, and @example
2. Ensure all schema fields have inline JSDoc comments (/\*_ ... _/)
3. Add module-level JSDoc to both new files explaining purpose and usage

**Verification:**

- [ ] Every exported function has JSDoc
- [ ] Every schema field has a JSDoc comment
- [ ] Module headers describe purpose

## Success Criteria

- [ ] `bun test __tests__/src/iteration/metrics-collector.test.ts` passes
- [ ] `bun test __tests__/src/iteration/metrics-schemas.test.ts` passes
- [ ] `bunx --bun tsc --noEmit` passes with no new type errors
- [ ] Metrics file can be created and appended to at `.planning/metrics.json`
- [ ] Schemas include debate-related fields (defaulted to false/0) ready for 91-B and 91-C to populate
- [ ] No cross-tier import violations (metrics stays in T1 iteration domain)
