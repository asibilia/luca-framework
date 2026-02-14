---
id: "37-02"
title: "Recall, Lifecycle, Agent Integration & Final Verification"
phase: 37
wave: 2
depends_on: ["37-01"]
tasks:
  - id: "T1"
    title: "Create procedure recall module"
    description: "Create src/memory/procedure-recall.ts with a recallProcedures function that scores and selects relevant procedures for a given planning context. Scoring formula: (tag_overlap * 0.4) + (trigger_similarity * 0.4) + (success_rate * 0.2). Tag overlap uses Jaccard similarity between procedure tags and phase tags. Trigger similarity uses keyword overlap between the procedure's trigger text and the phase description. Only active procedures are considered. Returns top N entries sorted by relevance score, with configurable limit (default 5). Also export helper functions: computeTagOverlap, computeTriggerSimilarity, scoreProcedure for testability."
    files: ["src/memory/procedure-recall.ts"]
    verification: "recallProcedures() returns procedures sorted by descending relevance score. Procedures with matching tags score higher than those without. Procedures with higher success rates are preferred when tag/trigger scores are equal. Retired procedures are excluded. Empty procedure list returns empty array. Limit parameter correctly caps results."
  - id: "T2"
    title: "Create procedure lifecycle module"
    description: "Create src/memory/procedure-lifecycle.ts with evaluateRetirement function that determines whether a procedure should be retired based on configurable thresholds. Default criteria: (1) success_rate < 0.3 AND execution_count >= 5 (consistently failing), (2) last_executed_at older than 180 days AND execution_count < 3 (stale, unproven), (3) manual retirement flag. Also export applyRetirement that returns a new ProcedureEntry with status='retired' and retirement_reason set. Export updateExecutionStats that returns a new ProcedureEntry with incremented execution_count, optionally incremented success_count, and recomputed success_rate."
    files: ["src/memory/procedure-lifecycle.ts"]
    verification: "evaluateRetirement returns { should_retire: true, reason: '...' } for procedures with success_rate=0.2 and execution_count=6. evaluateRetirement returns { should_retire: false, reason: '' } for healthy procedures. Stale procedures (180+ days, <3 executions) are flagged for retirement. applyRetirement returns new entry with status='retired'. updateExecutionStats correctly recomputes success_rate. All functions are pure (no mutation of input)."
  - id: "T3"
    title: "Write procedure recall tests"
    description: "Create src/memory/__tests__/procedure-recall.test.ts with comprehensive tests for the recall scoring and selection logic."
    files: ["src/memory/__tests__/procedure-recall.test.ts"]
    verification: "bun test src/memory/__tests__/procedure-recall.test.ts passes all tests. At least 10 test cases covering: tag overlap scoring, trigger similarity scoring, composite score calculation, sorting by score, limit enforcement, retired procedure exclusion, empty inputs, perfect match scenario, no match scenario, tie-breaking by success rate."
  - id: "T4"
    title: "Write procedure lifecycle tests"
    description: "Create src/memory/__tests__/procedure-lifecycle.test.ts with comprehensive tests for retirement evaluation and execution stat updates."
    files: ["src/memory/__tests__/procedure-lifecycle.test.ts"]
    verification: "bun test src/memory/__tests__/procedure-lifecycle.test.ts passes all tests. At least 10 test cases covering: low success rate retirement, stale procedure retirement, healthy procedure not retired, custom threshold overrides, applyRetirement returns new entry with correct status, updateExecutionStats with success increments correctly, updateExecutionStats without success only increments execution_count, success_rate recomputed correctly (e.g., 3/4 = 0.75), edge case with zero execution_count, immutability (original entry unchanged)."
  - id: "T5"
    title: "Update barrel exports for recall and lifecycle"
    description: "Update src/memory/index.ts to export recallProcedures from procedure-recall.ts and evaluateRetirement, applyRetirement, updateExecutionStats from procedure-lifecycle.ts. Follow existing section-comment grouping."
    files: ["src/memory/index.ts"]
    verification: "import { recallProcedures, evaluateRetirement, applyRetirement, updateExecutionStats } from '../memory' resolves correctly. Existing exports unchanged."
  - id: "T6"
    title: "Update lu-learner agent with extract_procedures step"
    description: "Update src/agents/general/lu-learner.agent.ts to add a new 'extract_procedures' step in the execution flow. The step instructs lu-learner to: (1) Review WORKING.md session log for successful multi-step sequences (3+ steps that led to a verified outcome), (2) Evaluate each candidate: Was it verified? Is it reusable? Is it specific enough? Does it already exist in PROCEDURES.md? (3) For new procedures: generate entry with generateProcedureId, set initial execution_count=1, success_count=1, success_rate=1.0, serialize and append to PROCEDURES.md Active section, (4) For existing procedures: increment execution_count and success_count, recompute success_rate, update last_executed_at, (5) Run evaluateRetirement on all active procedures and move any that should retire to the Retired section. Add extraction criteria to the agent's role description and update the generate_summary step to include procedure counts."
    files: ["src/agents/general/lu-learner.agent.ts"]
    verification: "lu-learner agent config includes extract_procedures step text. Extraction criteria documented: 3+ steps, verified outcome, reusable, not duplicate. Agent references PROCEDURES.md file path. generate_summary mentions procedure extraction count. Agent still compiles: bunx --bun tsc --noEmit."
  - id: "T7"
    title: "Update phase-plan skill with procedure recall"
    description: "Update src/skills/general/phase-plan.skill.ts to include procedure recall in the Cognitive Pre-Flight (Step 0). After the existing MEMORY.md recall, add: (1) Read .planning/PROCEDURES.md, (2) Filter active procedures relevant to the current phase by tags and description, (3) Include top 3-5 recalled procedures in WORKING.md Memory Recall section under a '**Procedures:**' subsection, (4) Pass recalled procedures to lu-planner as context for plan creation. The recalled procedures appear as structured step sequences that inform plan structure."
    files: ["src/skills/general/phase-plan.skill.ts"]
    verification: "phase-plan skill config references PROCEDURES.md in cognitive pre-flight step. Procedure recall described with tag/trigger matching. Recalled procedures included in WORKING.md Memory Recall section. Skill still compiles: bunx --bun tsc --noEmit."
  - id: "T8"
    title: "Run full build and verify no regressions"
    description: "Run bun run build:all (or equivalent build command) to propagate all changes. Run the full test suite to ensure no regressions in existing memory module tests, agent tests, or skill tests. Verify that all new modules are importable through the barrel exports."
    files: []
    verification: "bunx --bun tsc --noEmit passes. bun test src/memory/__tests__/ passes all memory tests (existing + new). bun test passes full suite. All new exports resolve through src/memory/index.ts."
