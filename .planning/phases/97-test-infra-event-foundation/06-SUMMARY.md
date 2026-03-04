# 97-06 Summary: Developer Notes Queue

## Status: IN PROGRESS

## Description

Implements a "soft interrupt" mechanism for developer notes — file-per-note in `.planning/notes/`, automatic injection into agent context via hooks, and full observer dashboard integration.

## Files Created

| File | Purpose |
|------|---------|
| `src/skills/general/note.skill.ts` | `/note` skill for adding developer notes |
| `packages/luca-observer/src/app/api/notes/route.ts` | GET/POST API for notes |
| `packages/luca-observer/src/app/notes/page.tsx` | Observer notes dashboard page |

## Files Modified

| File | Change |
|------|--------|
| `src/hooks/scripts/session-start.sh` | Add `notes/done/` dir init + pending announcement |
| `src/hooks/scripts/context-check-throttled.sh` | Add urgent note scanning + injection |
| `src/hooks/scripts/pre-commit-gate.sh` | Add advisory pending notes check |
| `packages/luca-observer/src/lib/constants.ts` | Add `note.added` / `note.consumed` event types + Notes nav item |

## Verification

- [ ] `bun run build:all` succeeds
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `bun test` passes
