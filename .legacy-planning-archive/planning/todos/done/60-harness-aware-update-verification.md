---
title: Verify harness-aware update command template collection
area: dx
created: 2026-03-05
source: v2.8.0 done-todo audit (partial: 10-harness-aware-update-command)
---

## Context

Todo `10-harness-aware-update-command` was marked done but the harness-specific template collection logic could not be fully confirmed during audit.

## Partial Completion

The following WAS implemented:

- `packages/luca-framework/src/commands/update.ts` exists with template handling
- Update command handles conflict detection and safe updates

## Gaps

The following could not be verified:

- `collectTemplateFiles()` function for harness-specific template gathering — may exist under a different name or be inlined
- Source markers in templates that enable selective update — unclear if implemented or deferred

## Task

1. Read `update.ts` and confirm whether harness-specific template collection exists (possibly under a different function name)
2. If implemented: close this todo
3. If missing: determine if it's still needed given current update workflow
4. Document findings either way

## Notes

Low priority — the update command works for its current use case. This is a verification gap, not necessarily a functionality gap.
