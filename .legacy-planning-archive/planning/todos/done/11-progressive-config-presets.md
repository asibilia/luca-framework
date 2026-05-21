---
title: "Progressive Config Presets (Starter/Standard/Full)"
area: cli/dx
created: 2026-03-01
source: expert-panel-research
tier: 2
complexity: MODERATE
moat: N/A
---

## Context

132-line config.json on first contact is hostile. Pi's zero-friction setup and Nader's progressive layering ("stop at any layer and have a working system") suggest progressive disclosure.

## Task

Introduce three named presets during wizard:

- **Starter**: Disables cognitive pre-flight, learning capture, code review, UAT. Conservative defaults.
- **Standard**: Current defaults (what ships today).
- **Full**: All gates, all review agents, parallelization, thorough verification.

Store `preset` field in config.json. `bun luca update` merges preset changes on upgrade. Uses `defu` (already a dependency) for merge.

**Implementation:**

- New preset selection step in `packages/luca-framework/src/utils/wizard.ts`
- New: `src/utils/presets.ts` — preset definitions and merge logic
- Conditional rendering per preset in `packages/luca-framework/templates/framework/templates/config.json`
- Pass preset to config builder in `packages/luca-framework/src/commands/init.ts`
- Add preset field to LucaConfig in `packages/luca-framework/src/types.ts`

## Notes

- Source agent: DX & Distribution Expert
