---
id: "36-02"
title: "Working Memory, Context Monitoring & Memory Parser"
phase: 36
wave: 2
depends_on: ["36-01"]
tasks:
  - id: "T1"
    title: "Create working memory manager"
    description: "Create src/memory/working-memory.ts with parseWorkingMemory, serializeWorkingMemory, addSection, and summarizeSection functions. Zod-validated WORKING.md structure with merge semantics."
    files: ["src/memory/working-memory.ts"]
    verification: "parseWorkingMemory reads WORKING.md and returns structured WorkingMemory. serializeWorkingMemory produces valid markdown. addSection merges content. summarizeSection compresses sections over threshold."
  - id: "T2"
    title: "Create context monitor module"
    description: "Create src/memory/context-monitor.ts with createContextMonitor factory returning monitor with checkContextUsage, getBreakdown, shouldCompress. Tracks BRAIN + MEMORY + WORKING + STATE file sizes."
    files: ["src/memory/context-monitor.ts"]
    verification: "createContextMonitor returns monitor. checkContextUsage returns usage percentage and quality zone. shouldCompress returns true when MEMORY.md exceeds token threshold."
  - id: "T3"
    title: "Create MEMORY.md parser"
    description: "Create src/memory/memory-parser.ts with parseMemoryFile that reads MEMORY.md and returns MemoryEntry[]. Handles markdown sections (Patterns, Decisions, Pitfalls). Extracts metadata (agent, tags, confidence, added date). Supports recall tracking."
    files: ["src/memory/memory-parser.ts"]
    verification: "parseMemoryFile reads .planning/MEMORY.md and returns MemoryEntry[] with correct categories, tags, and metadata. Handles entries with missing fields gracefully."
  - id: "T4"
    title: "Enhance context-monitor.sh hook"
    description: "Update src/hooks/scripts/context-monitor.sh to output granular file-size breakdown and compression recommendation alongside existing severity levels. Maintain backward compatibility."
    files: ["src/hooks/scripts/context-monitor.sh"]
    verification: "Hook still outputs systemMessage for Claude Code and followup_message for Cursor. New output includes per-file breakdown (BRAIN, MEMORY, WORKING, STATE) and compression recommendation when memory exceeds threshold."
  - id: "T5"
    title: "Create PostToolUse context monitor hook"
    description: "Create a lightweight PostToolUse hook script (src/hooks/scripts/context-check-throttled.sh) that runs the context monitor on a throttled basis (skip if last check was <60 seconds ago via timestamp file). Register the hook in .claude/settings.json and .cursor/hooks.json for the PostToolUse/post_tool_use event."
    files:
      ["src/hooks/scripts/context-check-throttled.sh", ".claude/settings.json"]
    verification: "Hook runs after tool use. Skips if last check was within 60 seconds. When it runs, calls bun run src/memory/context-monitor.ts and reports zone if degrading or stop."
  - id: "T6"
    title: "Update barrel exports for Wave 2"
    description: "Update src/memory/index.ts to export all Wave 2 public API: parseWorkingMemory, serializeWorkingMemory, addSection, summarizeSection, shouldAutoSummarize, createContextMonitor, parseMemoryFile, contextUsageResultSchema, compressionTriggerSchema, and their types."
    files: ["src/memory/index.ts"]
    verification: "All Wave 2 public functions and types are importable from src/memory."
  - id: "T7"
    title: "Write working memory tests"
    description: "Create src/memory/__tests__/working-memory.test.ts covering parsing, serialization, merge semantics, section summarization, and roundtrip consistency."
    files: ["src/memory/__tests__/working-memory.test.ts"]
    verification: "bun test src/memory/__tests__/working-memory.test.ts passes all tests."
  - id: "T8"
    title: "Write context monitor tests"
    description: "Create src/memory/__tests__/context-monitor.test.ts covering file tracking, usage percentage calculation, zone mapping, and compression recommendations."
    files: ["src/memory/__tests__/context-monitor.test.ts"]
    verification: "bun test src/memory/__tests__/context-monitor.test.ts passes all tests."
  - id: "T9"
    title: "Write memory parser tests"
    description: "Create src/memory/__tests__/memory-parser.test.ts covering section parsing, metadata extraction, recall tracking, and edge cases for malformed entries."
    files: ["src/memory/__tests__/memory-parser.test.ts"]
    verification: "bun test src/memory/__tests__/memory-parser.test.ts passes all tests."
