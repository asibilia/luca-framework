# Phase 180: DRY Consolidation & Convention Alignment - Research

**Researched:** 2026-03-16
**Domain:** Code deduplication, convention alignment, function decomposition
**Confidence:** HIGH

## Summary

This research maps the exact consumers, import chains, and dependencies for all 19 tasks in Phase 180. The phase is purely refactoring -- no new features, no behavioral changes. All tasks operate within the `packages/luca-framework/` package boundary (with one exception: `scripts/deploy-global.ts` for shared deploy utilities).

The primary refactoring target is `init.ts` (841 lines), which contains three inlined functions (`copyDirForDeploy`, `rewriteWrapperPathsForInit`, `buildProposedHooksFromDeployed`) that duplicate logic from `deploy-global.ts` and the canonical hook registry. Secondary targets are the port resolution pattern (duplicated 3x), monorepo root walk-up (duplicated 3x), and `homedir()` calls (7 direct uses where `getLucaHomePaths()` exists).

**Primary recommendation:** Execute extractions in dependency order (foundations first, then consumers), with typecheck verification after each file change.

## Consumer Maps

### DRY-1: resolveMuninndbPort()

Port resolution is duplicated identically in three files:

| Consumer File         | Line    | Current Code                                                                     | Import After                                               |
| --------------------- | ------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `muninndb-service.ts` | 66-70   | `rawPort ?? (process.env.MUNINNDB_PORT ? parseInt(...) : MUNINNDB_DEFAULT_PORT)` | `import { resolveMuninndbPort } from "./muninndb-schemas"` |
| `muninndb-health.ts`  | 101-105 | Identical pattern                                                                | `import { resolveMuninndbPort } from "./muninndb-schemas"` |
| `vault-setup.ts`      | 374-378 | Identical pattern                                                                | `import { resolveMuninndbPort } from "./muninndb-schemas"` |

**Target file:** `packages/luca-framework/src/utils/muninndb-schemas.ts` (already exports `MUNINNDB_DEFAULT_PORT`)

**Signature:** `export function resolveMuninndbPort(port?: number): number`

**No new imports needed in target file** -- `MUNINNDB_DEFAULT_PORT` is already defined there.

### DRY-2: Delegate vault-setup health check to checkMuninndbService()

| Consumer                                                 | Current Code                                   | Change                                                                                              |
| -------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `vault-setup.ts` lines 370-393 `verifyVaultConnection()` | Manual fetch to `/health` with AbortController | Replace body with `const status = await checkMuninndbService(resolvedPort); return status.healthy;` |

**New import in vault-setup.ts:** `import { checkMuninndbService } from "./muninndb-health"`

**Risk:** LOW. `verifyVaultConnection()` already returns `boolean`. `checkMuninndbService()` returns the same health check with identical timeout behavior.

### DRY-3: resolveMonorepoRoot()

The walk-up-to-monorepo-root pattern appears 3 times:

| Consumer File      | Line    | Pattern                                                                                            |
| ------------------ | ------- | -------------------------------------------------------------------------------------------------- |
| `init.ts`          | 101-105 | `while (dir !== "/" && !existsSync(join(dir, "packages/luca-framework"))) { dir = dirname(dir); }` |
| `global-update.ts` | 83-88   | Identical                                                                                          |
| `global-update.ts` | 409-414 | Identical (second use in same file)                                                                |

**Target file:** `packages/luca-framework/src/utils/runtime-context.ts` (already exports `detectRuntimeContext()`)

**Signature:** `export function resolveMonorepoRoot(startDir: string): string`

**Consumers after extraction:**

- `init.ts` replaces lines 101-105: `sourceRoot = resolveMonorepoRoot(ctx.packageDir);`
- `global-update.ts` replaces lines 83-88 (in `resolveSourceClaudeDir`): `sourceRoot = resolveMonorepoRoot(ctx.packageDir);`
- `global-update.ts` replaces lines 409-414 (in `executeGlobalUpdate`): `sourceRoot = resolveMonorepoRoot(ctx.packageDir);`

**New imports:** Both files add `import { resolveMonorepoRoot } from "../utils/runtime-context"` (init.ts already imports from this module).

### DRY-4: Shared deploy utilities (copyDirForDeploy, rewriteHookPaths)

**Duplicated functions:**

