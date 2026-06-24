# Phase 175 Plan 2 Summary: Core Library Functions

## Result: PASS

All three core library modules implemented, type-checked, and committed atomically.

## Tasks Completed

### Task 1: Backup Manager

- **Commit:** `64ca78b3`
- **File:** `packages/luca-framework/src/utils/backup-manager.ts`
- **Functions:** `backupSettings()`, `rotateBackups()`, `listBackups()`
- **Notes:** Uses `Bun.file()`/`Bun.write()` for read/write I/O. Directory creation uses `node:fs` mkdir (Bun has no dir creation API). Rotation uses `lodash/orderBy` for lexical sort of ISO timestamps.

### Task 2: Settings Merger (Three-Tier Merge)

- **Commit:** `0ff89ff0`
- **File:** `packages/luca-framework/src/utils/settings-merger.ts`
- **Functions:** `buildSlotKey()`, `parseExistingHooks()`, `extractLucaScriptName()`, `isLucaHook()`, `getKnownLucaScripts()`, `computeMergeActions()`, `applyMerge()`
- **Notes:** Composite key = `{Event}:{matcher}`. `getKnownLucaScripts()` accepts the canonical hook registry as a parameter (dependency injection) since `packages/luca-framework/` cannot import from `src/hooks/` (different package boundary). Returns 15 scripts from the current registry (plan said 14 but registry has grown). No hardcoded script lists.

### Task 3: Deploy Manifest Writer

- **Commit:** `ec72ca93`
- **File:** `packages/luca-framework/src/utils/deploy-manifest-writer.ts`
- **Functions:** `createDeployManifest()`, `writeDeployManifest()`, `readDeployManifest()`
- **Notes:** Reuses `hashFile()` and `LUCA_VERSION` from `manifest.ts`. Validates on read with `DeployManifestSchema.safeParse()`. Consistent with existing manifest.ts patterns.

## Verification

- **Type check:** `bunx --bun tsc --noEmit` passes (no new errors)
- **No hardcoded script lists:** `getKnownLucaScripts()` dynamically derives from canonical registry
- **Bun APIs:** backup-manager and deploy-manifest-writer use `Bun.file()`/`Bun.write()`
- **Import structure:** All modules import only from T0 (same utils directory, external packages) -- no tier violations
- **Functional patterns:** No classes, all exports are functions
- **Zod schema-first:** `DeployManifestSchema.safeParse()` on read, types from Plan 1 schemas

## Deviations

### [Rule 2 - Missing Critical] getKnownLucaScripts dependency injection

The plan specified `getKnownLucaScripts()` with no parameters, but `packages/luca-framework/src/utils/` cannot import from `src/hooks/__helpers/hook-registry.ts` (different package, no path alias). Solved via dependency injection: the function accepts the registry as a parameter. The caller (deploy-global.ts or luca init command) provides `canonicalHookRegistry` at call time.

### Registry count: 15 vs plan's 14

The plan stated "14 entries (matches canonical hook registry count)" but the actual canonical registry has 15 hooks (includes `post-tool-use-failure` which was likely added after planning). The function correctly derives all 15 from the registry.

## Files Created

- `packages/luca-framework/src/utils/backup-manager.ts` (181 lines)
- `packages/luca-framework/src/utils/settings-merger.ts` (445 lines)
- `packages/luca-framework/src/utils/deploy-manifest-writer.ts` (181 lines)
