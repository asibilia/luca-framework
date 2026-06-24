---
id: "81-A"
title: "Distribution Blockers: Version Sync & Harness-Aware Update"
phase: 81
wave: 1
complexity: COMPLEX
requirements:
  - R1 (Distribution Pipeline Fix)
  - R2 (Harness-Aware Update Command)
todos:
  - "#5: npm Publishing Pipeline + Version Sync Fix (MODERATE)"
  - "#10: Harness-Aware Update Command (COMPLEX)"
tasks:
  - id: "81-A-T1"
    title: "Fix LUCA_VERSION sync with package.json"
    goal: "Replace hardcoded LUCA_VERSION '0.0.1' with build-time injection from package.json so the CLI, manifest, and published package all report the correct version."
    verify: "bun run build && grep -q '2.4.0' packages/luca-framework/dist/index.mjs"
    files:
      - packages/luca-framework/src/utils/manifest.ts
      - packages/luca-framework/build.config.ts
      - packages/luca-framework/package.json
  - id: "81-A-T2"
    title: "Add prepublishOnly script and validate-package script"
    goal: "Add a prepublishOnly lifecycle script that runs build + test + build:plugin, and create a validate-package.ts script that verifies the npm tarball contains correct version metadata, shebang, templates, and dist."
    verify: "bun run scripts/validate-package.ts exits 0 and logs all checks passing"
    files:
      - packages/luca-framework/package.json
      - packages/luca-framework/scripts/validate-package.ts
  - id: "81-A-T3"
    title: "Add harness source tracking to manifest file entries"
    goal: "Extend the manifest files record to include a harness-specific source marker (e.g., 'harness:claude', 'harness:cursor', 'harness:pi') so the update command can identify which files belong to which harness."
    verify: "bunx --bun tsc --noEmit && bun test"
    files:
      - packages/luca-framework/src/types.ts
      - packages/luca-framework/src/utils/manifest.ts
      - packages/luca-framework/src/utils/files.ts
  - id: "81-A-T4"
    title: "Detect harness additions and removals during update"
    goal: "Compare manifest.harnesses with current config harnesses to detect added/removed platforms. Scaffold new harness files for additions; clean up stale files for removals."
    verify: "bun test — unit tests cover add-harness and remove-harness scenarios"
    files:
      - packages/luca-framework/src/commands/update.ts
      - packages/luca-framework/src/utils/manifest.ts
  - id: "81-A-T5"
    title: "Apply chmod +x to hook scripts during update"
    goal: "Replicate the chmod +x logic from generateFiles (init) in the update path so hook scripts restored during update are executable."
    verify: "After update, .claude/hooks/*.sh and .cursor/hooks/*.sh have executable permission"
    files:
      - packages/luca-framework/src/commands/update.ts
  - id: "81-A-T6"
    title: "Update manifest version on update"
    goal: "When the update command completes successfully, update the manifest.version to the current LUCA_VERSION so version comparison works on subsequent runs."
    verify: "After bun luca update, manifest.json version matches package.json version"
    files:
      - packages/luca-framework/src/commands/update.ts
      - packages/luca-framework/src/utils/manifest.ts
  - id: "81-A-T7"
    title: "Add tests for version sync and harness-aware update"
    goal: "Comprehensive test coverage: version injection verification, harness addition/removal scenarios, source marker tracking, chmod on hook scripts, and validate-package script assertions."
    verify: "bun test — all new tests pass, existing tests unchanged"
    files:
      - __tests__/packages/luca-framework/version-sync.test.ts
      - __tests__/packages/luca-framework/harness-update.test.ts
---

# Plan 81-A — Distribution Blockers: Version Sync & Harness-Aware Update

## Objective

Fix two distribution blockers that prevent the published `@alecsibilia/luca-framework` package from working correctly for end users:

1. **Version sync bug (CRITICAL):** `LUCA_VERSION` in `manifest.ts` is hardcoded to `"0.0.1"` while `package.json` is at `2.4.0`. Every consumer's manifest records the wrong version, breaking update version comparison and CLI version reporting.

2. **Harness-aware update (HIGH):** `bun luca update` already collects per-harness template files but does not handle harness additions/removals, source tracking, hook script permissions, or manifest version propagation. Users who add a new harness (e.g., Pi) post-init never receive its files via update, and users who remove a harness accumulate stale files.

## Context

Key source files:

