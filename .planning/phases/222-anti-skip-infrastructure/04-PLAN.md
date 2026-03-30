---
phase: 222
plan: 4
type: feature
autonomous: true
wave: 4
depends_on: [1]
---

# Phase 222 Plan 4: Event-Sourced Gap Detection

## Objective

Build the post-execution gap detector that audits DAG execution results to identify steps that were expected but never ran. Uses the structured skip entries from Wave 1 and the three-tier tolerance model (strict on required, tolerant on explicit skips, warn on optional). Exposes the gap detector via a `luca-bridge audit-gaps` subcommand for integration with the verification pipeline.

## Context

@src/workflow/**schemas/workflow.schemas.ts (SkipReasonSchema, SkippedStepEntrySchema from Wave 1)
@src/workflow/**helpers/dag-executor.ts (structured skip entries from Wave 1)
@src/workflow/index.ts
@packages/luca-framework/src/state/bridge.ts
@.planning/phases/222-anti-skip-infrastructure/01-CONTEXT.md (Decision #4)
@.planning/phases/222-anti-skip-infrastructure/01-PREMORTEM.md (Constraint #1)

## Tasks

### 1. Create gap-detector.ts with three-tier tolerance model

**Type:** auto
**TDD:** false
**Depends on:** none (but depends on Wave 1 schema changes being present)

Create `src/workflow/__helpers/gap-detector.ts` with the gap detection logic.

**PREMORTEM Constraint #1 (pre-satisfied):** `DAGCheckpointSchema.skippedSteps` was widened to structured entries in Wave 1 (Plan 1, Task 1). This task can safely consume the structured format.

**Schemas to define in gap-detector.ts:**

```typescript
/** Severity of a detected gap */
export const GapSeveritySchema = z.enum(["fail", "warning", "info"]);

/** A single detected gap in execution coverage */
export const ExecutionGapSchema = z.object({
  /** Step ID that was expected but not found */
  stepId: z.string(),
  /** Step name for human readability */
  stepName: z.string(),
  /** Whether the step is optional */
  optional: z.boolean(),
  /** What was expected (completed/skipped/failed) */
  expectedStatus: z.string(),
  /** What was found (or "missing" if no record exists) */
  actualStatus: z.string().default("missing"),
  /** Severity: fail for required gaps, warning for optional, info for noted skips */
  severity: GapSeveritySchema,
  /** Human-readable recommendation */
  recommendation: z.string(),
});

/** Result of a gap audit */
export const GapAuditResultSchema = z.object({
  /** Overall audit status */
  status: z.enum(["clean", "gaps_found", "error"]),
  /** Detected gaps */
  gaps: z.array(ExecutionGapSchema),
  /** Summary counts */
  summary: z.object({
    totalSteps: z.number(),
    completedSteps: z.number(),
    skippedSteps: z.number(),
    failedSteps: z.number(),
    missingSteps: z.number(),
    optionalMissing: z.number(),
  }),
});
```

**Core function: `detectGaps`**

```typescript
/**
 * Audit a DAG execution for coverage gaps.
 *
 * Three-tier tolerance model (from CONTEXT.md Decision #4):
 * - Required step with no ledger entry: FAIL (gap detected)
 * - Step skipped via --skip flag: PASS (requires structured entry with reason)
 * - Step with guard returning false: PASS (recorded in skippedSteps)
 * - Optional step absent: WARNING (not failure)
 *
 * @param dag - The workflow DAG definition (source of truth for expected steps)
 * @param checkpoint - The execution checkpoint with completed/skipped/failed steps
 * @returns GapAuditResult with gaps and summary
 */
