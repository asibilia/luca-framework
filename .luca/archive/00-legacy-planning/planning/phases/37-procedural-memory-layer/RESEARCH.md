# Phase 37: Procedural Memory Layer -- Research

## Overview

Phase 37 adds a 4th memory type -- **procedures** -- to the existing memory system (patterns, decisions, pitfalls, preferences). Procedures are executable learned step sequences extracted from successful task executions, stored in `PROCEDURES.md`, recalled during planning, and tracked for success rate. This transforms implicit "how we did it" knowledge into reusable mini-skill templates.

## Existing Memory Architecture

### Current Memory Types (from `src/memory/types.ts`)

The `memoryEntrySchema` supports 4 categories:

```typescript
category: z.enum(["pattern", "decision", "pitfall", "preference"]);
```

Each entry has: `id`, `category`, `title`, `content`, `tags`, `agent`, `confidence`, `added_at`, `last_recalled_at`, `recall_count`, `token_estimate`.

### Current Memory Files

| File                   | Purpose                                                      | Module                         |
| ---------------------- | ------------------------------------------------------------ | ------------------------------ |
| `.planning/BRAIN.md`   | Project identity (loaded at session start)                   | Read-only reference            |
| `.planning/MEMORY.md`  | Long-term learning (patterns/decisions/pitfalls/preferences) | `src/memory/memory-parser.ts`  |
| `.planning/WORKING.md` | Session memory (cleared after learning extraction)           | `src/memory/working-memory.ts` |

### Existing Module Structure (`src/memory/`)

| File                 | Exports                                                            | Purpose                     |
| -------------------- | ------------------------------------------------------------------ | --------------------------- |
| `types.ts`           | All Zod schemas + types                                            | Schema definitions          |
| `index.ts`           | Barrel exports                                                     | Public API                  |
| `token-estimator.ts` | `estimateTokens`, `estimateFileTokens`, `estimateMemoryBudget`     | Token counting              |
| `compression.ts`     | `analyzeMemoryEntries`                                             | Compression recommendations |
| `quality-scorer.ts`  | `calculatePhaseQuality`, `scoreToZone`                             | Phase quality metrics       |
| `quality-trend.ts`   | `createQualityTrend`, `addPhaseMetrics`, etc.                      | Cross-phase trends          |
| `working-memory.ts`  | `parseWorkingMemory`, `serializeWorkingMemory`, `addSection`, etc. | WORKING.md management       |
| `context-monitor.ts` | `createContextMonitor`                                             | Context usage tracking      |
| `memory-parser.ts`   | `parseMemoryFile`, `parseMemoryContent`                            | MEMORY.md parsing           |
| `__tests__/`         | 7 test files                                                       | bun:test suite              |

### Key Patterns to Follow

1. **Zod schema-first**: All data structures defined as Zod schemas with `z.infer` types
2. **snake_case for schema fields**: Per API conventions rule
3. **Result<T> discriminated union**: From `src/shared/types.ts` for fallible operations
4. **Functional API**: Factory functions and pure functions, no classes
5. **Immutable operations**: Functions return new objects, never mutate input
6. **`import.meta.main` CLI entry points**: For standalone script execution
7. **`__tests__/` subdirectory**: With `bun:test` imports

## How Procedures Differ from Patterns

| Aspect          | Pattern                              | Procedure                                 |
| --------------- | ------------------------------------ | ----------------------------------------- |
| **Nature**      | Declarative knowledge ("what works") | Executable knowledge ("how to do it")     |
| **Format**      | Description + when-to-use            | Ordered step sequence with inputs/outputs |
| **Granularity** | Single insight                       | Multi-step recipe                         |
| **Recall**      | Inform planning decisions            | Suggest execution templates               |
| **Validation**  | Confidence (low/medium/high)         | Success rate (0.0-1.0)                    |
| **Lifecycle**   | Accumulate, compress, archive        | Track success, retire on low success      |

A pattern says: "Wave-based parallelization reduces execution time."
A procedure says: "To parallelize a multi-plan phase: (1) identify file-disjoint plans, (2) group into waves by dependency, (3) execute each wave in parallel, (4) verify after each wave."

## Design: Procedural Memory Format (PROC-01)

### `procedureEntrySchema`