| Function                                             | init.ts Location | deploy-global.ts Location | Differences                                                                                                                       |
| ---------------------------------------------------- | ---------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `copyDirForDeploy` / `copyDirRecursive`              | Lines 346-401    | Lines 244-288             | deploy-global.ts tracks to module-level `deployedFiles`; init.ts takes `deployedFiles` as param. Both have SEC-008 symlink guard. |
| `rewriteWrapperPathsForInit` / `rewriteWrapperPaths` | Lines 409-421    | Lines 130-141             | deploy-global.ts has `if (dryRun) return;` guard; otherwise identical regex logic.                                                |

**Extraction target:** `packages/luca-framework/src/utils/deploy-helpers.ts` (new file)

**Shared API design:**

```typescript
// copyDirForDeploy: takes deployedFiles as explicit param (not module-level)
export function copyDirForDeploy(
  source: string,
  target: string,
  globalDir: string,
  deployedFiles: Array<{
    relativePath: string;
    absolutePath: string;
    sourceType: DeploySourceType;
  }>,
  sourceType: DeploySourceType,
  sourceRoot?: string,
): void;

// rewriteHookPaths: no dryRun guard (caller handles that)
export function rewriteHookPaths(targetPath: string, projectRoot: string): void;
```

**Import chain changes:**

- `init.ts`: Remove inline functions, add `import { copyDirForDeploy, rewriteHookPaths } from "../utils/deploy-helpers"`
- `deploy-global.ts`: Remove `copyDirRecursive` and `rewriteWrapperPaths`, add `import { copyDirForDeploy, rewriteHookPaths } from "../packages/luca-framework/src/utils/deploy-helpers"`. Adapt `deployDir()` to pass `deployedFiles` array and `GLOBAL_DIR`. Keep `dryRun` guard at call site.

**Risk:** MEDIUM. deploy-global.ts is a `scripts/` file importing from `packages/luca-framework/src/utils/` -- this is an existing pattern (it already imports 6 things from there). No new cross-boundary violation.

### DRY-5: Migrate init.ts from node:fs to Bun.file/Bun.write

Per CONTEXT.md decision, only `readFileSync` and `writeFileSync` are migrated.

**Calls to migrate in init.ts:**

| Line | Current                                    | Replacement                                                                       | Notes                |
| ---- | ------------------------------------------ | --------------------------------------------------------------------------------- | -------------------- |
| 140  | `writeFileSync(target, readFileSync(...))` | `await Bun.write(target, await Bun.file(join(agentsSource, file)).arrayBuffer())` | In agent deploy loop |
| 196  | `writeFileSync(target, readFileSync(...))` | Same pattern                                                                      | In hook deploy loop  |
| 277  | `readFileSync(settingsPath, "utf-8")`      | `await Bun.file(settingsPath).text()`                                             | Settings read        |
| 323  | `writeFileSync(settingsPath, ...)`         | `await Bun.write(settingsPath, ...)`                                              | Settings write       |

**CRITICAL:** After DRY-4 extraction, `copyDirForDeploy` moves to `deploy-helpers.ts` -- the fs calls inside that function should also be migrated there, not in init.ts. The calls in lines 140, 196 remain in init.ts only if they are NOT inside `copyDirForDeploy`.

Looking at the code more carefully:

- Lines 140 (agent deploy): Direct `writeFileSync/readFileSync` -- these stay in init.ts, migrate to Bun.
- Lines 196 (hook deploy): Direct `writeFileSync/readFileSync` -- stays in init.ts, migrate to Bun.
- Lines 393 (inside `copyDirForDeploy`): Moves to `deploy-helpers.ts` per DRY-4.
- Lines 277, 323 (settings): Stays in init.ts, migrate to Bun.

**Async threading:** `runDeployStep()` is already `async`. All Bun.file/Bun.write calls need `await`. No synchronous callers exist.

### DRY-6: extractErrorMessage()

The pattern `err instanceof Error ? err.message : "fallback"` appears:

| File                   | Count | Lines            |
| ---------------------- | ----- | ---------------- |
| `muninndb-service.ts`  | 2     | 115-116, 209-210 |
| `muninndb-download.ts` | 2     | 280, 370         |
| `state/persistence.ts` | 3     | 57, 151, 184     |
| `state/bridge.ts`      | 2     | 969, 1257        |
| `state/cli.ts`         | 1     | 370              |

**Target:** `packages/luca-framework/src/utils/error-utils.ts` (new file, small -- single function)

**Scope for this phase:** Per CONTEXT.md, only extract the utility. Consumers in `muninndb-service.ts` and potentially others can adopt it. Not all 10 call sites need to be updated in this phase (LOW priority task).

### DRY-7: inferSourceType()

