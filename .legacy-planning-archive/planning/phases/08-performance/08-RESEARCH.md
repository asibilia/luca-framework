# Phase 8 Research: Performance

## Summary

The Luca Framework CLI has a well-structured codebase with good practices already in place (dynamic imports in doctor checks, non-blocking version checks). The primary performance concerns are: (1) eager loading of ALL command modules and their dependency trees at startup regardless of which command is invoked, (2) `fs-extra` used only for `ensureDir` which is replaceable by native `mkdir({recursive:true})`, and (3) build scripts contain duplicated logic across three files that could be consolidated. Bundle sizes are reasonable for a CLI tool (39-42KB application code, ~99KB total dist), and build script execution is fast (85ms for build:all, 2.2s for unbuild).

## Findings

### Finding 1: Eager Loading of All Command Modules at Startup
**Severity:** MEDIUM
**Category:** startup
**Location:** `packages/luca-framework/src/index.ts:1-5`
**Description:** The main entry point eagerly imports ALL command modules (`init`, `update`, `doctor`) and the `version-check` utility at the top level. This means running `luca doctor` (the simplest command) loads the entire dependency trees of `init` and `update`, including `@clack/prompts`, `ejs`, `fs-extra`, `update-notifier`, `wizard.ts`, `template.ts`, `branding.ts`, `manifest.ts`, `detect.ts`, and `sanitize.ts`. The `citty` framework supports lazy subcommand resolution via functions that return command definitions, but this is not currently used.
**Recommendation:** Convert subcommand imports to lazy `() => import(...)` patterns:
```ts
subCommands: {
  init: () => import('./commands/init').then(m => m.initCommand),
  update: () => import('./commands/update').then(m => m.updateCommand),
  doctor: () => import('./commands/doctor').then(m => m.default),
}
```
This would defer loading of `@clack/prompts`, `ejs`, `fs-extra`, etc. until the specific command is actually invoked. The doctor command would then only load `citty` + `consola` + its own check modules.

### Finding 2: `update-notifier` Loaded Eagerly on Every Invocation
**Severity:** MEDIUM
**Category:** startup
**Location:** `packages/luca-framework/src/utils/version-check.ts:1`
**Description:** `update-notifier` (1.0MB on disk) is imported at the module level in `version-check.ts`. Since `checkForUpdates()` is called from `runMain()` in `index.ts`, and `version-check.ts` is imported eagerly at the top of `index.ts`, this 1.0MB dependency is loaded on every CLI invocation. While `update-notifier` itself does background checking, the module must still be parsed and loaded synchronously.
**Recommendation:** Use a dynamic import inside `checkForUpdates()`:
```ts
export async function checkForUpdates(): Promise<void> {
  try {
    const { default: updateNotifier } = await import('update-notifier');
    // ... rest of function
  } catch { /* silent */ }
}
```
Since the function is already called without `await` (fire-and-forget), making it async with a dynamic import has no impact on the caller.

### Finding 3: `fs-extra` Only Used for `ensureDir`
**Severity:** LOW
**Category:** bundle
**Location:** `packages/luca-framework/src/commands/update.ts:6`, `packages/luca-framework/src/utils/files.ts:4`, `packages/luca-framework/src/utils/template.ts:4`
**Description:** The `fs-extra` dependency (148KB on disk) is imported in three files, but only the `ensureDir` function is used. This function is equivalent to the native `mkdir(path, { recursive: true })` from `fs/promises`, which is already imported in several of these files. This is an unnecessary production dependency.
**Recommendation:** Replace all `ensureDir(path)` calls with `mkdir(path, { recursive: true })` from `fs/promises` and remove `fs-extra` from dependencies. This eliminates one production dependency entirely.

### Finding 4: `execa` Dependency Could Be Replaced with Bun Shell
**Severity:** LOW
**Category:** bundle
**Location:** `packages/luca-framework/src/adapters/github-adapter.ts:11`
**Description:** The `execa` package (656KB on disk) is imported only in `github-adapter.ts` for running `gh` CLI commands. Per the project's CLAUDE.md conventions, `Bun.$` should be used instead of `execa`. However, since the adapters are NOT currently imported in the CLI startup path (they exist as library exports), this has no impact on CLI startup time. If the package needs to remain runtime-agnostic (not Bun-specific), `execa` may be intentional.
**Recommendation:** If Bun is the sole target runtime, replace `execa` calls with `Bun.$` and remove the `execa` dependency. If runtime portability is needed, keep `execa` but consider it a future lazy-load candidate when adapters are integrated into CLI commands.