---

# Plan 36-02: Working Memory, Context Monitoring & Memory Parser

## Objective

Build the working memory management layer, async context monitoring module, and MEMORY.md parser that integrate with the core schemas and scoring from Wave 1. These modules enable structured WORKING.md handling (MEM-02, MEM-03), enhanced context monitoring during execution (MEM-04), and provide the parsing foundation for token-aware compression (MEM-01).

This plan addresses **MEM-01** (memory parsing for compression input), **MEM-02** (auto-summarize WORKING.md), **MEM-03** (structured WORKING.md schemas), and **MEM-04** (async context monitoring) from the Phase 36 requirements.

## Context

Read these files to understand existing infrastructure and Wave 1 outputs:

- @src/memory/types.ts -- All memory schemas (from Plan 36-01): memoryEntrySchema, workingMemorySchema, workingMemorySectionSchema, tokenEstimateSchema
- @src/memory/token-estimator.ts -- Token estimation functions (from Plan 36-01): estimateTokens, estimateFileTokens
- @src/memory/compression.ts -- Compression recommendations (from Plan 36-01): analyzeMemoryEntries
- @src/memory/index.ts -- Barrel exports (from Plan 36-01)
- @src/hooks/scripts/context-monitor.sh -- Existing Stop-event context monitor (162 lines), dual-platform output
- @src/agents/general/lu-learner.agent.ts -- MEMORY.md entry structure, extraction flow, section parsing expectations
- @src/planner/types.ts -- QUALITY_ZONES const, qualityZoneSchema, zone boundaries
- @src/context/types.ts -- Context tier system, budgetAllocationSchema
- @.planning/MEMORY.md -- Current 89KB memory file with ## Patterns, ## Decisions, ## Pitfalls sections
- @.planning/WORKING.md -- Current working memory (template structure)
- @.planning/config.json -- Configuration with planner zone boundaries and context thresholds

## Tasks

### T1: Create working memory manager

**Goal:** Provide structured management of WORKING.md with Zod-validated sections, merge semantics, and threshold-based auto-summarization. This replaces unstructured markdown append patterns with a typed API.

**Files:** `src/memory/working-memory.ts`

**Implementation:**

```typescript
import type { WorkingMemory, WorkingMemorySection } from "./types";
import {
  workingMemorySchema,
  workingMemorySectionSchema,
  WORKING_MEMORY_SECTIONS,
} from "./types";
import { estimateTokens } from "./token-estimator";

/** Default token threshold per section before auto-summarize triggers */
const DEFAULT_SECTION_TOKEN_THRESHOLD = 2000;

/** Total working memory token threshold before global compression */
const DEFAULT_TOTAL_TOKEN_THRESHOLD = 8000;
```

**Functions to implement:**

1. **`parseWorkingMemory(markdown: string): Result<WorkingMemory>`**
   - Parse WORKING.md markdown into structured `WorkingMemory` object
   - Detect sections by `## Section Name` headers
   - Map markdown headers to `WORKING_MEMORY_SECTIONS` enum values:
     - `## Session Info` -> `session_info`
     - `## Memory Recall` -> `memory_recall`
     - `## Planning Notes` -> `planning_notes`
     - `## Findings` (or `## Immediate Findings`) -> `findings`
     - `## Hypotheses` -> `hypotheses`
     - `## Candidate Learnings` (or `## Pre-Learning Extraction`) -> `candidate_learnings`
   - For each section, estimate tokens via `estimateTokens(content)`
   - Sum all section tokens into `total_tokens`
   - Detect status from `_Session Status_` checkboxes
   - Return via `workingMemorySchema.safeParse()`

2. **`serializeWorkingMemory(wm: WorkingMemory): string`**
   - Convert structured `WorkingMemory` back to markdown
   - Map section names back to display headers:
     - `session_info` -> `## Session Info`
     - `memory_recall` -> `## Memory Recall`
     - `planning_notes` -> `## Planning Notes`
     - `findings` -> `## Findings`
     - `hypotheses` -> `## Hypotheses`
     - `candidate_learnings` -> `## Candidate Learnings`
   - Include `# Working Memory` title and intro line
   - Append `_Session Status_` checkboxes at the bottom
   - Output should be valid markdown readable by lu-learner

