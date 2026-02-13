---
title: Address v1.3.0 audit tech debt findings
area: build
created: 2026-02-12
source: conversation
---

## Context

The v1.3.0 milestone audit (`.planning/milestones/v1.3.0-AUDIT.md`) completed with PASSED verdict but identified 2 CRITICAL, 12 HIGH, 18 MEDIUM, and 18 LOW findings. All are tech debt — none blocked the v1.3.0 release. These should be addressed in v1.4.0 planning.

## Task

Address audit findings in priority order:

1. **Extract `generateAllOutputs()` to build-shared.ts** — Eliminates triple duplication across build-all.ts, check-drift.ts, and check-drift.test.ts (H-02, H-03, H-04)
2. **Fix duplicate `GenericruledescripRule` class names** — CRIT-01: Rename to `FileNamingRule` and `LodashPreferenceRule` in auto-generated rule classes
3. **Remove duplicate `lu-workflow.rule.ts`** — CRIT-02: Two competing files at `src/rules/` and `src/rules/general/` with divergent content
4. **Extract shared `compileAgent` logic** — H-01: PluginCompiler.compileAgent() is verbatim copy of ClaudeCompiler.compileAgent()
5. **Quote shell variables in hook scripts** — MEDIUM security: Unquoted variable expansion in post-edit-format.sh, post-edit-typecheck.sh, session-start.sh
6. **Migrate build-utils.ts to Bun APIs** — H-05: Uses node:fs instead of Bun.file per project conventions
7. **Refactor BaseCompiler class hierarchy** — H-06: Violates no-classes rule, convert to factory-function pattern

## Notes

- Items 2 and 3 are quick fixes (CRITICAL severity but low effort)
- Item 1 is the highest-impact change (eliminates most duplication)
- Item 7 is lowest urgency (foundational v1.0 architecture, stable)
- Full findings detail in `.planning/milestones/v1.3.0-AUDIT.md`
