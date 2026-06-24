# Phase 145: Memory Feedback Completion & PR-Address Learning - Research

**Researched:** 2026-03-11
**Domain:** MuninnDB memory effectiveness, learning capture, engram lifecycle
**Confidence:** HIGH

## Summary

Phase 145 closes three gaps in the memory effectiveness pipeline across 5 source files. The codebase is well-structured for these changes -- existing patterns for lu-learner spawning (phase-execute Step 8), MuninnDB metric storage (phase-execute Step 7.1), and milestone boundary operations (milestone-complete Step 0.5) provide clear templates to follow.

The three workstreams are:

1. **PR-Address Learning** -- Add lu-learner spawn to `pr-address.skill.ts` after Step 7 (verify fixes), following the exact pattern from phase-execute's learning capture section.
2. **Stale Engram Pruning** -- Revise milestone-complete Step 0.5 to match the CONTEXT.md stale threshold (5+ recalls with 0 positive AND 3+ milestones no positive), add human review gate, and integrate `muninn_consolidate`.
3. **Metric Completion** -- Extend `computeMemoryPhaseMetrics()` to accept optional historical data and compute real values for `stale_engram_pct` and `confidence_calibration` instead of hardcoded 0.

**Primary recommendation:** Follow existing patterns exactly -- lu-learner spawn mirrors phase-execute Step 8, stale detection revises milestone-complete Step 0.5, metrics extend the existing helper with a new optional `historicalData` parameter.

## Standard Stack

### Core

| Library      | Version     | Purpose                                                 | Why Standard                                                     |
| ------------ | ----------- | ------------------------------------------------------- | ---------------------------------------------------------------- |
| zod          | (workspace) | Schema validation for new input types                   | Already used in memory-feedback.ts and memory-metrics.schemas.ts |
| MuninnDB MCP | (external)  | Memory storage, recall, feedback, consolidation, forget | Canonical memory system per CLAUDE.md                            |

### Supporting

| Library | Version     | Purpose                                | When to Use                                     |
| ------- | ----------- | -------------------------------------- | ----------------------------------------------- |
| lodash  | (workspace) | Safe property access, array operations | Use `filter`, `isEmpty` per project conventions |

### Alternatives Considered

None -- all changes extend existing infrastructure. No new libraries needed.

**Installation:**
No new packages required.

## Architecture Patterns

### File Structure (No New Files)

All changes are to existing files:

```
src/
├── skills/general/
│   ├── pr-address.skill.ts          # Add Step 7.5: lu-learner spawn
│   └── milestone-complete.skill.ts  # Revise Step 0.5: stale detection + pruning
├── shared/
│   ├── __schemas/
│   │   └── memory-metrics.schemas.ts # Add HistoricalPhaseDataSchema (input type)
│   └── __helpers/
│       └── memory-feedback.ts        # Extend computeMemoryPhaseMetrics()
└── agents/general/
    └── lu-pr-reviewer.agent.ts       # No changes needed (context already flows through)
```

### Pattern 1: lu-learner Spawn in pr-address (Mirrors phase-execute Step 8)

**What:** After fix verification (Step 7) succeeds, spawn lu-learner with PR review context.
**When to use:** After Step 7 (Verify Fixes), before Step 8 (Respond to PR Comments).
**Insertion point:** Between current Step 7 and Step 8 in pr-address.skill.ts content string.

The existing phase-execute lu-learner spawn pattern (lines 97-177 of the skill content) provides the exact template:

