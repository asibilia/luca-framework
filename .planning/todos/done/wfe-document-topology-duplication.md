---
title: Document ROUTING_PRESETS and AGENTS duplication risk in topology
area: observer/workflow-editor
created: 2026-03-13
source: v4.3.0-MILESTONE-AUDIT.md
priority: MEDIUM
effort: Small
---

## Context

`workflow-topology.ts` contains two large duplicated data structures:

- `ROUTING_PRESETS` (~line 63) duplicated from `src/complexity/` routing presets
- `AGENTS` array (~line 144, ~500 lines) duplicating definitions from `src/agents/` and `src/skills/`

These are in the observer package (Next.js) and cannot directly import from `src/` (different build context). The duplication is intentional but creates drift risk.

## Task

- Add prominent `// DUPLICATION NOTE:` comments at the top of both data structures explaining:
  - Why duplication exists (Next.js vs Bun build boundary)
  - Where the canonical source lives (`src/complexity/`, `src/agents/`, `src/skills/`)
  - How to keep them in sync (manual sync after source changes)
- Consider a longer-term migration to `workflow.json` as the single source of truth (separate effort)

## Files Affected

- `packages/luca-observer/lib/workflow-topology.ts`

## Notes

- Audit source: code-simplifier + code-architect (MEDIUM severity, cross-phase issue affecting phases 147 + 151)
- The full migration to a generated `workflow.json` is a larger effort — this todo just documents the current state
