---
title: "Replace copy-into-cwd asset install with in-place package scan"
priority: medium
area: harness
source: gh-issue-#213
---

> GitHub Issue: #213 — https://github.com/asibilia/luca-framework/issues/213
> Prerequisite: #212 (race-condition fix)

Replace the `installSkills()` / `installSlashCommands()` / `installRules()` copy-into-cwd pattern with an in-place scan of bundled assets from the installed package directory.

**Key changes:**
- `createMastraCode()` accepts a `bundledAssetRoot` option pointing at `dist/mastracode/`
- Bundled asset paths appended to skill/command/rule scan lists at lowest precedence
- Delete `install-bundled-assets.ts` and its call sites in `launch.ts`
- User overrides in higher-precedence paths (`.mastracode/`, `.claude/`, etc.) still win

**Requires upstream change:** `mastracode` must accept and merge `bundledAssetRoot` into its path lists.

Closes #213
