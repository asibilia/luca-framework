---
id: "37-01"
title: "Core Types, Procedure Parser, Tests & Barrel Exports"
phase: 37
wave: 1
depends_on: []
tasks:
  - id: "T1"
    title: "Add procedureEntrySchema to memory types"
    description: "Add the procedureEntrySchema and procedureStepSchema Zod schemas to src/memory/types.ts. The schema defines the structure for executable learned procedures with fields: id, title, trigger, steps (array of {order, action, expected_output?, tool?}), tags, source_agent, source_phase, execution_count, success_count, success_rate, added_at, last_executed_at, token_estimate, status (active|retired), retirement_reason. Export the ProcedureEntry and ProcedureStep inferred types."
    files: ["src/memory/types.ts"]
    verification: "procedureEntrySchema.safeParse() validates a well-formed procedure entry. ProcedureEntry type is exported and usable. All schema fields use snake_case. Defaults applied correctly: tags=[], source_agent='general', execution_count=0, success_count=0, success_rate=0, token_estimate=0, status='active'."
  - id: "T2"
    title: "Create procedure parser module"
    description: "Create src/memory/procedure-parser.ts following the pattern established by memory-parser.ts. Implements four exported functions: parseProcedureFile(filePath) reads PROCEDURES.md and returns Result<ProcedureEntry[]>, parseProcedureContent(content) parses raw markdown into entries (exported for testing), serializeProcedures(entries) converts ProcedureEntry[] back to PROCEDURES.md-format markdown with Active/Retired sections and statistics footer, generateProcedureId(title) creates deterministic 'proc-<slug>' IDs. The parser splits by ### headers, detects metadata lines (**Trigger**:, **Tags**:, **Success Rate**:, **Source**:, **Last Executed**:, **Status**:), and parses ordered step lists (1., 2., etc.) into the steps array with optional expected_output and tool fields. Includes import.meta.main CLI entry point."
    files: ["src/memory/procedure-parser.ts"]
    verification: "parseProcedureContent() correctly parses the PROCEDURES.md format from RESEARCH.md into ProcedureEntry[]. serializeProcedures() round-trips: parse then serialize produces structurally equivalent markdown. generateProcedureId('Add security hardening') returns 'proc-add-security-hardening'. Empty content returns empty array. Invalid entries are skipped with console warning. CLI entry point runs without error: bun run src/memory/procedure-parser.ts --file=.planning/PROCEDURES.md."
  - id: "T3"
    title: "Create PROCEDURES.md template"
    description: "Create .planning/PROCEDURES.md with the initial template structure: title, description blockquote, empty '## Active Procedures' section, empty '## Retired Procedures' section with HTML comment placeholder, and a statistics footer showing Total active: 0, Total retired: 0, Average success rate: N/A, Last updated: current date."
    files: [".planning/PROCEDURES.md"]
    verification: "File exists at .planning/PROCEDURES.md. Contains '## Active Procedures' and '## Retired Procedures' headers. Statistics footer is present. parseProcedureContent() on this file returns an empty array (no entries yet)."
  - id: "T4"
    title: "Update barrel exports for procedure types and parser"
    description: "Update src/memory/index.ts to export the new procedureEntrySchema, procedureStepSchema, ProcedureEntry type, ProcedureStep type from types.ts, and parseProcedureFile, parseProcedureContent, serializeProcedures, generateProcedureId from procedure-parser.ts. Follow the existing export grouping pattern with section comments."
    files: ["src/memory/index.ts"]
    verification: "import { procedureEntrySchema, parseProcedureFile, serializeProcedures, generateProcedureId } from '../memory' resolves correctly. import type { ProcedureEntry, ProcedureStep } from '../memory' resolves correctly. Existing exports unchanged (no regressions)."
  - id: "T5"
    title: "Write procedure parser tests"
    description: "Create src/memory/__tests__/procedure-parser.test.ts with comprehensive test coverage using bun:test. Test cases: (1) parse well-formed PROCEDURES.md content with multiple active entries, (2) parse content with retired entries, (3) parse empty content returns empty array, (4) parse content with missing optional fields (expected_output, tool, last_executed_at, source_phase), (5) generateProcedureId produces correct 'proc-<slug>' format, (6) generateProcedureId handles special characters and long titles, (7) serializeProcedures produces valid markdown with Active and Retired sections, (8) round-trip: parse -> serialize -> parse produces equivalent entries, (9) parse steps with expected_output and tool metadata, (10) parse success rate from '0.83 (5/6)' format, (11) invalid entries are skipped without crashing, (12) statistics footer correctly rendered in serialized output."
    files: ["src/memory/__tests__/procedure-parser.test.ts"]
    verification: "bun test src/memory/__tests__/procedure-parser.test.ts passes all tests. At least 12 test cases covering parsing, serialization, ID generation, round-tripping, and edge cases."
