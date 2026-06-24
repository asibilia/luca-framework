# Phase 3 Summary: Polish + Naming + Misc

**Status:** COMPLETE
**Commits:** 7
**Files changed:** 16 (14 modified, 2 created)

## What Was Done

### Batch A -- Quick one-line fixes (#16, #21, #22, #23)

**Commit:** `5abc65a1`

- **#16:** Removed duplicate ASCII-dash section header in `src/workflow/index.ts` that preceded the Unicode-box header for Step Contracts
- **#21:** Added JSDoc comment to `src/adapters/index.ts` barrel documenting the side-effect import requirement for `register-builtins.ts`
- **#22:** Updated eval test case code_diff string to use `"~/shared"` barrel import instead of `"~/shared/__helpers/cli-utils"` direct path
- **#23:** Removed `.ts` extensions from all imports in `dag-builder.ts`, `phase-pipeline.ts`, `dag-executor.ts`, and `workflow/index.ts` barrel

### Batch B -- SDK type guard + adapter registry (#12, #19)

**Commit:** `a21554f2`

- **#12:** Extracted shared `isSdkMessage(m, type, subtype?)` predicate in `api-executor.ts`. All 3 type guards (`isSystemInitMessage`, `isResultSuccess`, `isResultError`) now delegate to this shared predicate, eliminating the repeated `typeof === "object" && !== null && "type" in message` prelude
- **#19:** Removed the redundant second `for` loop in `detectAdapter` that duplicated the `detect()` logic with an `existsSync` fallback. Each adapter's `detect()` already checks directory existence. Also removed unused `node:fs` and `node:path` imports

### Batch C -- Eval reporter DRY (#20)

**Commit:** `5c66b51b`

- **#20:** Extracted `loadReportFile(filePath)` private helper in `eval-reporter.ts`. Both `loadLatestReport` and `loadReport` now delegate to this shared implementation

### Batch D -- Rule emitter extraction (#18)

**Commit:** `f3a1cf70`

- **#18:** Extracted `emitRuleMarkdown` from `claude-adapter.ts` to new `src/adapters/claude/rule-emitter.ts`. Updated `claude-adapter.ts` to import from the new module. Added re-export to `src/adapters/claude/index.ts` barrel

### Batch E -- Adapter naming collision (#17)

**Commit:** `a2a14d63`

- **#17:** Renamed `Adapter` to `WorkflowAdapter` and `AdapterSchema` to `WorkflowAdapterSchema` in the workflow domain. Updated all references in:
  - `workflow.schemas.ts` (definition + JSDoc)
  - `workflow/index.ts` (barrel exports)
  - `dag-executor.ts` (3 parameter type annotations)
  - `adapter-executor-bridge.ts` (import alias removed, now direct import)
  - `module-boundary.rule.ts` (documentation example updated)

### Batch F -- Convergence DRY (#11)

**Commit:** `0b85a2b2`

- **#11:** Created `src/skills/__helpers/convergence-loop-shared.ts` with `CONVERGENCE_BLOCKING_TRANSITIONS` string constant containing the 4-branch IMPROVING/STALLED/DIVERGING/REVIEWING transitions. Both `phase-research-review.skill.ts` and `phase-plan-review.skill.ts` import and embed this constant via template literal interpolation. Each skill retains its own approval conditions and severity labels

### Batch G -- Hook schema cleanup (#24)

**Commit:** `cc6fc08b`

- **#24:** Instead of removing events (which would break `Record<CanonicalEvent, string>` in `CLAUDE_EVENT_MAP`), documented the split between active events (with hooks) and forward-compatibility entries (valid Claude Code events reserved for future hooks) via inline comments and expanded JSDoc

## Deviations

1. **#23 scope expansion:** The task specified only `dag-builder.ts`, `phase-pipeline.ts`, and `dag-executor.ts`, but `workflow/index.ts` also had `.ts` extensions in all its re-exports. Fixed those too since they are in the same domain and the barrel is the primary entry point. [Rule 2 - Missing Critical]

2. **#24 conservative approach:** Instead of removing unreachable events, documented them. Removal would have broken the `Record<CanonicalEvent, string>` type constraint in `platform-adapters.ts` and eliminated valid Claude Code event support needed for future hooks. [Rule 4 decision: chose documentation over deletion]

## Files Created

- `src/adapters/claude/rule-emitter.ts` -- Rule-to-markdown emitter (extracted from claude-adapter.ts)
- `src/skills/__helpers/convergence-loop-shared.ts` -- Shared convergence state machine transitions

## Files Modified

- `src/workflow/index.ts` -- Removed duplicate header, .ts extensions, renamed export
- `src/workflow/__schemas/workflow.schemas.ts` -- Renamed Adapter to WorkflowAdapter
- `src/workflow/__helpers/dag-builder.ts` -- Removed .ts extensions
- `src/workflow/__helpers/dag-executor.ts` -- Removed .ts extensions, updated type references
- `src/workflow/__helpers/phase-pipeline.ts` -- Removed .ts extensions
- `src/adapters/index.ts` -- Added side-effect import JSDoc
- `src/adapters/api/api-executor.ts` -- Extracted isSdkMessage predicate
- `src/adapters/__helpers/adapter-registry.ts` -- Removed redundant loop + unused imports
- `src/adapters/__helpers/adapter-executor-bridge.ts` -- Updated import to WorkflowAdapter
- `src/adapters/claude/claude-adapter.ts` -- Moved emitRuleMarkdown to rule-emitter.ts
- `src/adapters/claude/index.ts` -- Added emitRuleMarkdown re-export
- `src/eval/__helpers/eval-reporter.ts` -- Extracted loadReportFile helper
- `src/eval/suites/lu-verifier.eval.ts` -- Fixed barrel import in code_diff string
- `src/skills/general/phase-research-review.skill.ts` -- Embedded shared convergence constant
- `src/skills/general/phase-plan-review.skill.ts` -- Embedded shared convergence constant
- `src/hooks/__schemas/hook.schemas.ts` -- Documented active vs forward-compat events
- `src/rules/general/module-boundary.rule.ts` -- Updated documentation example