### Finding 5: `readFileSync` Used in Version Check Hot Path
**Severity:** LOW
**Category:** startup
**Location:** `packages/luca-framework/src/utils/version-check.ts:2, 33`
**Description:** The `checkForUpdates()` function uses `readFileSync` to read `package.json` during startup. While this is in a try/catch and loops through multiple paths, synchronous file reads block the event loop. Given this is only called once and reads a small file, the impact is minimal, but it could be made async alongside the dynamic import recommendation.
**Recommendation:** Convert to async `readFile` when implementing the dynamic import for `update-notifier` (Finding 2). This is a minor improvement.

### Finding 6: Doctor Command Uses Dynamic Imports (Good Practice)
**Severity:** N/A (positive finding)
**Category:** startup
**Location:** `packages/luca-framework/src/utils/doctor/index.ts:8-10`
**Description:** The `executeDoctor()` function already uses dynamic `await import()` for loading individual health checks (`node-version`, `cursor-ide`, `config-validation`). This is excellent practice and means the doctor checks are only loaded when the doctor command is actually executed. This pattern should be followed for other commands.
**Recommendation:** No action needed. Use this as the model for lazy loading in other commands.

### Finding 7: Module-Level Mutable State in `files.ts`
**Severity:** MEDIUM
**Category:** memory
**Location:** `packages/luca-framework/src/utils/files.ts:12`
**Description:** The `createdPaths` array is declared at the module level and accumulates file paths during `generateFiles()`. While it is cleared on success (`createdPaths.length = 0` at line 217) and on error (via `cleanupFiles()` at line 57), there are two concerns: (1) If `generateFiles()` is called multiple times in the same process (e.g., in tests), the state persists between calls. (2) The `setupCleanupHandler()` function adds a new `SIGINT` listener each time it's called, without removing old ones. This could accumulate handlers if `init` is invoked multiple times in a long-running process.
**Recommendation:** (1) Reset `createdPaths` at the beginning of `generateFiles()`, not just on success/error. (2) Track the SIGINT handler reference and remove it when done, or use `process.once('SIGINT', ...)` instead of `process.on('SIGINT', ...)`.

### Finding 8: SIGINT Handler Accumulation
**Severity:** MEDIUM
**Category:** memory
**Location:** `packages/luca-framework/src/utils/files.ts:79-84`
**Description:** `setupCleanupHandler()` calls `process.on('SIGINT', ...)` without checking if a handler is already registered or using `once`. If the init command is called multiple times in a process lifecycle (testing, programmatic use), this will add duplicate SIGINT handlers.
**Recommendation:** Use `process.once('SIGINT', handler)` or track and remove the handler after the operation completes.

### Finding 9: Build Script Code Duplication
**Severity:** LOW
**Category:** build
**Location:** `scripts/build-all.ts`, `scripts/build-cursor.ts`, `scripts/build-claude.ts`
**Description:** The three build scripts share 90%+ identical logic (instantiate components, create directories, compile, write files). `build-all.ts` essentially runs both `build-cursor.ts` and `build-claude.ts` logic inline rather than composing them. All three scripts use synchronous `fs.writeFileSync` and `fs.mkdirSync` calls. However, given the total build time is only 85ms for build:all, this is not a practical performance concern.
**Recommendation:** Low priority. Could refactor into a shared `buildForFormat(format: 'CURSOR' | 'CLAUDE')` function, but the 85ms total execution time makes optimization unnecessary. The synchronous fs calls are fine for a build script that runs sequentially.

### Finding 10: Template Rendering Is Sequential Per File
**Severity:** LOW
**Category:** template
**Location:** `packages/luca-framework/src/utils/template.ts:47-55`, `packages/luca-framework/src/commands/update.ts:67-139`
**Description:** Template processing in `getNewFrameworkFiles()` (update command) iterates through files sequentially with `for...of` loops, reading each file and processing it one at a time. The `processTemplate()` function itself calls EJS `render()` synchronously (it returns a string, wrapped in async). For large projects with many template files, this sequential processing could be slow.
**Recommendation:** Low priority for current scale. If template count grows significantly, consider processing files with `Promise.all()` in batches. The current sequential approach is fine for the expected number of templates (typically under 50 files).

