---
title: "Portable Cognitive Profiles (Cross-Project Memory)"
area: framework/memory
created: 2026-03-01
source: expert-panel-research
tier: 3
complexity: MODERATE
moat: Medium
---

## Context

Claude Code has ~/.claude/CLAUDE.md but no structured learning transfer. Pi has no memory system. User stickiness grows the more projects use Luca — patterns carry between projects.

## Task

Export/import transferable learnings across projects via `~/.luca/global-memory.json`. Filter by category: "pattern" and "preference" are portable; "decision" may be project-specific. Auto-loaded by lu-cognition during pre-flight alongside project-local MEMORY.md.

**Implementation:**

- Add source_project field to `src/memory/__schemas/memory.schemas.ts`
- New: `src/memory/__helpers/profile-export.ts` — filter and export portable entries
- New: `src/memory/__helpers/profile-import.ts` — merge with deduplication
- Cross-project dedup in `src/memory/__helpers/compression.ts`
- Load global profile in `src/agents/general/lu-cognition.agent.ts`
- New skills: `src/skills/general/profile-export.skill.ts`, `profile-import.skill.ts`

## Notes

- "Always run migrations first" carries between Django projects
- Source agent: Competitive Edge Expert