---

# Plan 37-02: Recall, Lifecycle, Agent Integration & Final Verification

## Objective

Build the intelligence layer on top of the procedure parser from Plan 37-01. This plan delivers procedure recall (selecting relevant procedures during planning), lifecycle management (success tracking and retirement), and integration into the lu-learner agent and phase-plan skill. Together with Plan 37-01, this completes all five PROC requirements.

This plan addresses **PROC-03** (lu-learner step sequence extraction), **PROC-04** (procedure recall during planning), and **PROC-05** (procedure validation and retirement).

## Context

Read these files to understand existing infrastructure:

- @src/memory/types.ts -- procedureEntrySchema and ProcedureEntry type (added in Plan 37-01). The recall and lifecycle modules operate on these types.
- @src/memory/procedure-parser.ts -- parseProcedureFile, parseProcedureContent, serializeProcedures, generateProcedureId (added in Plan 37-01). Used by the lifecycle module to read/write PROCEDURES.md.
- @src/memory/index.ts -- Barrel exports including procedure types and parser (updated in Plan 37-01). Add recall and lifecycle exports here.
- @src/memory/compression.ts -- Scoring and analysis pattern to follow for the recall module. Uses similar per-entry scoring with configurable weights.
- @src/memory/working-memory.ts -- Immutable update pattern. The lifecycle module follows this pattern: functions return new objects, never mutate input.
- @src/agents/general/lu-learner.agent.ts -- Learning extraction agent. Currently extracts patterns, decisions, pitfalls from WORKING.md. Add extract_procedures step.
- @src/skills/general/phase-plan.skill.ts -- Planning skill with cognitive pre-flight. Currently recalls from MEMORY.md. Add PROCEDURES.md recall.
- @src/shared/types.ts -- Result<T> type for fallible operations.
- @.planning/phases/37-procedural-memory-layer/RESEARCH.md -- Full design spec for recall scoring formula, retirement criteria, lu-learner integration, and phase-plan integration.
- @.planning/PROCEDURES.md -- Storage file for procedures (template created in Plan 37-01).