3. **`addSection(wm: WorkingMemory, sectionName: WorkingMemorySectionName, content: string, mergeMode?: "append" | "replace"): WorkingMemory`**
   - Returns a NEW WorkingMemory (immutable)
   - Default merge mode is `"append"` -- adds content to existing section with `\n\n` separator
   - `"replace"` mode overwrites the section content entirely
   - Recalculates token estimates for the updated section and total
   - If section does not exist, creates it

4. **`summarizeSection(wm: WorkingMemory, sectionName: WorkingMemorySectionName, maxTokens?: number): WorkingMemory`**
   - Returns a NEW WorkingMemory (immutable)
   - If the section's token count is below `maxTokens` (default `DEFAULT_SECTION_TOKEN_THRESHOLD`), returns unchanged
   - If over threshold, truncates to the last N lines that fit within the token budget
   - Prepends a `[Summarized: original was ~{N} tokens, truncated to ~{M} tokens]` marker
   - Recalculates token estimates

5. **`shouldAutoSummarize(wm: WorkingMemory, thresholds?: { section?: number; total?: number }): { should_summarize: boolean; sections_over: string[] }`**
   - Check which sections exceed the section token threshold
   - Check if total tokens exceed the total threshold
   - Return list of sections that need summarization

**Acceptance Criteria:**

- `parseWorkingMemory` parses the current `.planning/WORKING.md` template without errors
- `serializeWorkingMemory(parseWorkingMemory(md))` produces functionally equivalent markdown
- `addSection` returns a new object (original unchanged)
- `addSection` with "append" concatenates content, "replace" overwrites
- `summarizeSection` reduces token count below threshold
- `shouldAutoSummarize` correctly identifies sections over threshold
- All functions are pure (no file I/O except through `estimateTokens`)

### T2: Create context monitor module

**Goal:** Provide an async-safe context monitoring API that hooks and skills can use to check context usage, get per-file breakdowns, and receive compression recommendations. This module is the TypeScript backing for the enhanced `context-monitor.sh` hook.

**Files:** `src/memory/context-monitor.ts`

**Implementation:**

```typescript
import type { QualityZone } from "../planner/types";
import { estimateFileTokens, estimateTokens } from "./token-estimator";

/** Default context file paths relative to project root */
const DEFAULT_CONTEXT_FILES = {
  brain: ".planning/BRAIN.md",
  memory: ".planning/MEMORY.md",
  working: ".planning/WORKING.md",
  state: ".planning/STATE.md",
} as const;

/** Default total context budget in tokens (200K context window estimate) */
const DEFAULT_CONTEXT_BUDGET = 50000; // ~200KB usable context
```

**Factory function pattern (no classes):**

```typescript
/**
 * Create a context monitor for tracking memory file usage.
 *
 * Returns an object with methods to check context usage,
 * get breakdowns, and determine compression needs. Designed
 * for use by both hooks (shell via CLI) and skills (TypeScript).
 *
 * @param config - Optional configuration overrides
 * @returns Context monitor object
 */
export function createContextMonitor(config?: {
  project_dir?: string;
  context_budget?: number;
  zone_boundaries?: {
    peak_end: number;
    good_end: number;
    degrading_end: number;
  };
}) {
  const projectDir = config?.project_dir ?? ".";
  const budget = config?.context_budget ?? DEFAULT_CONTEXT_BUDGET;
  const zones = config?.zone_boundaries ?? {
    peak_end: 30,
    good_end: 50,
    degrading_end: 70,
  };

  return {
    /**
     * Check context usage across all memory files.
     *
     * @returns Usage result with percentage, zone, and per-file breakdown
     */
    checkContextUsage: async (): Promise<ContextUsageResult> => {
      // 1. Read each context file via estimateFileTokens
      // 2. Sum total tokens
      // 3. Calculate usage_percent = (total / budget) * 100
      // 4. Map to quality zone using zone boundaries
      // 5. Return structured result
    },

    /**
     * Get per-file token breakdown.
     */
    getBreakdown: async (): Promise<ContextBreakdown> => {
      // Return token count per file
    },

    /**
     * Determine whether compression should be triggered.
     *
     * Returns true when:
     * - MEMORY.md exceeds 50% of total budget (primary trigger)
     * - Total context usage is in "degrading" or "stop" zone
     * - WORKING.md exceeds 15% of total budget
     */
    shouldCompress: async (): Promise<CompressionTrigger> => {
      // Check individual file thresholds
      // Return { should_compress, triggers: string[] }
    },
  };
}
```

