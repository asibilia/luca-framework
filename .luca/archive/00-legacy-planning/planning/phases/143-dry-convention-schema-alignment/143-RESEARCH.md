# Phase 143: DRY, Convention & Schema Alignment - Research

**Researched:** 2026-03-10
**Domain:** Code quality, schema consistency, convention compliance
**Confidence:** HIGH

## Summary

This phase addresses 12 findings from the v4.1.0 milestone audit spanning schema drift, DRY violations, convention non-compliance (.parse() vs .safeParse(), node:fs vs Bun, .sort() vs orderBy), and stale configuration. All findings are code-level fixes in existing files with no new dependencies or architectural changes needed.

The highest-impact item is the recall scoring schema drift (Integration Gap #2): the TS schema implements 6 signals while lu-cognition documents 7 signals with different weights. The fix requires adding `feedback_score` to the schema and realigning weights. The DRY violations in consensus-resolver.ts are the most code-intensive changes, requiring function consolidation and a type-safe expert lookup helper.

**Primary recommendation:** Group into 3 plans by coupling (schema alignment, DRY consolidation, convention sweep) with independent waves within each plan. All changes are mechanical and LOW risk.

## Standard Stack

No new libraries needed. All fixes use existing dependencies:

### Core

| Library        | Version  | Purpose                                          | Why Used                                   |
| -------------- | -------- | ------------------------------------------------ | ------------------------------------------ |
| zod            | existing | Schema validation (.safeParse conversion)        | Already in all target files                |
| lodash/orderBy | existing | Sort replacement                                 | Already imported in consensus-resolver.ts  |
| Bun APIs       | existing | node:fs replacement (Bun.file, readdir via Glob) | Project convention per bun-preference rule |

### Supporting

No additional libraries needed.

## Architecture Patterns

No structural changes. All modifications are within existing files at their current locations.

### Files Modified (13 total)

```
src/
├── agents/
│   ├── __schemas/recall-scoring.schemas.ts  # Add feedback_score signal
│   ├── __helpers/embedding-recall.ts        # Add feedback_score computation + weight alignment
│   └── general/lu-cognition.agent.ts        # Realign documented weights to match schema
├── shared/
│   └── __helpers/
│       ├── consensus-resolver.ts            # DRY: merge duplicate builders + extract expert lookup
│       ├── memory-feedback.ts               # .parse() -> .safeParse() (3 occurrences)
│       ├── memory-context-builder.ts        # .sort() -> orderBy
│       └── recall-cache.ts                  # Document dual representation (no code change)
scripts/
├── check-domain-boundaries.ts               # Remove stale EXCEPTIONS + node:fs -> Bun
packages/
└── luca-observer/
    └── app/api/todos/route.ts               # node:fs/promises -> Bun APIs
```

## Don't Hand-Roll

| Problem                          | Don't Build                            | Use Instead                          | Why                                           |
| -------------------------------- | -------------------------------------- | ------------------------------------ | --------------------------------------------- |
| Schema validation on public APIs | Manual try/catch around .parse()       | Zod .safeParse()                     | Returns typed success/error without throwing  |
| File reading in Bun runtime      | node:fs readFileSync / readdir         | Bun.file().text(), new Glob().scan() | Project convention, consistent runtime        |
| Array sorting                    | Array.prototype.sort() with comparator | lodash orderBy                       | Project convention per lodash-preference rule |

## Common Pitfalls

### Pitfall 1: Weight Sum Drift When Adding feedback_score

**What goes wrong:** Adding a 7th signal weight (0.075) without adjusting existing weights causes the total to exceed 1.0.
**Why it happens:** The 6 current weights sum to 1.0 (0.25 + 0.15 + 0.30 + 0.15 + 0.075 + 0.075). Adding 0.075 for feedback_score makes 1.075.
**How to avoid:** Reduce `milestone_proximity` from 0.30 to 0.225 (as lu-cognition spec documents) to make room. New sum: 0.25 + 0.15 + 0.225 + 0.15 + 0.075 + 0.075 + 0.075 = 1.0.
**Warning signs:** Tests or typecheck failures on weight sum assertions (if any exist).

### Pitfall 2: .safeParse() Error Handling Must Match Existing Behavior

**What goes wrong:** Converting .parse() to .safeParse() without proper error handling changes the function's failure mode from throwing to silently returning a result.
**Why it happens:** .parse() throws ZodError on invalid input. .safeParse() returns `{ success: false, error: ZodError }`. The calling code must handle the error case explicitly.
**How to avoid:** For each .parse() -> .safeParse() conversion, add explicit error handling that either: (a) throws a descriptive error, (b) returns a typed error result, or (c) falls back to schema defaults. Decision depends on whether the function is internal (can throw) or public API (should return error).
**Warning signs:** Functions that previously threw now silently succeed with unexpected data.

### Pitfall 3: Bun.file() vs readdir for Directory Listing

**What goes wrong:** Bun.file() reads individual files. For directory listing (replacing readdir), use `new Glob("*.md").scan({ cwd: dirPath })`.
**Why it happens:** Bun does not have a direct `readdir` equivalent on the Bun object. The Glob API is the Bun-idiomatic way to list files.
**How to avoid:** Use `import { Glob } from "bun"` with `.scan()` for directory listing, `Bun.file(path).text()` for file reading.

### Pitfall 4: consensus-resolver DRY Merge Must Preserve Semantic Differences

**What goes wrong:** buildHighestConfidenceResult and buildFallbackResult look identical but serve different fallback strategies. Merging them naively could lose the semantic intent.
**Why it happens:** They ARE structurally identical (same logic, same return shape). The only difference is the `strategy` parameter passed through. The comment in buildFallbackResult says "pick highest confidence as nominal winner but mark fallback_applied so callers know to halt/escalate" -- but buildHighestConfidenceResult does the exact same thing.
**How to avoid:** Merge into a single function (`buildWinnerByConfidence` or similar) that both callsites invoke. The strategy parameter already differentiates the behavior via `fallback_strategy_applied`.

## Code Examples

### Finding 1: Recall Scoring Schema Drift (Integration Gap #2)

**Current state in `src/agents/__schemas/recall-scoring.schemas.ts`:**

- RecallScoringWeightsSchema has 6 fields, no `feedback_score`
- `milestone_proximity` default is 0.30
- ScoreBreakdownSchema has 6 fields, no `feedback_score`

**Current state in `src/agents/__helpers/embedding-recall.ts`:**

- `scoreRecallResults()` computes 6 signals (lines 265-275)
- Composite score sums 6 weighted terms (lines 277-283)

**Current state in `src/agents/general/lu-cognition.agent.ts`:**

- Documents 7 signals including `feedback_score` at weight 0.075 (lines 304-311)
- Documents `milestone_proximity` at weight 0.225 (not 0.30)

**Fix required:**

```typescript
// recall-scoring.schemas.ts -- add feedback_score to weights
export const RecallScoringWeightsSchema = z.object({
  semantic_similarity: z.number().min(0).max(1).default(0.25),
  tag_overlap: z.number().min(0).max(1).default(0.15),
  milestone_proximity: z.number().min(0).max(1).default(0.225), // was 0.30
  agent_match: z.number().min(0).max(1).default(0.15),
  confidence: z.number().min(0).max(1).default(0.075),
  recency: z.number().min(0).max(1).default(0.075),
  feedback_score: z.number().min(0).max(1).default(0.075), // NEW
});

// ScoreBreakdownSchema -- add feedback_score
export const ScoreBreakdownSchema = z.object({
  semantic_similarity: z.number().min(0).max(1),
  tag_overlap: z.number().min(0).max(1),
  milestone_proximity: z.number().min(0).max(1),
  agent_match: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  recency: z.number().min(0).max(1),
  feedback_score: z.number().min(0).max(1), // NEW
});
```

```typescript
// embedding-recall.ts -- add feedback_score computation
// Add new scorer function:
function computeFeedbackScore(content: string): number {
  if (!content) return 0.5;
  const lower = content.toLowerCase();
  if (lower.includes("confidence: high") || lower.includes("confidence:high"))
    return 0.8;
  if (lower.includes("confidence: low") || lower.includes("confidence:low"))
    return 0.2;
  return 0.5; // Medium or no confidence marker
}

// In scoreRecallResults(), add to breakdown:
const breakdown: ScoreBreakdown = {
  // ...existing 6 fields...
  feedback_score: computeFeedbackScore(result.content),
};

// In composite score calculation, add:
breakdown.feedback_score * resolvedWeights.feedback_score;
```

### Finding 2: consensus-resolver DRY Violations (HIGH #5, #6)

**HIGH #5: buildHighestConfidenceResult and buildFallbackResult are identical**

Lines 317-355 (`buildHighestConfidenceResult`) and 357-397 (`buildFallbackResult`) have identical logic. Both:

1. Sort perspectives by confidence descending
2. Pick the highest-confidence winner
3. Partition into voters/dissenters
4. Return ConsensusResult with fallback_applied: true

**Fix:** Delete `buildFallbackResult`, rename `buildHighestConfidenceResult` to `buildWinnerByConfidence` (or keep the name), and update the 3 callsites in `applyFallback()`:

- Line 280-284: `case "halt"/"escalate"/"escalate_to_human"` -- currently calls `buildFallbackResult` -> change to `buildHighestConfidenceResult` (or the renamed function)
- Line 308-312: default case -- already calls `buildHighestConfidenceResult`
- Line 473: in `buildDeferToExpertResult` fallback -- already calls `buildHighestConfidenceResult`

**HIGH #6: Expert-agent lookup duplicated 3 times with unsafe cast**

The pattern `"agent" in p && expertSet.has((p as Record<string, unknown>).agent as string)` appears at:

- Line 181-183 in `countExpertParticipants()`
- Line 207-209 in `countVotes()`
- Line 466-468 in `buildDeferToExpertResult()`

**Fix:** Extract a helper function:

```typescript
function isExpertPerspective<TCategory extends string>(
  perspective: VotablePerspective<TCategory>,
  expertSet: Set<string>,
): boolean {
  return (
    "agent" in perspective &&
    typeof (perspective as Record<string, unknown>).agent === "string" &&
    expertSet.has((perspective as Record<string, unknown>).agent as string)
  );
}
```

### Finding 3: .parse() -> .safeParse() Sweep (MEDIUM #1, #2)

**memory-feedback.ts** (MEDIUM #1) -- 3 occurrences on public API entry points:

| Line | Current                                          | Context                                                     |
| ---- | ------------------------------------------------ | ----------------------------------------------------------- |
| 151  | `DetermineFeedbackConfigSchema.parse(rawConfig)` | `determineFeedback()` entry point                           |
| 216  | `ComputeMetricsConfigSchema.parse(rawConfig)`    | `computeMemoryPhaseMetrics()` entry point                   |
| 175  | `MemoryFeedbackEntrySchema.parse({...})`         | Internal construction (keep .parse() -- data is controlled) |
| 225  | `MemoryPhaseMetricsSchema.parse({...})`          | Internal construction (keep .parse() -- data is controlled) |

Lines 151 and 216 are public API entry points receiving external input -- convert to .safeParse().
Lines 175 and 225 construct objects from already-validated data -- .parse() is acceptable here.

**consensus-resolver.ts** (MEDIUM #2) -- 1 occurrence:

| Line | Current                                        | Context                                                    |
| ---- | ---------------------------------------------- | ---------------------------------------------------------- |
| 82   | `ConsensusConfigSchema.parse(rawConfig ?? {})` | `resolveConsensus()` public entry -- external config input |

Convert to .safeParse() with fallback to defaults on failure.

### Finding 4: Stale EXCEPTIONS (MEDIUM #3)

**scripts/check-domain-boundaries.ts lines 46-62:**

Three exception entries exist for `shared -> agents`, `shared -> skills`, `shared -> rules` with reason "validation-utils references agent/skill/rule schemas". These were resolved in Phase 13 (the rule file `.claude/rules/module-boundary.md` documents this explicitly: "Removed exceptions (resolved): shared/**helpers/validation-utils.ts -> agents/skills/rules **schemas/ was a T0->T2 violation... Resolved in Phase 13").

**Fix:** Delete the entire EXCEPTIONS array contents (keep the empty array structure) and remove the `isException()` function call, or simplify to an empty array.

### Finding 5: node:fs -> Bun Migration (HIGH #4, LOW #1)

**packages/luca-observer/app/api/todos/route.ts (HIGH #4):**

- Line 2: `import { readdir, stat } from "node:fs/promises"` -- used for directory listing and file stat
- Line 73: `await stat(todosDir)` in `findProjectRoot()` -- check if directory exists
- Line 98: `await readdir(dirPath)` in `readTodosFromDir()` -- list files in directory
- Line 103: `await Bun.file(join(dirPath, file)).text()` -- already uses Bun for reading!

**Fix:**

- Replace `readdir(dirPath)` with `new Glob("*.md").scan({ cwd: dirPath })` (more idiomatic, already filters to .md)
- Replace `stat(todosDir)` with `Bun.file(join(todosDir, ".")).exists()` or use try/catch on Glob.scan
- Remove `import { readdir, stat } from "node:fs/promises"`

**scripts/check-domain-boundaries.ts (LOW #1):**

- Line 17: `import { readFileSync } from "node:fs"` -- used at line 179
- Line 179: `readFileSync(fullPath, "utf-8")` -- read file contents

**Fix:**

- Replace `readFileSync(fullPath, "utf-8")` with `await Bun.file(fullPath).text()`
- Remove `import { readFileSync } from "node:fs"`
- Note: `main()` is already async so no signature change needed

### Finding 6: .sort() -> orderBy (MEDIUM #4)

**src/shared/\_\_helpers/memory-context-builder.ts line 115:**

```typescript
const sorted = [...sections]
  .filter((s) => s.items.length > 0)
  .sort((a, b) => b.priority - a.priority);
```

**Fix:**

```typescript
import orderBy from "lodash/orderBy";
// ...
const sorted = orderBy(
  sections.filter((s) => s.items.length > 0),
  (s) => s.priority,
  "desc",
);
```

Note: The spread `[...sections]` is no longer needed since lodash orderBy returns a new array.

### Finding 7: Dual Recall Representation (MEDIUM #8)

**src/shared/\_\_helpers/recall-cache.ts:**

The `RecallCacheEntrySchema` (lines 83-98) stores data in two formats:

1. Flat string arrays: `patterns`, `decisions`, `pitfalls`, `findings` (consumed by `buildMemoryContextBlock()`)
2. Structured engrams: `recalledEngrams` with IDs, content, concept, confidence (consumed by `determineFeedback()`)

The comment at lines 58-61 explicitly documents this: "Both representations coexist for backward compatibility."

**Assessment:** This is a documented design choice for backward compatibility. The flat arrays power the memory context block formatting (which expects string arrays), while `recalledEngrams` enables the feedback loop (which needs engram IDs). Consolidating would require changing `buildMemoryContextBlock()` to accept structured engrams and extract strings, which is a larger refactor.

**Recommendation:** Add a code comment clarifying the migration path (derive flat arrays from recalledEngrams when all callers are migrated) but do NOT change the data structure in this phase. This is LOW risk as-is and the documentation already explains it.

## State of the Art

| Old Approach            | Current Approach                       | When Changed                    | Impact                           |
| ----------------------- | -------------------------------------- | ------------------------------- | -------------------------------- |
| 6-signal scoring        | 7-signal scoring (with feedback_score) | Phase 140.1 (lu-cognition spec) | TS schema lags behind spec       |
| .parse() on public APIs | .safeParse() per project convention    | schema-first-parsing rule       | 4 occurrences still use .parse() |
| node:fs in Bun runtime  | Bun.file() / Glob                      | bun-preference rule             | 2 files still use node:fs        |

## Open Questions

1. **Dual recall representation migration timeline**
   - What we know: Both flat arrays and structured engrams exist for backward compat
   - What's unclear: When buildMemoryContextBlock() will be migrated to use structured engrams
   - Recommendation: Document migration path in a code comment, defer actual migration to a future phase

2. **feedback_score computation coupling with confidence signal**
   - What we know: feedback_score uses the same confidence-extraction logic as the confidence signal but with different output values (0.8/0.5/0.2 vs 1.0/0.5/0.25)
   - What's unclear: Whether this creates problematic correlation between the two signals
   - Recommendation: Implement as documented in lu-cognition spec. The 0.075 weight is deliberately small to limit correlation impact.

## Recommended Plan Structure

### Plan 1: Schema Alignment (Integration Gap #2 + MEDIUM #7)

**Wave 1:** Update recall-scoring.schemas.ts (add feedback_score, adjust weights)
**Wave 2:** Update embedding-recall.ts (add feedback_score computation, add to composite score)
**Wave 3:** Verify lu-cognition.agent.ts documented weights match schema (may need no change if spec is already correct)

Rationale: Schema must change before consumers. lu-cognition spec is the source of truth.

### Plan 2: DRY Consolidation (HIGH #5, #6)

**Wave 1:** Extract `isExpertPerspective()` helper + merge buildHighestConfidenceResult/buildFallbackResult into single function
Both changes are in the same file (consensus-resolver.ts) and can be done in a single wave.

Rationale: Single file, tightly coupled changes. No dependencies on other plans.

### Plan 3: Convention Sweep (MEDIUM #1-4, HIGH #4, LOW #1)

**Wave 1 (independent, parallel):**

- .parse() -> .safeParse() in memory-feedback.ts (lines 151, 216)
- .parse() -> .safeParse() in consensus-resolver.ts (line 82)
- .sort() -> orderBy in memory-context-builder.ts (line 115)
- Remove stale EXCEPTIONS in check-domain-boundaries.ts (lines 46-62)
- node:fs -> Bun in check-domain-boundaries.ts (line 17, 179)
- node:fs -> Bun in todos/route.ts (lines 2, 73, 98)

All changes are independent files, can be done in parallel within a single wave.

**Wave 2:** Add migration-path comment to recall-cache.ts for dual representation (MEDIUM #8 documentation only)

Rationale: Convention fixes are independent of each other and of Plans 1-2. All three plans can run in parallel.

## Sources

### Primary (HIGH confidence)

- Direct code inspection of all 8 target files in the repository
- `.planning/v4.1.0-MILESTONE-AUDIT.md` -- authoritative finding descriptions
- `.claude/rules/schema-first-parsing.md` -- .safeParse() convention
- `.claude/rules/bun-preference.md` -- Bun API convention
- `.claude/rules/lodash-preference.md` -- orderBy convention
- `.claude/rules/module-boundary.md` -- documents EXCEPTIONS as resolved in Phase 13

### Secondary (MEDIUM confidence)

- lu-cognition.agent.ts spec (lines 299-322) -- 7-signal composite scoring documentation

## Metadata

**Confidence breakdown:**

- Schema drift fix: HIGH - exact line numbers, clear delta between spec and schema
- DRY consolidation: HIGH - functions verified identical by line-by-line comparison
- Convention sweep: HIGH - mechanical transformations with clear patterns
- Dual representation: HIGH - documented design choice, recommendation is documentation-only

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (stable -- all changes are to existing code patterns)