## Tasks

### T1: Create procedure recall module

**Goal:** Implement relevance-based procedure selection for use during planning. When a phase is being planned, the recall module identifies which learned procedures are most relevant based on tag overlap, trigger text similarity, and historical success rate.

**Files:** `src/memory/procedure-recall.ts`

**Implementation:**

```typescript
import type { ProcedureEntry } from "./types.ts";

/**
 * Recall relevant procedures for a planning context.
 *
 * Scores each active procedure by relevance to the given phase context
 * and returns the top N most relevant procedures, sorted by descending score.
 *
 * Scoring formula:
 *   score = (tag_overlap * 0.4) + (trigger_similarity * 0.4) + (success_rate * 0.2)
 *
 * - tag_overlap: Jaccard similarity between procedure tags and phase tags
 * - trigger_similarity: Keyword overlap between trigger text and phase description
 * - success_rate: Procedure's historical success rate (0.0-1.0)
 *
 * @param procedures - All procedure entries (active and retired)
 * @param context - Planning context with phase description and tags
 * @param limit - Maximum number of procedures to return (default 5)
 * @returns Top N most relevant active procedures, sorted by score
 */
export function recallProcedures(
  procedures: ProcedureEntry[],
  context: {
    phase_description: string;
    phase_tags: string[];
  },
  limit: number = 5,
): ProcedureEntry[] {
  // 1. Filter to active procedures only
  // 2. Score each procedure
  // 3. Sort by descending score
  // 4. Return top N (limit)
}

/**
 * Compute Jaccard similarity between two tag sets.
 *
 * Jaccard = |intersection| / |union|
 * Returns 0 if both sets are empty.
 *
 * @param tagsA - First tag set
 * @param tagsB - Second tag set
 * @returns Similarity score (0.0-1.0)
 */
export function computeTagOverlap(tagsA: string[], tagsB: string[]): number {
  // Jaccard similarity
}

/**
 * Compute keyword overlap between trigger text and phase description.
 *
 * Tokenizes both strings into lowercase words, removes stop words,
 * and computes Jaccard similarity on the remaining tokens.
 *
 * @param trigger - Procedure trigger text
 * @param description - Phase description text
 * @returns Similarity score (0.0-1.0)
 */
export function computeTriggerSimilarity(
  trigger: string,
  description: string,
): number {
  // Tokenize, remove stop words, Jaccard similarity
}

/**
 * Compute composite relevance score for a procedure.
 *
 * @param entry - Procedure entry to score
 * @param context - Planning context
 * @returns Composite score (0.0-1.0)
 */
export function scoreProcedure(
  entry: ProcedureEntry,
  context: { phase_description: string; phase_tags: string[] },
): number {
  // (tag_overlap * 0.4) + (trigger_similarity * 0.4) + (success_rate * 0.2)
}
```

**Acceptance Criteria:**

- Retired procedures are never returned
- Results sorted by descending relevance score
- Limit parameter caps results
- Tag overlap uses Jaccard similarity
- Trigger similarity uses keyword-based overlap
- Success rate contributes to scoring
- Empty inputs return empty array
- All functions are pure (no side effects)

### T2: Create procedure lifecycle module

**Goal:** Implement procedure health management including execution stat tracking, success rate computation, and retirement evaluation. These functions enable the lu-learner agent to maintain procedure health over time.

**Files:** `src/memory/procedure-lifecycle.ts`

**Implementation:**