### Finding 11: Duplicate `getAllFiles` and `isTemplateFile` Functions
**Severity:** LOW
**Category:** build
**Location:** `packages/luca-framework/src/utils/template.ts:104-147` and `packages/luca-framework/src/commands/update.ts:21-59`
**Description:** The `getAllFiles()` recursive directory walker and `isTemplateFile()` helper are defined identically in both `template.ts` and `update.ts`. This is code duplication, not a performance issue, but increases maintenance burden. The `update.ts` version even has a dynamic import of `readdir` inside the function (line 22) despite `readFile` already being imported at the top.
**Recommendation:** Extract shared file-walking utilities to a single location and import from both files. Fix the unnecessary dynamic import of `readdir` in `update.ts:22`.

## Dependency Analysis

### Root Package (`luca-monorepo`)

| Dependency | Type | Purpose | Size on Disk | Notes |
|------------|------|---------|-------------|-------|
| `js-yaml` | production | YAML parsing | -- | Used by monorepo build tooling |
| `zod` | production | Schema validation | 6.0 MB | Used by adapters and build tooling |
| `@alecsibilia/commit` | dev | Commit conventions | -- | Dev only, correctly placed |
| `@types/bun` | dev | Bun type definitions | -- | Dev only, correctly placed |
| `@types/js-yaml` | dev | YAML types | -- | Dev only, correctly placed |
| `unbuild` | dev | Build tool | -- | Dev only, correctly placed |
| `typescript` | dev | Type checking | -- | Dev only, correctly placed |

**Issue:** `zod` is listed as a production dependency in the root, but the root package is `private: true`. This is not a problem for shipping but could be moved to devDependencies for clarity since it's only used by the build-time compiler scripts.

### Framework Package (`luca-framework`)

| Dependency | Type | Purpose | Size on Disk | Can Remove? |
|------------|------|---------|-------------|-------------|
| `@clack/prompts` | production | Interactive CLI prompts | 396 KB | No (core UX) |
| `citty` | production | CLI framework | 40 KB | No (core CLI) |
| `consola` | production | Logging | 420 KB | No (core logging) |
| `defu` | production | Deep defaults merging | 40 KB | No (used in config) |
| `ejs` | production | Template rendering | 160 KB | No (core feature) |
| `execa` | production | External process execution | 656 KB | Maybe (only in github-adapter, could use Bun.$) |
| `fs-extra` | production | File system utilities | 148 KB | **Yes** (only uses `ensureDir`) |
| `pathe` | production | Cross-platform paths | 88 KB | No (used extensively) |
| `zod` | production | Schema validation | 6.0 MB | No (used in adapters) |
| `pkg-types` | production | Package.json reading | 52 KB | No (used in detect.ts) |
| `semver` | production | Version comparison | 264 KB | Keep for now (future use) |
| `update-notifier` | production | Update checks | 1.0 MB | No (but should lazy-load) |

**Key finding:** `fs-extra` can be removed entirely (replaced with native `mkdir`). `execa` can potentially be replaced with `Bun.$`. `update-notifier` should be lazy-loaded. `zod` is the largest dependency at 6.0MB but is needed for adapter input validation.

## Startup Path Analysis

### Current Eager Import Chain (for any command)

```
bin/luca.js
  -> dist/index.mjs
    -> citty (defineCommand, runMain)        [NEEDED]
    -> commands/init                          [DEFER - only needed for 'luca init']
      -> @clack/prompts (*)
      -> consola (logger)
      -> utils/detect (pkg-types, fs, pathe)
      -> utils/wizard (@clack/prompts, utils/branding, utils/sanitize)
      -> utils/files (fs-extra, @clack/prompts, utils/template, utils/manifest)
        -> utils/template (ejs, fs/promises, pathe, fs-extra)
    -> commands/update                        [DEFER - only needed for 'luca update']
      -> @clack/prompts (*)
      -> fs/promises, fs, pathe, fs-extra
      -> utils/manifest (fs/promises, crypto, pathe, utils/sanitize)
      -> utils/template (ejs, fs/promises, pathe, fs-extra)
      -> utils/branding
    -> commands/doctor                        [NEEDED for 'luca doctor']
      -> citty
      -> utils/doctor (uses dynamic imports - good!)
    -> utils/version-check                    [EAGER - should be dynamic]
      -> update-notifier (1.0 MB)
      -> fs (readFileSync)
      -> pathe, url
```

