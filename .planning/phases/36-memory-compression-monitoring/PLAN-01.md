---
id: "36-01"
title: "Memory Core: Schemas, Token Estimation, Compression & Quality Scoring"
phase: 36
wave: 1
depends_on: []
tasks:
  - id: "T1"
    title: "Create memory type schemas"
    description: "Create src/memory/types.ts with Zod schemas for memory entries, compression recommendations, quality metrics, token estimates, quality trends, and working memory sections. All types derived via z.infer."
    files: ["src/memory/types.ts"]
    verification: "File exports all schemas and derived types. bun run src/memory/types.ts does not error. All schemas use snake_case for field names."
  - id: "T2"
    title: "Create token estimator module"
    description: "Create src/memory/token-estimator.ts with heuristic token estimation using ~4 chars/token. Functions: estimateTokens, estimateFileTokens, estimateMemoryBudget. Returns Result<TokenEstimate>."
    files: ["src/memory/token-estimator.ts"]
    verification: "estimateTokens('hello world') returns approximately 3 tokens. estimateFileTokens reads file via Bun.file and returns token count. estimateMemoryBudget returns breakdown per file."
  - id: "T3"
    title: "Create compression recommendation engine"
    description: "Create src/memory/compression.ts with analyzeMemoryEntries returning CompressionRecommendation[]. Scores entries by age, recall frequency, confidence. Strategies: summarize, archive, merge, deduplicate."
    files: ["src/memory/compression.ts"]
    verification: "Old, low-confidence, never-recalled entries receive archive recommendation. High-recall entries are kept. Duplicate entries receive deduplicate strategy. Each recommendation includes estimated token savings."
  - id: "T4"
    title: "Create phase quality scorer"
    description: "Create src/memory/quality-scorer.ts with calculatePhaseQuality returning PhaseQualityMetrics. Weighted formula: tests(40%) + types(20%) + verification(25%) + learnings(15%). Maps to quality zones."
    files: ["src/memory/quality-scorer.ts"]
    verification: "All-passing harness with verification pass returns quality zone 'peak'. Mixed results return appropriate zone. Edge cases (no harness, empty results) handled gracefully."
  - id: "T5"
    title: "Create quality trend tracker"
    description: "Create src/memory/quality-trend.ts with addPhaseMetrics, getQualityTrend, detectRegression. Stores trend as JSON array. Compares current phase to rolling average for regression detection."
    files: ["src/memory/quality-trend.ts"]
    verification: "Adding declining metrics triggers regression detection. Rolling average computed correctly over configurable window. Empty state returns no regression."
  - id: "T6"
    title: "Create barrel exports"
    description: "Create src/memory/index.ts exporting all public API from types, token-estimator, compression, quality-scorer, and quality-trend modules."
    files: ["src/memory/index.ts"]
    verification: "import { estimateTokens, analyzeMemoryEntries, calculatePhaseQuality, getQualityTrend } from '../memory' resolves correctly."
  - id: "T7"
    title: "Write token estimator tests"
    description: "Create src/memory/__tests__/token-estimator.test.ts covering heuristic accuracy, file estimation, budget breakdown, error handling for missing files."
    files: ["src/memory/__tests__/token-estimator.test.ts"]
    verification: "bun test src/memory/__tests__/token-estimator.test.ts passes all tests."
  - id: "T8"
    title: "Write compression engine tests"
    description: "Create src/memory/__tests__/compression.test.ts covering recommendation generation, scoring, all four strategies, token savings estimation, and edge cases."
    files: ["src/memory/__tests__/compression.test.ts"]
    verification: "bun test src/memory/__tests__/compression.test.ts passes all tests."
  - id: "T9"
    title: "Write quality scorer tests"
    description: "Create src/memory/__tests__/quality-scorer.test.ts covering all quality zones, weight verification, edge cases (zero checks, all skipped), and zone boundary mapping."
    files: ["src/memory/__tests__/quality-scorer.test.ts"]
    verification: "bun test src/memory/__tests__/quality-scorer.test.ts passes all tests."
  - id: "T10"
    title: "Write quality trend tests"
    description: "Create src/memory/__tests__/quality-trend.test.ts covering regression detection, rolling average computation, empty state handling, and trend serialization."
    files: ["src/memory/__tests__/quality-trend.test.ts"]
    verification: "bun test src/memory/__tests__/quality-trend.test.ts passes all tests."
