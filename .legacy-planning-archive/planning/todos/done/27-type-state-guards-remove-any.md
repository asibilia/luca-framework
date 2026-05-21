---
title: "Type state/guards.ts — Replace 23+ `any` Usages in State Domain"
area: state
created: 2026-03-01
source: repo-audit
tier: 0
complexity: MODERATE
---

## Context

Repo audit found 23+ `any` type occurrences concentrated in the `state/` domain, violating the project's "no `any` type" coding standard. The worst offender is `state/guards.ts` with 17 occurrences using `context: any` and `event: any` throughout.

## Task

Replace `any` types with proper XState context and event types:

- `src/state/guards.ts` — 17 occurrences (context: any, event: any on all guard functions)
- `src/state/bridge.ts` — 3 occurrences
- `src/state/persistence.ts` — 2 occurrences
- `src/state/machine.ts` — 1 occurrence

Define or import proper `MachineContext` and `MachineEvent` types from the state machine definition and thread them through all guard/actor signatures.

## Notes

- guards.ts is the critical file — all guards use untyped context/event
- The XState machine likely already has context/event types defined; this is about propagating them
- Also audit `as any` casts in bridge.ts and persistence.ts
