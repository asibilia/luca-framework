---
phase: 222
plan: 2
type: feature
autonomous: true
wave: 2
depends_on: [1]
---

# Phase 222 Plan 2: Progressive Disclosure Executor Mode

## Objective

Create `executeProgressively()` in `src/workflow/__helpers/progressive-executor.ts` -- a zone-adaptive execution wrapper that produces structured summaries of prior step outputs with degradation based on context budget zones (PEAK/GOOD/DEGRADING/POOR). This enables downstream steps to receive appropriately sized context from upstream steps without consuming excessive context budget.

## Context

@src/workflow/**helpers/dag-executor.ts
@src/context/**helpers/resolve-context-tier.ts
@src/context/**schemas/context.schemas.ts
@src/hooks/**schemas/hook.schemas.ts (ContextZone type)
@.planning/phases/222-anti-skip-infrastructure/01-CONTEXT.md (Decision #3)
@.planning/phases/222-anti-skip-infrastructure/01-PREMORTEM.md (Constraint #3)

## Tasks

### 1. Define progressive execution schemas

**Type:** auto
**TDD:** false
**Depends on:** none

Create Zod schemas for the progressive execution system at the top of `src/workflow/__helpers/progressive-executor.ts`.

**Schemas to define:**

```typescript
/**
 * Context zone type -- reuse the existing contextZoneSchema from hooks.
 *
 * DO NOT re-define ContextZoneSchema. Import the existing one:
 *   import { contextZoneSchema, type ContextZone } from "~/hooks/__schemas/hook.schemas";
 *
 * The existing schema uses lowercase values: ["peak", "good", "degrading", "stop"].
 * The "stop" zone maps to what CLAUDE.md calls "POOR" (>70% usage).
 *
 * Create a mapping function to convert hook zones to progressive disclosure modes:
 *   - "peak" -> full summary (intent, decisions, artifacts, outputPointers)
 *   - "good" -> full summary (same as peak)
 *   - "degrading" -> decisions-only (drop artifacts and outputPointers)
 *   - "stop" -> minimal (keep only stepId and status)
 */

/** Structured summary of a completed step's execution */
export const StepSummarySchema = z.object({
  /** Step ID */
  stepId: z.string(),
  /** One-sentence intent */
  intent: z.string().default(""),
  /** Key decisions made during execution */
  decisions: z.array(z.string()).default([]),
  /** File paths written or modified */
  artifacts: z.array(z.string()).default([]),
  /** Pointers to outputs (not full output content) */
  outputPointers: z.array(z.string()).default([]),
  /** Step pass/fail status */
  status: z.enum(["completed", "failed", "skipped"]),
});