| Current Location                 | Consumers                                  |
| -------------------------------- | ------------------------------------------ |
| `global-update.ts` lines 133-142 | `computeGlobalDiff()` line 175 (same file) |

**Target:** `packages/luca-framework/src/utils/deploy-manifest.schemas.ts`

**Import change:** `global-update.ts` adds `import { inferSourceType } from "./deploy-manifest.schemas"`

**Risk:** LOW. Single consumer, simple move.

### ANTI-PATTERN-1: Replace direct homedir() with getLucaHomePaths()

Files using `homedir()` directly instead of `getLucaHomePaths()`:

| File                                | Line     | Current Pattern                                                    | Replacement                                                                                                                                                                                                                                                |
| ----------------------------------- | -------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `init.ts`                           | 92       | `const home = homedir(); const globalDir = join(home, ".claude");` | Use `getLucaHomePaths()` (already imported). Note: `~/.claude/` is NOT in `LucaHomePaths` -- this is `~/.claude/`, not `~/.luca/`. **This specific call constructs `~/.claude/`**, which is different from `getLucaHomePaths()` which resolves `~/.luca/`. |
| `reinit.ts`                         | 58       | `const home = homedir(); const globalDir = join(home, ".claude");` | Same issue -- constructs `~/.claude/` path                                                                                                                                                                                                                 |
| `global-update.ts`                  | 164, 337 | Same pattern for `~/.claude/`                                      | Same issue                                                                                                                                                                                                                                                 |
| `runtime-context.ts`                | 45       | `const home = homedir();` (for RuntimeContext.homeDir)             | Already uses it correctly -- homeDir is a generic field                                                                                                                                                                                                    |
| `luca-home.ts`                      | 49       | `const home = homedir();` (for `~/.luca/` paths)                   | Source of truth -- correct                                                                                                                                                                                                                                 |
| `doctor/checks/global-artifacts.ts` | 59       | `const home = homedir();` for `~/.claude/`                         | Same `~/.claude/` vs `~/.luca/` distinction                                                                                                                                                                                                                |

**IMPORTANT FINDING:** Most `homedir()` calls construct `~/.claude/` (the Claude Code global config dir), NOT `~/.luca/` (the Luca home dir). `getLucaHomePaths()` only covers `~/.luca/` paths. The CONTEXT.md decision says "replace all direct homedir() calls with getLucaHomePaths()" but this is only valid for `~/.luca/` paths.

**Recommendation:** Create a complementary helper: either extend `getLucaHomePaths()` to include a `claudeGlobal` path, or create a separate `getGlobalClaudeDir()` function. The simplest approach: add `claudeGlobal: join(home, ".claude")` to `LucaHomePathsSchema` and `getLucaHomePaths()`.

### COMPLEXITY-1: Hook Registry JSON Artifact

**Current state:**

- Canonical source: `src/hooks/__helpers/hook-registry.ts` exports `canonicalHookRegistry` (15 hooks)
- `deploy-global.ts` imports `resolveCanonicalRegistry()` directly (monorepo-tier import)
- `init.ts` has a hardcoded `scriptEventMap` (lines 438-527) -- 15 entries matching the canonical registry

**Build pipeline insertion point:**

- `scripts/build-all.ts` calls `generateAllOutputs()` from `scripts/build-shared.ts`
- The JSON artifact generator should be added as an additional step in `build-all.ts` (after the main generate call)

**Generator approach:**

1. New file: `scripts/generate-hooks-registry-json.ts`
2. Called from `build-all.ts` after existing steps
3. Reads `resolveCanonicalRegistry()`, serializes to `dist/hooks-registry.json`
4. Shape: `Record<string, { event, tool_filter?, command_filter?, timeout, async, status_message }>`

**init.ts fallback strategy:**

```typescript
// Try reading build artifact
const registryPath = join(sourceRoot, "dist/hooks-registry.json");
let hookRegistry: Record<string, CanonicalHook> | null = null;
try {
  const file = Bun.file(registryPath);
  if (await file.exists()) {
    hookRegistry = JSON.parse(await file.text());
  }
} catch {
  /* fallback below */
}

// Fallback: use inline map (kept as backup)
if (!hookRegistry) {
  hookRegistry = FALLBACK_HOOK_MAP; // The current scriptEventMap, renamed
}
```

**CRITICAL:** Cannot run `bun run build:all` in session. The generator code will be written but untestable until user runs it manually.

### COMPLEXITY-2 & COMPLEXITY-3: Function Decomposition

