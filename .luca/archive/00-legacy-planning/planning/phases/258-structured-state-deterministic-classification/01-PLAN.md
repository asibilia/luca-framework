---
phase: 258
plan: 1
type: feature
autonomous: false
wave: 1
depends_on: []
---

# Phase 258 Plan 1: Structured State & Deterministic Classification

## Objective

Deliver two foundational capabilities for the v9.0.0 pipeline redesign:

1. **Structured state consolidation** (FOUND-01 through FOUND-05): Extend `WorkflowContext` with `git_workflow`, `token_profile`, and `schema_version` fields. Include `pipeline_position` in `read-status` output by calling the existing `computePipelinePosition()` at read time. Eliminate STATE.md entirely -- remove all generation code, all consumer reads/greps across skills/agents, delete the file, and remove the `snapshot` bridge command.

2. **Deterministic classification** (CLASS-01 through CLASS-05): Create a zero-LLM heuristic classifier that scores task complexity from input signals and returns structured results. Provide a CLI entry point. Eliminate both classify `Agent()` calls from `lu.skill.ts`. Add routing history with adaptive adjustment.

This unblocks every downstream phase in the v9.0.0 milestone by establishing `state.json` as the sole source of truth and removing LLM-dependent classification.

## Context

@packages/luca-framework/src/state/types.ts
@packages/luca-framework/src/state/bridge.ts
@packages/luca-framework/src/state/snapshot.ts
@packages/luca-framework/src/state/persistence.ts
@src/complexity/**schemas/complexity.schemas.ts
@src/complexity/**helpers/model-routing.ts
@src/skills/luca/lu.skill.ts
@.planning/phases/258-structured-state-deterministic-classification/01-CONTEXT.md

## Tasks

### Wave 1: Schema & Classifier Foundation (independent, no cross-dependencies)

### 1. Create classifier Zod schemas

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/complexity/__schemas/classify.schemas.ts` with all Zod schemas for the deterministic classifier system.

**Schemas to define:**

- `classifierInputSchema`: task description (string), file count (number, optional), cross-cutting scope (array of strings, optional), risk indicators (array of strings, optional), dependency count (number, optional), roadmap phase data (optional object with task_count, file_references, dependencies)
- `classifierOutputSchema`: complexity (reuse `complexityLevelSchema` from `complexity.schemas.ts`), route (string -- "direct" or "phased"), score (number 0-1), signals (record of signal name to individual score)
- `keywordDictionarySchema`: maps each complexity level to an array of keyword strings
- `classifierWeightsSchema`: keyword (number), file_scope (number), cross_cutting (number), risk (number), novelty (number) -- all with defaults matching D4 weights (0.2, 0.3, 0.2, 0.15, 0.15)
- `classifierThresholdsSchema`: maps each complexity level to its upper bound (TRIVIAL < 0.2, SIMPLE < 0.4, MODERATE < 0.6, COMPLEX < 0.8, CRITICAL >= 0.8)
- `routingHistoryEntrySchema`: timestamp, phase (int), initial_complexity, final_complexity, succeeded (bool), stalled (bool), iteration_counts (object with harness_fix and verify_fix ints), task_count (int), file_count (int), keywords (array of strings)
- Export inferred types for all schemas

Import `complexityLevelSchema` from the sibling `complexity.schemas.ts` (same tier, same domain -- T0 intra-domain import is allowed).

**Files to create:**

- `src/complexity/__schemas/classify.schemas.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- File exports all named schemas and inferred types
- No upward tier imports (stays within T0 complexity domain)

### 2. Create deterministic heuristic classifier

**Type:** auto
**TDD:** false
**Depends on:** 1

Create `src/complexity/__helpers/classify.ts` implementing the weighted-sum scoring classifier per D4.

**Implementation details:**

- Export `classifyComplexity(input: ClassifierInput): ClassifierOutput` as the primary function
- Define keyword dictionaries inline (const arrays for each complexity level): TRIVIAL keywords ("typo", "rename", "comment", "formatting"), SIMPLE keywords ("update", "add field", "config change"), MODERATE keywords ("feature", "refactor", "new component"), COMPLEX keywords ("cross-cutting", "migration", "multi-package", "breaking"), CRITICAL keywords ("architecture", "rewrite", "system-wide", "security vulnerability")
- Score computation: for each signal dimension (keyword, file_scope, cross_cutting, risk, novelty), compute a 0-1 score, multiply by weight, sum all weighted scores
- File scope scoring: 0 files = 0.0, 1 file = 0.1, 2-3 = 0.3, 4-5 = 0.5, 6-10 = 0.7, 10+ = 1.0
- Cross-cutting scoring: 0 domains = 0.0, 1 = 0.2, 2 = 0.5, 3+ = 0.8, 5+ = 1.0
- Risk scoring: count risk indicator keywords in description, normalize to 0-1
- Keyword scoring: scan description against all dictionaries, highest matching level determines base score
- Route determination: score < 0.4 = "direct", score >= 0.4 = "phased"
- Add `if (import.meta.main)` CLI block: parse `--description`, `--file-count`, `--scope` (comma-separated), `--risk` (comma-separated), `--dependency-count` from args, call `classifyComplexity()`, output JSON to stdout
- Use `safeParse` for input validation

**Files to create:**

- `src/complexity/__helpers/classify.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `bun src/complexity/__helpers/classify.ts --description="fix a typo in README"` outputs JSON with complexity: "TRIVIAL"
- `bun src/complexity/__helpers/classify.ts --description="cross-cutting migration of auth system" --file-count=12 --scope="auth,api,database"` outputs COMPLEX or CRITICAL

### 3. Create routing history module

**Type:** auto
**TDD:** false
**Depends on:** 1

Create `src/complexity/__helpers/routing-history.ts` with functions to append and read routing history entries from `.planning/routing-history.jsonl`.

**Implementation details:**

- Export `appendRoutingEntry(entry: RoutingHistoryEntry): Promise<void>` -- appends JSON line to `.planning/routing-history.jsonl` using `Bun.file()` and `Bun.write()` (read existing, append, write back)
- Export `readRoutingHistory(options?: { tail?: number }): Promise<RoutingHistoryEntry[]>` -- reads JSONL file, parses each line with `safeParse`, returns valid entries. If `tail` specified, return only last N entries. Default returns all.
- Handle missing file gracefully (return empty array, create on first append)
- Use `Bun.file().exists()` for existence checks
- Parse each line independently so a single corrupt line does not break the entire history
- Import schema from `../__schemas/classify.schemas`

**Files to create:**

- `src/complexity/__helpers/routing-history.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Module exports both functions with correct types

### 4. Create adaptive adjustment module

**Type:** auto
**TDD:** false
**Depends on:** 1, 3

Create `src/complexity/__helpers/adaptive-adjust.ts` implementing the adaptive complexity adjustment per D6 and D10.

**Implementation details:**

- Export `adjustComplexity(options: { raw_complexity: ComplexityLevel, history: RoutingHistoryEntry[], override?: ComplexityLevel }): { adjusted: ComplexityLevel, reason: string }`
- If `override` is provided, return it immediately with reason "user override" (D10: `--complexity` always wins)
- If history has fewer than 3 entries, return `raw_complexity` unchanged with reason "insufficient history" (edge case from CONTEXT.md)
- Read last 20 entries (or all if fewer) from provided history
- Compute accuracy: count entries where `initial_complexity === final_complexity` and `succeeded === true`
- If > 60% of entries had `final_complexity` higher than `initial_complexity` (under-prediction), bump up 1 level (capped at CRITICAL)
- If > 60% of entries had `final_complexity` lower than `initial_complexity` (over-prediction), bump down 1 level (capped at TRIVIAL)
- Otherwise return raw_complexity unchanged
- Use `COMPLEXITY_ORDER` and `COMPLEXITY_LEVELS` from sibling schemas for level arithmetic
- Maximum adjustment: 1 level in either direction (D10)

**Files to create:**

- `src/complexity/__helpers/adaptive-adjust.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Override always returns the override value regardless of history
- Empty/short history returns raw complexity unchanged

### 5. Extend WorkflowContext schema with new fields

**Type:** auto
**TDD:** false
**Depends on:** none

Add `git_workflow`, `token_profile`, and `schema_version` to `workflowContextSchema` in `packages/luca-framework/src/state/types.ts` using `.extend()` is not applicable here since the schema is defined inline -- add the fields directly to the existing `z.object()` call.

**Fields to add (per D2):**

```typescript
// Git workflow (consolidates existing standalone fields)
git_workflow: z.object({
  ticket_id: z.string().optional(),
  github_issue: z.number().int().optional(),
  branch: z.string().optional(),
  base_branch: z.string().default("main"),
  pr_number: z.number().int().optional(),
}).optional(),

// Token profile for ceremony control
token_profile: z.enum(["budget", "balanced", "quality"]).default("balanced"),

// Schema version for forward compatibility
schema_version: z.number().int().default(1),
```

Add deprecation comments on the existing standalone `ticket_id`, `github_issue`, `branch`, `base_branch` fields:

```typescript
/** @deprecated Use git_workflow.ticket_id instead. Kept for backward compat until Phase 260+. */
```

Update `initializeContext()` to set `schema_version: 1` in the defaults.

**Files to edit:**

- `packages/luca-framework/src/state/types.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Existing state.json files parse without errors (all new fields are optional with defaults)
- `workflowContextSchema.parse({session_id: "test"})` succeeds and includes `token_profile: "balanced"` and `schema_version: 1`

