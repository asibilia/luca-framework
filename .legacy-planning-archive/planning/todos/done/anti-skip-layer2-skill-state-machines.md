---
title: "Layer 2: Per-skill state machine definitions + bridge extension"
area: workflow
created: 2026-03-28
source: conversation
---

## Context

"Make illegal states unrepresentable" (Yaron Minsky). If no transition exists from FETCHED to FIXED, the LLM cannot skip validation — period. State machines catch both within-skill AND between-skill step-skipping. Production-validated at Stripe, Netflix, Uber, AWS Step Functions.

## Task

### Part A: State Machine Schema

Create `src/skills/__schemas/skill-states.ts`:

```typescript
export const SkillStateDefinitionSchema = z.object({
  skill: z.string(),
  initial: z.string(),
  transitions: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      event: z.string(),
      guard: z.string().optional(),
      evidence_required: z.boolean().default(true),
    }),
  ),
});
```

### Part B: Per-Skill State Definitions

Create state definitions for the 5 priority skills:

```
src/skills/__schemas/states/
  pr-address.states.ts       (11 states: IDLE -> FETCHED -> ... -> PUSHED)
  phase-execute.states.ts    (extend existing bridge transitions)
  milestone-complete.states.ts
  verify.states.ts
  debug.states.ts
```

### Part C: Lightweight State Machine Runtime (~50 lines)

Implement `createSkillStateMachine<S>()` factory function:

- Transition map lookup: `${from}:${event}` -> target state
- Guard evaluation
- Reject illegal transitions with clear error

### Part D: Bridge Extension

New subcommand: `luca-bridge skill-state --skill=NAME --event=EVENT --data=JSON`

- Validates transition against registered state machine
- Rejects illegal transitions
- Persists state to `.planning/skill-state/{skill-name}.json`
- `--explain` mode for debugging (shows current state + available transitions)

## Notes

- Research: `docs/research/anti-step-skipping/03-state-machine-case.md`
- Critical: state machine is a _gatekeeper_, not an _advisor_ — if prerequisites aren't met, the bridge returns an error
- Luca already has `luca-bridge` with 13 subcommands — this adds 1 more
- The existing `WorkflowDAGSchema` and step contracts in `src/workflow/` provide the foundation
- Estimated effort: 3-5 days
