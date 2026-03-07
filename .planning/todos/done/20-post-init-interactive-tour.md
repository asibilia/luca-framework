---
title: "Post-Init Interactive Tour"
area: cli/dx
created: 2026-03-01
source: expert-panel-research
tier: quick-win
complexity: MODERATE
moat: N/A
---

## Context

After init, users are left with a directory full of files and no guidance on what to do first. Pi's zero-friction setup contrasts with Luca's current "wall of files" first impression.

## Task

After init success, prompt "Would you like a quick tour?" Walk through 3-4 steps:

1. Open and explain .planning/BRAIN.md — what to customize
2. Explain harness files created ("28 agents, 12 rules, 48 skills installed into .claude/")
3. Show exact startup command per harness
4. Suggest first /lu command based on context

Skippable with `--no-tour` or `--quick`. Uses @clack/prompts (already a dependency).

**Implementation:**

- New: `src/utils/tour.ts` — interactive tour logic
- Call tour after success in `packages/luca-framework/src/commands/init.ts`
- Enhanced context detection in `packages/luca-framework/src/utils/detect.ts`

## Notes

- Source agent: DX & Distribution Expert