**executeGlobalUpdate() (global-update.ts, ~190 lines of logic):**

Current structure (lines 244-433):

1. Resolve source dir (lines 252-262) -- already delegated to `resolveSourceClaudeDir()`
2. Read manifest (lines 265-274)
3. Compute diff via `computeGlobalDiff()` (lines 277-280)
4. Show summary (lines 283-333)
5. Apply changes -- deploy loop (lines 337-405)
6. Resolve source root for manifest (lines 408-417) -- DUPLICATED walk-up
7. Write manifest (lines 420-426)

**Decomposition plan:** Steps 5 and 6-7 can be extracted:

- `applyArtifactUpdates(diff, sourceClaudeDir, globalDir)` -- the deploy loop
- Source root resolution uses `resolveMonorepoRoot()` from DRY-3

This is straightforward because `computeGlobalDiff()` and `resolveSourceClaudeDir()` are already extracted.

**runDeployStep() (init.ts, ~246 lines):**

Current structure (lines 91-336):

1. Resolve source root (lines 100-110) -- uses monorepo walk-up (DRY-3)
2. Deploy agents (lines 132-149)
3. Deploy skills (lines 152-170)
4. Deploy hooks (lines 173-209)
5. Deploy statusline (lines 213-226)
6. Deploy rules (lines 229-261)
7. Settings merge (lines 263-324)
8. Write manifest (lines 327-333)

**Decomposition plan per CONTEXT.md:**

- `deployAgentArtifacts(sourceRoot, globalDir)` -- steps 2
- `deploySkillArtifacts(sourceRoot, globalDir)` -- step 3
- `deployHookArtifacts(sourceRoot, globalDir)` -- step 4 (includes statusline)
- `deployRuleArtifacts(sourceRoot, globalDir)` -- step 6
- Settings merge and manifest stay inline (already use library functions)

**Shared pattern between COMPLEXITY-2 and COMPLEXITY-3:** Both functions follow the pattern: resolve-source -> diff/iterate artifacts -> deploy files -> write manifest. After DRY-3 (resolveMonorepoRoot) and DRY-4 (deploy-helpers), both become thinner orchestrators.

### W1: Schema Casing Alignment

**Current muninndb-schemas.ts field casing:**

| Schema                        | Current Casing                                  | Direction     | Needed Change                             |
| ----------------------------- | ----------------------------------------------- | ------------- | ----------------------------------------- |
| `MuninndbBinaryStatusSchema`  | camelCase (`installed`, `path`, etc.)           | Internal only | No change needed (internal-only, not API) |
| `MuninndbServiceStatusSchema` | camelCase (`running`, `port`, `pid`, `healthy`) | Internal only | No change needed                          |
| `MuninndbInstallResultSchema` | camelCase (`success`, `binaryPath`, `error`)    | Internal only | No change needed                          |

**Finding:** These schemas are internal-only (not sent to/from an external API). Per the api-snake-case rule, internal schemas CAN use camelCase. The CONTEXT.md task says "Schema casing alignment" which likely refers to ensuring consistency within the muninndb module. All three schemas already use camelCase consistently. **No casing changes needed** unless the decision is to move everything to snake_case for consistency.

**Recommendation:** Add explicit JSDoc direction comments (`/** Internal schema. Uses camelCase. */`) but do not change the casing -- it would break all consumers.

### W2: Fix deploy-global.ts Barrel Imports

**Current direct imports (not through barrels):**

```typescript
import { sanitizeJsonParse } from "../packages/luca-framework/src/utils/sanitize";
import { promptConflictResolution } from "../packages/luca-framework/src/utils/conflict-prompt";
import type { DeploySourceType } from "../packages/luca-framework/src/utils/deploy-manifest.schemas";
```

These are deep imports into `packages/luca-framework/src/utils/`. The other imports in the file also use deep paths but go through the correct module files.

**Fix:** Since `deploy-global.ts` is in `scripts/` (outside the package), barrel imports from `packages/luca-framework` aren't available via workspace aliases. These deep imports are **acceptable** per the module-boundary rules (scripts/ is external, not subject to barrel-first rules). The task may have been created before this was understood.

**Recommendation:** Keep deep imports. The "barrel import fix" is a non-issue for scripts/ directory files. Mark this task as resolved-by-investigation.

### W5: Convert doctor CheckResult to Zod Schema

**Current interface (doctor/types.ts):**

```typescript
export interface CheckResult {
  name: string;
  status: "pass" | "fail" | "warning";
  message: string;
  fixCommand: string | null;
  details: string | null;
}
```