/** Configuration for progressive execution behavior */
export const ProgressiveExecutorConfigSchema = z.object({
  /** Override context mode (bypasses zone-based degradation) */
  contextMode: z
    .enum(["full", "summary", "decisions-only", "minimal"])
    .optional(),
  /** Zone boundaries as context usage percentages (maps to existing ContextZone values) */
  zoneBoundaries: z
    .object({
      peakEnd: z.number().default(30), // 0-30% -> "peak"
      goodEnd: z.number().default(50), // 30-50% -> "good"
      degradingEnd: z.number().default(70), // 50-70% -> "degrading", 70%+ -> "stop"
    })
    .default({}),
});
```

**Files to create/edit:**

- `src/workflow/__helpers/progressive-executor.ts` (create -- schemas section)

**Verification:**

- Schemas parse valid input via safeParse
- Zone thresholds match CLAUDE.md quality degradation curve (0-30% PEAK, 30-50% GOOD, 50-70% DEGRADING, 70%+ POOR)

### 2. Implement zone resolution and summary degradation

**Type:** auto
**TDD:** false
**Depends on:** 1

Implement the core functions in `progressive-executor.ts`.

**Import the existing context zone schema** -- do NOT re-define it:

```typescript
import {
  contextZoneSchema,
  type ContextZone,
} from "~/hooks/__schemas/hook.schemas";
```

Note: `progressive-executor.ts` is in `src/workflow/__helpers/` (T1 Core). Importing from `src/hooks/__schemas/` (T3 Build) is an upward import. However, the `contextZoneSchema` is a pure data schema with no behavioral dependencies. If the boundary check flags this, an alternative is to define a local `resolveContextZone` that returns plain string literals matching the hook schema values ("peak", "good", "degrading", "stop") and use `ContextZone` as a type-only import.

**`resolveContextZone(usagePercent: number, boundaries?): ContextZone`**

- Maps a context usage percentage to a zone using the existing lowercase values: "peak" (0-30%), "good" (30-50%), "degrading" (50-70%), "stop" (70%+)
- Accepts optional custom boundaries from config

**`degradeSummary(summary: StepSummary, zone: ContextZone): StepSummary`**

- "peak" zone: Return full structured summary (intent, decisions, artifacts, outputPointers)
- "good" zone: Return full structured summary (same as peak)
- "degrading" zone: Drop artifacts and outputPointers, keep intent and decisions
- "stop" zone: Keep only stepId and status (intent becomes empty, decisions emptied)

**`formatSummariesForContext(summaries: StepSummary[], zone: ContextZone): string`**

- Renders degraded summaries as a compact text block suitable for inclusion in downstream step context
- Uses markdown-style formatting: step ID as header, decisions as bullet list

**Files to create/edit:**

- `src/workflow/__helpers/progressive-executor.ts` (edit -- add functions)

**Verification:**

- `resolveContextZone(25)` returns "peak"
- `resolveContextZone(40)` returns "good"
- `resolveContextZone(60)` returns "degrading"
- `resolveContextZone(80)` returns "stop"
- `degradeSummary(fullSummary, "stop")` strips everything except stepId and status

### 3. Implement executeProgressively wrapper

**Type:** auto
**TDD:** false
**Depends on:** 2

Implement the main `executeProgressively()` function that wraps `executeDAG` with progressive disclosure behavior.

**Function signature:**

```typescript
export async function executeProgressively(
  dag: WorkflowDAG,
  adapter: WorkflowAdapter,
  context: Record<string, unknown>,
  options: ExecuteDAGOptions & {
    progressiveConfig?: ProgressiveExecutorConfig;
    getContextUsagePercent?: () => Promise<number>;
  },
): Promise<ExecutionResult & { summaries: StepSummary[] }>;
```

**Key behaviors:**

1. Accept an optional `getContextUsagePercent` callback that returns current context usage (0-100). Default: returns 0 (PEAK zone, no degradation).

2. **PREMORTEM Constraint #3:** Re-query context zone via `getContextUsagePercent()` at each wave boundary, not just at invocation time. The zone may change as waves consume tokens.

3. After each wave completes, build `StepSummary` entries for completed steps from `StepResult` data.

4. Degrade summaries based on current zone before adding them to accumulated context.

5. Inject degraded summaries into the execution context under a `__priorStepSummaries` key so downstream steps can read them.

6. If `progressiveConfig.contextMode` is provided, use that mode directly instead of zone-based degradation (testing override per CONTEXT.md Decision #3).

7. Return the standard `ExecutionResult` plus the accumulated `summaries` array.

**Implementation approach:**

- Do NOT fork or duplicate `executeDAG`. Instead, wrap it per-wave by pre-processing context and post-processing results. If the DAG needs wave-by-wave control, call `executeDAG` with checkpoint advancement (execute one wave at a time by setting up checkpoints).
- Alternatively, extract the wave loop from executeDAG into a shared helper if wrapping proves insufficient.

**Files to create/edit:**

- `src/workflow/__helpers/progressive-executor.ts` (edit -- add main function)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Function signature matches the specification
- Context zone is re-queried per wave (PREMORTEM Constraint #3)
- `contextMode` override bypasses zone resolution

### 4. Export progressive executor from workflow barrel

**Type:** auto
**TDD:** false
**Depends on:** 3

Add exports to `src/workflow/index.ts`:

- `executeProgressively` function
- `StepSummarySchema`, `ProgressiveExecutorConfigSchema` (values)
- `StepSummary`, `ProgressiveExecutorConfig` (types)
- `resolveContextZone`, `degradeSummary`, `formatSummariesForContext` (utility functions)

Note: `ContextZoneSchema` is NOT exported here because it is not re-defined -- consumers should import `contextZoneSchema` from `~/hooks/__schemas/hook.schemas` (or use `ContextZone` as a type-only import).

**Files to create/edit:**

- `src/workflow/index.ts` (edit)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- All progressive executor symbols importable from `~/workflow`

## Verification

1. Run `bunx --bun tsc --noEmit` -- must pass with zero errors
2. Confirm `src/workflow/__helpers/progressive-executor.ts` exists with all functions
3. Confirm zone boundaries match CLAUDE.md curve: "peak" 0-30%, "good" 30-50%, "degrading" 50-70%, "stop" 70%+ (using existing contextZoneSchema values)
4. Confirm source code of `executeProgressively` calls `getContextUsagePercent()` inside the wave loop (not cached at invocation time) -- PREMORTEM Constraint #3
5. Confirm source code reads `contextMode` from config before calling `resolveContextZone`, and bypasses zone resolution when `contextMode` is set
6. Confirm all symbols exported from `src/workflow/index.ts`

## Success Criteria

- `executeProgressively()` wraps DAG execution with zone-adaptive context summaries
- Structured summaries include intent, decisions, artifacts, and output pointers
- Degradation policy matches spec: "peak"/"good" = full, "degrading" = decisions-only, "stop" = minimal (using existing contextZoneSchema values, no re-definition)
- Zone is re-evaluated per wave boundary, not cached at invocation
- Testing override via `contextMode` parameter works
- No new dependencies introduced (reuses existing `contextZoneSchema` from hooks)

## Output Specification

- Created: `src/workflow/__helpers/progressive-executor.ts`
- Modified: `src/workflow/index.ts`