```typescript
export const procedureEntrySchema = z.object({
  /** Unique identifier (proc-<slug>) */
  id: z.string(),
  /** Procedure title */
  title: z.string(),
  /** When to use this procedure (trigger conditions) */
  trigger: z.string(),
  /** Ordered steps to execute */
  steps: z.array(
    z.object({
      /** Step number (1-indexed) */
      order: z.number().int().positive(),
      /** What to do */
      action: z.string(),
      /** Expected output or artifact */
      expected_output: z.string().optional(),
      /** Tool or agent to use */
      tool: z.string().optional(),
    }),
  ),
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
```

### ID Generation

Follow the existing `generateEntryId` pattern in `memory-parser.ts`:

```typescript
// Prefix: "proc-" for procedures
// Slug: lowercase, stripped punctuation, dashes
generateProcedureId("Add security hardening to hook scripts");
// => "proc-add-security-hardening-to-hook-scripts"
```

### Relationship to `memoryEntrySchema`

Procedures are NOT an extension of `memoryEntrySchema`. They are a separate schema with their own storage file (`PROCEDURES.md` vs `MEMORY.md`). This avoids overloading the `category` enum and keeps the two concerns cleanly separated.

The `memory-parser.ts` module parses `MEMORY.md`. A new `procedure-parser.ts` will parse `PROCEDURES.md`.

## Design: PROCEDURES.md Storage (PROC-02)

### File Format

```markdown
# Procedures

> Executable learned procedures extracted from successful executions.
> Recalled during planning to suggest proven step sequences.

## Active Procedures

### Add a New Memory Module

- **Trigger**: When adding a new subsystem to `src/memory/`
- **Source**: lu-executor (Phase 36)
- **Tags**: [architecture, coding]
- **Success Rate**: 1.0 (2/2)
- **Last Executed**: 2026-02-13
- **Status**: Active

**Steps:**

1. Define Zod schemas in `src/memory/types.ts`
2. Create implementation module `src/memory/<name>.ts` with pure functions
3. Add barrel exports to `src/memory/index.ts`
4. Create test file `src/memory/__tests__/<name>.test.ts`
5. Add `import.meta.main` CLI entry point if standalone usage needed

---

### Parallelize Multi-Plan Phase Execution

- **Trigger**: When a phase has 3+ plans with file-disjoint scopes
- **Source**: lu-executor (Phase 9)
- **Tags**: [planning, performance]
- **Success Rate**: 0.83 (5/6)
- **Last Executed**: 2026-02-12
- **Status**: Active

**Steps:**

1. Identify file-disjoint plans using grep on PLAN.md file lists
2. Group plans into waves by dependency chain
3. Validate wave assignments with lu-plan-checker
4. Execute each wave's plans in parallel
5. Run harness verification after each wave completes

---

## Retired Procedures

<!-- Procedures with success rate below threshold or marked obsolete -->

---

_Procedure Statistics_

- Total active: 2
- Total retired: 0
- Average success rate: 0.92
- Last updated: 2026-02-13
```

### Storage Location

`.planning/PROCEDURES.md` -- alongside `MEMORY.md`, `BRAIN.md`, `WORKING.md`.

### Parser Design

New file: `src/memory/procedure-parser.ts`

Functions:

- `parseProcedureFile(filePath: string): Promise<Result<ProcedureEntry[]>>` -- Read + parse
- `parseProcedureContent(content: string): Result<ProcedureEntry[]>` -- Parse markdown content
- `serializeProcedures(entries: ProcedureEntry[]): string` -- Write back to markdown
- `generateProcedureId(title: string): string` -- ID generation

The parser follows the existing `memory-parser.ts` approach:

- Split by `##` / `###` headers
- Detect metadata fields (`**Trigger**:`, `**Tags**:`, etc.)
- Build + validate against `procedureEntrySchema.safeParse()`
- Parse ordered step lists (`1.`, `2.`, etc.)

## Design: lu-learner Step Sequence Extraction (PROC-03)

### How Extraction Works

lu-learner currently extracts patterns, decisions, and pitfalls from `WORKING.md`. For procedures, it needs a new extraction step:

**New step in lu-learner: `extract_procedures`**

1. Read `WORKING.md` session log and findings
2. Identify successful multi-step sequences (3+ steps that led to a verified outcome)
3. For each candidate procedure:
   - Was the sequence verified (harness passed, verifier approved)?
   - Is it reusable (not a one-off debugging session)?
   - Is it specific enough to be actionable?
   - Does it already exist in `PROCEDURES.md`? (dedup by trigger similarity)