---

### Wave 2: Bridge & STATE.md Elimination (depends on Wave 1, tasks 1-5)

### 6. Update bridge.ts -- remove snapshot, add pipeline_position to read-status

**Type:** auto
**TDD:** false
**Depends on:** 5

Modify `packages/luca-framework/src/state/bridge.ts` with the following changes:

**Remove:**

- `STATE_MD_PATH` constant (line ~69)
- `checkDualWriteDivergence()` function (lines ~99-163)
- `updateStateMd()` function (lines ~174-199)
- `"snapshot"` from `VALID_SUBCOMMANDS` array
- `"snapshot"` from `HELP_TEXT` string
- The `snapshot` case in the main subcommand switch (the `handleSnapshot` function or inline block)
- All calls to `updateStateMd(actor)` throughout the file (in handleSetField, handleTransition, handleEnsureInit)
- All calls to `checkDualWriteDivergence()` throughout the file
- Import of `generateSnapshot` from `./snapshot`
- Remove `LUCA_EXPORT_MD` env var gating throughout

**Add to `handleReadStatus()`:**

- Include `pipeline_position` in the output by calling `computePipelinePosition(stateValue)` (already imported)
- Include `token_profile` from context (new field from task 5)
- Include `schema_version` from context (new field from task 5)
- Include `git_workflow` from context (new field from task 5)

