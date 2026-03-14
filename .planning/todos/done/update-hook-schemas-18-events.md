---
title: Update hook schemas to support PreCompact and other new Claude Code events
area: hooks
created: 2026-03-13
source: conversation
priority: high
complexity: SIMPLE
---

## Context

Luca's hook schemas (`src/hooks/__schemas/hook.schemas.ts`) define only 5 events (PostToolUse, PreToolUse, Stop, SessionStart, SessionEnd). Claude Code actually supports 18 hook events. The schemas must be updated before implementing PreCompact checkpoint hooks.

## Why

The PreCompact hook is the foundation of the entire memory system checkpoint-and-restore architecture (Decision 1 in `docs/memory-system/decisions.md`). Without updating the schema, new hooks won't have type safety or discoverability.

## Task

- Update `src/hooks/__schemas/hook.schemas.ts` to add at minimum: `PreCompact`, `UserPromptSubmit`, `SubagentStop`, `SubagentStart`, `Notification`, `PostToolUseFailure`, `InstructionsLoaded`, `PermissionRequest`, `TeammateIdle`, `TaskCompleted`, `ConfigChange`, `WorktreeCreate`, `WorktreeRemove`
- Update any hook registry or config generation that depends on the event enum
- Verify `.claude/settings.json` registration works with the new events
- Run `bunx --bun tsc --noEmit` to confirm type safety

## Acceptance Criteria

- Hook schema defines all 18 Claude Code events
- Existing hooks continue to work unchanged
- Type-safe registration of PreCompact hooks is possible

## References

- `docs/memory-system/decisions.md` — Infrastructure Note section
- [Claude Code hooks reference](https://code.claude.com/docs/en/hooks) — 18 event types
- `src/hooks/__schemas/hook.schemas.ts` — current schema

## Notes

This is a prerequisite for the PreCompact checkpoint hook (the next todo). Must be completed first.