---

# Plan 36-01: Memory Core: Schemas, Token Estimation, Compression & Quality Scoring

## Objective

Build the foundational type system, token estimation engine, memory compression recommender, and phase quality scoring modules for the Luca memory subsystem. These modules provide the data structures and algorithms that Wave 2 builds on for working memory management and context monitoring.

This plan addresses **MEM-01** (token-aware compression foundation), **MEM-05** (phase quality scoring), and **MEM-06** (quality trend tracking) from the Phase 36 requirements.

## Context

Read these files to understand existing patterns and infrastructure:

- @src/context/types.ts -- Context tier system (T0-T3), Zod schema-first pattern with `z.infer`, snake_case convention
- @src/context/result-envelope.ts -- ResultEnvelope pattern, discriminated unions, parsing with fallbacks
- @src/iteration/types.ts -- Budget tracking schemas, convergence detection, comprehensive Zod schema examples (323 lines)
- @src/iteration/budget.ts -- `assessBudget` pattern, functional API with CLI entry point, JSDoc conventions
- @src/harness/types.ts -- HarnessResult, CheckResult, ParsedError interfaces (consumed by quality scorer)
- @src/planner/types.ts -- QUALITY_ZONES const, qualityZoneSchema, zone boundaries, token cost estimates
- @src/state-machine/types.ts -- PhaseResult, harnessResultRefSchema, workflowContextSchema
- @src/agents/general/lu-learner.agent.ts -- Learning extraction flow, MEMORY.md entry structure (patterns/decisions/pitfalls)
- @.planning/MEMORY.md -- Current memory file structure and entry format (89KB, needs compression)
- @.planning/config.json -- Configuration with complexity matrix, harness config, planner zone boundaries

## Tasks

### T1: Create memory type schemas

**Goal:** Define all Zod schemas for the memory subsystem in a single types module, following the established pattern from `src/context/types.ts` and `src/iteration/types.ts`.

**Files:** `src/memory/types.ts`

**Implementation:**

Create the following schemas with snake_case field names:

1. **`memoryEntrySchema`** -- A single entry from MEMORY.md:

   ```typescript
   export const memoryEntrySchema = z.object({
     /** Unique identifier derived from title hash */
     id: z.string(),
     /** Entry category */
     category: z.enum(["pattern", "decision", "pitfall", "preference"]),
     /** Entry title/name */
     title: z.string(),
     /** Full content of the entry (markdown) */
     content: z.string(),
     /** Domain tags from TAG-VOCABULARY.md */
     tags: z.array(z.string()).default([]),
     /** Agent that originated this entry */
     agent: z.string().default("general"),
     /** Confidence level */
     confidence: z.enum(["low", "medium", "high"]).default("low"),
     /** ISO 8601 date when entry was added */
     added_at: z.string(),
     /** ISO 8601 date when entry was last recalled */
     last_recalled_at: z.string().optional(),
     /** Number of times this entry has been recalled */
     recall_count: z.number().int().nonnegative().default(0),
     /** Estimated token count for this entry */
     token_estimate: z.number().int().nonnegative().default(0),
   });
   ```

2. **`compressionStrategySchema`** -- Strategy enum:

   ```typescript
   export const COMPRESSION_STRATEGIES = [
     "summarize",
     "archive",
     "merge",
     "deduplicate",
     "keep",
   ] as const;
   export const compressionStrategySchema = z.enum(COMPRESSION_STRATEGIES);
   ```

