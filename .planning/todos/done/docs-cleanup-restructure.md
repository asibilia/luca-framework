---
title: "docs/ cleanup, restructure & drift reconciliation"
area: docs
created: 2026-03-31
source: conversation
---

## Context

The `docs/` directory has accumulated 182+ files across 13+ subdirectories. It contains permanent reference docs mixed with phase research artifacts, completed migration plans, bug audits, and comprehensive specs for systems now fully implemented. A full audit was performed with drift checks against the codebase.

## Task

Execute the restructuring plan at `.claude/plans/zippy-wiggling-diffie.md`. The plan has been reviewed by 3 agents (architecture, DX, risk) — all approved with changes, which have been incorporated.

**Summary of work:**

1. **Phase 0:** Build file disposition manifest + sweep all `@see` refs in `src/`
2. **Phase 1:** Create target directories (`architecture/`, `guides/`, `archive/`)
3. **Phase 2:** Consolidate multi-file docs before archival (agent-framework 5->1, memory-system 3->1)
4. **Phase 3:** Archive ~100 historical files (brainstorm, workflow-v2 spec, runtime research, skill-to-agent migration, studio review, deprecated observer docs)
5. **Phase 3.5:** Relocate scouting operational files from `docs/scouting/` to `.planning/scouting/` — 40+ hardcoded path refs across 10 source files need updating
6. **Phase 4:** Move active docs to new locations (runtime-architecture -> architecture/, style-guide -> guides/, etc.)
7. **Phase 5:** Create new docs (README index, workflow-orchestration.md, archive/README, MIGRATION.md redirect map)
8. **Phase 6:** Update cross-references in `src/`, `README.md`, `AGENTS.md`
9. **Phase 7:** Update drifted content (coding-standards, memory-system gaps, architecture-overview)
10. **Phase 8:** Create todos for 6 unfixed Studio bugs (S-01 through S-07)

**Key constraints:**

- `bun run build:all` cannot run in-session (crashes Claude Code) — PR description must note it's needed after merge
- Archive entire directory trees intact (especially workflow-v2-spec with 175+ internal links)
- Memory system decisions.md content must be preserved verbatim during consolidation
- Consolidate BEFORE archive to prevent file-not-found

**Target outcome:** ~28 active docs + ~125 archived + 4 new docs. Clean, navigable structure.

## Notes

- Full plan file: `.claude/plans/zippy-wiggling-diffie.md`
- Drift checks found: workflow v2 fully implemented (no drift), runtime phases A-E mostly complete, memory Gap 2 solved but docs stale, coding standards stale
- Three review agents identified and resolved: broken `@see` refs (P0), scouting operational dependency (P0), deprecated observer docs (P0), phase ordering risk (P1)
