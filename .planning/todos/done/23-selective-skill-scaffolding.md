---
title: "Selective Skill Scaffolding (Core vs Extended)"
area: cli/distribution
created: 2026-03-01
source: expert-panel-research
tier: quick-win
complexity: COMPLEX
moat: N/A
---

## Context

Pi's one-file-per-extension model lets you list exactly what you want. Nader's progressive layering. Currently Luca installs all 48 skills regardless of preset or need.

## Task

Two-tier skill system: **core** (always installed: ~12 essential skills) and **extended** (installed on demand based on preset). Starter preset gets core only, Standard gets ~25, Full gets all ~48.

Add `index.json` manifest to each harness's skills directory mapping skill names to category and prerequisites. `bun luca add-skill <name>` for on-demand installation.

**Implementation:**

- Add index.json manifest to `packages/luca-framework/templates/harness/*/skills/`
- Filter skills during scaffolding in `packages/luca-framework/src/utils/files.ts`
- Preset determines skill tier in `packages/luca-framework/src/utils/wizard.ts`
- New: `src/commands/add-skill.ts` — on-demand skill installation

## Notes

- Depends on #11 (Progressive Config Presets)
- Source agent: DX & Distribution Expert