3. **`compressionRecommendationSchema`** -- Per-entry recommendation:

   ```typescript
   export const compressionRecommendationSchema = z.object({
     entry_id: z.string(),
     strategy: compressionStrategySchema,
     reason: z.string(),
     priority: z.number().min(0).max(1),
     estimated_token_savings: z.number().int().nonnegative(),
     merge_target_id: z.string().optional(),
   });
   ```

4. **`tokenEstimateSchema`** -- Token estimation result:

   ```typescript
   export const tokenEstimateSchema = z.object({
     total_tokens: z.number().int().nonnegative(),
     breakdown: z.array(
       z.object({
         source: z.string(),
         tokens: z.number().int().nonnegative(),
         bytes: z.number().int().nonnegative(),
       }),
     ),
     timestamp: z.string(),
   });
   ```

5. **`phaseQualityMetricsSchema`** -- Quality scoring output:

   ```typescript
   export const phaseQualityMetricsSchema = z.object({
     phase_id: z.number().int(),
     composite_score: z.number().min(0).max(1),
     zone: qualityZoneSchema,
     component_scores: z.object({
       tests: z.number().min(0).max(1),
       types: z.number().min(0).max(1),
       verification: z.number().min(0).max(1),
       learnings: z.number().min(0).max(1),
     }),
     weights: z.object({
       tests: z.number().default(0.4),
       types: z.number().default(0.2),
       verification: z.number().default(0.25),
       learnings: z.number().default(0.15),
     }),
     timestamp: z.string(),
   });
   ```

6. **`qualityTrendSchema`** -- Cross-phase trend:

   ```typescript
   export const qualityTrendSchema = z.object({
     phases: z.array(phaseQualityMetricsSchema),
     rolling_average: z.number().min(0).max(1),
     regression_detected: z.boolean(),
     regression_details: z.string().optional(),
     window_size: z.number().int().positive().default(5),
   });
   ```

7. **`workingMemorySectionSchema`** -- Structured WORKING.md section:

   ```typescript
   export const WORKING_MEMORY_SECTIONS = [
     "session_info",
     "memory_recall",
     "planning_notes",
     "findings",
     "hypotheses",
     "candidate_learnings",
   ] as const;
   export const workingMemorySectionNameSchema = z.enum(
     WORKING_MEMORY_SECTIONS,
   );
   export const workingMemorySectionSchema = z.object({
     name: workingMemorySectionNameSchema,
     content: z.string().default(""),
     token_estimate: z.number().int().nonnegative().default(0),
     last_updated_at: z.string().optional(),
   });
   ```

8. **`workingMemorySchema`** -- Full WORKING.md structure:
   ```typescript
   export const workingMemorySchema = z.object({
     sections: z.array(workingMemorySectionSchema).default([]),
     total_tokens: z.number().int().nonnegative().default(0),
     status: z.enum(["active", "extracted", "cleared"]).default("active"),
     session_started_at: z.string().optional(),
   });
   ```

Export all types via `z.infer<typeof ...>` following the pattern:

```typescript
export type MemoryEntry = z.infer<typeof memoryEntrySchema>;
export type CompressionRecommendation = z.infer<
  typeof compressionRecommendationSchema
>;
// etc.
```

Import `qualityZoneSchema` from `@src/planner/types.ts` (or re-export it).

**Acceptance Criteria:**

- All schemas compile without errors
- All schemas use snake_case for field names
- All types are exported via `z.infer`
- Module has no runtime dependencies beyond `zod` and the planner types import
- Comprehensive JSDoc on every schema and field

### T2: Create token estimator module

**Goal:** Provide heuristic token estimation for text content and files, enabling token-aware compression decisions.

**Files:** `src/memory/token-estimator.ts`

**Implementation:**

Use the `Result<T>` pattern (`{ success: true, data: T } | { success: false, error: string }`):