**Consumers:** 11 files in `doctor/checks/` plus `doctor/index.ts` barrel export.

**Conversion:**

```typescript
export const CheckResultSchema = z.object({
  name: z.string(),
  status: z.enum(["pass", "fail", "warning"]),
  message: z.string(),
  fixCommand: z.string().nullable(),
  details: z.string().nullable(),
});
export type CheckResult = z.infer<typeof CheckResultSchema>;
```

**Impact:** Each check's `run()` method constructs a `CheckResult` literal. After conversion, these still work because TypeScript structural typing matches. No consumer changes needed -- only the type definition changes.

### DEAD-CODE-1: Remove unused errorMsg variable

**Location:** `muninndb-service.ts` lines 115-116

```typescript
const errorMsg =
  err instanceof Error ? err.message : "Failed to spawn MuninnDB process";
```

This variable is assigned but never used -- the catch block returns a parsed schema object without referencing `errorMsg`. Same pattern at line 209-210 (stop function).

**Fix:** Remove the variable assignment. If DRY-6 is done first, the pattern changes anyway.

## Architecture Patterns

### Recommended Extraction Order (Wave Dependencies)

Extractions must respect dependency order. A consumer cannot import from a file that hasn't been created yet.

```
Wave 1 (Foundation - no dependencies on other tasks):
  DRY-1: resolveMuninndbPort() -> muninndb-schemas.ts
  DRY-3: resolveMonorepoRoot() -> runtime-context.ts
  DRY-6: extractErrorMessage() -> error-utils.ts (new file)
  DRY-7: inferSourceType() -> deploy-manifest.schemas.ts
  DEAD-CODE-1: Remove unused errorMsg

Wave 2 (Depends on Wave 1 extractions):
  DRY-4: deploy-helpers.ts (new file: copyDirForDeploy, rewriteHookPaths)
  DRY-2: Delegate vault-setup health check (uses resolveMuninndbPort from W1)
  ANTI-PATTERN-1: Replace homedir() calls

Wave 3 (Depends on Wave 2):
  DRY-5: Bun.file migration in init.ts (after DRY-4 moves functions out)
  COMPLEXITY-1: Hook registry JSON artifact generator
  COMPLEXITY-2: Decompose executeGlobalUpdate() (after DRY-3, DRY-4)
  COMPLEXITY-3: Decompose runDeployStep() (after DRY-3, DRY-4, DRY-5)

Wave 4 (Schema/convention work - independent of code structure):
  W1: Schema casing alignment JSDoc
  W5: Convert CheckResult to Zod schema
  DX tasks: Lodash, import grouping, JSDoc documentation
```

### Project Structure After Extraction

```
packages/luca-framework/src/
├── commands/
│   ├── init.ts              # ~500 lines (down from 841)
│   ├── reinit.ts            # Minor: uses getLucaHomePaths().claudeGlobal
│   └── doctor.ts            # Unchanged
├── utils/
│   ├── deploy-helpers.ts    # NEW: copyDirForDeploy, rewriteHookPaths
│   ├── deploy-manifest.schemas.ts  # + inferSourceType()
│   ├── error-utils.ts       # NEW: extractErrorMessage()
│   ├── muninndb-schemas.ts  # + resolveMuninndbPort()
│   ├── muninndb-service.ts  # Uses resolveMuninndbPort, extractErrorMessage
│   ├── muninndb-health.ts   # Uses resolveMuninndbPort
│   ├── vault-setup.ts       # Delegates to checkMuninndbService
│   ├── runtime-context.ts   # + resolveMonorepoRoot()
│   ├── global-update.ts     # Uses resolveMonorepoRoot, decomposed helpers
│   ├── luca-home.ts         # + claudeGlobal path
│   └── doctor/
│       └── types.ts         # CheckResult -> Zod schema
scripts/
├── deploy-global.ts         # Uses deploy-helpers.ts shared functions
└── generate-hooks-registry-json.ts  # NEW: build-time hook registry emitter
```

## Don't Hand-Roll