```typescript
import type { ProcedureEntry } from "./types.ts";

/**
 * Evaluate whether a procedure should be retired.
 *
 * Retirement criteria (any one triggers retirement):
 * 1. success_rate < min_success_rate AND execution_count >= min_executions
 *    (consistently failing)
 * 2. last_executed_at older than max_stale_days AND execution_count < min_executions
 *    (stale, unproven)
 *
 * @param entry - Procedure to evaluate
 * @param options - Configurable thresholds
 * @returns Assessment with should_retire flag and reason
 */
export function evaluateRetirement(
  entry: ProcedureEntry,
  options?: {
    min_executions?: number; // default: 5
    min_success_rate?: number; // default: 0.3
    max_stale_days?: number; // default: 180
  },
): { should_retire: boolean; reason: string } {
  // Check low success rate criterion
  // Check staleness criterion
  // Return assessment
}

/**
 * Apply retirement to a procedure entry.
 *
 * Returns a new ProcedureEntry with status="retired" and
 * the provided retirement reason. Does NOT mutate the input.
 *
 * @param entry - Procedure to retire
 * @param reason - Reason for retirement
 * @returns New ProcedureEntry with retired status
 */
export function applyRetirement(
  entry: ProcedureEntry,
  reason: string,
): ProcedureEntry {
  // Return new entry with status: "retired", retirement_reason: reason
}

/**
 * Update execution statistics for a procedure.
 *
 * Increments execution_count, optionally increments success_count,
 * recomputes success_rate, and updates last_executed_at.
 * Does NOT mutate the input.
 *
 * @param entry - Procedure to update
 * @param success - Whether this execution was successful
 * @returns New ProcedureEntry with updated stats
 */
export function updateExecutionStats(
  entry: ProcedureEntry,
  success: boolean,
): ProcedureEntry {
  // Increment counters, recompute rate, update timestamp
}
```

**Acceptance Criteria:**

- evaluateRetirement returns `{ should_retire: true }` for low-success procedures
- evaluateRetirement returns `{ should_retire: true }` for stale procedures
- evaluateRetirement returns `{ should_retire: false }` for healthy procedures
- Custom thresholds override defaults
- applyRetirement returns a new entry (immutable)
- updateExecutionStats correctly recomputes success_rate
- All functions are pure (original entry unchanged)

### T3: Write procedure recall tests

**Goal:** Comprehensive test coverage for recall scoring and selection logic.

**Files:** `src/memory/__tests__/procedure-recall.test.ts`

**Implementation:**

```typescript
import { describe, test, expect } from "bun:test";
import {
  recallProcedures,
  computeTagOverlap,
  computeTriggerSimilarity,
  scoreProcedure,
} from "../procedure-recall";
import type { ProcedureEntry } from "../types";
```

**Test cases (minimum 10):**

1. **Tag overlap -- identical tags:** Jaccard returns 1.0
2. **Tag overlap -- disjoint tags:** Jaccard returns 0.0
3. **Tag overlap -- partial overlap:** Jaccard returns correct ratio (e.g., 2/5 = 0.4)
4. **Tag overlap -- empty sets:** Returns 0.0 (not NaN)
5. **Trigger similarity -- matching keywords:** High similarity score
6. **Trigger similarity -- no common keywords:** Returns 0.0
7. **Composite score -- all components contribute:** Score equals weighted sum
8. **recallProcedures -- sorted by score descending:** First result has highest score
9. **recallProcedures -- limit enforced:** Requesting 2 from 5 returns exactly 2
10. **recallProcedures -- retired excluded:** Retired procedures never in results
11. **recallProcedures -- empty input:** Empty procedure list returns empty array
12. **recallProcedures -- tie-breaking by success rate:** Higher success rate wins

**Acceptance Criteria:**

- All tests pass: `bun test src/memory/__tests__/procedure-recall.test.ts`
- At least 10 test cases
- Tests construct ProcedureEntry objects directly (no file I/O)
- Edge cases covered: empty inputs, zero scores, identical scores

### T4: Write procedure lifecycle tests

**Goal:** Comprehensive test coverage for retirement evaluation and execution stat updates.

**Files:** `src/memory/__tests__/procedure-lifecycle.test.ts`

**Implementation:**