```typescript
import type { TokenEstimate } from "./types";

/** Characters per token heuristic (GPT/Claude average) */
const CHARS_PER_TOKEN = 4;

/**
 * Estimate token count for a text string.
 *
 * Uses a ~4 chars/token heuristic which is accurate within ~10%
 * for English text and code. Not a substitute for a real tokenizer
 * but sufficient for budget estimation and compression decisions.
 *
 * @param text - The text to estimate
 * @returns Estimated token count (always >= 0)
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Estimate token count for a file on disk.
 *
 * @param filePath - Absolute or relative path to file
 * @returns Result with token count, or error if file not readable
 */
export async function estimateFileTokens(
  filePath: string,
): Promise<Result<{ tokens: number; bytes: number }>> {
  // Use Bun.file(filePath).text() to read
  // Wrap in try/catch, return { success: false, error } on failure
  // Return { success: true, data: { tokens, bytes } }
}

/**
 * Estimate token budget across multiple memory files.
 *
 * @param paths - Array of file paths (BRAIN.md, MEMORY.md, WORKING.md, STATE.md)
 * @returns Result with TokenEstimate including per-file breakdown
 */
export async function estimateMemoryBudget(
  paths: string[],
): Promise<Result<TokenEstimate>> {
  // For each path, call estimateFileTokens
  // Aggregate into TokenEstimate with breakdown array
  // Set timestamp to current ISO string
}
```

Import the `Result<T>` type from the shared location:

```typescript
import type { Result } from "../shared/types";
```

Follow the CLI entry point pattern from `src/iteration/budget.ts`:

```typescript
if (import.meta.main) {
  // Accept file paths as args, output JSON
}
```

**Acceptance Criteria:**

- `estimateTokens("hello world")` returns `3` (11 chars / 4 = 2.75, ceil = 3)
- `estimateTokens("")` returns `0`
- `estimateFileTokens` reads file via `Bun.file()` and returns token count
- `estimateFileTokens` returns `{ success: false }` for non-existent files
- `estimateMemoryBudget` returns breakdown per file with totals
- CLI entry point outputs JSON to stdout
- Full JSDoc on all exported functions

### T3: Create compression recommendation engine

**Goal:** Analyze memory entries and produce compression recommendations to reduce MEMORY.md token usage.

**Files:** `src/memory/compression.ts`

**Implementation:**

```typescript
import type {
  MemoryEntry,
  CompressionRecommendation,
  CompressionStrategy,
} from "./types";
import { estimateTokens } from "./token-estimator";

/**
 * Analyze memory entries and produce compression recommendations.
 *
 * Scoring factors (all normalized 0-1, higher = more compressible):
 * - age: (days_since_added / 365). Older entries are more compressible.
 * - staleness: 1 - (recall_count / max_recall_count). Less recalled = more compressible.
 * - confidence_weight: low=0.3, medium=0.6, high=0.9. Low confidence = more compressible.
 *
 * Composite priority = (age * 0.3) + (staleness * 0.4) + ((1 - confidence_weight) * 0.3)
 *
 * Strategy assignment:
 * - priority >= 0.7 → "archive" (move to ## Archive section)
 * - priority >= 0.5 → "summarize" (compress content to 1-2 lines)
 * - duplicate detected → "deduplicate" (merge into existing entry)
 * - similar entries found → "merge" (combine related entries)
 * - priority < 0.3 → "keep" (no action)
 */
export function analyzeMemoryEntries(
  entries: MemoryEntry[],
  options?: {
    max_age_days?: number;
    min_recall_threshold?: number;
  },
): CompressionRecommendation[] {
  // 1. Score each entry
  // 2. Detect duplicates (same title or >80% content overlap)
  // 3. Assign strategy based on priority
  // 4. Estimate token savings per recommendation
}

/**
 * Detect potential duplicate entries by title similarity.
 */
function detectDuplicates(entries: MemoryEntry[]): Map<string, string[]> {
  // Group by normalized title (lowercase, stripped punctuation)
  // Return map of canonical title -> array of entry IDs
}

/**
 * Estimate token savings for a compression recommendation.
 */
function estimateTokenSavings(
  entry: MemoryEntry,
  strategy: CompressionStrategy,
): number {
  // archive: 100% of entry tokens saved
  // summarize: ~70% savings (keep 30% as summary)
  // deduplicate: 100% of duplicate tokens saved
  // merge: ~40% savings (combined is shorter than sum)
  // keep: 0 savings
}
```

