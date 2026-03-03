---
title: Build luca-observer real-time web dashboard
area: packages
created: 2026-03-03
source: conversation
---

## Context

Researched [disler/claude-code-hooks-multi-agent-observability](https://github.com/disler/claude-code-hooks-multi-agent-observability) for inspiration. A team of 3 review agents (architecture, domain coverage, tech feasibility) validated the plan. Full implementation plan at `.claude/plans/eager-conjuring-anchor.md`.

## Task

Build `packages/luca-observer/` — a Next.js web dashboard that visualizes Luca workflow executions in real-time. Users install it alongside luca-framework and run `luca-observer` to watch their workflows.

**Stack**: Next.js (App Router) + TypeScript + Bun + Tailwind CSS 4 + shadcn/ui + SQLite (bun:sqlite) + SSE

**Data flow**: Hooks emit HTTP POST -> SQLite -> SSE broadcast -> Browser. State/memory/metrics read from `.planning/` filesystem on demand.

**8 dashboard pages**: Dashboard overview, Workflow state machine, Iterations & convergence, Harness results, Planning (WSJF), Memory system, Tribunal & debate, Agent activity.

**6 implementation phases**: Foundation MVP -> Workflow & State -> Harness & Iteration -> Memory & Planning -> Tribunal & Agents -> Polish.

## Notes

- Plan reviewed by 3 agents: arch-reviewer, data-reviewer, tech-researcher
- Key tech decisions: no Turbopack for Phase 1 (bun:sqlite compat), standalone tsconfig (no root extend), globalThis SQLite singleton, observer-emitter.ts extracted from bridge.ts
- 12 existing schema files to reuse across iteration/harness/planner/memory/tribunal/observability/context/complexity domains
- Observer is live-only (fire-and-forget events, no guaranteed delivery)
- Full plan: `.claude/plans/eager-conjuring-anchor.md`
