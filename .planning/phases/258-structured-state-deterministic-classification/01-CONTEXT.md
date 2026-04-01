# Phase 258 — Structured State & Deterministic Classification

## Summary

Phase 258 delivers two foundational capabilities for the v9.0.0 pipeline redesign:

1. **Structured state consolidation** (FOUND-01 through FOUND-05): Extend `WorkflowContext` with `pipeline_position`, `git_workflow`, `token_profile`, and `schema_version` fields. Eliminate STATE.md entirely -- remove all generation code, all reads/greps across 48+ skills/agents, delete the file, and remove the `snapshot` bridge command. Migrate pipeline tracking from `/tmp/lu-context.json` to `state.json`. Make `luca-bridge read-status` the sole human-readable inspection interface.

2. **Deterministic classification** (CLASS-01 through CLASS-05): Create a zero-LLM heuristic classifier (`src/complexity/__helpers/classify.ts`) that scores task complexity from input signals and returns `{ complexity, route, score, signals }`. Provide a CLI entry point. Eliminate both classify `Agent()` calls from `lu.skill.ts`. Add routing history (`routing-history.jsonl`) with adaptive adjustment (20-entry window, 1-level cap, `--complexity` override always wins).

---

## Key Technical Decisions

### D1: XState state value as pipeline position source of truth

`pipeline_position` will NOT be stored as a new field in `workflowContextSchema`. The existing `computePipelinePosition()` in `packages/luca-framework/src/state/__helpers/pipeline-position.ts` already derives it from the XState state value. The bridge's `read-field --field=pipeline_position` already handles this as a virtual computed field (bridge.ts line 434-435). Decision: keep derivation, add `pipeline_position` to the `read-status` JSON output by calling `computePipelinePosition()` at read time.

### D2: New context fields use Zod schema extension

Add `git_workflow`, `token_profile`, and `schema_version` to `workflowContextSchema` using `.extend()` pattern (Zod 4 convention, `.merge()` is deprecated). All new fields are optional with defaults so existing state.json files parse without errors.

```typescript
// New fields in workflowContextSchema
git_workflow: z.object({
  ticket_id: z.string().optional(),
  github_issue: z.number().int().optional(),
  branch: z.string().optional(),
  base_branch: z.string().default("main"),
  pr_number: z.number().int().optional(),
}).optional(),
token_profile: z.enum(["budget", "balanced", "quality"]).default("balanced"),
schema_version: z.number().int().default(1),
```

Note: `ticket_id`, `github_issue`, `branch`, `base_branch` already exist as top-level fields. The `git_workflow` object consolidates them. The migration strategy: add the new `git_workflow` object, keep old fields temporarily with deprecation comments, and let Phase 260+ handle cleanup.

### D3: STATE.md elimination strategy

Per binding decision D9: STATE.md is eliminated entirely. The approach:

1. Remove `generateSnapshot()` and `snapshot.ts` from `packages/luca-framework/src/state/`
2. Remove `updateStateMd()` function from `bridge.ts`
3. Remove `snapshot` subcommand from bridge CLI
4. Remove `LUCA_EXPORT_MD` gating (no longer needed)
5. Update `read-status` to return a formatted JSON summary as the sole inspection interface
6. Grep all 48 files in `src/` that reference STATE.md and update each to use bridge reads
7. Delete `.planning/STATE.md` from the repo

### D4: Classifier architecture -- weighted sum with keyword dictionaries

The deterministic classifier uses a weighted-sum scoring approach (validated by research doc 04). No NLP library dependencies -- pure TypeScript with keyword dictionaries.

**Input signals:**

- Task description keywords (weighted against complexity dictionaries)
- File count estimate (from ROADMAP.md phase data)
- Cross-cutting scope (package/domain references)
- Risk indicators ("breaking change", "migration", "refactor")
- Dependency count (from ROADMAP.md)

**Weights:** keyword 0.2, file_scope 0.3, cross_cutting 0.2, risk 0.15, novelty 0.15

**Thresholds:** TRIVIAL < 0.2, SIMPLE < 0.4, MODERATE < 0.6, COMPLEX < 0.8, CRITICAL >= 0.8

### D5: Routing history append-only JSONL

Schema for `.planning/routing-history.jsonl`:

```typescript
const RoutingHistoryEntrySchema = z.object({
  timestamp: z.string(),
  phase: z.number().int(),
  initial_complexity: complexityLevelSchema,
  final_complexity: complexityLevelSchema,
  succeeded: z.boolean(),
  stalled: z.boolean(),
  iteration_counts: z.object({
    harness_fix: z.number().int().nonnegative(),
    verify_fix: z.number().int().nonnegative(),
  }),
  task_count: z.number().int().nonnegative(),
  file_count: z.number().int().nonnegative(),
  keywords: z.array(z.string()),
});
```

### D6: Adaptive adjustment reads last 20 entries max

The adjustment function computes a `predicted_vs_actual` ratio from the routing history window. If actual complexity consistently exceeds prediction, next classification is bumped up 1 level. If consistently below, bumped down 1 level. `--complexity` user override always takes precedence (D10).

---

## Files to Create