**Acceptance Criteria:**

- Old (>180 days), never-recalled, low-confidence entries get "archive" strategy
- Recent, high-recall, high-confidence entries get "keep" strategy
- Entries with identical titles get "deduplicate" strategy
- Each recommendation includes a human-readable reason
- `estimated_token_savings` is a positive integer for non-keep strategies
- Function handles empty entry arrays (returns empty array)
- Pure function with no side effects (no file I/O)

### T4: Create phase quality scorer

**Goal:** Calculate a composite quality score for a completed phase, using harness results, verification status, and learning count.

**Files:** `src/memory/quality-scorer.ts`

**Implementation:**

```typescript
import type { PhaseQualityMetrics } from "./types";
import { phaseQualityMetricsSchema } from "./types";
import type { HarnessResult } from "../harness/types";
import type { QualityZone } from "../planner/types";

/** Weight constants for composite score calculation */
const WEIGHTS = {
  tests: 0.4,
  types: 0.2,
  verification: 0.25,
  learnings: 0.15,
} as const;

/**
 * Calculate composite quality metrics for a completed phase.
 *
 * Each component is scored 0-1:
 * - tests: (passed_test_checks / total_test_checks). 1.0 if all pass, 0.0 if all fail.
 * - types: (passed_type_checks / total_type_checks). 1.0 if clean, 0.0 if errors.
 * - verification: 1.0 if verified passed, 0.5 if partial, 0.0 if failed.
 * - learnings: min(learning_count / expected_count, 1.0). Expected: 1 for SIMPLE, 3 for MODERATE, 5 for COMPLEX.
 *
 * Composite = sum(component * weight)
 *
 * Zone mapping (uses planner zone boundaries from config):
 * - composite >= 0.85 → "peak"
 * - composite >= 0.65 → "good"
 * - composite >= 0.45 → "degrading"
 * - composite < 0.45 → "stop"
 */
export function calculatePhaseQuality(input: {
  phase_id: number;
  harness_result?: HarnessResult;
  verification_status: "passed" | "partial" | "failed" | "skipped";
  learning_count: number;
  complexity: string;
}): PhaseQualityMetrics {
  // 1. Extract test and type scores from harness_result
  //    - Find check with name "test", score = passed ? 1.0 : 0.0
  //    - Find check with name "typecheck", score = passed ? 1.0 : 0.0
  //    - If no harness result, default both to 0.5 (unknown)
  // 2. Map verification_status to score
  // 3. Calculate learning score based on complexity-adjusted expectation
  // 4. Compute composite score
  // 5. Map to quality zone
  // 6. Return PhaseQualityMetrics via schema.parse()
}

/**
 * Map a composite score (0-1) to a quality zone.
 */
export function scoreToZone(score: number): QualityZone {
  if (score >= 0.85) return "peak";
  if (score >= 0.65) return "good";
  if (score >= 0.45) return "degrading";
  return "stop";
}
```

**Acceptance Criteria:**

- All-passing harness + verification pass + adequate learnings returns zone "peak" with composite >= 0.85
- All-failing harness + verification fail + zero learnings returns zone "stop" with composite near 0.0
- Missing harness result defaults component scores to 0.5 (not 0)
- Weights sum to 1.0
- Returns valid `PhaseQualityMetrics` via `phaseQualityMetricsSchema.parse()`
- Pure function with no side effects

### T5: Create quality trend tracker

**Goal:** Track quality metrics across phases and detect regressions by comparing current phase to a rolling average.

**Files:** `src/memory/quality-trend.ts`

**Implementation:**