```typescript
// From phase-execute -- the pattern to replicate
Task(
  prompt="""
<learning_context>
**Phase:** {phase_number}
**Verification Result:** {verification_result}
**Working Memory (session findings):** {working_content}
**Current Long-Term Memory:** {memory_content}
</learning_context>

<extraction_targets>
1. **Patterns**: What execution approaches worked well?
2. **Decisions**: What implementation choices were made?
3. **Pitfalls**: What issues were encountered during execution?
4. **Preferences**: What conventions emerged from this phase?
</extraction_targets>

<output_requirements>
- Extract ONLY validated learnings (verified by outcome)
- Write curated insights to MuninnDB via muninn_remember
- Clear session context via muninn_forget after extraction
- Return summary of learnings captured
</output_requirements>
""",
  subagent_type="lu-learner",
  model="{learner_model}",
  description="Capture phase learnings"
)
```

**Key adaptation for pr-address:** The `<learning_context>` block changes to include PR-specific data (comment text, category, fix applied, verification result). The `<extraction_targets>` narrows to `pitfall:pr-review-*` category per CONTEXT.md decision.

### Pattern 2: Stale Engram Detection at Milestone Boundary

**What:** Revise milestone-complete Step 0.5 to implement the CONTEXT.md stale threshold.
**When to use:** During milestone completion, before archiving.
**Current state:** Step 0.5 already exists with a DIFFERENT stale definition (3+ recalls with low usefulness OR never recalled). Must be revised to match CONTEXT.md.

Current milestone-complete Step 0.5 stale definition (NEEDS REVISION):

```
An engram is "stale" if:
- It was recalled 3+ times across the milestone but received feedback with useful=false more than useful=true
- OR it was never recalled at all during the entire milestone
```

CONTEXT.md required definition (BOTH conditions required):

```
An engram is "stale" if:
- 5+ recalls with 0 positive feedback (useful=true)
- AND 3+ milestones with no positive feedback
```

This is MORE conservative (requires both conditions, higher thresholds). The revision tightens the criteria.

**New additions to Step 0.5:**

1. Human review checkpoint (flag stale engrams, developer decides)
2. Hard-delete via `muninn_forget` after approval
3. `muninn_consolidate()` call for near-duplicate merging

### Pattern 3: Extending computeMemoryPhaseMetrics() with Historical Data

**What:** Add optional `historicalData` parameter to compute real values for `stale_engram_pct` and `confidence_calibration`.
**When to use:** When caller has queried MuninnDB for historical phase metrics.

Current signature:

```typescript
export function computeMemoryPhaseMetrics(
  rawConfig: ComputeMetricsConfig,
): MemoryPhaseMetrics;
```

Extended approach: Add optional fields to `ComputeMetricsConfigSchema`:

```typescript
const ComputeMetricsConfigSchema = z.object({
  // ... existing fields ...
  /** Optional historical data for stale/calibration computation */
  historicalData: z
    .object({
      /** Engrams with their recall count and positive feedback count */
      engramFeedbackHistory: z
        .array(
          z.object({
            engramId: z.string(),
            totalRecalls: z.number().int().nonnegative(),
            positiveRecalls: z.number().int().nonnegative(),
            milestonesWithNoPositive: z.number().int().nonnegative(),
            confidence: z.enum(["low", "medium", "high"]).optional(),
          }),
        )
        .default([]),
      /** Per-engram predicted confidence vs actual usefulness for calibration */
      confidenceActuals: z
        .array(
          z.object({
            confidence: z.enum(["low", "medium", "high"]),
            actuallyUseful: z.boolean(),
          }),
        )
        .default([]),
    })
    .optional(),
});
```

Computation logic:

- **stale_engram_pct**: Count engrams where `totalRecalls >= 5 AND positiveRecalls === 0 AND milestonesWithNoPositive >= 3`, divide by total engrams in history.
- **confidence_calibration**: For each confidence level, compute predicted usefulness (low=0.33, medium=0.66, high=0.90) vs actual usefulness rate. Average the absolute differences and subtract from 1 to get calibration score (1.0 = perfect calibration, 0.0 = no correlation).

### Anti-Patterns to Avoid