- @packages/luca-framework/src/utils/manifest.ts — `LUCA_VERSION` hardcoded to `"0.0.1"` (line 7), `createManifest()`, `compareFiles()`
- @packages/luca-framework/src/commands/update.ts — `getNewFrameworkFiles()` already collects harness templates (lines 97-109), `updateCommand` orchestration
- @packages/luca-framework/src/utils/files.ts — `generateFiles()` with init-time harness scaffolding and `chmod +x` for hooks
- @packages/luca-framework/src/utils/template.ts — `processTemplate()`, `getAllFiles()`, `getTemplatesDir()`
- @packages/luca-framework/src/types.ts — `LucaManifest`, `FileComparison`, `HarnessId` types
- @packages/luca-framework/build.config.ts — unbuild config (currently no version injection)
- @packages/luca-framework/package.json — version `2.4.0`, uses unbuild for build
- @packages/luca-framework/bin/luca.js — `#!/usr/bin/env bun` entry point

## Detailed Task Descriptions

### T1 — Fix LUCA_VERSION Sync with package.json

**Problem:** Line 7 of `manifest.ts` has `const LUCA_VERSION = "0.0.1"`. This value propagates into every consumer's `manifest.json` and is never updated. The build process (unbuild via `build.config.ts`) does not inject the real version.

**Approach:**

1. In `manifest.ts`, read the version dynamically at build time using unbuild's `replace` plugin or a simple import:
   - Option A (preferred): Use `unbuild` hooks in `build.config.ts` to define a `__LUCA_VERSION__` replacement string, then reference it in `manifest.ts`
   - Option B: Read `package.json` at runtime via `import pkg from '../../package.json'` — but this couples to file location and does not work in dist
   - Option C: Add a `version.ts` generated file that is written by a pre-build script

2. The cleanest approach for unbuild is to use the `rollup.replace` plugin in `build.config.ts`:

   ```typescript
   import { readFileSync } from "node:fs";
   const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));
   // Add to rollup config: replace({ __LUCA_VERSION__: JSON.stringify(pkg.version) })
   ```

   Then in `manifest.ts`: `const LUCA_VERSION = __LUCA_VERSION__;`

3. If unbuild does not support `replace` natively, create a `scripts/inject-version.ts` pre-build script that writes `src/utils/version.ts` with `export const LUCA_VERSION = "2.4.0"`.

**Verification:**

- `bun run build` succeeds
- `grep` the built output (`dist/index.mjs`) to confirm the real version string appears
- The hardcoded `"0.0.1"` no longer appears in dist output

### T2 — Add prepublishOnly and validate-package Scripts

**Problem:** No automated gate prevents publishing a broken package. The version mismatch bug (T1) could have been caught by validation.

**Approach:**

1. Add to `package.json`:

   ```json
   "prepublishOnly": "bun run build && bun test && bun run build:plugin"
   ```

2. Create `scripts/validate-package.ts` that:
   - Reads `package.json` version
   - Checks `bin/luca.js` exists and starts with `#!/usr/bin/env bun`
   - Checks `dist/index.mjs` exists and contains the correct version string
   - Checks `templates/` directory exists with expected subdirectories (base, framework, harness, hooks, stacks)
   - Checks `dist/plugin/` exists (from build:plugin)
   - Exits 0 on all pass, 1 with details on failure

3. Add a `validate` script to `package.json`: `"validate": "bun scripts/validate-package.ts"`

**Verification:**

- `bun run validate` exits 0 after a successful build
- Intentionally breaking a check (e.g., deleting dist/) causes exit 1

### T3 — Add Harness Source Tracking to Manifest

**Problem:** The manifest `files` record tracks `source: "framework" | "user"` but does not indicate which harness a file belongs to. This makes it impossible to clean up files from a removed harness.

**Approach:**

1. Extend the `source` union in `LucaManifest.files` to include harness-specific values:

   ```typescript
   source: "framework" | "user" | `harness:${HarnessId}`;
   ```

2. Update `createManifest()` in `manifest.ts` to accept an optional `sourceMap` parameter that maps file paths to source values. During init (`generateFiles` in `files.ts`), harness template files should be marked with their harness source.

3. Update `collectTemplateFiles()` in `update.ts` to tag output entries with harness source, and propagate this through `updateManifestAfterUpdate()`.

**Verification:**

- `bunx --bun tsc --noEmit` clean
- After init with `["claude", "cursor"]`, manifest shows `.claude/` files as `source: "harness:claude"` and `.cursor/` files as `source: "harness:cursor"`

### T4 — Detect Harness Additions and Removals During Update

**Problem:** If a user's config changes harnesses (e.g., adds Pi, removes Cursor), `bun luca update` does not scaffold new harness files or clean up removed harness files.

**Approach:**

1. At the start of `updateCommand.run()`, after reading the manifest, compare `manifest.harnesses` with the config's harnesses:

   ```typescript
   import difference from "lodash/difference";

   const oldHarnesses = manifest.harnesses ?? ["claude", "cursor"];
   const newHarnesses = config.harnesses ?? ["claude", "cursor"];
   const addedHarnesses = difference(newHarnesses, oldHarnesses);
   const removedHarnesses = difference(oldHarnesses, newHarnesses);
   ```

