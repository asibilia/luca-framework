---
title: "Migrate build output from .claude/ to dist/claude/"
area: build-pipeline
created: 2026-03-31
source: conversation
tags: [build, architecture, cleanup]
---

## Context

The luca-framework source repo builds agents/skills/rules/hooks into `.claude/`, then `deploy` copies them to `~/.claude/`. When working in this repo, Claude Code loads both — creating duplicate hook firing, 52 duplicate agents, 67 duplicate skills, and git noise from tracking generated files. Since deploy already installs everything globally, the local `.claude/` copy serves no purpose.

## Task

Redirect `bun run build:all` to output to `dist/claude/` (gitignored staging area) instead of `.claude/`. Update `deploy`, `check:drift`, and all build scripts to read from the new location. Strip `.claude/` in this repo to only `settings.local.json` and `plans/`.

## Files to Modify

1. `scripts/build-shared.ts` — Change `.claude/` prefix to `dist/claude/` in all output path generators
2. `scripts/build-deploy.ts` — Change target directory from `.claude` to `dist/claude`
3. `scripts/build-compile.ts` — Update prefix stripping from `.claude/` to `dist/claude/`
4. `scripts/check-drift.ts` — Update comparison paths and stale file detection
5. `scripts/deploy-global.ts` — Update source paths from `.claude/` to `dist/claude/`
6. `src/hooks/__helpers/generate-shell-wrappers.ts` — Update output paths and relative path depth (2→3 levels)
7. `.gitignore` — Add `dist/claude/`, remove tracking of generated `.claude/` subdirs
8. Git cleanup — `git rm -r --cached` the generated files from `.claude/`
9. `CLAUDE.md` — Update references to `.claude/` as generated output
10. `src/rules/general/generated-file-guard.rule.ts` — Update guard scope

## Notes

- Template system (`packages/luca-framework/templates/harness/claude/`) is unaffected — consumer repos still get `.claude/` via `luca init`
- Shell wrapper relative paths change depth: `.claude/hooks/` (2 deep) → `dist/claude/hooks/` (3 deep)
- Critical: the `$LUCA_PACKAGE_ROOT` fallback in wrappers handles absolute paths, so depth change mainly affects local dev
- Full plan: `~/.claude/plans/linear-doodling-harbor.md`
