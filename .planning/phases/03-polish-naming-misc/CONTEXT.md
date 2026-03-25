# Phase 3 Context: Polish + Naming + Misc

## Phase Objective

Fix remaining 11 audit findings (#11, #12, #16-24): convergence loop DRY, SDK type guards, barrel header, Adapter naming, rule-emitter extraction, registry double-loop, reporter DRY, barrel comment, eval import path, .ts extensions, unreachable events.

## Fixes

1. #11: Extract shared convergence state machine section for phase-\*-review skills
2. #12: Extract shared SDK type guard predicate in api-executor.ts
3. #16: Remove duplicate section header in workflow/index.ts
4. #17: Rename workflow Adapter to WorkflowAdapter in workflow.schemas.ts
5. #18: Extract emitRuleMarkdown to rule-emitter.ts in adapters/claude/
6. #19: Remove redundant detectAdapter second loop in adapter-registry.ts
7. #20: Extract shared loadReportFile helper in eval-reporter.ts
8. #21: Add side-effect import comment to adapters barrel (index.ts)
9. #22: Fix lu-verifier.eval.ts to use barrel import instead of direct \_\_helpers/ path
10. #23: Remove .ts extensions from workflow domain imports
11. #24: Remove unreachable event types from CANONICAL_EVENTS in hook.schemas.ts
