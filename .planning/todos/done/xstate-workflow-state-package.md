---
title: XState-based workflow state package — npm package for callable state machine functions
area: architecture
created: 2026-02-13
source: conversation
---

## Context

After implementing the autopilot orchestrator skill, discussion about how workflow state is managed. Currently state lives in markdown files (STATE.md, WORKING.md, ROADMAP.md) with the LLM handling all reads and writes. This is token-expensive and non-deterministic. The framework needs a proper state machine backing its workflow transitions.

## Task

Design and publish an accompanying npm package that provides:

1. **XState state machine** modeling the full Luca workflow lifecycle (idle → cognitive-preflight → routing → discuss → plan → execute → verify → learn → commit → complete)
2. **Callable functions** that skills.md files can invoke (via Bash/MCP tool calls) to get/set workflow state deterministically
3. **State persistence** — serialize/deserialize machine state to/from disk so sessions can resume
4. **Transition guards** — encode complexity gating, oversight levels, and gate config as XState guards rather than LLM reasoning
5. **Event-driven architecture** — workflow transitions emit events that hooks/skills can subscribe to

### Key Design Considerations

- **Package boundary**: This is a standalone npm package (`@alecsibilia/luca-state` or similar) that the framework depends on, not embedded in the framework source
- **XState v5**: Use the actor model — each workflow invocation is an actor, phases are child actors
- **Callable from SKILL.md**: Functions exposed as CLI commands (`bun run state transition --event=PHASE_COMPLETE`) or MCP tools so markdown-program skills can invoke them
- **Replace markdown state files**: Gradually replace STATE.md / WORKING.md reads/writes with state machine queries (`bun run state get --field=complexity`) and transitions (`bun run state send --event=EXECUTE_COMPLETE`)
- **Encode business rules in guards**: Complexity gating matrix, oversight pause conditions, gate config booleans — all become XState guards rather than LLM-interpreted markdown tables

### Relationship to Existing Todos

**Supersedes/consolidates:** `ts-driven-state-management-llm-offloading.md` — that todo describes the problem (offload deterministic writes from LLM). This todo proposes the concrete solution (XState state machine as npm package). They should be merged or the older todo should reference this as the implementation approach.

### Architecture Sketch

```
SKILL.md (markdown program)
  → calls: `bun run @alecsibilia/luca-state transition PHASE_COMPLETE`
  → XState machine processes event
  → Guards check: complexity >= MODERATE? oversight != full-auto?
  → Machine transitions to next state
  → Returns: { currentState: "verifying", nextAction: "spawn lu-verifier", context: {...} }
  → SKILL.md receives structured JSON, acts on it
```

### Expected Benefits

- Deterministic workflow transitions (testable, no LLM variance)
- Massive token savings (state queries return JSON, not file contents)
- Resumable sessions (XState persisted state)
- Visualizable workflows (XState has built-in visualization tools)
- Type-safe state management (XState + TypeScript)
- Publishable as standalone package for other AI workflow frameworks

## Notes

- XState v5 is the current version — use actor model, not v4 machine pattern
- Start with the core workflow states, expand to sub-machines (phase lifecycle, milestone lifecycle)
- Consider how autopilot skill's oversight levels map to XState guards
- The package should work standalone (no framework dependency) so other projects can adopt it
- Performance consideration: Bun cold-start for CLI calls — may want an MCP server that keeps the machine in memory instead
- Related: phase-execute already has implicit state machine logic in its markdown — this would formalize it