---

# Plan 37-01: Core Types, Procedure Parser, Tests & Barrel Exports

## Objective

Establish the foundational data layer for procedural memory by defining the Zod schema, implementing a markdown parser/serializer for PROCEDURES.md, creating the initial template file, and exporting everything through the memory barrel. This plan delivers the storage and parsing infrastructure that all subsequent procedure features (recall, lifecycle, agent integration) depend on.

This plan addresses **PROC-01** (procedural memory format) and **PROC-02** (PROCEDURES.md storage).

## Context

Read these files to understand existing infrastructure:

- @src/memory/types.ts -- Existing memory schemas (memoryEntrySchema, qualityTrendSchema, workingMemorySchema, etc.). The procedureEntrySchema is a NEW schema alongside these, NOT an extension of memoryEntrySchema. Follow the same Zod + snake_case + JSDoc patterns.
- @src/memory/memory-parser.ts -- Parser pattern to follow. Uses splitSections(), metadata extraction, Bun.file() for I/O, Result<T> return type, import.meta.main CLI entry point, and generateEntryId() for deterministic IDs. The procedure parser follows this same architecture.
- @src/memory/index.ts -- Current barrel exports with section-comment grouping. Add new exports in a `Procedure Memory` section.
- @src/memory/token-estimator.ts -- estimateTokens() function used for token_estimate fields.
- @src/shared/types.ts -- Result<T> discriminated union type used for fallible operations.
- @src/memory/**tests**/memory-parser.test.ts -- Existing parser test patterns to follow (if it exists).
- @.planning/phases/37-procedural-memory-layer/RESEARCH.md -- Full design specification including schema definition, PROCEDURES.md format, parser API, and ID generation rules.
- @.planning/MEMORY.md -- Existing memory file format for reference on markdown conventions.

## Tasks

### T1: Add procedureEntrySchema to memory types

**Goal:** Define the Zod schema for procedure entries, establishing the data contract that the parser, recall engine, and lifecycle manager all share. Procedures are a separate schema from memoryEntrySchema -- they have distinct fields (trigger, steps, execution_count, success_rate) and live in a separate file (PROCEDURES.md).

**Files:** `src/memory/types.ts`

**Implementation:**

Add two new schemas after the existing `compressionTriggerSchema` section:

