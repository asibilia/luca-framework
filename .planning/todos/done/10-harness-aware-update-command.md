---
title: "Harness-Aware Update Command"
area: cli/distribution
created: 2026-03-01
source: expert-panel-research
tier: 2
complexity: COMPLEX
moat: N/A
---

## Context

`bun luca update` currently ignores all harness-specific templates. Users on Claude+Pi never receive updated agents/skills/hooks after version bumps. Phase 75 of v2.3.0 roadmap. Distribution blocker.

## Task

Extend update command to handle harness-specific template files.

**Implementation:**

- Extend `getNewFrameworkFiles()` in `packages/luca-framework/src/commands/update.ts` to call `collectTemplateFiles()` for each harness in manifest
- Claude: templates/harness/claude/ -> .claude/
- Cursor: templates/harness/cursor/ -> .cursor/
- Pi: templates/harness/pi/ -> .pi/
- Track harness-origin files with source marker (e.g., `source: "harness:claude"`)
- Replicate `chmod +x` for hook scripts in update path
- Existing conflict resolution UI (accept-theirs/accept-mine/manual) works unchanged

**Files affected:**

- `packages/luca-framework/src/commands/update.ts`
- `packages/luca-framework/src/utils/files.ts`
- `packages/luca-framework/src/types.ts`
- `packages/luca-framework/src/utils/manifest.ts`

## Notes

- Source agent: DX & Distribution Expert