**Files to edit:**

- `packages/luca-framework/src/state/bridge.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `bun packages/luca-framework/src/state/bridge.ts read-status` includes `pipeline_position`, `token_profile`, `schema_version` fields
- `bun packages/luca-framework/src/state/bridge.ts snapshot` exits with error (unknown subcommand)
- No references to `STATE_MD_PATH`, `updateStateMd`, `checkDualWriteDivergence`, `LUCA_EXPORT_MD`, or `generateSnapshot` remain in bridge.ts

### 7. Delete snapshot.ts

**Type:** auto
**TDD:** false
**Depends on:** 6

Delete `packages/luca-framework/src/state/snapshot.ts` entirely. Before deletion, verify no other files import from it (bridge.ts import was removed in task 6).

**Steps:**

- Search for imports of `./snapshot` or `snapshot.ts` across `packages/luca-framework/src/state/`
- Remove any remaining import references
- Check `packages/luca-framework/src/state/index.ts` barrel -- remove any re-export of snapshot
- Delete the file

**Files to delete:**

- `packages/luca-framework/src/state/snapshot.ts`

**Files to potentially edit:**

- `packages/luca-framework/src/state/index.ts` (remove snapshot re-export if present)

**Verification:**

- `bunx --bun tsc --noEmit` passes (no dangling imports)
- `packages/luca-framework/src/state/snapshot.ts` no longer exists
- No file in the repo imports from `./snapshot` or references `generateSnapshot`

### 8. Remove STATE.md references from persistence.ts

**Type:** auto
**TDD:** false
**Depends on:** 6

Clean up `packages/luca-framework/src/state/persistence.ts`:

- Remove any STATE.md comments or references (found: line 5 mentions STATE.md gating)
- Update JSDoc to reflect that state.json is the sole state file
- No functional changes expected -- persistence.ts already writes to state.json only

**Files to edit:**

- `packages/luca-framework/src/state/persistence.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- No string "STATE.md" appears in persistence.ts