**Supporting types (add to `src/memory/types.ts` created in PLAN-01 T1):**

```typescript
/** Result of a context usage check */
export const contextUsageResultSchema = z.object({
  total_tokens: z.number().int().nonnegative(),
  budget_tokens: z.number().int().positive(),
  usage_percent: z.number().min(0),
  zone: qualityZoneSchema,
  breakdown: z.array(
    z.object({
      file: z.string(),
      tokens: z.number().int().nonnegative(),
      percent_of_budget: z.number().min(0),
      exists: z.boolean(),
    }),
  ),
  timestamp: z.string(),
});
export type ContextUsageResult = z.infer<typeof contextUsageResultSchema>;

/** Compression trigger assessment */
export const compressionTriggerSchema = z.object({
  should_compress: z.boolean(),
  triggers: z.array(z.string()),
  recommended_actions: z.array(z.string()),
});
export type CompressionTrigger = z.infer<typeof compressionTriggerSchema>;
```

**CLI entry point:**

```typescript
if (import.meta.main) {
  const projectDir =
    process.argv.find((a) => a.startsWith("--project-dir="))?.split("=")[1] ??
    ".";
  const monitor = createContextMonitor({ project_dir: projectDir });
  const usage = await monitor.checkContextUsage();
  console.log(JSON.stringify(usage, null, 2));
  process.exit(0);
}
```

**Acceptance Criteria:**

- `createContextMonitor()` returns an object with `checkContextUsage`, `getBreakdown`, `shouldCompress`
- `checkContextUsage` returns zone mapping consistent with `QUALITY_ZONES`
- `shouldCompress` triggers when MEMORY.md is over 50% of budget
- Missing files are reported as `{ exists: false, tokens: 0 }`
- CLI entry point outputs JSON usage report to stdout
- Factory function follows the no-classes pattern (closure-based state)

### T3: Create MEMORY.md parser

**Goal:** Parse the current MEMORY.md markdown file into structured `MemoryEntry[]` for use by the compression engine and token estimator. This bridges the gap between the markdown-based memory format used by lu-learner and the typed schemas from Wave 1.

**Files:** `src/memory/memory-parser.ts`

**Implementation:**

```typescript
import type { MemoryEntry } from "./types";
import { memoryEntrySchema } from "./types";
import { estimateTokens } from "./token-estimator";

/**
 * Parse a MEMORY.md file into structured MemoryEntry array.
 *
 * Handles the current MEMORY.md format used by lu-learner:
 * - ## Patterns / ### Validated Approaches
 * - ## Decisions
 * - ## Pitfalls
 * - ## Preferences
 *
 * Each entry is a markdown list item or ### subsection with metadata fields.
 *
 * @param filePath - Path to the MEMORY.md file
 * @returns Result with parsed entries or error
 */
export async function parseMemoryFile(
  filePath: string,
): Promise<Result<MemoryEntry[]>> {
  // 1. Read file via Bun.file(filePath).text()
  // 2. Split into sections by ## headers
  // 3. For each section, parse entries
  // 4. Return Result<MemoryEntry[]>
}
```

**Section parsing logic:**

```typescript
/**
 * Parse a section of MEMORY.md into entries.
 *
 * Supports two entry formats:
 *
 * Format 1 (inline list item -- used for Patterns):
 *   - **Entry Name**: Description text
 *     Tags: [tag1, tag2]
 *
 * Format 2 (subsection -- used for Decisions/Pitfalls):
 *   ### Entry Name
 *   - **Field**: Value
 *   - **Tags**: [tag1, tag2]
 *   - **Confidence**: High
 *   - **Agent**: executor
 *   - **Added**: 2026-01-15
 */
function parseSectionEntries(
  sectionContent: string,
  category: "pattern" | "decision" | "pitfall" | "preference",
): MemoryEntry[] {
  // 1. Detect format (inline vs subsection)
  // 2. Extract title, content, tags, metadata
  // 3. Generate ID from title hash (simple hash function)
  // 4. Estimate tokens for each entry
  // 5. Set defaults for missing fields (confidence: "low", recall_count: 0)
  // 6. Validate via memoryEntrySchema.safeParse()
  // 7. Skip entries that fail validation, log warning
}
```