```typescript
// ─── Procedure Step Schema ─────────────────────────────────────────────────────

/**
 * A single step within a learned procedure.
 *
 * Steps are ordered instructions that form an executable recipe.
 * Each step has an action description and optional metadata about
 * expected output and tooling.
 *
 * Uses snake_case for all field names per API conventions.
 */
export const procedureStepSchema = z.object({
  /** Step number (1-indexed) */
  order: z.number().int().positive(),
  /** What to do in this step */
  action: z.string(),
  /** Expected output or artifact from this step */
  expected_output: z.string().optional(),
  /** Tool or agent to use for this step */
  tool: z.string().optional(),
});

/** A single step within a learned procedure. */
export type ProcedureStep = z.infer<typeof procedureStepSchema>;

// ─── Procedure Entry Schema ────────────────────────────────────────────────────

/**
 * A learned procedure extracted from a successful execution.
 *
 * Procedures are executable step sequences (mini-skill templates) that
 * capture "how to do it" knowledge. Unlike patterns (declarative insights),
 * procedures are ordered, trackable recipes with success rate validation
 * and retirement lifecycle.
 *
 * Stored in .planning/PROCEDURES.md, parsed by procedure-parser.ts.
 *
 * Uses snake_case for all field names per API conventions.
 */
export const procedureEntrySchema = z.object({
  /** Unique identifier (proc-<slug>) */
  id: z.string(),
  /** Procedure title */
  title: z.string(),
  /** When to use this procedure (trigger conditions) */
  trigger: z.string(),
  /** Ordered steps to execute */
  steps: z.array(procedureStepSchema),
  /** Domain tags from TAG-VOCABULARY.md */
  tags: z.array(z.string()).default([]),
  /** Agent that originated this procedure */
  source_agent: z.string().default("general"),
  /** Phase where this procedure was first extracted */
  source_phase: z.number().int().optional(),
  /** Number of times this procedure has been executed */
  execution_count: z.number().int().nonnegative().default(0),
  /** Number of successful executions */
  success_count: z.number().int().nonnegative().default(0),
  /** Computed success rate (success_count / execution_count, 0.0-1.0) */
  success_rate: z.number().min(0).max(1).default(0),
  /** ISO 8601 date when procedure was added */
  added_at: z.string(),
  /** ISO 8601 date when procedure was last executed */
  last_executed_at: z.string().optional(),
  /** Estimated token count */
  token_estimate: z.number().int().nonnegative().default(0),
  /** Whether this procedure is active or retired */
  status: z.enum(["active", "retired"]).default("active"),
  /** Reason for retirement (if retired) */
  retirement_reason: z.string().optional(),
});

/** A learned procedure with ordered steps, success tracking, and lifecycle status. */
export type ProcedureEntry = z.infer<typeof procedureEntrySchema>;
```

**Acceptance Criteria:**

- Both schemas compile without TypeScript errors
- `procedureEntrySchema.safeParse()` validates correctly with defaults applied
- `procedureStepSchema.safeParse({ order: 1, action: "Do something" })` succeeds
- All field names are snake_case
- Types are exported: `ProcedureEntry`, `ProcedureStep`
- Existing schemas unchanged (no regressions)

### T2: Create procedure parser module

**Goal:** Implement the PROCEDURES.md parser and serializer following the established memory-parser.ts patterns. The parser converts between markdown format and typed ProcedureEntry arrays, enabling programmatic read/write of procedure data.

**Files:** `src/memory/procedure-parser.ts`

**Implementation:**

Follow the `memory-parser.ts` architecture:

```typescript
import type { ProcedureEntry } from "./types.ts";
import { procedureEntrySchema } from "./types.ts";
import type { Result } from "../shared/types.ts";
import { estimateTokens } from "./token-estimator.ts";

/**
 * Parse a PROCEDURES.md file into structured ProcedureEntry array.
 *
 * Reads the file via Bun.file() and delegates to parseProcedureContent().
 *
 * @param filePath - Path to the PROCEDURES.md file
 * @returns Result with parsed entries or error
 */
export async function parseProcedureFile(
  filePath: string,
): Promise<Result<ProcedureEntry[]>> {
  // Read file via Bun.file(), delegate to parseProcedureContent()
}

/**
 * Parse PROCEDURES.md content string into structured ProcedureEntry array.
 *
 * Exported for testing (avoids file I/O in unit tests).
 *
 * @param content - Raw markdown content
 * @returns Result with parsed entries
 */
export function parseProcedureContent(
  content: string,
): Result<ProcedureEntry[]> {
  // Split by ## headers to find Active/Retired sections
  // Within each section, split by ### headers for individual procedures
  // For each procedure: extract metadata, parse steps, validate with schema
}

/**
 * Serialize ProcedureEntry array back to PROCEDURES.md markdown format.
 *
 * Produces a complete PROCEDURES.md file with:
 * - Title and description
 * - Active Procedures section
 * - Retired Procedures section
 * - Statistics footer
 *
 * @param entries - Array of procedure entries to serialize
 * @returns Formatted markdown string
 */
export function serializeProcedures(entries: ProcedureEntry[]): string {
  // Separate active/retired, render each entry, add statistics footer
}

/**
 * Generate a deterministic procedure ID from a title.
 *
 * Prefix: "proc-"
 * Slug: lowercase, stripped punctuation, dashes, truncated to 50 chars.
 *
 * @param title - Procedure title
 * @returns Deterministic ID string (e.g., "proc-add-security-hardening")
 */
export function generateProcedureId(title: string): string {
  // Follow generateEntryId pattern from memory-parser.ts
}
```