export function detectGaps(
  dag: WorkflowDAG,
  checkpoint: DAGCheckpoint,
): GapAuditResult;
```

**Detection logic for each step in the DAG:**

1. Check `checkpoint.completedSteps[step.id]` -- if present, step is covered (no gap)
2. Check `checkpoint.skippedSteps` for a structured entry with matching ID:
   - If found with reason `"guard-false"`: PASS (legitimate skip)
   - If found with reason `"flag-skip"`: PASS (explicit user skip)
   - If found with reason `"guard-exception"`: WARNING (should be investigated, but not a gap)
3. Check `checkpoint.failedSteps[step.id]` -- if present, step attempted but failed (not a gap, but noted)
4. If step is in NONE of the above:
   - If `step.optional === true`: WARNING severity with recommendation "Optional step not executed"
   - If `step.optional === false`: FAIL severity with recommendation "Required step was never executed"

**Files to create/edit:**

- `src/workflow/__helpers/gap-detector.ts` (create)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `detectGaps` correctly identifies:
  - Required steps with no record as FAIL
  - Optional steps with no record as WARNING
  - Guard-skipped steps as PASS (no gap)
  - Flag-skipped steps as PASS (no gap)
  - Guard-exception steps as WARNING

### 2. Add audit-gaps subcommand to bridge.ts (inline gap detection)

**Type:** auto
**TDD:** false
**Depends on:** 1

Extend `packages/luca-framework/src/state/bridge.ts` with the `audit-gaps` subcommand.

**CRITICAL: `handleAuditGaps` implements gap detection inline. No import from `~/workflow` needed.**

The bridge lives in `packages/luca-framework/src/state/` and cannot import from `~/workflow` (which resolves to root `src/workflow/`). There is no cross-package path alias. The gap detection logic is simple enough to implement self-contained in the bridge handler:

1. Read checkpoint data from state (completedSteps, skippedSteps, failedSteps)
2. Read DAG step definitions from state or reconstruct from phase pipeline
3. For each expected step, classify coverage using the three-tier tolerance model
4. Output structured JSON result

The `gap-detector.ts` in `src/workflow/__helpers/` (Task 1) remains as the reusable library for non-bridge consumers (lu-verifier, phase-execute, etc.). The bridge handler has its own self-contained implementation that follows the same three-tier tolerance logic.

**Changes:**

1. Add `"audit-gaps"` to the `VALID_SUBCOMMANDS` array

2. Create `handleAuditGaps` async function with inline gap detection:

   ```typescript
   async function handleAuditGaps(args: string[]): Promise<void> {
     // 1. Read current DAG checkpoint from state (completedSteps, skippedSteps, failedSteps)
     // 2. Read expected step list from state or phase pipeline
     // 3. Inline gap detection (same three-tier logic as gap-detector.ts):
     //    - Required step with no record -> FAIL
     //    - Optional step with no record -> WARNING
     //    - Guard-skipped / flag-skipped -> PASS
     //    - Guard-exception -> WARNING
     // 4. Build GapAuditResult-shaped JSON (status, gaps[], summary)
     // 5. Output JSON result to stdout
     // 6. Exit with code 0 (clean) or 1 (gaps found)
   }
   ```

3. Add `case "audit-gaps":` to the switch statement

4. Export `handleAuditGaps` in the module exports section

**Follow the existing bridge subcommand pattern:**

- Read state via the bridge's internal `readFromState` helper
- Output structured JSON to stdout via `console.log(JSON.stringify(...))`
- Use `process.exit(0)` for clean, `process.exit(1)` for gaps found
- Handle errors gracefully with structured error JSON

**Files to create/edit:**

- `packages/luca-framework/src/state/bridge.ts` (edit)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `VALID_SUBCOMMANDS` includes "audit-gaps"
- `handleAuditGaps` implements gap detection inline (no import from `~/workflow`)
- Three-tier tolerance model is applied correctly
- Exit code 0 for clean, 1 for gaps found

### 3. Export gap detector from workflow barrel

**Type:** auto
**TDD:** false
**Depends on:** 1

Add exports to `src/workflow/index.ts`:

- `detectGaps` function
- `GapSeveritySchema`, `ExecutionGapSchema`, `GapAuditResultSchema` (values)
- `GapSeverity`, `ExecutionGap`, `GapAuditResult` (types)

**Files to create/edit:**

- `src/workflow/index.ts` (edit)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- All gap detector symbols importable from `~/workflow`

### 4. Add JSDoc documentation for gap detection module

**Type:** auto
**TDD:** false
**Depends on:** 1, 2, 3

Ensure comprehensive JSDoc documentation on all exported functions and types:

- `detectGaps`: Document the three-tier tolerance model, parameters, return type, and usage example
- `GapAuditResultSchema`: Document each field's purpose
- `ExecutionGapSchema`: Document severity levels and their meanings
- `handleAuditGaps`: Document bridge integration and output format

Add a module-level JSDoc comment at the top of `gap-detector.ts` explaining:

- Purpose: Post-execution audit for step coverage
- Relationship to PREMORTEM Constraint #1 (requires structured skip entries)
- Three-tier tolerance model summary
- Integration point: `luca-bridge audit-gaps` subcommand

**Files to create/edit:**

- `src/workflow/__helpers/gap-detector.ts` (edit -- add/enhance JSDoc)
- `packages/luca-framework/src/state/bridge.ts` (edit -- add JSDoc to handleAuditGaps)

**Verification:**

- All exported functions have JSDoc with @param, @returns, @example
- Module-level documentation explains the three-tier model

## Verification

1. Run `bunx --bun tsc --noEmit` -- must pass with zero errors
2. Confirm `src/workflow/__helpers/gap-detector.ts` exists with `detectGaps` function
3. Confirm `packages/luca-framework/src/state/bridge.ts` has `audit-gaps` subcommand
4. Confirm gap detector uses structured skip entries (not bare string IDs)
5. Confirm three-tier tolerance model:
   - Required + missing = FAIL
   - Optional + missing = WARNING
   - Guard-skipped = PASS
   - Flag-skipped = PASS
   - Guard-exception = WARNING
6. Confirm `luca-bridge audit-gaps` outputs structured JSON
7. Confirm all symbols exported from `src/workflow/index.ts`

## Success Criteria

- `detectGaps()` correctly classifies all step states using the three-tier tolerance model
- Gap detector consumes the structured `SkippedStepEntry` format from Wave 1 (not bare strings)
- Bridge `audit-gaps` subcommand outputs structured JSON with gaps and summary
- Bridge exits with code 0 (clean) or 1 (gaps found)
- Comprehensive JSDoc documentation on all public APIs
- Post-execution audit only -- does not block execution (that is Layer 3's job)

## Output Specification

- Created: `src/workflow/__helpers/gap-detector.ts`
- Modified: `packages/luca-framework/src/state/bridge.ts`
- Modified: `src/workflow/index.ts`
