---
title: "Cross-Agent Interop Scanner"
area: framework/interop
created: 2026-03-01
source: expert-panel-research
tier: 3
complexity: COMPLEX
moat: Medium
priority: P2
---

## Context

Pi's cross-agent interop scanning (from disler/pi-vs-claude-code cross-agent.ts) discovers agents from .claude/, .gemini/, .codex/ directories. Projects increasingly have agents from multiple tools coexisting.

## Task

New `src/interop/` domain at T1 (Core tier). Scans .claude/, .cursor/, .pi/, .gemini/, .codex/, .github/copilot/ for agent definitions. Normalizes to common InteropAgentSummary schema. Populates context assembler's agent_summaries field. Informs routing (avoid spawning Luca agents that duplicate existing non-Luca agents).

**Implementation:**

- New domain: `src/interop/` with **schemas/, **helpers/, index.ts
- Consume interop summaries in `src/context/__helpers/context-assembler.ts`
- Register interop as T1 in `.claude/rules/domain-architecture.md` and `module-boundary.md`
- Add `discover` bridge subcommand in `packages/luca-framework/src/state/bridge.ts`

## Notes

- Source agent: Architecture Expert