```typescript
import type { PhaseQualityMetrics, QualityTrend } from "./types";
import { qualityTrendSchema } from "./types";

/**
 * Create an empty quality trend tracker.
 */
export function createQualityTrend(windowSize?: number): QualityTrend {
  return qualityTrendSchema.parse({
    phases: [],
    rolling_average: 0,
    regression_detected: false,
    window_size: windowSize ?? 5,
  });
}

/**
 * Add phase metrics to the trend and recompute rolling average.
 *
 * Returns a NEW QualityTrend (immutable -- does not mutate input).
 */
export function addPhaseMetrics(
  trend: QualityTrend,
  metrics: PhaseQualityMetrics,
): QualityTrend {
  // 1. Append metrics to phases array
  // 2. Recompute rolling average over last window_size phases
  // 3. Detect regression (see detectRegression)
  // 4. Return new QualityTrend via schema.parse()
}

/**
 * Compute rolling average of composite scores over the window.
 */
export function computeRollingAverage(
  phases: PhaseQualityMetrics[],
  windowSize: number,
): number {
  // Take last windowSize phases
  // Average their composite_score values
  // Return 0 if no phases
}

/**
 * Detect quality regression.
 *
 * Regression is detected when:
 * 1. There are at least 3 phases in the trend
 * 2. The current phase composite_score is more than 0.15 below the rolling average
 * 3. OR two consecutive phases show declining scores
 *
 * @returns Object with detected flag and optional details string
 */
export function detectRegression(
  phases: PhaseQualityMetrics[],
  rollingAverage: number,
  windowSize: number,
): { detected: boolean; details?: string } {
  // Check conditions above
}

/**
 * Serialize quality trend to JSON for storage in STATE.md or MEMORY.md.
 */
export function serializeTrend(trend: QualityTrend): string {
  return JSON.stringify(trend, null, 2);
}

/**
 * Deserialize quality trend from stored JSON.
 */
export function deserializeTrend(json: string): Result<QualityTrend> {
  // JSON.parse + safeParse with error handling
}
```

Follow the immutable pattern from `src/iteration/budget.ts` -- all functions return NEW objects.

**Acceptance Criteria:**

- `createQualityTrend()` returns empty trend with defaults
- `addPhaseMetrics` returns a new object (does not mutate input)
- Rolling average is computed correctly over the window
- Regression detected when current score drops >0.15 below rolling average
- No regression detected with fewer than 3 phases
- `serializeTrend`/`deserializeTrend` roundtrip produces identical data
- Edge case: single phase, empty trend, all-identical scores

### T6: Create barrel exports

**Goal:** Provide a clean public API for the memory module via barrel exports.

**Files:** `src/memory/index.ts`

**Implementation:**

```typescript
// Types and schemas
export {
  memoryEntrySchema,
  compressionStrategySchema,
  compressionRecommendationSchema,
  tokenEstimateSchema,
  phaseQualityMetricsSchema,
  qualityTrendSchema,
  workingMemorySectionSchema,
  workingMemorySchema,
  workingMemorySectionNameSchema,
  COMPRESSION_STRATEGIES,
  WORKING_MEMORY_SECTIONS,
} from "./types";

export type {
  MemoryEntry,
  CompressionStrategy,
  CompressionRecommendation,
  TokenEstimate,
  PhaseQualityMetrics,
  QualityTrend,
  WorkingMemorySection,
  WorkingMemory,
} from "./types";

// Token estimation
export {
  estimateTokens,
  estimateFileTokens,
  estimateMemoryBudget,
} from "./token-estimator";

// Compression
export { analyzeMemoryEntries } from "./compression";

// Quality scoring
export { calculatePhaseQuality, scoreToZone } from "./quality-scorer";

// Quality trend
export {
  createQualityTrend,
  addPhaseMetrics,
  computeRollingAverage,
  detectRegression,
  serializeTrend,
  deserializeTrend,
} from "./quality-trend";
```

**Acceptance Criteria:**

- All public API functions and types are importable from `src/memory`
- No internal implementation details leak through the barrel
- TypeScript resolves all imports without errors

### T7: Write token estimator tests

**Goal:** Comprehensive test coverage for the token estimation module.

**Files:** `src/memory/__tests__/token-estimator.test.ts`

**Implementation:**