**Metadata extraction helpers:**

```typescript
/**
 * Extract tags from a line like "Tags: [coding, patterns, security]"
 */
function extractTags(content: string): string[] {
  // Match Tags: [tag1, tag2, ...] pattern
  // Return array of tag strings
}

/**
 * Extract a metadata field value from entry content.
 * Matches patterns like "- **Confidence**: High" or "- **Agent**: executor"
 */
function extractMetadataField(
  content: string,
  fieldName: string,
): string | undefined {
  // Match - **FieldName**: Value pattern
  // Return trimmed value or undefined
}

/**
 * Generate a simple hash ID from a title string.
 */
function generateEntryId(title: string): string {
  // Lowercase, strip punctuation, replace spaces with dashes
  // Prefix with category initial (p-, d-, t-, pref-)
  // Truncate to 50 chars
}
```

**Acceptance Criteria:**

- `parseMemoryFile` successfully parses the current `.planning/MEMORY.md` (89KB)
- Returns correct `category` for each section ("pattern", "decision", "pitfall", "preference")
- Extracts `tags` arrays from `Tags: [tag1, tag2]` format
- Handles entries with missing metadata gracefully (uses defaults)
- Generates unique `id` for each entry based on title
- Estimates `token_estimate` for each entry
- Returns `{ success: false }` for non-existent files
- Handles empty sections (returns empty array for that category)
- Handles both inline list format and subsection format

### T4: Enhance context-monitor.sh hook

**Goal:** Extend the existing context monitor hook to output granular per-file breakdowns and compression recommendations while maintaining backward compatibility with existing severity levels.

**Files:** `src/hooks/scripts/context-monitor.sh`

**Implementation:**

Add a new section after the existing WORKING.md severity check block and before the final output generation that provides an enhanced breakdown:

1. **Measure all four context files:**

   ```bash
   # --- Enhanced breakdown: All memory files ---
   BRAIN_MD="$PROJECT_DIR/.planning/BRAIN.md"
   MEMORY_MD="$PROJECT_DIR/.planning/MEMORY.md"
   STATE_MD="$PROJECT_DIR/.planning/STATE.md"

   BRAIN_SIZE=0
   MEMORY_SIZE=0
   STATE_SIZE=0

   if [ -f "$BRAIN_MD" ]; then
     BRAIN_SIZE=$(wc -c < "$BRAIN_MD" | tr -d ' ')
   fi
   if [ -f "$MEMORY_MD" ]; then
     MEMORY_SIZE=$(wc -c < "$MEMORY_MD" | tr -d ' ')
   fi
   if [ -f "$STATE_MD" ]; then
     STATE_SIZE=$(wc -c < "$STATE_MD" | tr -d ' ')
   fi
   ```

2. **Calculate total context bytes:**

   ```bash
   TOTAL_CONTEXT_BYTES=$((BRAIN_SIZE + MEMORY_SIZE + WMD_SIZE + STATE_SIZE))
   ```

3. **Add compression recommendation to the output message:**
   - If `MEMORY_SIZE > 60000` (60KB), append: `" MEMORY.md is large (~${MEMORY_SIZE} bytes). Consider running memory compression to reduce context usage."`
   - If `TOTAL_CONTEXT_BYTES > 150000` (150KB), append: `" Total context files are ${TOTAL_CONTEXT_BYTES} bytes. Consider consolidating memory."`

4. **Enhance the JSON output to include breakdown:**
   - Add a `breakdown` field to the output JSON (alongside `systemMessage` or `followup_message`)
   - The breakdown is informational only -- the primary output remains the warning message
   - Structure:
     ```json
     {
       "systemMessage": "...",
       "context_breakdown": {
         "brain_bytes": 5000,
         "memory_bytes": 89000,
         "working_bytes": 2000,
         "state_bytes": 3000,
         "total_bytes": 99000
       }
     }
     ```

