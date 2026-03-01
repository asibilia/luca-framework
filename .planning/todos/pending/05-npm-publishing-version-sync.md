---
title: "npm Publishing Pipeline + Version Sync Fix"
area: cli/distribution
created: 2026-03-01
source: expert-panel-research
tier: 1
complexity: MODERATE
moat: N/A
---

## Context

BUG: `LUCA_VERSION` is hardcoded to `"0.0.1"` in manifest.ts (line 7), not synced with package.json 2.3.0. Every consumer's manifest records the wrong version, breaking update command version comparison.

## Task

Fix version synchronization and add publishing pipeline.

**Implementation:**

1. Build step reads package.json version and injects into manifest.ts
2. Add `prepublishOnly` script: `bun run build && bun test && bun run build:plugin`
3. Add dry-run validation script: npm pack --dry-run, validate shebang, templates, dist/

**Files affected:**

- `packages/luca-framework/src/utils/manifest.ts` — fix LUCA_VERSION constant
- `packages/luca-framework/package.json` — add prepublishOnly script
- `packages/luca-framework/build.config.ts` — version injection during build
- New (dev-only): `scripts/validate-package.ts` — dry-run validation

## Notes

- This is a bug fix AND distribution blocker
- Source agent: DX & Distribution Expert