- **Do NOT add inline learning logic to pr-address** -- always spawn lu-learner. The CONTEXT.md explicitly says "Spawn lu-learner (not inline logic)."
- **Do NOT auto-delete stale engrams** -- CONTEXT.md requires human review gate before deletion.
- **Do NOT create a new agent or helper file** -- extend existing `memory-feedback.ts` per CONTEXT.md.

## Don't Hand-Roll

| Problem                              | Don't Build                       | Use Instead                     | Why                                                                             |
| ------------------------------------ | --------------------------------- | ------------------------------- | ------------------------------------------------------------------------------- |
| Learning extraction from PR comments | Custom inline logic in pr-address | lu-learner agent spawn          | lu-learner already handles extraction, confidence, muninn_remember, muninn_link |
| Engram merging/deduplication         | Custom similarity matching        | `muninn_consolidate()` MCP tool | MuninnDB handles semantic similarity and archival of originals                  |
| Engram deletion                      | Custom archival system            | `muninn_forget()` MCP tool      | Soft-delete with 7-day recovery window built-in                                 |
| Feedback recording                   | Custom tracking system            | `muninn_feedback()` MCP tool    | Updates vault's learned scoring weights via SGD                                 |

**Key insight:** MuninnDB provides all the primitives needed for stale detection and pruning. The skill just orchestrates the MCP calls in the right order.

## Common Pitfalls

### Pitfall 1: Mismatching Stale Threshold Between CONTEXT.md and milestone-complete

**What goes wrong:** The current milestone-complete Step 0.5 has a DIFFERENT stale definition than CONTEXT.md specifies. If not updated, the two definitions will conflict.
**Why it happens:** Step 0.5 was written before the CONTEXT.md decisions were finalized.
**How to avoid:** Replace the entire stale detection logic in Step 0.5 with the CONTEXT.md threshold (5+ recalls with 0 positive AND 3+ milestones no positive, BOTH required).
**Warning signs:** Seeing "3+ recalls" in the stale detection logic instead of "5+ recalls".

### Pitfall 2: MuninnDB Recall Cannot Filter by Feedback Count

**What goes wrong:** Attempting to use `muninn_recall` to directly query "engrams with 5+ recalls and 0 positive feedback" -- MuninnDB recall is semantic search, not SQL.
**Why it happens:** Assuming MuninnDB has structured query capabilities.
**How to avoid:** The skill must: (1) recall all pattern/decision/pitfall engrams, (2) for each, recall associated feedback metrics, (3) compute staleness in the skill logic, not in MuninnDB queries. Alternatively, use the per-phase metric engrams (`metric:memory-recall-precision-*`) that are already stored as structured JSON.
**Warning signs:** Trying to pass filter criteria to `muninn_recall` context parameter.

### Pitfall 3: muninn_forget is Soft-Delete (Not Hard-Delete)

**What goes wrong:** CONTEXT.md says "Hard-delete via muninn_forget after human approval" but `muninn_forget` is actually a soft-delete (recoverable within 7 days per MCP tool description).
**Why it happens:** Terminology mismatch between CONTEXT.md and MuninnDB API.
**How to avoid:** Use `muninn_forget` as specified -- it is the strongest delete available. The 7-day recovery window is a safety net, not a problem. Document this in the skill content for clarity.
**Warning signs:** Looking for a "hard delete" API that doesn't exist.

### Pitfall 4: pr-address Learning Context Must Include Comment Text

**What goes wrong:** Spawning lu-learner without the PR review comment text means it can't extract meaningful pitfalls.
**Why it happens:** The phase-execute pattern passes phase/verification context, but PR review needs comment-specific context.
**How to avoid:** Include in the lu-learner prompt: comment text, category, file path, fix description, verification result. This is all available from Steps 4-7 output.
**Warning signs:** lu-learner extracting vague learnings like "fixed PR comment" with no specifics.

### Pitfall 5: Confidence Calibration Requires Sufficient Sample Size