5. **Backward compatibility:**
   - All existing behavior (severity levels, threshold checks, dual-platform output) remains unchanged
   - The breakdown is additive -- it does not alter the existing `systemMessage`/`followup_message` format
   - Claude Code and Cursor will ignore the extra `context_breakdown` field (they only read `systemMessage`/`followup_message`)

**Acceptance Criteria:**

- Existing severity levels (NONE, MODERATE, HIGH, CRITICAL) work unchanged
- New per-file breakdown is included in the JSON output
- Compression recommendation appears in the message when MEMORY.md > 60KB
- Hook still exits 0 when no threshold exceeded
- No new dependencies added (pure bash + bun -e)
- SEC-01 transcript path validation still in place

### T5: Create PostToolUse context monitor hook

**Goal:** Wire the context monitor module to fire during execution (not just at session end) via a PostToolUse hook. The hook is throttled to avoid excessive overhead — it skips if the last check was less than 60 seconds ago.

**Files:** `src/hooks/scripts/context-check-throttled.sh`, `.claude/settings.json`

**Implementation:**

Create `src/hooks/scripts/context-check-throttled.sh`:

```bash
#!/usr/bin/env bash
# PostToolUse throttled context monitor
# Skips if last check was within 60 seconds (via timestamp file)

THROTTLE_FILE="/tmp/.luca-context-check-ts"
THROTTLE_SECONDS=60

# Check throttle
if [ -f "$THROTTLE_FILE" ]; then
  LAST_CHECK=$(cat "$THROTTLE_FILE" 2>/dev/null || echo "0")
  NOW=$(date +%s)
  ELAPSED=$((NOW - LAST_CHECK))
  if [ "$ELAPSED" -lt "$THROTTLE_SECONDS" ]; then
    exit 0  # Skip — too recent
  fi
fi

# Update timestamp
date +%s > "$THROTTLE_FILE"

# Run context monitor and check zone
PROJECT_DIR="${PROJECT_DIR:-.}"
RESULT=$(bun run src/memory/context-monitor.ts --project-dir="$PROJECT_DIR" 2>/dev/null)
ZONE=$(echo "$RESULT" | bun -e "const r=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(r.zone)" 2>/dev/null)

if [ "$ZONE" = "degrading" ] || [ "$ZONE" = "stop" ]; then
  USAGE=$(echo "$RESULT" | bun -e "const r=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(Math.round(r.usage_percent))" 2>/dev/null)
  echo "{\"systemMessage\": \"Context usage at ${USAGE}% (zone: ${ZONE}). Consider compressing memory or starting a new session.\"}"
fi
```

Register in `.claude/settings.json` under hooks (PostToolUse, async):

```json
{
  "event": "PostToolUse",
  "command": "bash src/hooks/scripts/context-check-throttled.sh",
  "async": true
}
```

**Acceptance Criteria:**

- Hook skips execution if last check was within 60 seconds
- When it runs, calls the context monitor module and only outputs a message if zone is degrading or stop
- Registered as async PostToolUse hook (does not block tool use)
- No output when zone is peak or good (silent when healthy)

### T6: Update barrel exports for Wave 2

**Goal:** Update `src/memory/index.ts` to include all Wave 2 public API functions, schemas, and types.

**Files:** `src/memory/index.ts`

**Implementation:**

Add the following exports to the existing barrel file created in PLAN-01 T6:

```typescript
// Working memory
export {
  parseWorkingMemory,
  serializeWorkingMemory,
  addSection,
  summarizeSection,
  shouldAutoSummarize,
} from "./working-memory";

// Context monitoring
export { createContextMonitor } from "./context-monitor";
export { contextUsageResultSchema, compressionTriggerSchema } from "./types";
export type { ContextUsageResult, CompressionTrigger } from "./types";

// Memory parsing
export { parseMemoryFile } from "./memory-parser";
```

**Acceptance Criteria:**

- All Wave 2 public functions and types are importable from `src/memory`
- TypeScript resolves all imports without errors
- No duplicate exports with Wave 1

### T7: Write working memory tests

**Goal:** Comprehensive test coverage for the working memory management module.

**Files:** `src/memory/__tests__/working-memory.test.ts`