### 9. Migrate STATE.md consumers -- skills and hooks (batch 1: 15 skills)

**Type:** auto
**TDD:** false
**Depends on:** 6

Replace `grep STATE.md` / `cat STATE.md` patterns with `luca-bridge` read commands in skill files. These are shell script template strings embedded in TypeScript skill definitions.

**Pattern replacement mapping:**
| Old Pattern | New Pattern |
|---|---|
| `grep "Task Complexity:" .planning/STATE.md \| awk '{print $NF}'` | `luca-bridge read-complexity 2>/dev/null \| bun -e "..." \|\| echo "MODERATE"` |
| `grep "Current Phase:" .planning/STATE.md \| awk '{print $NF}'` | `luca-bridge read-phase 2>/dev/null \| bun -e "..." \|\| echo ""` |
| `cat .planning/STATE.md` | `luca-bridge read-status 2>/dev/null` |
| `grep "Oversight:" .planning/STATE.md \| awk '{print $NF}'` | `luca-bridge read-field --field=oversight 2>/dev/null \| bun -e "..." \|\| echo "milestone"` |

**Files to edit (skills batch):**

- `src/skills/general/phase-plan.skill.ts`
- `src/skills/general/phase-discuss.skill.ts`
- `src/skills/general/session-resume.skill.ts`
- `src/skills/general/quick.skill.ts`
- `src/skills/general/progress.skill.ts`
- `src/skills/general/debug.skill.ts`
- `src/skills/general/help.skill.ts`
- `src/skills/general/milestone-audit.skill.ts`
- `src/skills/general/milestone-new.skill.ts`
- `src/skills/general/project-new.skill.ts`
- `src/skills/general/context-restore.skill.ts`
- `src/skills/general/workflow-save.skill.ts`
- `src/skills/general/phase-remove.skill.ts`
- `src/skills/general/todo-add.skill.ts`
- `src/skills/general/choose.skill.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `grep -r "STATE\.md" src/skills/general/` returns zero matches for the edited files
- All replaced patterns use `luca-bridge` with `2>/dev/null` fallbacks

### 10. Migrate STATE.md consumers -- agents and hooks (batch 2: remaining files)

**Type:** auto
**TDD:** false
**Depends on:** 6

Replace STATE.md references in agent definitions, hook scripts, rule definitions, and remaining files.

**Files to edit (agents):**

- `src/agents/luca/lu-executor.agent.ts`
- `src/agents/luca/lu-premortem.agent.ts`
- `src/agents/luca/lu-planner.agent.ts`
- `src/agents/general/lu-cognition.agent.ts`
- `src/agents/general/lu-verifier.agent.ts`
- `src/agents/general/lu-roadmapper.agent.ts`
- `src/agents/general/lu-roadmap-prioritizer.agent.ts`
- `src/agents/general/lu-roadmap-architect.agent.ts`
- `src/agents/general/lu-executor-capable.agent.ts`

**Files to edit (hooks and helpers):**

- `src/hooks/scripts/pre-commit-gate.ts`
- `src/hooks/scripts/pre-compact-checkpoint.ts`
- `src/hooks/scripts/snapshot-sync.ts`
- `src/hooks/scripts/session-start.ts`
- `src/hooks/__helpers/git-context.ts`
- `src/hooks/__helpers/hook-registry.ts`

**Files to edit (rules, schemas, other):**

- `src/rules/general/state-machine-bridge.rule.ts` (update documentation text)
- `src/rules/general/complexity-gating.rule.ts` (update documentation text)
- `src/rules/general/planning-structure.rule.ts`
- `src/shared/__schemas/shadow-scanner.schemas.ts`
- `src/hooks/__schemas/hook.schemas.ts`
- `src/skills/__helpers/agent-prompts.ts`
- `src/skills/__helpers/multi-lens-gate.ts`
- `src/agents/__helpers/cold-isolation-block.ts`
- `src/context/__schemas/context.schemas.ts`
- `src/skills/general/shadow-cleanup.skill.ts`
- `src/skills/general/phase-execute.skill.ts`
- `src/skills/general/phase-research-review.skill.ts`
- `src/skills/general/phase-insert.skill.ts`
- `src/skills/general/phase-add.skill.ts`
- `src/skills/general/note.skill.ts`
- `src/skills/general/workflow-start.skill.ts`
- `src/skills/general/rule-complexity-gating.skill.ts`

**Approach for agent/rule files:** These contain prompt template strings that instruct agents to "read STATE.md". Replace with instructions to use `luca-bridge read-status` or `luca-bridge read-field`. For rule definition files, update the documentation/guidance text.

**Approach for hook scripts:** Replace `cat .planning/STATE.md` or `grep STATE.md` with bridge CLI invocations.

**Approach for schema files:** Remove STATE.md from any file lists, allowlists, or path references.

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `grep -r "STATE\.md" src/` returns zero matches (excluding this plan's references and any comments explaining the migration)

### 11. Delete STATE.md from the repo

**Type:** auto
**TDD:** false
**Depends on:** 9, 10

Delete `.planning/STATE.md` from the working tree. This is the final step after all consumers have been migrated.

**Files to delete:**

- `.planning/STATE.md`

**Verification:**

- `.planning/STATE.md` no longer exists
- `luca-bridge read-status` still works and returns valid JSON from state.json
- No file in `src/` references STATE.md in a functional capacity (documentation mentions are acceptable)

---

### Wave 3: Orchestrator Wiring (depends on Waves 1-2)

### 12. Wire classifier and routing history into lu.skill.ts

**Type:** checkpoint:human-verify
**TDD:** false
**Depends on:** 2, 3, 4, 9, 10

Update `src/skills/luca/lu.skill.ts` to replace the two classify `Agent()` calls with deterministic CLI invocations and wire routing history append.

**Changes:**

1. **Replace session-level classify (Step 1 in the skill):**
   - Remove: `Agent(name: "classify", subagent_type: "lu-cognition", ...)`
   - Add: `bun src/complexity/__helpers/classify.ts --description="$TASK_DESCRIPTION" --file-count=$FILE_COUNT --scope="$SCOPE"` invocation
   - Parse JSON output to extract `complexity` and `route`
   - If `--complexity` flag was provided by user, skip classifier entirely and use override (D10)
   - After classification, call adaptive adjustment: `bun src/complexity/__helpers/adaptive-adjust.ts --raw=$RAW_COMPLEXITY --override=$USER_OVERRIDE` (or inline the logic)

2. **Replace per-phase classify (Step 5c / Step 7c in the skill):**
   - Remove: `Agent(name: "classify-{NN}", subagent_type: "lu-cognition", ...)`
   - Add: same deterministic CLI invocation with phase-specific description

3. **Wire routing history append (Step 5q -- after phase completion):**
   - After each phase completes, append an entry to routing history via `bun src/complexity/__helpers/routing-history.ts --append --phase=$PHASE --initial=$INITIAL --final=$FINAL --succeeded=$SUCCESS --stalled=$STALLED --harness-fix=$HF_COUNT --verify-fix=$VF_COUNT --task-count=$TASKS --file-count=$FILES --keywords="$KW"`
   - Alternatively, add an `if (import.meta.main)` CLI block to routing-history.ts that handles `--append` with the above args

4. **Remove STATE.md reads/writes from lu.skill.ts** (any remaining after task 9/10)

**Files to edit:**

- `src/skills/luca/lu.skill.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- No `Agent("classify")` or `Agent("classify-{NN}")` calls remain in lu.skill.ts
- No STATE.md references remain in lu.skill.ts
- The skill invokes `bun src/complexity/__helpers/classify.ts` for complexity determination
- Routing history append is wired after phase completion