**What goes wrong:** Computing confidence_calibration with <10 engrams produces noisy/meaningless results.
**Why it happens:** Early phases may not have enough data.
**How to avoid:** Add a minimum sample size check (e.g., require 10+ engrams with confidence data). Return 0 if insufficient data.
**Warning signs:** Wild swings in confidence_calibration between phases.

## Code Examples

### PR-Address lu-learner Spawn (New Step 7.5)

```python
# Step 7.5: Capture PR Review Learnings
#
# After fix verification (Step 7), spawn lu-learner to extract
# patterns from PR review comments. Uses pitfall:pr-review-* category.

Task(
  prompt="""
<learning_context>

**Source:** PR review comments
**PR:** #{pr_number}
**Verification Result:** {verification_result}

**Review Comments Addressed:**
{for each addressed comment:}
- Comment #{comment_id}: "{comment_text}"
  - Category: {category}
  - File: {file_path}
  - Fix Applied: {fix_description}
  - Fix Verified: {fix_verified}

</learning_context>

<extraction_targets>
Extract ONLY pitfalls from PR review feedback:
- **Category**: Use `pitfall:pr-review-{descriptive-name}`
- **Confidence**: Low (first occurrence from PR review)
- **Content**: What the reviewer caught, why it matters, how to avoid it
- All comments captured at low confidence -- the confidence evolution
  system (3+ feedback heuristic) handles quality over time
</extraction_targets>

<output_requirements>
- Write each pitfall as a MuninnDB engram via muninn_remember
- Use concept: "pitfall:pr-review-{descriptive-name}"
- Link new engrams to related existing memories via muninn_link
- Return summary of learnings captured
</output_requirements>

Extract learnings from these PR review comments.
""",
  subagent_type="lu-learner",
  description="Capture PR review learnings"
)
```

### Stale Engram Detection Logic (Revised Step 0.5)

```markdown
**2. Identify stale engrams (REVISED threshold):**

An engram is "stale" when BOTH conditions are met:

1. 5+ recalls with 0 positive feedback (useful=true)
2. 3+ milestones with no positive feedback

Steps:
a. Recall all metric:memory-\* engrams for last 10 phases
b. For each pattern/decision/pitfall engram that appeared in recalls:

- Count total recalls across phases
- Count positive feedback instances (useful=true)
- Count milestones with no positive feedback
  c. Flag engrams meeting BOTH thresholds

**3. Human review checkpoint:**

Display stale engrams to developer:
```

Stale engrams detected ({count}):

| #   | Concept           | Recalls | Positive | Milestones w/o Positive |
| --- | ----------------- | ------- | -------- | ----------------------- |
| 1   | pitfall:old-issue | 7       | 0        | 4                       |

[Y] Prune all [N] Keep all [S] Select individually

```

**4. Prune after approval:**
- For approved deletions: `muninn_forget(vault, id)`
- Run `muninn_consolidate()` on remaining near-duplicates
```

### Extended computeMemoryPhaseMetrics() Signature

```typescript
// New optional field in ComputeMetricsConfigSchema
const ComputeMetricsConfigSchema = z.object({
  feedbackEntries: z.array(MemoryFeedbackEntrySchema),
  totalRecalled: z.number().int().nonnegative(),
  totalApplied: z.number().int().nonnegative(),
  memoryTokensInjected: z.number().int().nonnegative(),
  phase: z.number(),
  milestone: z.string(),
  // NEW: historical data for stale/calibration metrics
  historicalData: z
    .object({
      engramFeedbackHistory: z
        .array(
          z.object({
            engramId: z.string(),
            totalRecalls: z.number().int().nonnegative(),
            positiveRecalls: z.number().int().nonnegative(),
            milestonesWithNoPositive: z.number().int().nonnegative(),
          }),
        )
        .default([]),
      confidenceActuals: z
        .array(
          z.object({
            confidence: z.enum(["low", "medium", "high"]),
            actuallyUseful: z.boolean(),
          }),
        )
        .default([]),
    })
    .optional(),
});
```

