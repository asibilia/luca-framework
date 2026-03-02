---
title: "Harness-Aware `bun luca doctor`"
area: cli/dx
created: 2026-03-01
source: expert-panel-research
tier: quick-win
complexity: MODERATE
moat: N/A
---

## Context

Current doctor runs 3 checks (Node version, Cursor IDE detection, config validation) with no harness awareness. Checks are wrong for a Bun-first project.

## Task

Add per-harness checks. Skip checks for harnesses not in manifest. Replace node-version.ts with bun-runtime.ts.

**Per-harness checks:**

- Claude: validate .claude/settings.json, hook script paths executable
- Pi: validate .pi/settings.json, all extensions exist, \_\_helpers/ complete
- Cursor: validate .cursor/hooks.json, skill directories

**Implementation:**

- Conditional check loading in `packages/luca-framework/src/utils/doctor/index.ts`
- New per-harness check files in `packages/luca-framework/src/utils/doctor/checks/`
- Rename `node-version.ts` to `bun-runtime.ts`

## Notes

- Source agent: DX & Distribution Expert
