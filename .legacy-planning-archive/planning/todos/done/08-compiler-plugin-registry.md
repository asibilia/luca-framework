---
title: "Compiler Plugin Registry"
area: framework/compilers
created: 2026-03-01
source: expert-panel-research
tier: 2
complexity: MODERATE
moat: Medium
---

## Context

compile.ts (lines 271-337) uses hardcoded switch statements for each output format. Adding a new platform target requires modifying core compilation logic.

## Task

Replace hardcoded switch with CompilerPlugin factories. Each plugin: `{ compileAgent, compileSkill, compileRule }` keyed by format name. Existing Claude/Cursor/Plugin/Pi formatters become 4 built-in plugins. Adding Gemini/Windsurf/Codex = one adapter file.

**Implementation:**

- Refactor `src/compilers/__helpers/compile.ts` to registry-based dispatch
- Add CompilerPluginSchema to `src/compilers/__schemas/compilers.schemas.ts`
- New directory: `src/compilers/plugins/` — one file per format
- Re-export registry and plugin contract from `src/compilers/index.ts`

## Notes

- Inspired by Pi's extension composability via `-e` flag stacking
- Source agent: Architecture Expert