4. If new: add to `PROCEDURES.md` Active section
5. If existing: increment `execution_count` and `success_count`, recompute `success_rate`

### Candidate Detection Heuristics

Look for in WORKING.md:

- **Session log entries** with sequential numbered actions
- **Findings** sections describing "what we did" in sequence
- **Candidate Learnings** that describe process (not just insight)
- Phase execution summaries with step-by-step accounts

### Extraction Criteria

```
Extract as procedure if:
  - 3+ sequential steps that produced a verified outcome
  - Sequence is reusable (not tied to a single unique situation)
  - Sequence involves recognizable trigger conditions
  - Sequence is not already captured as a procedure

Skip if:
  - Fewer than 3 steps (too simple for a procedure)
  - One-time debugging sequence
  - Sequence already exists with matching trigger
  - Sequence was part of a failed verification
```

### lu-learner Integration Points

The lu-learner agent config (`src/agents/general/lu-learner.agent.ts`) needs:

1. New `extract_procedures` step in execution flow
2. New section in `WORKING.md` candidate recognition: `Candidate Procedures`
3. Updated `generate_summary` to include procedure counts
4. New `memory_tags` addition: include `procedures` in agent cognition config

The lu-learner's `cognition.memory_tags` currently is `["patterns", "decisions", "pitfalls"]`. This does NOT need a new tag for procedures -- the tag vocabulary applies to MEMORY.md entries, not to PROCEDURES.md. The learner agent text (execution flow) gets a new step.

## Design: Procedure Recall During Planning (PROC-04)

### Recall Flow

During `phase-plan` (Step 0: Cognitive Pre-Flight), after recalling from MEMORY.md:

1. Load `PROCEDURES.md` via `parseProcedureFile()`
2. Filter to `status === "active"` procedures
3. Score relevance by:
   - Tag overlap with current phase keywords
   - Trigger text similarity to phase description
   - Success rate (higher = more relevant)
4. Select top N procedures (3-5, scaled by cognition tier)
5. Include in WORKING.md `## Memory Recall` section under `**Procedures**:`

### Recall Function

New file: `src/memory/procedure-recall.ts`

```typescript
export function recallProcedures(
  procedures: ProcedureEntry[],
  context: {
    phase_description: string;
    phase_tags: string[];
  },
  limit: number = 5,
): ProcedureEntry[];
```

Scoring: `(tag_overlap * 0.4) + (trigger_similarity * 0.4) + (success_rate * 0.2)`

Tag overlap: Jaccard similarity between procedure tags and phase tags.
Trigger similarity: Keyword overlap between trigger text and phase description.

### Integration with phase-plan Skill

In `src/skills/general/phase-plan.skill.ts`, Step 0 (Cognitive Pre-Flight):

After the existing MEMORY.md recall, add:

```bash
# Recall procedures for this phase
PROCEDURES=$(cat .planning/PROCEDURES.md 2>/dev/null || echo "")
```

Include recalled procedures in the WORKING.md Memory Recall section and pass to lu-planner.

### Integration with lu-planner Agent

lu-planner already reads Memory Recall from its prompt context. The recalled procedures appear as structured step sequences that inform plan creation. No code change needed in the planner agent -- it reads whatever is in the Memory Recall section.

## Design: Procedure Validation and Retirement (PROC-05)

### Success Rate Tracking

After each phase execution:

1. lu-learner checks if any active procedure was followed
2. If yes: increment `execution_count`
3. If execution succeeded (harness + verifier passed): increment `success_count`
4. Recompute `success_rate = success_count / execution_count`

### Retirement Criteria

A procedure is retired when:

1. `success_rate < 0.3` AND `execution_count >= 5` (consistently failing)
2. `last_executed_at` older than 180 days AND `execution_count < 3` (stale, unproven)
3. Manual retirement via lu-learner (e.g., architecture changed, procedure obsolete)

### Retirement Function

New in `src/memory/procedure-lifecycle.ts`:

```typescript
export function evaluateRetirement(
  entry: ProcedureEntry,
  options?: {
    min_executions?: number;
    min_success_rate?: number;
    max_stale_days?: number;
  },
): { should_retire: boolean; reason: string };
```

Defaults: `min_executions: 5`, `min_success_rate: 0.3`, `max_stale_days: 180`.

### Retirement Process

