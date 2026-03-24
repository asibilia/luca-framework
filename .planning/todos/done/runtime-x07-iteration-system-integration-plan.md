---
title: "Runtime X07: Iteration system integration plan — DAG executor consumes src/iteration/ helpers"
area: runtime-architecture
created: 2026-03-24
source: docs/runtime-architecture/research/backlog-integration.md
depends_on: []
phase: runtime-x
estimated_files: 1
---

## Context

The existing iteration domain (`src/iteration/`) provides decision-support utilities for externally-controlled loops: budget tracking, convergence detection, error classification, checkpoint management, and stall detection. The DAG executor's retry/convergence logic must REUSE these utilities rather than duplicating them.

The iteration module explicitly follows the "Ralph Wiggum pattern" — the phase-execute skill IS the loop controller; iteration provides intelligence for decisions. The DAG executor replaces phase-execute as the loop controller but continues to use iteration's intelligence.

## Task

### 1. Create integration specification document

**File:** `docs/runtime-architecture/decisions/iteration-integration-spec.md`

Write the following content:

---

# Iteration System Integration Specification

**Date:** 2026-03-24
**Applies to:** Phase A DAG executor (`src/workflow/__helpers/dag-executor.ts`)

## Principle

The DAG executor calls `src/iteration/` helpers directly. It does NOT wrap them in DAG-specific adapters. The iteration domain's barrel exports (`src/iteration/index.ts`) are the integration surface.

## Integration Points

### 1. Budget tracking — controls step retry limits

**Integration:** Before each DAG step retry, call `shouldStartIteration()` and `assessBudget()`.

**Iteration functions used:**

- `createBudgetState(config)` — initialize budget for a step's retry loop
- `shouldStartIteration(budgetState)` — check if another retry is allowed
- `assessBudget(budgetState)` — get detailed budget status (AVAILABLE, WARNING, EXHAUSTED)
- `advanceBudget(budgetState)` — increment attempt counter after each retry

**Complexity-gated loop budgets from `complexity-gating.md`:**

| Parameter                    | TRIVIAL | SIMPLE | MODERATE | COMPLEX | CRITICAL |
| ---------------------------- | ------- | ------ | -------- | ------- | -------- |
| Harness fix iterations       | 1       | 2      | 2        | 2       | 3        |
| Verify fix iterations        | 1       | 1      | 1        | 1       | 2        |
| Plan verification iterations | 1       | 1      | 1        | 2       | 3        |

The DAG executor reads these from the complexity matrix (`config.json` -> `complexity_matrix`) and passes them as `maxIterations` to `createBudgetState()`.

**Example DAG executor retry loop:**

```typescript
import {
  createBudgetState,
  shouldStartIteration,
  advanceBudget,
} from "~/iteration";

// In dag-executor.ts, for a step with retry enabled:
const budget = createBudgetState({
  maxIterations: complexityMatrix[complexity].harnessFixIterations,
  budgetTokens: undefined, // Token budget not used for step retries
});

while (shouldStartIteration(budget)) {
  const result = await executeStep(step, adapter);
  if (result.success) break;
  advanceBudget(budget);
}
```

### 2. Convergence detection — decides when verify loops should stop

**Integration:** After each verification attempt, compute convergence signals and assess whether to continue.

**Iteration functions used:**

- `createFingerprint(error)` — fingerprint harness errors for dedup
- `computeConvergenceSignals(current, previous)` — compute error_count_delta, fingerprint_overlap, artifact_change_delta
- `assessConvergence(signals, thresholds)` — returns CONVERGING, STALLED, or DIVERGING

**DAG executor usage:** The execute-verify loop within a phase calls `assessConvergence()` after each verify step. If STALLED, the executor can invoke the stall debate mechanism before retrying.

### 3. Error classification — routes errors to appropriate fix strategies

**Integration:** When harness fails, classify errors to determine retry strategy.

**Iteration functions used:**

- `classifyErrors(errors)` — classify each error as transient, correctable, or permanent
- `partitionByClass(classifiedErrors)` — group by class for different handling

**DAG executor usage:** After harness failure, classify errors. Only retry for `transient` and `correctable` errors. Skip `permanent` errors (they persist across retries and should not consume budget).

### 4. Stall detection — prevents infinite retry loops

**Integration:** Compare error fingerprints across iterations to detect stalls.

**Iteration functions used:**

- `detectStall(current, previous, options)` — returns stall indicators
- `areFingerprintsIdentical(set1, set2)` — check if errors are exactly the same

**DAG executor usage:** If `detectStall` returns a stall, the executor should either:

- Invoke `evaluateStallDebate()` (if complexity >= COMPLEX)
- Halt and send `PHASE_FAILED` event (if complexity < COMPLEX)

### 5. Checkpoint management — persists iteration state across retries

**Integration:** Create checkpoints before each retry attempt.

**Iteration functions used:**

- `createCheckpoint(phaseId, iteration, metadata)` — git tag + JSON metadata
- `rollbackToCheckpoint(tagName)` — restore to previous state if retry makes things worse
- `prunePhaseCheckpoints(phaseId, keepCount)` — clean up old checkpoints

**DAG executor usage:** Before each step retry, create a checkpoint. If the retry produces more errors than the previous attempt, rollback.

## What the DAG executor does NOT use from iteration

- `metricsCollector` — metrics are collected by the learning phase, not the executor
- `stallDebate` — the stall debate is invoked by the executor but the debate AGENT is spawned by the orchestrator (lu.skill.ts or DAG step), not by the iteration module

## No changes to src/iteration/ needed

The iteration domain's exports are already suitable for consumption by the DAG executor. No new functions, schemas, or helpers need to be added to `src/iteration/`. The DAG executor is a new consumer of existing APIs.

The one potential addition (deferred to Phase A implementation): if the DAG executor needs a higher-level "run step with retry and convergence" orchestration function, it should be placed in `src/workflow/__helpers/` (not in `src/iteration/`), calling iteration helpers internally.

---

## Verification

- `docs/runtime-architecture/decisions/iteration-integration-spec.md` exists
- Document maps all 5 iteration capabilities to DAG executor usage
- Complexity-gated loop budgets are referenced with correct values
- Code examples show exact function imports from `~/iteration`
- Document confirms no changes needed to `src/iteration/`

## Notes

- This is a specification document, not code changes. The implementing agent for Phase A uses this as the integration guide.
- The iteration module is T1 Core; the workflow module is also T1 Core. Same-tier imports are allowed, so `workflow` importing from `iteration` is valid.