**Metadata extraction from markdown:**

The parser detects these metadata patterns within each `###` procedure subsection:

- `- **Trigger**: <text>` -- Required trigger description
- `- **Source**: <agent> (Phase <N>)` -- Source agent and phase
- `- **Tags**: [tag1, tag2]` -- Domain tags
- `- **Success Rate**: 0.83 (5/6)` -- Rate with execution counts
- `- **Last Executed**: 2026-02-13` -- ISO date
- `- **Status**: Active|Retired` -- Lifecycle status

**Step parsing:**

Steps are numbered lists under a `**Steps:**` marker:

```
1. Define Zod schemas in `src/memory/types.ts`
2. Create implementation module
```

Each step's `action` is the text after the number. Optional `expected_output` and `tool` can be specified with inline markers (e.g., `-> output: schema file` or `[tool: lu-executor]`), though most steps will only have an action.

**Acceptance Criteria:**

- Parses the PROCEDURES.md format defined in RESEARCH.md
- Handles both Active and Retired sections
- Steps parsed into ordered array with correct order numbers
- Success rate extracted with execution/success counts
- Round-trip: parse then serialize produces structurally equivalent output
- generateProcedureId follows the same slug conventions as generateEntryId
- Invalid entries skipped with console.warn (not thrown)
- CLI entry point works: `bun run src/memory/procedure-parser.ts --file=.planning/PROCEDURES.md`

### T3: Create PROCEDURES.md template

**Goal:** Create the initial empty PROCEDURES.md file that serves as the storage location for learned procedures. This file will be populated by lu-learner during the learning extraction step.

**Files:** `.planning/PROCEDURES.md`

**Implementation:**

```markdown
# Procedures

> Executable learned procedures extracted from successful executions.
> Recalled during planning to suggest proven step sequences.

## Active Procedures

<!-- No procedures extracted yet. Procedures are added by lu-learner after successful phase executions. -->

---

## Retired Procedures

<!-- Procedures with success rate below threshold or marked obsolete -->

---

_Procedure Statistics_

- Total active: 0
- Total retired: 0
- Average success rate: N/A
- Last updated: 2026-02-14
```

**Acceptance Criteria:**

- File exists at `.planning/PROCEDURES.md`
- Contains both `## Active Procedures` and `## Retired Procedures` headers
- Statistics footer present with zero counts
- `parseProcedureContent()` on this content returns an empty array

### T4: Update barrel exports for procedure types and parser

**Goal:** Expose the new procedure schemas, types, and parser functions through the memory module's public API so that downstream consumers (recall, lifecycle, agents) can import them cleanly.

**Files:** `src/memory/index.ts`

**Implementation:**

Add two new sections to the barrel exports:

```typescript
// ─── Procedure Types ────────────────────────────────────────────────────────

export { procedureStepSchema, procedureEntrySchema } from "./types.ts";

export type { ProcedureStep, ProcedureEntry } from "./types.ts";

// ─── Procedure Parsing ──────────────────────────────────────────────────────

export {
  parseProcedureFile,
  parseProcedureContent,
  serializeProcedures,
  generateProcedureId,
} from "./procedure-parser.ts";
```

**Acceptance Criteria:**

- `import { procedureEntrySchema, parseProcedureFile, serializeProcedures } from '../memory'` resolves
- `import type { ProcedureEntry, ProcedureStep } from '../memory'` resolves
- Existing exports unchanged
- No duplicate export warnings
- `bunx --bun tsc --noEmit` passes

### T5: Write procedure parser tests