**Implementation:**

```typescript
import { describe, test, expect } from "bun:test";
import {
  parseWorkingMemory,
  serializeWorkingMemory,
  addSection,
  summarizeSection,
  shouldAutoSummarize,
} from "../working-memory";
```

**Test cases (minimum):**

1. **`parseWorkingMemory`:**
   - Parse the standard template (empty sections) succeeds
   - Parse markdown with populated sections extracts content correctly
   - Section name mapping: `## Session Info` -> `session_info`, etc.
   - Token estimates are calculated for each section
   - Total tokens equals sum of section tokens
   - Status detected from checkboxes (`[ ] Active` -> "active")
   - Invalid markdown returns `{ success: false }` with error

2. **`serializeWorkingMemory`:**
   - Produces valid markdown with `# Working Memory` title
   - Each section appears as `## Section Name` header
   - Status checkboxes are included at the bottom
   - Empty sections produce header with no content

3. **Roundtrip consistency:**
   - `serializeWorkingMemory(parseWorkingMemory(md).data)` preserves section content
   - Section order is preserved

4. **`addSection` (merge semantics):**
   - Append mode concatenates with `\n\n` separator
   - Replace mode overwrites entirely
   - Adding to non-existent section creates it
   - Token estimates are recalculated after mutation
   - Returns NEW object (original unchanged)

5. **`summarizeSection`:**
   - Section below threshold is returned unchanged
   - Section above threshold is truncated with `[Summarized]` marker
   - Token count after summarization is below threshold
   - Content is preserved as much as possible (keeps most recent lines)

6. **`shouldAutoSummarize`:**
   - No sections over threshold returns `{ should_summarize: false, sections_over: [] }`
   - One section over threshold returns it in `sections_over`
   - Total over threshold returns `should_summarize: true` even if no individual section is over

**Acceptance Criteria:**

- All tests pass with `bun test src/memory/__tests__/working-memory.test.ts`
- At least 15 test cases
- Immutability verified for addSection and summarizeSection
- Roundtrip tests confirm data preservation

### T8: Write context monitor tests

**Goal:** Comprehensive test coverage for the async context monitoring module.

**Files:** `src/memory/__tests__/context-monitor.test.ts`

**Implementation:**

```typescript
import { describe, test, expect } from "bun:test";
import { createContextMonitor } from "../context-monitor";
```

**Test cases (minimum):**

1. **Factory creation:**
   - `createContextMonitor()` returns object with expected methods
   - Custom config overrides are respected
   - Default context budget is applied when not specified

2. **`checkContextUsage`:**
   - Returns `usage_percent` as a number >= 0
   - Returns valid `QualityZone` ("peak", "good", "degrading", or "stop")
   - Breakdown includes entries for all four context files
   - Missing files show `{ exists: false, tokens: 0 }`
   - Timestamp is a valid ISO 8601 string

3. **Zone mapping:**
   - Usage 0-30% maps to "peak"
   - Usage 30-50% maps to "good"
   - Usage 50-70% maps to "degrading"
   - Usage >70% maps to "stop"
   - Zone boundaries respect config overrides

4. **`shouldCompress`:**
   - Returns `{ should_compress: false }` when all files are small
   - Returns `{ should_compress: true }` when MEMORY.md exceeds 50% of budget
   - Returns `{ should_compress: true }` when total usage is in "degrading" zone
   - `triggers` array explains why compression was recommended
   - `recommended_actions` provides actionable suggestions

5. **`getBreakdown`:**
   - Returns token count for each file
   - Handles missing files without errors
   - Sum of breakdown tokens matches total

6. **Real file test (integration):**
   - Point monitor at project root (`.`)
   - Confirm it reads real `.planning/MEMORY.md` and produces valid output
   - This test may be skipped in CI if files are not present (use conditional skip)

**Acceptance Criteria:**

- All tests pass with `bun test src/memory/__tests__/context-monitor.test.ts`
- At least 12 test cases
- Factory pattern tested (no `new` keyword)
- Zone boundary tests are exact

### T9: Write memory parser tests

**Goal:** Comprehensive test coverage for the MEMORY.md parser module.

**Files:** `src/memory/__tests__/memory-parser.test.ts`

**Implementation:**

