---
title: Bundle statusline for npm distribution
priority: high
milestone: v9.2.1
phase: 280
type: bug-fix
created: 2026-04-02
completed: 2026-04-02
---

# Bundle Statusline for npm Distribution

## Problem

The custom statusline does not appear in Claude Code sessions when Luca is installed via npm on another machine. The `statusline.sh` wrapper references `src/hooks/scripts/statusline.ts`, but the `src/` directory is not included in the npm package (`files` field only includes `bin`, `dist`, `templates`).

## Root Cause

1. `statusline.sh` wrapper pointed to `src/hooks/scripts/statusline.ts`
2. `src/` is excluded from npm package
3. After `rewriteHookPaths()` rewrites paths during `luca init`, the absolute path resolves to a non-existent file

## Solution

1. **Bundle statusline.ts** into a standalone `dist/statusline.bundle.js` using `Bun.build()`
2. **Fix barrel import** — changed import from state barrel (which inlines the full XState machine with side effects) to direct `resolve-state-value.ts` helper
3. **Update wrapper** to prefer bundle (`dist/statusline.bundle.js`), fall back to source TS for monorepo dev
4. **Chain into build** — `build:statusline` script added to `prepublishOnly`

## Files Changed

- `src/hooks/scripts/statusline.ts` — targeted import instead of barrel
- `packages/luca-framework/scripts/build-statusline.ts` — new bundle build script
- `packages/luca-framework/templates/harness/claude/statusline.sh` — prefer bundle
- `packages/luca-framework/package.json` — `build:statusline` + `prepublishOnly` chain

## Verification

- Bundle builds successfully (19k lines, zero XState machine code)
- Source and bundle produce identical ANSI output
- npm install simulation: wrapper finds bundle when src/ absent
- Monorepo dev: `LUCA_PACKAGE_ROOT` still routes to source TS
- TypeScript passes (`bunx --bun tsc --noEmit`)
