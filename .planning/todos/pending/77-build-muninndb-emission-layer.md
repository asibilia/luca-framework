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