```typescript
import { describe, test, expect } from "bun:test";
import { parseMemoryFile } from "../memory-parser";
// Import helpers if exported for testing
```

**Test cases (minimum):**

1. **Section parsing:**
   - `## Patterns` section parsed with category "pattern"
   - `## Decisions` section parsed with category "decision"
   - `## Pitfalls` section parsed with category "pitfall"
   - `## Preferences` section parsed with category "preference"
   - Unknown `## Section` headers are skipped gracefully

2. **Inline entry format (Patterns):**
   - Parse: `- **Entry Name**: Description text\n  Tags: [tag1, tag2]`
   - Correctly extracts title: "Entry Name"
   - Correctly extracts content: "Description text"
   - Correctly extracts tags: ["tag1", "tag2"]
   - Handles entries without tags (defaults to empty array)

3. **Subsection entry format (Decisions/Pitfalls):**
   - Parse: `### Decision Title\n- **Context**: ...\n- **Tags**: [tag1]\n- **Confidence**: High`
   - Correctly extracts title: "Decision Title"
   - Correctly extracts confidence: "high"
   - Correctly extracts agent if present
   - Correctly extracts added date if present

4. **Metadata extraction:**
   - Tags extracted from `Tags: [coding, patterns]` format
   - Tags extracted from `**Tags**: [coding, patterns]` format
   - Confidence extracted and normalized to lowercase
   - Agent field extracted or defaults to "general"
   - Added date extracted or defaults to empty string

5. **ID generation:**
   - Title "Zod safeParse at API boundaries" -> predictable, unique ID
   - Different titles produce different IDs
   - Same title always produces same ID (deterministic)

6. **Token estimation:**
   - Each entry has `token_estimate > 0` for non-empty content
   - Token estimate roughly matches `content.length / 4`

7. **Edge cases:**
   - Non-existent file returns `{ success: false }`
   - Empty file returns `{ success: true, data: [] }`
   - File with only headers and no entries returns empty categories
   - Malformed entries (missing title, broken markdown) are skipped with warning
   - `## Archive` section is parsed but entries may have lower default confidence

8. **Integration with real MEMORY.md:**
   - Parse the actual `.planning/MEMORY.md`
   - Verify total entry count is > 0
   - Verify at least some pattern entries exist
   - Verify tags are non-empty arrays on most entries
   - This test validates the parser against the real format

**Acceptance Criteria:**

- All tests pass with `bun test src/memory/__tests__/memory-parser.test.ts`
- At least 15 test cases
- Both entry formats (inline and subsection) are tested
- Integration test runs against real MEMORY.md
- Malformed entries do not crash the parser

## Success Criteria

1. All 3 new source files compile without TypeScript errors (`bunx --bun tsc --noEmit`)
2. All 3 new test files pass (`bun test src/memory/__tests__/`)
3. `context-monitor.sh` passes existing tests and produces enhanced output
4. PostToolUse throttled hook created and registered in `.claude/settings.json`
5. Barrel exports in `src/memory/index.ts` updated with Wave 2 exports
6. `parseWorkingMemory` + `serializeWorkingMemory` roundtrip is lossless
7. `parseMemoryFile` successfully parses the real `.planning/MEMORY.md` (89KB)
8. `createContextMonitor` produces valid zone mappings matching planner boundaries
9. `context-monitor.sh` backward compatible with existing hook behavior
10. All functions follow functional API pattern (no classes, immutable returns)
11. All functions have comprehensive JSDoc documentation
12. All existing tests continue to pass (`bun test`)

## Verification

**Automated checks:**

- `bunx --bun tsc --noEmit` -- all files type-check
- `bun test src/memory/__tests__/` -- all memory module tests pass (Wave 1 + Wave 2)
- `bun test` -- full test suite passes (no regressions)

**Manual verification:**

- Run `bun run src/memory/context-monitor.ts --project-dir=.` and confirm valid JSON output with zone and breakdown
- Run `bun run src/memory/memory-parser.ts --file=.planning/MEMORY.md` and confirm parsed entries match expected structure
- Verify `context-monitor.sh` produces enhanced output when MEMORY.md is large
- Confirm working memory roundtrip: parse WORKING.md -> modify -> serialize -> parse again -> identical structure