| File                                           | Description                                                                                                                                                                       |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/complexity/__helpers/classify.ts`         | Deterministic heuristic classifier. Exports `classifyComplexity()` returning `{ complexity, route, score, signals }`. Includes CLI entry point via `if (import.meta.main)` block. |
| `src/complexity/__schemas/classify.schemas.ts` | Zod schemas for classifier input, output, keyword dictionaries, and routing history entries.                                                                                      |
| `src/complexity/__helpers/routing-history.ts`  | Functions to append entries to `.planning/routing-history.jsonl` and read the last N entries for adaptive adjustment.                                                             |
| `src/complexity/__helpers/adaptive-adjust.ts`  | Reads routing history (20-entry window or current milestone), computes adjustment, returns complexity adjusted by at most 1 level.                                                |

## Files to Modify

| File                                               | Changes                                                                                                                                                                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/luca-framework/src/state/types.ts`       | Add `git_workflow`, `token_profile`, `schema_version` to `workflowContextSchema`. Deprecate standalone `ticket_id`, `github_issue`, `branch`, `base_branch` fields (keep for backward compat).                                       |
| `packages/luca-framework/src/state/bridge.ts`      | Remove `snapshot` subcommand. Remove `updateStateMd()` function. Remove `STATE_MD_PATH` constant. Remove dual-write divergence check. Update `read-status` to include `pipeline_position` in output. Remove `LUCA_EXPORT_MD` gating. |
| `packages/luca-framework/src/state/snapshot.ts`    | Delete file entirely (STATE.md generation).                                                                                                                                                                                          |
| `packages/luca-framework/src/state/persistence.ts` | Remove any STATE.md references.                                                                                                                                                                                                      |
| `src/skills/luca/lu.skill.ts`                      | Remove both `Agent("classify")` and `Agent("classify-{NN}")` calls. Replace with `bun src/complexity/__helpers/classify.ts --description=... --roadmap=...` invocation. Remove STATE.md reads/writes.                                |
| `src/complexity/__helpers/model-routing.ts`        | No structural changes -- but the classifier will import `ComplexityLevel` from sibling schemas.                                                                                                                                      |
| 48 files in `src/` referencing STATE.md            | Replace `grep STATE.md` / `cat STATE.md` patterns with `luca-bridge read-status` / `luca-bridge read-field` / `luca-bridge read-complexity` calls.                                                                                   |

## Files to Delete

| File                                            | Reason                                       |
| ----------------------------------------------- | -------------------------------------------- |
| `packages/luca-framework/src/state/snapshot.ts` | STATE.md generation no longer needed (D9).   |
| `.planning/STATE.md`                            | Eliminated entirely per binding decision D9. |

---

## Dependencies and Ordering

### Wave 1: Schema & Classifier (no external dependencies)

1. **Create classify schemas** (`src/complexity/__schemas/classify.schemas.ts`) -- keyword dictionaries, input/output types, routing history schema
2. **Create classifier** (`src/complexity/__helpers/classify.ts`) -- weighted sum scorer with CLI entry point
3. **Create routing history** (`src/complexity/__helpers/routing-history.ts`) -- append/read JSONL
4. **Create adaptive adjustment** (`src/complexity/__helpers/adaptive-adjust.ts`) -- 20-entry window, 1-level cap
5. **Extend WorkflowContext** (`packages/luca-framework/src/state/types.ts`) -- add `git_workflow`, `token_profile`, `schema_version`

### Wave 2: Bridge & STATE.md elimination (depends on Wave 1)

6. **Update bridge.ts** -- remove snapshot command, remove `updateStateMd()`, remove dual-write, update `read-status` output
7. **Delete snapshot.ts** -- STATE.md generation code removed
8. **Update persistence.ts** -- remove STATE.md references
9. **Migrate 48 STATE.md consumers** -- replace grep/cat STATE.md with bridge read commands across all skills/agents/hooks

### Wave 3: Orchestrator wiring (depends on Waves 1-2)

10. **Update lu.skill.ts** -- replace `Agent("classify")` calls with deterministic CLI, remove STATE.md reads, wire routing history append after phase completion

---

## Risks and Edge Cases

### Risk 1: STATE.md removal blast radius (HIGH)

48 files reference STATE.md. Each needs individual attention -- some read complexity, some read phase, some read the full state. Mitigation: categorize all 48 into groups by what they read, create a mapping table of old pattern -> new bridge command, then batch-update.

### Risk 2: Backward compatibility of state.json (MEDIUM)

Existing `state.json` files won't have the new fields. Mitigation: all new fields have Zod defaults, so `safeParse()` on old files succeeds. `schema_version` defaults to 1. Future migrations can key off this version.

### Risk 3: Classifier accuracy (LOW)

The heuristic classifier may misclassify edge cases. Mitigation: `--complexity` override always wins, adaptive adjustment self-corrects over time, and the routing history provides visibility into prediction accuracy. The existing `self-tuning.ts` already tracks prediction vs actual.

### Risk 4: Snapshot.ts import graph (MEDIUM)

`snapshot.ts` is imported by `bridge.ts` and possibly other state modules. Mitigation: check import graph before deletion, remove all imports first, then delete the file.

### Risk 5: lu.skill.ts size (MEDIUM)

`lu.skill.ts` is the main orchestrator and is already large. The classify replacement is a net simplification (removes Agent() calls, adds a simpler `bun` invocation). But touching this file carries inherent risk. Mitigation: keep changes surgical -- only replace classify calls and remove STATE.md patterns.

### Edge Case: Empty routing history

First run has no routing history. Adaptive adjustment should return the raw classifier output unchanged when history has < 3 entries (insufficient data for trend).

### Edge Case: Concurrent bridge reads during migration

During the transition period, some consumers may still attempt STATE.md reads. Since STATE.md will be deleted, these will fail gracefully (they already use `|| echo ""` fallbacks). The bridge reads will succeed.
