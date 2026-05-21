---
title: "`bun luca status` Command"
area: cli/dx
created: 2026-03-01
source: expert-panel-research
tier: quick-win
complexity: SIMPLE
moat: N/A
---

## Context

No way to quickly see the state of a Luca installation without reading multiple files manually.

## Task

Add `status` subcommand showing: installed version, configured harnesses (with file counts), branding, workflow preset, current phase/plan from STATE.md, quick drift summary. Uses @clack/prompts for formatted output. Support `--json` flag for CI. Fast — local file reads only, no network calls.

**Implementation:**

- New: `src/commands/status.ts`
- Register subcommand in `packages/luca-framework/src/index.ts`
- Reuse readManifest() from `packages/luca-framework/src/utils/manifest.ts`

## Notes

- Source agent: DX & Distribution Expert