2. **Added harnesses:** For each added harness, collect its template files via `collectTemplateFiles()` and add them all as `status: "new"` entries to the comparison results. All of these are safe to create.

3. **Removed harnesses:** For each removed harness, find all manifest entries with `source: "harness:<id>"`. For each:
   - If the file is unchanged (originalHash === currentHash), delete it
   - If the file is user-modified, flag as a conflict and let the user decide
   - Log a summary of cleaned-up and conflicted files

4. After update, write the updated `harnesses` array to the manifest.

**Verification:**

- Unit test: Start with manifest `harnesses: ["claude", "cursor"]`, update with config `harnesses: ["claude", "pi"]` — Pi files scaffolded, Cursor files cleaned up (if unchanged)
- Conflicted Cursor files are preserved with conflict notice

### T5 — Apply chmod +x to Hook Scripts During Update

**Problem:** `generateFiles()` in `files.ts` calls `chmod(destPath, 0o755)` for hook scripts, but the update path in `update.ts` writes files via `Bun.write()` without setting executable permissions.

**Approach:**

1. In `applyUpdates()` or as a post-write step, detect hook script paths (matching patterns like `.claude/hooks/*.sh`, `.cursor/hooks/*.sh`, `.pi/hooks/*.sh`) and apply `chmod(destPath, 0o755)`.

2. Use a simple helper:

   ```typescript
   import { chmod } from "node:fs/promises";

   async function makeExecutable(filePath: string): Promise<void> {
     try {
       await chmod(filePath, 0o755);
     } catch {
       /* non-fatal on Windows */
     }
   }
   ```

3. After writing each file in `applyUpdates()`, check if the path matches a hook script pattern and call `makeExecutable()`.

**Verification:**

- After `bun luca update`, verify hook scripts have executable permission: `ls -la .claude/hooks/` shows `-rwxr-xr-x`

### T6 — Update Manifest Version on Update

**Problem:** `updateManifestAfterUpdate()` spreads the old manifest but does not update `manifest.version` to the current LUCA_VERSION. After update, the manifest still records the old version.

**Approach:**

1. Import `LUCA_VERSION` (after T1 fix) into `update.ts`
2. In `updateManifestAfterUpdate()`, set `version: LUCA_VERSION` on the updated manifest:
   ```typescript
   const updatedManifest: LucaManifest = {
     ...manifest,
     version: LUCA_VERSION, // <-- add this
     updatedAt: now,
     harnesses: config.harnesses ?? manifest.harnesses, // <-- propagate harness changes
     files: { ...manifest.files },
   };
   ```

**Verification:**

- After `bun luca update`, `manifest.json` version matches the current `package.json` version
- Subsequent `bun luca update` shows the correct "Current version:" message

### T7 — Tests

**Test file: `__tests__/packages/luca-framework/version-sync.test.ts`**

Tests for T1-T2:

- LUCA_VERSION is not "0.0.1" (reads from built output or source import)
- LUCA_VERSION matches package.json version
- validate-package script assertions (shebang check, dist existence, version presence)

**Test file: `__tests__/packages/luca-framework/harness-update.test.ts`**

Tests for T3-T6:

- Source marker: files created with `source: "harness:claude"` etc.
- Harness addition: new files appear in comparison as `status: "new"`
- Harness removal (unchanged files): files deleted from disk
- Harness removal (user-modified files): files preserved as conflicts
- Hook script chmod: updated hook scripts have 0o755 permission
- Manifest version: updated manifest records current LUCA_VERSION
- Manifest harnesses: updated manifest records new harnesses array

## Success Criteria

- [ ] `LUCA_VERSION` in built output matches `package.json` version (R1.1, R1.2)
- [ ] `"0.0.1"` no longer appears anywhere in dist output (R1.1)
- [ ] `prepublishOnly` script runs build + test + build:plugin (R1.3)
- [ ] `validate-package.ts` verifies tarball correctness (R1.3)
- [ ] CLI version report matches published version (R1.4)
- [ ] Update command reads `manifest.harnesses` (R2.1)
- [ ] Per-harness file diffing works via source tracking (R2.2)
- [ ] New harness files scaffolded when harness added post-init (R2.3)
- [ ] Removed harness files cleaned up when harness removed (R2.4)
- [ ] Hook scripts have executable permission after update (R2.2)
- [ ] All existing tests pass, new tests cover all scenarios (R1, R2)
- [ ] `bunx --bun tsc --noEmit` clean