```typescript
import { describe, test, expect } from "bun:test";
import {
  evaluateRetirement,
  applyRetirement,
  updateExecutionStats,
} from "../procedure-lifecycle";
import type { ProcedureEntry } from "../types";
```

**Test cases (minimum 10):**

1. **Low success rate triggers retirement:** success_rate=0.2, execution_count=6
2. **Healthy procedure not retired:** success_rate=0.8, execution_count=10
3. **Stale procedure triggers retirement:** last_executed_at 200 days ago, execution_count=2
4. **Recent low-execution not stale:** last_executed_at 30 days ago, execution_count=1
5. **Custom threshold overrides:** min_success_rate=0.5 triggers on success_rate=0.4
6. **applyRetirement returns new entry:** Original entry unchanged, returned entry has status="retired"
7. **applyRetirement sets retirement_reason:** Reason string preserved in returned entry
8. **updateExecutionStats with success:** execution_count +1, success_count +1, rate recomputed
9. **updateExecutionStats without success:** execution_count +1, success_count unchanged, rate recomputed
10. **updateExecutionStats rate computation:** 3/4 = 0.75 success_rate
11. **updateExecutionStats from zero:** First execution with success: 1/1 = 1.0
12. **Immutability check:** Original entry object not mutated by any function

**Acceptance Criteria:**

- All tests pass: `bun test src/memory/__tests__/procedure-lifecycle.test.ts`
- At least 10 test cases
- Tests construct ProcedureEntry objects directly
- Immutability verified explicitly

### T5: Update barrel exports for recall and lifecycle

**Goal:** Expose the recall and lifecycle functions through the memory module's public API.

**Files:** `src/memory/index.ts`

**Implementation:**

Add two new sections after the procedure parsing exports:

```typescript
// ─── Procedure Recall ───────────────────────────────────────────────────────

export { recallProcedures } from "./procedure-recall.ts";

// ─── Procedure Lifecycle ────────────────────────────────────────────────────

export {
  evaluateRetirement,
  applyRetirement,
  updateExecutionStats,
} from "./procedure-lifecycle.ts";
```

**Acceptance Criteria:**

- `import { recallProcedures, evaluateRetirement, applyRetirement, updateExecutionStats } from '../memory'` resolves
- Existing exports unchanged
- `bunx --bun tsc --noEmit` passes

### T6: Update lu-learner agent with extract_procedures step

**Goal:** Add procedure extraction capability to the lu-learner agent so it can identify successful multi-step sequences from WORKING.md and persist them as learned procedures in PROCEDURES.md.

**Files:** `src/agents/general/lu-learner.agent.ts`

**Implementation:**

Add to the lu-learner's execution flow (in the sections array content) a new step `extract_procedures` positioned after the existing pattern/decision/pitfall extraction and before `generate_summary`. The step text should instruct the agent to:

1. **Scan WORKING.md** for successful multi-step sequences (3+ sequential steps that produced a verified outcome)
2. **Evaluate candidates** against extraction criteria:
   - Was the sequence verified (harness passed, verifier approved)?
   - Is it reusable (not a one-off debugging session)?
   - Is it specific enough to be actionable (has clear trigger conditions)?
   - Does it already exist in PROCEDURES.md? (dedup by trigger similarity)
3. **For new procedures**: Generate entry with `generateProcedureId`, set initial stats (execution_count=1, success_count=1, success_rate=1.0), serialize and append to PROCEDURES.md `## Active Procedures` section
4. **For existing procedures**: Use `updateExecutionStats` to increment counts, recompute success_rate, update `last_executed_at`
5. **Run retirement check**: Call `evaluateRetirement` on all active procedures, apply retirement to any that should retire, move them to `## Retired Procedures` section
6. **Log results**: Record how many procedures were extracted, updated, or retired

Also update:

- The agent's role description to mention procedure extraction responsibility
- The `generate_summary` step to include procedure counts (extracted, updated, retired)

**Acceptance Criteria:**

- Agent config includes `extract_procedures` step text
- Extraction criteria clearly documented in agent prompt
- PROCEDURES.md file path referenced correctly
- `generate_summary` includes procedure metrics
- Agent compiles: `bunx --bun tsc --noEmit`
- No changes to existing extraction logic (patterns, decisions, pitfalls still work)

