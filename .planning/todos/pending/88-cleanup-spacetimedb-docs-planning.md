---
title: Clean up SpacetimeDB references in docs and planning
area: docs
created: 2026-03-08
source: conversation
---

## Context

After removing SpacetimeDB from framework and observer, all documentation and planning artifacts referencing SpacetimeDB need cleanup.

## Task

- Update `docs/observer-architecture.md` for MuninnDB architecture
- Update `docs/observer-deployment.md` for new deployment model
- Update `docs/architecture-overview.md`
- Archive SpacetimeDB planning phases (03, 107, 112, 127)
- Update `.claude/rules/state-machine-bridge.md` to remove emit commands
- Update `.planning/ROADMAP.md` to remove SpacetimeDB references
- Mark superseded todos as done/obsolete:
  - `65-rename-spacetimedb-memory-fields-to-md.md`
  - SpacetimeDB-specific observer todos (42, 43, 48)
- Remove SpacetimeDB rules from `packages/luca-spacetime/.cursor/rules/`

## Notes

- Some existing pending todos will be superseded by the migration
- Brainstorm doc: `.claude/plans/polished-mapping-fern.md`