| Problem                           | Don't Build                                                  | Use Instead                              | Why                                          |
| --------------------------------- | ------------------------------------------------------------ | ---------------------------------------- | -------------------------------------------- |
| Port resolution with env fallback | Inline `process.env.MUNINNDB_PORT ? parseInt(...) : DEFAULT` | `resolveMuninndbPort()`                  | Already duplicated 3x, will be 4x            |
| Monorepo root detection           | Inline while-loop walk-up                                    | `resolveMonorepoRoot()`                  | Already duplicated 3x                        |
| Error message extraction          | `err instanceof Error ? err.message : "fallback"`            | `extractErrorMessage(err, fallback)`     | 10+ call sites                               |
| Directory copy with symlink guard | Inline recursive copy with SEC-008 check                     | `copyDirForDeploy()` from deploy-helpers | Two implementations exist, must stay in sync |
| Shell wrapper path rewriting      | Inline regex replace                                         | `rewriteHookPaths()` from deploy-helpers | Two implementations exist, must stay in sync |

## Common Pitfalls

### Pitfall 1: Async/Sync Mismatch in Bun.file Migration

**What goes wrong:** Converting `readFileSync`/`writeFileSync` to `Bun.file().text()`/`Bun.write()` without adding `await` causes the function to return before I/O completes.
**Why it happens:** `Bun.file().text()` returns a Promise, not a string. Without `await`, the code continues with an unresolved Promise.
**How to avoid:** Verify every `Bun.file()` and `Bun.write()` call has `await`. The containing function must be `async`.
**Warning signs:** TypeScript should catch `Promise<string>` where `string` is expected, but only if strict mode is on.

### Pitfall 2: deploy-global.ts Module-Level State

