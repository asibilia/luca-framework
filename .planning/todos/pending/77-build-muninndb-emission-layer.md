---
title: Build MuninnDB emission layer in framework
area: infrastructure
created: 2026-03-08
source: conversation
---

## Context

Replace SpacetimeDB reducers with MuninnDB remember() calls. The framework needs to emit structured engrams for session events, decisions, agent activity, and state transitions.

## Task

- Create a new emitter module (replaces `observer-emitter.ts`) that calls MuninnDB HTTP API or MCP tools
- Emit engrams with:
  - Proper types (event, decision, observation, issue, task, etc.)
  - Entity extraction (agents, phases, files, sessions)
  - Entity relationships (agent uses file, phase depends_on phase, etc.)
  - Tags for session scoping (`session:<id>`, `phase:<n>`, `complexity:<level>`)
- Target moderate granularity: ~50-100 engrams per session
- Include: decisions, phase transitions, findings, learnings, errors, agent spawns, tool calls with results, state transitions
- Fire-and-forget pattern (non-blocking, same as current SpacetimeDB emitter)
- Circuit breaker pattern for resilience (same as current)

## Notes

- MuninnDB MCP tools: `muninn_remember`, `muninn_remember_batch`, `muninn_link`
- Existing MuninnDB API routes in observer: `/api/muninn/*`
- Brainstorm doc: `.claude/plans/polished-mapping-fern.md`
- **Audit update (2026-03-08):** The Muninn memory audit found critical gaps in session lifecycle that this emission layer should address:
  - **Gap: session-start.sh has ZERO MuninnDB operations** — emission layer should emit `session:start` engram with workflow type, timestamp
  - **Gap: session-persist.sh has ZERO MuninnDB operations** — emission layer should emit `session:end` summary before cleanup
  - **Gap: context-monitor.sh doesn't track MuninnDB session size** — emission layer should expose session:\* engram count for monitoring
  - **Gap: session:\* engrams never cleaned up on abandoned sessions** — emission layer should include TTL/cleanup hooks (#93)
  - **Audit synergy:** Emission layer is a prerequisite for #95 (Close Learning Loop) MEASURE phase — need structured event emission to track which recalled patterns were applied
  - **Audit synergy:** Session digest (#90) could be implemented as an emission layer feature — auto-publish digest engram after each execution wave
