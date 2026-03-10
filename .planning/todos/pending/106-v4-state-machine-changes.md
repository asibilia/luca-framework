---
title: "v4: State machine context extensions"
area: workflow
created: 2026-03-10
source: docs/brainstorm/3.final-workflow.md
priority: P0
complexity: MODERATE
milestone: v4.0.0
---

## Context

The v4 workflow adds new fields to WorkflowContext and a new optional state. These are cross-cutting changes that other v4 components depend on. No new top-level pipeline states — pre-mortem runs inside `discussing`, process data runs inside `learning`, appetite guard runs inside `wave_evaluating`.

Spec: `docs/brainstorm/3.final-workflow.md` (State Machine Changes)

## Task

### 1. WorkflowContext Extensions

Add to `packages/luca-framework/src/state/`:

| Field                    | Type   | Details                             |
| ------------------------ | ------ | ----------------------------------- |
| `appetite_level`         | Enum   | Micro / Small / Medium / Large / XL |
| `appetite_budget_tokens` | number | Weighted token budget ceiling       |
| `appetite_used_tokens`   | number | Running token consumption           |

### 2. Guard Additions

- Appetite guard in `wave_evaluating` state — checks budget at wave boundaries
- Pre-mortem invocation point in `discussing` state
- Process data invocation point in `learning` state (after lu-learner)

### 3. New State

- `cooldown` state (advisory, skippable): `complete` → `cooldown` → `idle`
- Used by divergent mode nudge (#105)

### 4. Bridge CLI Updates

Update `packages/luca-framework/src/state/bridge.ts`:

- `read-status` includes appetite fields
- `set-field` allowlist includes appetite fields
- `gate-check --gate=premortem` for pre-mortem auto-skip
- STATE.md snapshot includes Appetite section

### 5. Schema Updates

Update state machine Zod schemas to include new fields and validate appetite constraints.

## Notes

- This is foundational infrastructure — #99 (appetite), #100 (pre-mortem), #101 (process data), #105 (divergent) all depend on these changes
- Should be implemented first or alongside #99
- Preserves pipeline simplicity: no new top-level states for core workflow