1. Move procedure from `## Active Procedures` to `## Retired Procedures`
2. Set `status: "retired"` and `retirement_reason`
3. Update statistics at bottom of PROCEDURES.md

## Implementation Plan

### File Structure

```
src/memory/
  types.ts                      # Add procedureEntrySchema + ProcedureEntry type
  procedure-parser.ts           # Parse/serialize PROCEDURES.md
  procedure-recall.ts           # Recall scoring and selection
  procedure-lifecycle.ts        # Retirement evaluation
  index.ts                      # Add new barrel exports
  __tests__/
    procedure-parser.test.ts    # Parser tests
    procedure-recall.test.ts    # Recall scoring tests
    procedure-lifecycle.test.ts # Retirement tests

.planning/
  PROCEDURES.md                 # New file (created by lu-learner)

src/agents/general/
  lu-learner.agent.ts           # Add extract_procedures step

src/skills/general/
  phase-plan.skill.ts           # Add procedure recall to Step 0
```

### Suggested Wave Structure

**Wave 1: Core Types + Parser (PROC-01, PROC-02)**

- Add `procedureEntrySchema` to `src/memory/types.ts`
- Create `src/memory/procedure-parser.ts`
- Create `src/memory/__tests__/procedure-parser.test.ts`
- Update `src/memory/index.ts` barrel exports
- Create `.planning/PROCEDURES.md` template

**Wave 2: Lifecycle + Recall (PROC-04, PROC-05)**

- Create `src/memory/procedure-recall.ts`
- Create `src/memory/procedure-lifecycle.ts`
- Create tests for both modules
- Update barrel exports

**Wave 3: Agent Integration (PROC-03)**

- Update `lu-learner.agent.ts` with `extract_procedures` step
- Update `phase-plan.skill.ts` with procedure recall in Step 0
- Run `bun run build:all` to propagate changes

### Estimated Token Budget

| File                   | Estimated Tokens |
| ---------------------- | ---------------- |
| types.ts additions     | ~200             |
| procedure-parser.ts    | ~400             |
| procedure-recall.ts    | ~200             |
| procedure-lifecycle.ts | ~150             |
| Tests (3 files)        | ~600             |
| PROCEDURES.md template | ~100             |
| Agent/skill updates    | ~200             |
| **Total**              | **~1850**        |

## Context Monitor Integration

The existing `createContextMonitor` in `src/memory/context-monitor.ts` tracks token usage across memory files. `PROCEDURES.md` should be added to the monitored files list. This is a one-line change in the context monitor's file path array.

## Compression Considerations

Procedures have their own lifecycle (retirement) rather than using the MEMORY.md compression engine. The compression engine in `src/memory/compression.ts` operates on `MemoryEntry[]` and should NOT be extended to handle procedures. Procedures self-compress via the retirement mechanism.

## Risk Assessment

| Risk                             | Mitigation                                                |
| -------------------------------- | --------------------------------------------------------- |
| Procedures bloat PROCEDURES.md   | Retirement mechanism + token budget monitoring            |
| Low-quality procedure extraction | Strict extraction criteria (3+ steps, verified, reusable) |
| Recall noise during planning     | Tag-based filtering + success rate weighting              |
| Stale procedures                 | 180-day staleness check in retirement evaluation          |

## Open Questions

1. **Should procedures be included in context budget calculations?** Recommendation: Yes, add PROCEDURES.md to the context monitor's file list.
2. **Should lu-cognition handle procedure recall, or should it stay in phase-plan?** Recommendation: Keep in phase-plan for now (simpler). Migrate to lu-cognition if recall logic becomes complex.
3. **Should procedure retirement be automatic or require confirmation?** Recommendation: Automatic retirement with lu-learner logging the action. User can manually re-activate by editing PROCEDURES.md.

## References

- `src/memory/types.ts` -- Existing memory schemas
- `src/memory/memory-parser.ts` -- Parser pattern to follow
- `src/memory/working-memory.ts` -- Immutable update pattern
- `src/memory/compression.ts` -- Scoring/analysis pattern
- `src/memory/quality-trend.ts` -- Trend tracking pattern
- `src/agents/general/lu-learner.agent.ts` -- Learning extraction flow
- `src/skills/general/phase-plan.skill.ts` -- Planning cognitive pre-flight
- `.planning/MEMORY.md` -- Existing memory file format
- `.planning/ROADMAP.md` -- Phase 37 requirements (PROC-01 through PROC-05)