```typescript
import { describe, test, expect } from "bun:test";
import {
  estimateTokens,
  estimateFileTokens,
  estimateMemoryBudget,
} from "../token-estimator";
```

**Test cases (minimum):**

1. **`estimateTokens` -- basic heuristic:**
   - Empty string returns 0
   - "hello world" (11 chars) returns 3 tokens (ceil(11/4))
   - Single character returns 1
   - Long text (~1000 chars) returns ~250 tokens
   - Unicode text (multi-byte chars) estimates based on string length, not byte length

2. **`estimateFileTokens` -- file reading:**
   - Existing file returns token count matching content length / 4
   - Non-existent file returns `{ success: false }` with error message
   - Empty file returns `{ success: true, data: { tokens: 0, bytes: 0 } }`

3. **`estimateMemoryBudget` -- multi-file aggregation:**
   - Multiple existing files aggregates correctly
   - Mix of existing and missing files includes errors for missing, counts for existing
   - Empty path array returns total_tokens: 0 with empty breakdown
   - Breakdown entries include source path, token count, and byte count

**Acceptance Criteria:**

- All tests pass with `bun test src/memory/__tests__/token-estimator.test.ts`
- Tests use `bun:test` imports (describe, test, expect)
- File-based tests create temporary files or use existing `.planning/` files
- No mocking of Bun.file -- use real file I/O for integration confidence

### T8: Write compression engine tests

**Goal:** Comprehensive test coverage for the compression recommendation engine.

**Files:** `src/memory/__tests__/compression.test.ts`

**Implementation:**

```typescript
import { describe, test, expect } from "bun:test";
import { analyzeMemoryEntries } from "../compression";
import { memoryEntrySchema } from "../types";
```

**Test cases (minimum):**

1. **Strategy assignment:**
   - Old entry (added 1 year ago), zero recalls, low confidence -> "archive"
   - Recent entry (added 1 week ago), high recalls, high confidence -> "keep"
   - Entry with priority between 0.5-0.7 -> "summarize"
   - Two entries with identical title -> "deduplicate" for the second one

2. **Scoring:**
   - Verify age scoring: entry from 365 days ago scores higher than entry from 30 days ago
   - Verify recall scoring: entry with 0 recalls scores higher (more compressible) than entry with 10 recalls
   - Verify confidence scoring: low confidence scores higher than high confidence

3. **Token savings estimation:**
   - "archive" strategy estimates ~100% savings of entry token count
   - "summarize" strategy estimates ~70% savings
   - "keep" strategy estimates 0 savings
   - "deduplicate" strategy estimates ~100% savings of the duplicate

4. **Edge cases:**
   - Empty entries array returns empty recommendations
   - Single entry with high confidence returns "keep"
   - All entries identical -> first kept, rest deduplicated

**Acceptance Criteria:**

- All tests pass with `bun test src/memory/__tests__/compression.test.ts`
- Tests construct MemoryEntry objects via schema for type safety
- Recommendations include human-readable reason strings
- At least 10 test cases covering all strategies

### T9: Write quality scorer tests

**Goal:** Comprehensive test coverage for the phase quality scoring module.

**Files:** `src/memory/__tests__/quality-scorer.test.ts`

**Implementation:**

```typescript
import { describe, test, expect } from "bun:test";
import { calculatePhaseQuality, scoreToZone } from "../quality-scorer";
import type { HarnessResult } from "../../harness/types";
```

**Test cases (minimum):**

1. **Zone mapping (`scoreToZone`):**
   - Score 1.0 -> "peak"
   - Score 0.85 -> "peak" (boundary)
   - Score 0.84 -> "good"
   - Score 0.65 -> "good" (boundary)
   - Score 0.64 -> "degrading"
   - Score 0.45 -> "degrading" (boundary)
   - Score 0.44 -> "stop"
   - Score 0.0 -> "stop"

2. **Composite calculation:**
   - All components 1.0 -> composite 1.0
   - All components 0.0 -> composite 0.0
   - Only tests pass (1.0), rest 0 -> composite 0.4 (tests weight)
   - Only verification passes (1.0), rest 0 -> composite 0.25

