---
title: "Fix deepFreeze crash on Zod v4 lazy getters breaking pre-step hooks"
area: hooks
created: 2026-03-30
source: conversation
---

## Context

Every PreToolUse hook matching `Agent` (6 hooks) crashes on startup with:
```
TypeError: Attempting to change access mechanism for an unconfigurable property.
```

This causes 10+ "PreToolUse:Agent hook error" messages whenever a subagent (e.g., Explore) is spawned.

## Task

Fix `src/shared/__helpers/deep-freeze.ts` to enumerate values **before** freezing the object, so Zod v4's lazy getter-redefine pattern on `shape` can complete while the object is still mutable.

**Root cause:** `deepFreeze()` calls `Object.freeze(obj)` before `Object.values(obj)`. Zod v4 schemas use a lazy getter that calls `Object.defineProperty()` on first access — but the object is already frozen.

**Crash path:** `enforcement-hook-factory.ts` imports `HookContextSchema` from `../../workflow` which triggers module-level `deepFreeze()` in `phase-pipeline.ts:144`, `contract-definitions.ts:209`, and `dag-builder.ts:225`.

**Fix:** Move `Object.values(obj)` before `Object.freeze(obj)` in `deepFreeze()`. Verified with isolated Bun test that enumerate-then-freeze works while freeze-then-enumerate throws.

## Verification

1. `echo '{"tool_name":"Agent","tool_input":{"subagent_type":"Explore"}}' | bun src/hooks/scripts/pre-step-lu.ts` — should exit 0, no TypeError
2. `bunx --bun tsc --noEmit` — type-check passes
3. Spawn an Explore agent — no more "PreToolUse:Agent hook error" messages

## Notes

- Plan file with full details: `.claude/plans/async-napping-llama.md`
- Single file change, ~3-line diff
- Affects all consumers of `deepFreeze`: `dag-builder.ts`, `contract-definitions.ts`, `skill-state-machine.ts`
