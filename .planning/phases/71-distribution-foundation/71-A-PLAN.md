# Plan 71-A: Distribution Foundation

## Objective

Rename npm scope from `@asibilia` to `@alecsibilia`, add `HarnessId` type system, export bridge CLI function, create bin entry, and update package metadata. No behavior changes — purely structural foundation for distribution.

## Context

- **Package:** `packages/luca-framework/package.json` — currently `@asibilia/luca-framework` v2.0.0
- **Types:** `packages/luca-framework/src/types.ts` — LucaConfig/LucaManifest lack harness fields
- **Bridge:** `packages/luca-framework/src/state/bridge.ts` — import.meta.main dispatch needs extraction
- **Bin:** `packages/luca-framework/bin/luca.js` — only entry; no luca-bridge.js
- **Templates:** 3 hook scripts + 1 workflow template reference `@asibilia`

## Tasks

### T1: Rename npm scope @asibilia -> @alecsibilia

- `packages/luca-framework/package.json` line 2
- `packages/luca-framework/templates/hooks/scripts/session-start.sh` line 153
- `packages/luca-framework/templates/hooks/scripts/pre-commit-gate.sh` line 78
- `packages/luca-framework/templates/framework/workflows/cognitive-preflight.md` line 66

### T2: Add HarnessId type + extend interfaces

- Add `export type HarnessId = "claude" | "cursor" | "pi"` to `src/types.ts`
- Add `harnesses?: HarnessId[]` to `LucaConfig`
- Add `harnesses: HarnessId[]` to `LucaManifest`
- Re-export `HarnessId` from `src/index.ts`

### T3: Extract runBridgeCli() from bridge.ts

- Move `if (import.meta.main)` dispatch logic into exported `runBridgeCli()` function
- Keep `if (import.meta.main) { runBridgeCli() }` for backward compat

### T4: Create bin/luca-bridge.js

- New file with `#!/usr/bin/env bun` shebang
- Imports and runs `runBridgeCli()`

### T5: Update package.json metadata

- Add `"luca-bridge": "./bin/luca-bridge.js"` to bin entries
- Bump version to 2.3.0
- Run `bun install` to regenerate lock file

## Verification

- `bun test` passes
- `bunx --bun tsc --noEmit` passes
- `grep -r "@asibilia" packages/luca-framework/` returns zero results
- `bun run packages/luca-framework/src/state/bridge.ts read-status` still works

## Requirements Addressed

R1.1, R1.2, R1.3, R1.4, R1.5, R1.6