### Optimal Startup Path for `luca doctor`

Only citty + consola + doctor command should be loaded. Everything else should be deferred.

## Bundle Size Analysis

### Bun Bundle (full, no externals)
- **Total:** 680 KB (218 modules bundled in 47ms)
- Application code only (all deps external): 47 KB

### Bun Bundle (with code splitting)
| File | Size | Description |
|------|------|-------------|
| `index.js` | 610 KB | Main bundle entry |
| `prompt-*.js` | 51 KB | @clack/prompts chunk |
| `index-*.js` | 5.1 KB | Utility chunk |
| `config-validation-*.js` | 2.2 KB | Doctor check chunk |
| `cursor-ide-*.js` | 1.8 KB | Doctor check chunk |
| `index-*.js` | 0.9 KB | Small chunk |
| `node-version-*.js` | 0.8 KB | Doctor check chunk |
| `index-*.js` | 0.6 KB | Small chunk |

### Unbuild Output (production dist)
| File | Size | Description |
|------|------|-------------|
| `dist/index.mjs` | 36.7 KB | ESM entry (+ 39KB shared chunk) |
| `dist/index.cjs` | 38.7 KB | CJS entry (+ 41KB shared chunk) |
| `dist/chunks/*.mjs` | ~4.4 KB | Doctor check chunks |
| `dist/chunks/*.cjs` | ~4.5 KB | Doctor check chunks |
| **Total dist** | **99 KB** | Production bundle |

The dist output is lean because most dependencies are external (loaded from node_modules at runtime). The 99KB total is very reasonable for a CLI tool.

## Build Script Timing

| Script | Time | Notes |
|--------|------|-------|
| `bun run build:all` | 85ms | Generates Cursor + Claude format files |
| `bun run build:cursor` | 65ms | Generates Cursor format only |
| `bun run build:claude` | 95ms | Generates Claude format only |
| `unbuild` (luca-framework) | 2.2s | Full package build with types |

All build scripts execute extremely fast. The monorepo build scripts (build:all, build:cursor, build:claude) complete in under 100ms. The unbuild step for the framework package takes 2.2s, which is dominated by TypeScript declaration generation. No optimization needed.

## Recommendations

### Priority 1 (HIGH impact, LOW effort)
1. **Lazy-load subcommands in `index.ts`** - Convert static imports to dynamic `() => import(...)` functions. This is the single biggest startup improvement. Citty supports lazy subcommand definitions natively.
2. **Dynamic import `update-notifier` in `version-check.ts`** - Move the import inside the function body. The function is already fire-and-forget, so async is fine.

### Priority 2 (MEDIUM impact, LOW effort)
3. **Replace `fs-extra` with native `mkdir`** - Remove the dependency entirely. Only `ensureDir` is used, and `mkdir(path, { recursive: true })` is a drop-in replacement.
4. **Fix SIGINT handler accumulation** - Use `process.once()` instead of `process.on()` in `setupCleanupHandler()`, or track and remove the handler.

### Priority 3 (LOW impact, LOW effort)
5. **Reset `createdPaths` at the start of `generateFiles()`** - Prevent stale state from previous calls.
6. **Remove duplicate `getAllFiles`/`isTemplateFile`** - Extract to shared utility.
7. **Fix unnecessary dynamic import of `readdir` in `update.ts:22`** - Use the already-imported `readdir` from line 3.

### Priority 4 (DEFER - not worth the complexity)
8. **Replace `execa` with `Bun.$`** - Only relevant if Bun is the sole target runtime. Low priority since adapters are not in the CLI startup path.
9. **Parallelize template processing** - Sequential is fine for current template count (under 50 files).
10. **Build script refactoring** - Scripts run in under 100ms; not worth the refactoring effort.

### Not Recommended
- **Bundle size optimization** - The 99KB dist output is already excellent for a CLI tool. No tree-shaking or minification needed.
- **EJS compilation caching** - Templates are processed once per command invocation. Pre-compilation would add complexity for negligible gain.
- **Incremental build support** - Build scripts complete in under 100ms. Incremental compilation would add complexity without meaningful benefit.
- **Memory profiling for long-running operations** - The CLI commands are short-lived (init, update, doctor). There are no long-running server processes to worry about. The module-level state issues (Finding 7, 8) are real but only manifest in edge cases (repeated programmatic invocation).
