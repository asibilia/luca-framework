---
phase: 3
plan: 1
type: implementation
autonomous: true
---

# Phase 3: Polish + Naming + Misc

## Objective

Fix 11 remaining audit findings from the v6.0.0 milestone audit: convergence loop DRY, SDK type guards, barrel header, Adapter naming collision, rule-emitter extraction, registry double-loop, reporter DRY, barrel comment, eval import path, .ts extensions, unreachable events.

## Tasks

### Batch A -- Quick one-line fixes (#16, #21, #22, #23)

1. Remove duplicate section header (ASCII-dash + Unicode-box) in `src/workflow/index.ts`
2. Add side-effect import JSDoc comment to `src/adapters/index.ts`
3. Fix eval test case code_diff to use barrel import instead of `__helpers/` path
4. Remove `.ts` extensions from imports in workflow domain files

### Batch B -- SDK type guard + adapter registry (#12, #19)

5. Extract shared `isSdkMessage(m, type, subtype?)` predicate in `api-executor.ts`
6. Remove redundant second `for` loop in `detectAdapter`

### Batch C -- Eval reporter DRY (#20)

7. Extract `loadReportFile(filePath)` private helper in `eval-reporter.ts`

### Batch D -- Rule emitter extraction (#18)

8. Extract `emitRuleMarkdown` to `rule-emitter.ts` in `adapters/claude/`

### Batch E -- Adapter naming collision (#17)

9. Rename `Adapter` to `WorkflowAdapter` and `AdapterSchema` to `WorkflowAdapterSchema` in workflow domain

### Batch F -- Convergence DRY (#11)

10. Create `convergence-loop-shared.ts` with shared blocking-gap transition constant

### Batch G -- Hook schema cleanup (#24)

11. Document active vs forward-compatibility events in `CANONICAL_EVENTS`

## Verification

- [ ] `bunx --bun tsc --noEmit` passes after every batch
- [ ] All 11 audit items addressed
- [ ] No regressions in existing functionality
- [ ] New files follow kebab-case naming convention

## Success Criteria

- All 11 findings from Phase 3 of the gap closure plan resolved
- Type checking passes clean
- Each batch committed atomically with descriptive message