### T7: Update phase-plan skill with procedure recall

**Goal:** Integrate procedure recall into the planning workflow so that relevant learned procedures are available as templates when creating new phase plans.

**Files:** `src/skills/general/phase-plan.skill.ts`

**Implementation:**

Update the Cognitive Pre-Flight (Step 0) section in the skill config to add procedure recall after the existing MEMORY.md recall:

1. **Read PROCEDURES.md**: `cat .planning/PROCEDURES.md 2>/dev/null || echo ""`
2. **Identify relevant procedures**: Based on phase tags, description, and domain keywords
3. **Include in WORKING.md**: Add a `**Procedures:**` subsection under `## Memory Recall` with the top 3-5 most relevant procedures, including their title, trigger, steps summary, and success rate
4. **Pass to lu-planner**: The recalled procedures appear in the WORKING.md Memory Recall context that lu-planner already reads, so no separate planner changes needed

The skill prompt should explain that procedures are step-sequence templates from past successful executions, and the planner should consider them as starting points for task breakdown.

**Acceptance Criteria:**

- Phase-plan skill references PROCEDURES.md in cognitive pre-flight
- Procedure recall described with scoring criteria
- Recalled procedures formatted for WORKING.md Memory Recall section
- Skill compiles: `bunx --bun tsc --noEmit`
- No changes to existing MEMORY.md recall logic
- No changes to lu-planner agent (it reads whatever is in Memory Recall)

### T8: Run full build and verify no regressions

**Goal:** Ensure all changes compile, all tests pass, and no existing functionality is broken.

**Files:** None (verification only)

**Verification steps:**

1. `bunx --bun tsc --noEmit` -- All files type-check
2. `bun test src/memory/__tests__/procedure-parser.test.ts` -- Parser tests pass (from Plan 37-01)
3. `bun test src/memory/__tests__/procedure-recall.test.ts` -- Recall tests pass
4. `bun test src/memory/__tests__/procedure-lifecycle.test.ts` -- Lifecycle tests pass
5. `bun test src/memory/__tests__/` -- All memory module tests pass (no regressions)
6. `bun test` -- Full test suite passes
7. Verify all barrel exports resolve through `src/memory/index.ts`

**Acceptance Criteria:**

- Zero TypeScript errors
- All new tests pass
- All existing tests pass (no regressions)
- All procedure modules importable through barrel

## Success Criteria

1. `recallProcedures()` returns relevant procedures sorted by composite score
2. `evaluateRetirement()` correctly identifies procedures for retirement
3. `applyRetirement()` returns immutable retired entries
4. `updateExecutionStats()` correctly tracks success rates
5. lu-learner agent has `extract_procedures` step with clear criteria
6. phase-plan skill recalls procedures during cognitive pre-flight
7. All recall tests pass (`bun test src/memory/__tests__/procedure-recall.test.ts`)
8. All lifecycle tests pass (`bun test src/memory/__tests__/procedure-lifecycle.test.ts`)
9. All existing memory tests pass (no regressions)
10. Full test suite passes (`bun test`)
11. TypeScript compiles without errors (`bunx --bun tsc --noEmit`)
12. Full JSDoc documentation on all exported functions

## Verification

**Automated checks:**

- `bunx --bun tsc --noEmit` -- all files type-check
- `bun test src/memory/__tests__/procedure-recall.test.ts` -- recall tests pass
- `bun test src/memory/__tests__/procedure-lifecycle.test.ts` -- lifecycle tests pass
- `bun test src/memory/__tests__/` -- all memory tests pass (no regressions)
- `bun test` -- full test suite passes

**Manual verification:**

- Review lu-learner agent prompt to confirm extract_procedures step is complete and actionable
- Review phase-plan skill prompt to confirm procedure recall is integrated into cognitive pre-flight
- Verify `import { recallProcedures, evaluateRetirement, applyRetirement, updateExecutionStats } from '../memory'` resolves
- Confirm no changes to existing extraction logic in lu-learner (patterns/decisions/pitfalls unchanged)
- Confirm no changes to lu-planner agent (reads Memory Recall section as-is)
