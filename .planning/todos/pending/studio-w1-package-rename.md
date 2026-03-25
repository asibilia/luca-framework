---
title: "Rename luca-observer to luca-studio"
area: infrastructure
created: 2026-03-25
source: docs/brainstorm/observer-studio-rework
depends_on: []
phase: studio-w1
estimated_size: S
priority: P0
---

## Context

The brainstorm decided to merge Luca Observer and the planned Luca Studio into a single app called "Luca Studio." The package must be renamed before any new Studio features land to avoid a painful rename later with more dependent code.

## Task

Rename `packages/luca-observer` to `packages/luca-studio` in a single atomic commit. Research (R14) confirmed ~25 files affected: package.json name field, tsconfig paths, import aliases, workspace references in root package.json, scripts, and any documentation references. See `docs/brainstorm/observer-studio-rework/7.research-entity-editing.md` (R14) for the full file list.

## Key Files

- `packages/luca-observer/package.json` (rename to `packages/luca-studio/`)
- Root `package.json` (workspace references)
- `tsconfig.json` / `tsconfig.paths.json` (path aliases)
- Any scripts referencing `luca-observer`

## Verification

- `ls packages/luca-studio/package.json` succeeds
- `ls packages/luca-observer/` fails (directory removed)
- `bun install` succeeds with no resolution errors
- `bunx --bun tsc --noEmit` passes
- All import aliases resolve correctly