## State of the Art

| Old Approach                                         | Current Approach                                            | When Changed | Impact                          |
| ---------------------------------------------------- | ----------------------------------------------------------- | ------------ | ------------------------------- |
| stale_engram_pct: 0 (hardcoded)                      | Computed from historical feedback                           | Phase 145    | Real staleness tracking         |
| confidence_calibration: 0 (hardcoded)                | Computed from confidence vs actual                          | Phase 145    | Confidence evolution validation |
| No PR review learning                                | lu-learner spawn after pr-address                           | Phase 145    | Captures review patterns        |
| Loose stale threshold (3+ recalls OR never recalled) | Conservative threshold (5+ recalls AND 3+ milestones, BOTH) | Phase 145    | Fewer false positives           |

## Open Questions

1. **Milestone identification in feedback history**
   - What we know: `metric:memory-recall-precision-{milestone}-phase-{phase}` engrams exist per phase.
   - What's unclear: How to count "milestones with no positive feedback" for the stale threshold -- this requires grouping feedback by milestone. The metric engrams include `milestone` field, so this is queryable.
   - Recommendation: Recall last 10 phase metric engrams, group by milestone, count milestones where an engram had 0 positive feedback.

2. **Rolling window scope for stale_engram_pct**
   - What we know: CONTEXT.md says "rolling window of last 10 phases."
   - What's unclear: Whether the 10-phase window applies to stale_engram_pct computation in `computeMemoryPhaseMetrics()` or only to the milestone-complete pruning step.
   - Recommendation: Apply to both -- the helper takes whatever historical data the caller provides, and the caller (skill) queries MuninnDB for last 10 phases.

3. **lu-pr-reviewer changes**
   - What we know: CONTEXT.md lists `lu-pr-reviewer.agent.ts` as a file to modify to "ensure review comment context is passed through."
   - What's unclear: After analysis, the review comment context already flows through the pr-address skill orchestration (Steps 1-7 collect all comment data). The lu-pr-reviewer agent itself does not need modification -- the pr-address skill has all the data needed to build the lu-learner prompt.
   - Recommendation: Verify this assumption during planning. If lu-pr-reviewer needs to emit structured data for learning, add a structured output section. But based on current flow, pr-address orchestrates and has all context.

## Sources

### Primary (HIGH confidence)

- `src/skills/general/pr-address.skill.ts` -- Read in full (725 lines), verified flow Steps 1-9
- `src/skills/general/phase-execute.skill.ts` -- Read learning capture section (lines 80-210), verified lu-learner spawn pattern
- `src/agents/general/lu-learner.agent.ts` -- Read in full (743 lines), verified extraction flow and input expectations
- `src/shared/__helpers/memory-feedback.ts` -- Read in full (264 lines), verified hardcoded 0 values and function signatures
- `src/shared/__schemas/memory-metrics.schemas.ts` -- Read in full (145 lines), verified schema structure
- `src/skills/general/milestone-complete.skill.ts` -- Read in full (505 lines), verified Step 0.5 current implementation
- MuninnDB MCP tool schemas -- Fetched via ToolSearch: `muninn_recall`, `muninn_feedback`, `muninn_forget`, `muninn_consolidate`, `muninn_evolve`, `muninn_remember`

### Secondary (MEDIUM confidence)

- `src/shared/__schemas/recall-cache.schemas.ts` -- Verified RecalledEngram shape
- `src/shared/index.ts` barrel -- Verified exported symbols

### Tertiary (LOW confidence)

- None -- all findings from direct source code analysis.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH -- All changes are to existing files using existing tools
- Architecture: HIGH -- Patterns directly copied from phase-execute lu-learner spawn
- Pitfalls: HIGH -- Identified from direct comparison of CONTEXT.md vs current source code

**Research date:** 2026-03-11
**Valid until:** 2026-04-11 (stable internal codebase, no external dependencies)