**What goes wrong:** `deploy-global.ts` uses a module-level `deployedFiles` array that `copyDirRecursive` pushes to directly. Extracting to shared `deploy-helpers.ts` means the function signature must accept `deployedFiles` as a parameter.
**Why it happens:** The shared function can't reference module-level state from a different module.
**How to avoid:** The shared `copyDirForDeploy` already accepts `deployedFiles` as a parameter (matching init.ts's design). `deploy-global.ts` must pass its module-level array to the shared function.

### Pitfall 3: ~/.claude/ vs ~/.luca/ Path Confusion

**What goes wrong:** Replacing `homedir()` + `join(home, ".claude")` with `getLucaHomePaths()` which resolves `~/.luca/` paths.
**Why it happens:** `getLucaHomePaths()` does NOT have a `~/.claude/` path. The global Claude Code config dir (`~/.claude/`) is different from the Luca home dir (`~/.luca/`).
**How to avoid:** Either add `claudeGlobal` to `LucaHomePathsSchema`, or create a separate helper. Do NOT blindly replace all `homedir()` calls.

### Pitfall 4: Hook Registry Fallback Divergence

**What goes wrong:** The hardcoded `scriptEventMap` in init.ts and the `canonicalHookRegistry` in `src/hooks/` drift apart as hooks are added/removed.
**Why it happens:** Two sources of truth -- the canonical registry (build tier, T3) and the fallback map (package tier).
**How to avoid:** Add a sync version comment to the fallback map. The build-time JSON artifact eliminates drift -- the fallback map is frozen at the last known-good state.

### Pitfall 5: build:all Cannot Run in Session

**What goes wrong:** Testing the hook registry JSON artifact requires `bun run build:all`, which crashes Claude Code.
**Why it happens:** Per MEMORY.md, this is a known issue.
**How to avoid:** Write the generator code, but do NOT run `bun run build:all`. Verify with `bunx --bun tsc --noEmit` only. User must run build:all manually after the session.

## Code Examples

### resolveMuninndbPort() extraction

```typescript
// In muninndb-schemas.ts (add after MUNINNDB_DEFAULT_PORT)

/**
 * Resolve the MuninnDB port from an explicit value, environment variable, or default.
 *
 * Priority: explicit port > MUNINNDB_PORT env var > MUNINNDB_DEFAULT_PORT (8476).
 *
 * @param port - Explicit port override, or undefined to use env/default.
 * @returns Resolved port number.
 */
export function resolveMuninndbPort(port?: number): number {
  return (
    port ??
    (process.env.MUNINNDB_PORT
      ? parseInt(process.env.MUNINNDB_PORT, 10)
      : MUNINNDB_DEFAULT_PORT)
  );
}
```

### resolveMonorepoRoot() extraction

```typescript
// In runtime-context.ts (add after detectRuntimeContext)

/**
 * Walk up from a starting directory to find the monorepo root.
 *
 * Identifies the monorepo root by checking for the presence of
 * `packages/luca-framework/` in each ancestor directory. Returns
 * the starting directory unchanged if the marker is never found
 * (i.e., reaches filesystem root).
 *
 * @param startDir - Directory to start walking up from.
 * @returns Absolute path to the monorepo root, or startDir if not found.
 */
export function resolveMonorepoRoot(startDir: string): string {
  let dir = startDir;
  while (dir !== "/" && !existsSync(join(dir, "packages/luca-framework"))) {
    dir = dirname(dir);
  }
  return dir;
}
```

### deploy-helpers.ts shared module

```typescript
// New file: packages/luca-framework/src/utils/deploy-helpers.ts

import {
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "pathe";

import type { DeploySourceType } from "./deploy-manifest.schemas";

/**
 * Recursively copy a directory for deployment, tracking files for manifest.
 *
 * Includes a symlink traversal guard (SEC-008): before copying each file,
 * checks if it is a symlink. If the symlink resolves to a path outside
 * the source tree, the file is skipped with a warning.
 */
export function copyDirForDeploy(
  source: string,
  target: string,
  globalDir: string,
  deployedFiles: Array<{
    relativePath: string;
    absolutePath: string;
    sourceType: DeploySourceType;
  }>,
  sourceType: DeploySourceType,
  sourceRoot?: string,
): void {
  const root = sourceRoot ?? source;
  mkdirSync(target, { recursive: true });
  const entries = readdirSync(source, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(source, entry.name);
    const tgtPath = join(target, entry.name);

    if (lstatSync(srcPath).isSymbolicLink()) {
      try {
        const resolved = realpathSync(srcPath);
        if (!resolved.startsWith(root)) {
          console.warn(
            `[deploy] Skipping symlink that escapes source tree: ${srcPath} -> ${resolved}`,
          );
          continue;
        }
      } catch {
        console.warn(`[deploy] Skipping unresolvable symlink: ${srcPath}`);
        continue;
      }
    }

    if (entry.isDirectory()) {
      copyDirForDeploy(
        srcPath,
        tgtPath,
        globalDir,
        deployedFiles,
        sourceType,
        root,
      );
    } else {
      writeFileSync(tgtPath, readFileSync(srcPath));
      deployedFiles.push({
        relativePath: relative(globalDir, tgtPath),
        absolutePath: tgtPath,
        sourceType,
      });
    }
  }
}

/**
 * Rewrite relative paths in shell wrappers to absolute paths for global context.
 *
 * Replaces `$(dirname "$0")/../../` and `$(dirname "$0")/../` with the
 * absolute project root path so wrappers work when copied to ~/.claude/.
 */
export function rewriteHookPaths(
  targetPath: string,
  projectRoot: string,
): void {
  const content = readFileSync(targetPath, "utf-8");
  const rewritten = content
    .replace(/\$\(dirname "\$0"\)\/\.\.\/\.\.\//g, `${projectRoot}/`)
    .replace(/\$\(dirname "\$0"\)\/\.\.\//g, `${projectRoot}/`);

  if (rewritten !== content) {
    writeFileSync(targetPath, rewritten);
  }
}
```

## Import Chain Summary

All import changes needed, organized by target file:

### Files Gaining New Exports (Sources)

| File                         | New Exports                                          |
| ---------------------------- | ---------------------------------------------------- |
| `muninndb-schemas.ts`        | `resolveMuninndbPort()`                              |
| `runtime-context.ts`         | `resolveMonorepoRoot()`                              |
| `deploy-manifest.schemas.ts` | `inferSourceType()`                                  |
| `deploy-helpers.ts` (NEW)    | `copyDirForDeploy()`, `rewriteHookPaths()`           |
| `error-utils.ts` (NEW)       | `extractErrorMessage()`                              |
| `doctor/types.ts`            | `CheckResultSchema` (Zod schema, replaces interface) |

### Files Updating Imports (Consumers)

| Consumer File              | Adds Import                                                                                                       | Removes                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `muninndb-service.ts`      | `resolveMuninndbPort` from `./muninndb-schemas`                                                                   | Inline port resolution code                                             |
| `muninndb-health.ts`       | `resolveMuninndbPort` from `./muninndb-schemas`                                                                   | Inline port resolution code                                             |
| `vault-setup.ts`           | `resolveMuninndbPort` from `./muninndb-schemas`, `checkMuninndbService` from `./muninndb-health`                  | Inline port resolution, manual fetch in `verifyVaultConnection`         |
| `init.ts`                  | `resolveMonorepoRoot` from `./runtime-context`, `copyDirForDeploy`, `rewriteHookPaths` from `./deploy-helpers`    | Inline walk-up, inline `copyDirForDeploy`, `rewriteWrapperPathsForInit` |
| `global-update.ts`         | `resolveMonorepoRoot` from `./runtime-context`, `inferSourceType` removed (imported from deploy-manifest.schemas) | Inline walk-up (2x), inline `inferSourceType`                           |
| `scripts/deploy-global.ts` | `copyDirForDeploy`, `rewriteHookPaths` from `../packages/luca-framework/src/utils/deploy-helpers`                 | Inline `copyDirRecursive`, `rewriteWrapperPaths`                        |

## Open Questions

1. **`~/.claude/` path helper:** Should `getLucaHomePaths()` be extended with a `claudeGlobal` field, or should a separate `getGlobalClaudeDir()` function be created? The former is simpler but mixes concerns (Luca home vs Claude config). Recommend extending `getLucaHomePaths()` since it already resolves from `homedir()`.

2. **W2 (barrel imports in deploy-global.ts):** Investigation shows these are deep imports from `scripts/` into `packages/` -- an existing and acceptable pattern. This task may be a non-issue. Recommend marking as resolved-by-investigation or skipping.

3. **Hook registry JSON format:** Should the JSON artifact use the canonical format (snake_case event names like `post_tool_use`) or the Claude Code format (PascalCase like `PostToolUse`)? Recommend canonical format since the consumer (init.ts) will need to adapt for Claude Code anyway, and canonical is the source of truth.

## Risks Not Covered by CONTEXT.md or PREMORTEM.md

### Risk 4: deploy-global.ts dryRun Guard Lost During Extraction

`rewriteWrapperPaths()` in deploy-global.ts has `if (dryRun) return;` at the top. The shared `rewriteHookPaths()` should NOT include this guard (it's a module-level concern). If deploy-global.ts forgets to check `dryRun` before calling the shared function, dry-run mode will mutate files.

**Mitigation:** In deploy-global.ts, wrap the call: `if (!dryRun) rewriteHookPaths(targetPath, projectRoot);`

### Risk 5: TypeScript Strict Null Checks on Bun.file().text()

`Bun.file(path).text()` returns `Promise<string>` but if the file doesn't exist, it throws (unlike `readFileSync` which also throws). The behavior is the same, but the error type differs. init.ts has `existsSync()` guards before reads, so this is safe.

### Risk 6: Circular Import from runtime-context.ts

`runtime-context.ts` imports `homedir` from `node:os`. If `resolveMonorepoRoot()` is added and it imports `existsSync` from `node:fs` and `dirname`/`join` from `pathe`, these are external deps (no circular risk). However, if any consumer of `runtime-context.ts` also imports from it, verify no circular dependency is introduced.

**Verified safe:** `init.ts` imports from `runtime-context.ts` and is not imported by it. `global-update.ts` same pattern. No circular risk.

## Sources

### Primary (HIGH confidence)

- Direct codebase analysis of all files listed in research context
- `packages/luca-framework/src/commands/init.ts` (841 lines, full read)
- `packages/luca-framework/src/utils/muninndb-schemas.ts` (full read)
- `packages/luca-framework/src/utils/muninndb-service.ts` (full read)
- `packages/luca-framework/src/utils/muninndb-health.ts` (full read)
- `packages/luca-framework/src/utils/vault-setup.ts` (full read)
- `packages/luca-framework/src/utils/runtime-context.ts` (full read)
- `packages/luca-framework/src/utils/global-update.ts` (full read)
- `packages/luca-framework/src/utils/luca-home.ts` (full read)
- `packages/luca-framework/src/utils/deploy-manifest.schemas.ts` (full read)
- `packages/luca-framework/src/utils/doctor/types.ts` (full read)
- `scripts/deploy-global.ts` (full read, 984 lines)
- `src/hooks/__helpers/hook-registry.ts` (full read)
- `src/hooks/__helpers/config-generators.ts` (partial read)
- Grep-based consumer analysis across entire codebase

### Secondary (MEDIUM confidence)

- `.planning/phases/180-dry-consolidation-convention-alignment/180-CONTEXT.md` (decisions)
- `.planning/phases/180-dry-consolidation-convention-alignment/PREMORTEM.md` (risks)

## Metadata

**Confidence breakdown:**

- Consumer maps: HIGH - Full grep + file read verification
- Import chains: HIGH - Verified all import paths exist
- Wave ordering: HIGH - Dependency analysis from actual code
- Schema casing: HIGH - Verified all schema field names
- Hook registry artifact: MEDIUM - Generator approach is sound but untestable in session
- homedir() replacement: HIGH - Found the ~/.claude/ vs ~/.luca/ distinction

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 (30 days - stable refactoring domain)