3. **Weight verification:**
   - Confirm weights sum to 1.0
   - Confirm each weight matches documented values (0.4, 0.2, 0.25, 0.15)

4. **Harness integration:**
   - Passed harness with all checks -> test and type scores 1.0
   - Failed harness with test failures -> test score 0.0, type depends
   - No harness result -> component scores default to 0.5

5. **Verification status mapping:**
   - "passed" -> 1.0
   - "partial" -> 0.5
   - "failed" -> 0.0
   - "skipped" -> 0.5

6. **Learning score with complexity scaling:**
   - MODERATE with 3 learnings -> 1.0 (meets expectation)
   - MODERATE with 1 learning -> ~0.33
   - COMPLEX with 5 learnings -> 1.0
   - Any complexity with 0 learnings -> 0.0

**Acceptance Criteria:**

- All tests pass with `bun test src/memory/__tests__/quality-scorer.test.ts`
- Zone boundary tests are exact (testing boundary values)
- Returns valid schema objects (parseable by phaseQualityMetricsSchema)
- At least 15 test cases

### T10: Write quality trend tests

**Goal:** Comprehensive test coverage for the quality trend tracking module.

**Files:** `src/memory/__tests__/quality-trend.test.ts`

**Implementation:**

```typescript
import { describe, test, expect } from "bun:test";
import {
  createQualityTrend,
  addPhaseMetrics,
  computeRollingAverage,
  detectRegression,
  serializeTrend,
  deserializeTrend,
} from "../quality-trend";
import { phaseQualityMetricsSchema } from "../types";
```

**Test cases (minimum):**

1. **`createQualityTrend`:**
   - Default window size is 5
   - Custom window size is respected
   - Initial state has empty phases, 0 rolling average, no regression

2. **`addPhaseMetrics` (immutability):**
   - Returns new object (original unchanged)
   - Phases array grows by 1
   - Rolling average updates
   - Works with first phase (no prior data)

3. **`computeRollingAverage`:**
   - Empty array returns 0
   - Single phase returns that phase's score
   - 5 phases with window 5: average of all 5
   - 7 phases with window 5: average of last 5 only
   - All phases score 0.8 -> average is 0.8

4. **`detectRegression`:**
   - Fewer than 3 phases -> no regression
   - Current score 0.2 below rolling average -> regression detected
   - Current score 0.1 below rolling average -> no regression (below threshold)
   - Two consecutive declining phases -> regression detected
   - Details string describes the regression

5. **Serialization roundtrip:**
   - `deserializeTrend(serializeTrend(trend))` produces identical data
   - Invalid JSON returns `{ success: false }`
   - Valid JSON but wrong schema returns `{ success: false }`

**Acceptance Criteria:**

- All tests pass with `bun test src/memory/__tests__/quality-trend.test.ts`
- Immutability verified (original objects not mutated)
- At least 12 test cases
- Edge cases (empty state, boundary values) covered

## Success Criteria

1. All 6 source files compile without TypeScript errors (`bunx --bun tsc --noEmit`)
2. All 4 test files pass (`bun test src/memory/__tests__/`)
3. Barrel exports resolve all public API (`src/memory/index.ts`)
4. All Zod schemas use snake_case field names
5. All functions follow the functional API pattern (no classes, no mutation)
6. All functions have comprehensive JSDoc documentation
7. Token estimator heuristic is within 10% of expected for English text
8. Quality scorer weights sum to 1.0
9. Compression engine produces valid recommendations for all strategy types
10. Quality trend detects regressions accurately

## Verification

**Automated checks:**

- `bunx --bun tsc --noEmit` -- all files type-check
- `bun test src/memory/__tests__/` -- all tests pass

**Manual verification:**

- Review schema shapes match the documented structures above
- Confirm quality zones map correctly at boundary values
- Verify compression scoring produces sensible recommendations for realistic MEMORY.md entries
- Confirm trend regression detection triggers at the documented thresholds