### 13. Update complexity domain barrel exports

**Type:** auto
**TDD:** false
**Depends on:** 1, 2, 3, 4

Update `src/complexity/index.ts` to re-export the new schemas and helpers from the classify module.

**Exports to add:**

- Re-export all schemas from `__schemas/classify.schemas`
- Re-export `classifyComplexity` from `__helpers/classify`
- Re-export `appendRoutingEntry`, `readRoutingHistory` from `__helpers/routing-history`
- Re-export `adjustComplexity` from `__helpers/adaptive-adjust`

**Files to edit:**

- `src/complexity/index.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Barrel file contains only re-export statements (no logic)

## Verification

1. **Type safety**: `bunx --bun tsc --noEmit` passes cleanly across the entire repo
2. **STATE.md elimination**: `grep -r "STATE\.md" src/` returns zero functional references (documentation-only mentions acceptable)
3. **Classifier works**: `bun src/complexity/__helpers/classify.ts --description="fix typo" --file-count=1` outputs `{"complexity":"TRIVIAL",...}`
4. **Bridge updated**: `bun packages/luca-framework/src/state/bridge.ts read-status` returns JSON with `pipeline_position`, `token_profile`, `schema_version`, `git_workflow` fields
5. **Snapshot removed**: `bun packages/luca-framework/src/state/bridge.ts snapshot` exits with error
6. **Schema backward compat**: Existing `.planning/state.json` parses without errors with the extended schema

## Success Criteria

- **SC-1**: STATE.md is deleted from the repo and zero files in `src/` read or write it
- **SC-2**: `luca-bridge read-status` returns a JSON object containing `pipeline_position`, `token_profile`, `schema_version`, and `git_workflow` fields
- **SC-3**: `bun src/complexity/__helpers/classify.ts` accepts `--description` and optional signal flags, returns `{ complexity, route, score, signals }` JSON without any LLM invocation
- **SC-4**: `lu.skill.ts` contains zero `Agent("classify")` or `Agent("classify-{NN}")` calls and uses the deterministic classifier instead
- **SC-5**: `bunx --bun tsc --noEmit` passes cleanly with all changes applied

## Output Specification

**Files created (4):**

- `src/complexity/__schemas/classify.schemas.ts`
- `src/complexity/__helpers/classify.ts`
- `src/complexity/__helpers/routing-history.ts`
- `src/complexity/__helpers/adaptive-adjust.ts`

**Files deleted (2):**

- `packages/luca-framework/src/state/snapshot.ts`
- `.planning/STATE.md`

**Files modified (~55):**

- `packages/luca-framework/src/state/types.ts` (schema extension)
- `packages/luca-framework/src/state/bridge.ts` (snapshot removal, read-status update)
- `packages/luca-framework/src/state/persistence.ts` (comment cleanup)
- `src/complexity/index.ts` (barrel update)
- `src/skills/luca/lu.skill.ts` (classifier wiring)
- ~48 files across `src/skills/`, `src/agents/`, `src/hooks/`, `src/rules/`, `src/shared/`, `src/context/` (STATE.md consumer migration)