**Goal:** Comprehensive test coverage for the procedure parser ensuring correct parsing, serialization, ID generation, round-tripping, and graceful error handling.

**Files:** `src/memory/__tests__/procedure-parser.test.ts`

**Implementation:**

```typescript
import { describe, test, expect } from "bun:test";
import {
  parseProcedureContent,
  serializeProcedures,
  generateProcedureId,
} from "../procedure-parser";
import type { ProcedureEntry } from "../types";
```

**Test cases (minimum 12):**

1. **Parse well-formed content with active entries:**
   - Two active procedures with steps, metadata, and tags
   - Returns 2 entries with correct fields

2. **Parse content with retired entries:**
   - One active, one retired procedure
   - Retired entry has `status: "retired"` and `retirement_reason`

3. **Parse empty content returns empty array:**
   - Empty string and whitespace-only content return `{ success: true, data: [] }`

4. **Parse content with missing optional fields:**
   - Entry without expected_output, tool, last_executed_at, source_phase
   - Fields are undefined, entry still valid

5. **generateProcedureId produces correct format:**
   - `generateProcedureId("Add security hardening")` returns `"proc-add-security-hardening"`
   - `generateProcedureId("Create a New Module")` returns `"proc-create-a-new-module"`

6. **generateProcedureId handles edge cases:**
   - Special characters stripped, long titles truncated to 50 chars
   - Multiple spaces/dashes collapsed

7. **serializeProcedures produces valid markdown:**
   - Active and Retired sections with correct headers
   - Metadata lines for each entry (Trigger, Tags, Success Rate, etc.)
   - Numbered step list

8. **Round-trip: parse -> serialize -> parse:**
   - Parse content, serialize result, parse again
   - Second parse produces equivalent entries (same IDs, titles, step counts)

9. **Parse steps with expected_output and tool:**
   - Steps that include optional metadata are parsed correctly

10. **Parse success rate from formatted string:**
    - "1.0 (2/2)" extracts rate=1.0, execution_count=2, success_count=2
    - "0.83 (5/6)" extracts rate=0.83, execution_count=6, success_count=5

11. **Invalid entries are skipped without crashing:**
    - Entry missing required `trigger` field is skipped
    - console.warn called, other entries still parsed

12. **Statistics footer rendered correctly:**
    - serializeProcedures with 3 active, 1 retired renders correct counts
    - Average success rate computed correctly

**Acceptance Criteria:**

- All tests pass with `bun test src/memory/__tests__/procedure-parser.test.ts`
- At least 12 test cases
- Tests use parseProcedureContent (no file I/O in unit tests)
- Edge cases covered: empty content, missing fields, invalid data

## Success Criteria

1. `procedureEntrySchema` and `procedureStepSchema` compile and validate correctly (`bunx --bun tsc --noEmit`)
2. `parseProcedureContent()` parses the PROCEDURES.md format from RESEARCH.md
3. `serializeProcedures()` produces valid PROCEDURES.md markdown
4. `generateProcedureId()` produces deterministic `proc-<slug>` IDs
5. Round-trip parsing is structurally stable (parse -> serialize -> parse)
6. `.planning/PROCEDURES.md` template exists and parses to empty array
7. Barrel exports resolve for all new schemas, types, and functions
8. All parser test cases pass (`bun test src/memory/__tests__/procedure-parser.test.ts`)
9. Existing memory module tests still pass (`bun test src/memory/__tests__/`)
10. Full JSDoc documentation on all exported functions and schemas

## Verification

**Automated checks:**

- `bunx --bun tsc --noEmit` -- all files type-check
- `bun test src/memory/__tests__/procedure-parser.test.ts` -- parser tests pass
- `bun test src/memory/__tests__/` -- all memory tests pass (no regressions)
- `bun test` -- full test suite passes

**Manual verification:**

- Run `bun run src/memory/procedure-parser.ts --file=.planning/PROCEDURES.md` and confirm JSON output (empty array)
- Verify `import { procedureEntrySchema, parseProcedureFile } from '../memory'` resolves in a scratch file
- Confirm PROCEDURES.md template has correct section headers and statistics footer
