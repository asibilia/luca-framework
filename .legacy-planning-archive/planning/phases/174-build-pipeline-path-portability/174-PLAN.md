---
phase: 174
plan: 1
type: improvement
autonomous: false
wave: 1-3
depends_on: [172]
---

# Phase 174 Plan 1: Build Pipeline & Path Portability

## Objective

Make the Luca build pipeline and all runtime path references work from **both** contexts:

1. **Monorepo development** (current): paths relative to repo root, `process.cwd()` is the monorepo
2. **Global npm/bun install** (new): paths relative to the installed package location, `process.cwd()` is the user's project

Today, `scripts/build-all.ts`, `scripts/build-shared.ts`, hook shell wrappers, and numerous skill/agent definitions hardcode monorepo-relative paths. A global install cannot run `bun run build:all` because the paths resolve to locations that don't exist in the installed package.

## Context

### Existing Path Resolution Infrastructure

@packages/luca-framework/src/utils/runtime-context.ts — Already has `detectRuntimeContext()` returning `{ mode: "global" | "dev", packageDir, homeDir }`. Uses `import.meta.dir` to distinguish contexts. This is the foundation to build on.

### Build Pipeline (scripts/)

@scripts/build-all.ts — Main build orchestrator. Uses `process.cwd()` 6 times for output paths, lock file, package.json, and manifest. All assume monorepo root.

@scripts/build-shared.ts — Shared build logic. Uses `process.cwd()` 5 times for config paths, version reading, hook scripts directory. Direct `../src/` relative imports from scripts/ to src/.

@scripts/build-utils.ts — Uses `process.cwd()` to resolve project root for safety assertions.

@scripts/check-drift.ts — Uses `process.cwd()` for project directory.

@scripts/deploy-global.ts — Already handles path rewriting for global deploy via `rewriteWrapperPaths()`. Good pattern to reference.

### Hook Shell Wrappers

@src/hooks/\_\_helpers/generate-shell-wrappers.ts — Generates `.sh` wrappers with hardcoded relative paths: `$(dirname "$0")/../../src/hooks/scripts/{name}.ts`. These relative paths only work from monorepo `.claude/hooks/` location.

### Skill/Agent Content References

Skills and agents embed literal path references in their markdown content (prompt text that AI reads at runtime). These fall into categories:

- **`.planning/` references** (~80+ occurrences): `join(pd, ".planning", ...)` in hooks, `.planning/STATE.md` in skills. These are correct -- they reference the user's project directory, not the package.
- **`.claude/luca/` references** (~20 occurrences in skills): `.claude/luca/workflows/`, `.claude/luca/templates/`, `.claude/luca/references/`. These reference files that must exist in the user's project.
- **`luca-bridge` CLI references** (~30+ occurrences): Already portable -- uses PATH-based resolution.

### Compiler Domain

@src/compilers/\_\_helpers/compile.ts — Pure functions with no path dependencies. Produces content strings; doesn't write to disk. Already portable.

### Hook Scripts (TypeScript implementations)

@src/hooks/scripts/\*.ts — Use `pd` (project directory from hook-io) and `join()` to build paths to `.planning/`. These are correct for both contexts -- the project directory is always the user's cwd.

### Key Pattern: Where process.cwd() is Used

| File                                          | Count | Meaning                   |
| --------------------------------------------- | ----- | ------------------------- |
| `scripts/build-all.ts`                        | 6     | Monorepo root (needs fix) |
| `scripts/build-shared.ts`                     | 5     | Monorepo root (needs fix) |
| `scripts/build-utils.ts`                      | 2     | Project root (needs fix)  |
| `scripts/check-drift.ts`                      | 1     | Monorepo root (needs fix) |
| `src/context/__helpers/hydration-snapshot.ts` | 5     | User project dir (OK)     |
| `src/rules/__helpers/assemble-registry.ts`    | 1     | User project dir (OK)     |
| `packages/luca-framework/src/commands/*.ts`   | ~6    | User project dir (OK)     |
| `packages/luca-framework/src/utils/files.ts`  | 1     | User project dir (OK)     |
| `packages/luca-framework/src/state/bridge.ts` | 1     | User project dir (OK)     |

### Key Pattern: import.meta.dir / import.meta.path

| File                                                   | Usage                     |
| ------------------------------------------------------ | ------------------------- |
| `packages/luca-framework/src/utils/runtime-context.ts` | Detect global vs dev mode |
| `packages/luca-framework/src/utils/manifest.ts`        | Resolve package.json path |
| `packages/luca-framework/scripts/copy-plugin.ts`       | Resolve project root      |
| `packages/luca-framework/scripts/validate-package.ts`  | Resolve package dir       |

## Discovery Audit Results

### Category 1: Build Scripts — Must Support Both Contexts (CRITICAL)

**Problem:** `scripts/build-all.ts` and `scripts/build-shared.ts` hardcode `process.cwd()` to mean "monorepo root" and use relative `../src/` imports. In a global install, there is no monorepo root.

**Files affected:**

- `scripts/build-all.ts` (6 `process.cwd()` calls)
- `scripts/build-shared.ts` (5 `process.cwd()` calls + `../src/` imports)
- `scripts/build-utils.ts` (2 `process.cwd()` calls)
- `scripts/check-drift.ts` (1 `process.cwd()` call)

### Category 2: Shell Wrappers — Relative Path Assumption (HIGH)

**Problem:** `generate-shell-wrappers.ts` produces wrappers with `$(dirname "$0")/../../src/hooks/scripts/` which is monorepo-specific. After global install, wrappers live in `~/.claude/hooks/` and the relative path breaks.

**Files affected:**

- `src/hooks/__helpers/generate-shell-wrappers.ts`

**Note:** `scripts/deploy-global.ts` already has `rewriteWrapperPaths()` as a workaround. The fix should make this workaround unnecessary by generating context-aware wrappers.

### Category 3: Artifact Count Discovery (MEDIUM)

**Problem:** No programmatic way to discover how many agents/skills/rules exist from the installed package. Build manifest is written to `.claude/.build-manifest.json` which is monorepo-specific.

**Files affected:**

- `scripts/build-all.ts` (manifest writing)
- Build manifest lives in `.claude/` which is monorepo output

### Category 4: Skill/Agent Content Path References (LOW RISK)

**Assessment:** Most path references in skills/agents are either:

- `.planning/` paths (correct -- always relative to user project)
- `.claude/luca/` paths (correct -- these exist in user project after setup)
- `luca-bridge` CLI calls (correct -- PATH-based)

These are **not blocking** for path portability. They reference files in the user's project, not the package source.

### Category 5: Version Resolution (LOW)

**Problem:** `scripts/build-shared.ts#readVersion()` looks for `packages/luca-framework/package.json` via `process.cwd()`. In a global install, this path doesn't exist.

**Files affected:**

- `scripts/build-shared.ts` (`readVersion()`)
- `packages/luca-framework/src/utils/manifest.ts` (`resolveVersion()` -- already uses `import.meta.dir`, so OK)

## Tasks

### Wave 1: Foundation — Package-Relative Path Resolution

#### 1. Create `resolvePackageRoot()` utility

**Type:** auto
**TDD:** false
**Depends on:** none

Create a utility function in `src/shared/__helpers/` that resolves the Luca package root directory based on runtime context. This is the single source of truth for "where is the Luca source tree?"

**Strategy:**

- In monorepo dev: use `process.cwd()` (backward compat)
- In global install: use `import.meta.dir` to find the installed package location
- Leverage the existing `detectRuntimeContext()` pattern from `packages/luca-framework/src/utils/runtime-context.ts`

**Files to create/edit:**

- `src/shared/__helpers/resolve-package-root.ts` (new)
- `src/shared/index.ts` (add re-export)

**Verification:**

- TypeScript compiles: `bunx --bun tsc --noEmit`
- Function returns correct path in dev mode (matches `process.cwd()`)
- Function signature: `resolvePackageRoot(): string`

#### 2. Create `resolveSrcDir()` and `resolveScriptsDir()` helpers

**Type:** auto
**TDD:** false
**Depends on:** 1

Convenience functions that build on `resolvePackageRoot()`:

- `resolveSrcDir()` → `{packageRoot}/src`
- `resolveScriptsDir()` → `{packageRoot}/scripts`

These replace the scattered `process.cwd() + "src"` patterns.

**Files to create/edit:**

- `src/shared/__helpers/resolve-package-root.ts` (extend)

**Verification:**

- TypeScript compiles: `bunx --bun tsc --noEmit`

### Wave 2: Build Pipeline Migration

#### 3. Update `scripts/build-all.ts` to use `resolvePackageRoot()`

**Type:** auto
**TDD:** false
**Depends on:** 1, 2

Replace all `process.cwd()` calls in build-all.ts with `resolvePackageRoot()` for source/output paths. The `process.cwd()` calls for user-project paths (if any) should remain.

**Key changes:**

- Lock path: `resolvePackageRoot() + ".claude/.session-lock"`
- Output dirs: `resolvePackageRoot() + ".claude/"`, `resolvePackageRoot() + "dist/plugin/"`
- Package.json: `resolvePackageRoot() + "package.json"`
- Build manifest: `resolvePackageRoot() + ".claude/.build-manifest.json"`

**Files to create/edit:**

- `scripts/build-all.ts`

**Verification:**

- TypeScript compiles: `bunx --bun tsc --noEmit`
- Existing `bun run build:all` still works from monorepo (regression check)

#### 4. Update `scripts/build-shared.ts` to use `resolvePackageRoot()`

**Type:** auto
**TDD:** false
**Depends on:** 1, 2

Replace `process.cwd()` calls and ensure imports from `../src/` work in both contexts.

**Key changes:**

- `readVersion()`: Use `resolvePackageRoot()` for package.json lookups
- `getActiveProfileNames()`: Use user project cwd for `.planning/config.json` (keep `process.cwd()` here -- this is correct)
- `generatePluginOutputs()`: Use `resolvePackageRoot()` for `src/hooks/scripts/` and `src/hooks/__helpers/`

**Files to create/edit:**

- `scripts/build-shared.ts`

**Verification:**

- TypeScript compiles: `bunx --bun tsc --noEmit`
- `bun run build:all` produces same output (regression)

#### 5. Update `scripts/build-utils.ts` to use `resolvePackageRoot()`

**Type:** auto
**TDD:** false
**Depends on:** 1

Replace `process.cwd()` in `assertSafeCleanTarget()` with `resolvePackageRoot()`.

**Files to create/edit:**

- `scripts/build-utils.ts`

**Verification:**

- TypeScript compiles: `bunx --bun tsc --noEmit`

#### 6. Update `scripts/check-drift.ts` to use `resolvePackageRoot()`

**Type:** auto
**TDD:** false
**Depends on:** 1

Replace `process.cwd()` with `resolvePackageRoot()` for the project directory.

**Files to create/edit:**

- `scripts/check-drift.ts`

**Verification:**

- TypeScript compiles: `bunx --bun tsc --noEmit`

### Wave 3: Shell Wrappers & Artifact Discovery

#### 7. Make shell wrappers context-aware

**Type:** checkpoint:human-verify
**TDD:** false
**Depends on:** 1, 2

Update `generate-shell-wrappers.ts` to generate wrappers that resolve the TypeScript script path dynamically based on context (monorepo vs global install).

**Strategy options (evaluate during implementation):**

- Option A: Generate wrappers with `$LUCA_PACKAGE_ROOT` env var, set by session-start
- Option B: Use a well-known path (e.g., `~/.luca/src/`) as the global install target
- Option C: Generate wrappers that check for monorepo `src/` first, fall back to installed package path

The deploy-global script's `rewriteWrapperPaths()` should be kept as a transition mechanism but the generated wrappers should ideally not need post-processing.

**Files to create/edit:**

- `src/hooks/__helpers/generate-shell-wrappers.ts`
- `scripts/deploy-global.ts` (update if wrapper format changes)

**Verification:**

- TypeScript compiles: `bunx --bun tsc --noEmit`
- Generated wrappers contain correct paths for monorepo mode
- Manual check: wrapper path resolution logic is clear and documented

#### 8. Create discoverable artifact manifest

**Type:** auto
**TDD:** false
**Depends on:** 3

Ensure the build manifest (`.claude/.build-manifest.json`) includes artifact counts (agents, skills, rules, hooks) so consuming tools can discover what's available without parsing directories.

**Key changes:**

- Extend manifest to include `counts: { agents, skills, rules, hooks }` alongside existing `output_count`
- Ensure manifest is also written to the installed package location (not just `.claude/`)

**Files to create/edit:**

- `scripts/build-all.ts` (extend manifest content)

**Verification:**

- TypeScript compiles: `bunx --bun tsc --noEmit`
- Manifest JSON includes counts field after build

#### 9. Create `luca build` CLI subcommand

**Type:** checkpoint:decision
**TDD:** false
**Depends on:** 3, 4, 5, 6, 7

Create a `luca build` command in the CLI package that acts as the global equivalent of `bun run build:all`. This command:

- Calls the same `generateAllOutputs()` pipeline
- Writes output to the correct location based on runtime context
- Works from both monorepo (same as current) and global install

**Decision needed:** Should `luca build` write to the user's project `.claude/` (like a local install) or to `~/.claude/` (like a global deploy)? This affects the UX model.

**Files to create/edit:**

- `packages/luca-framework/src/commands/build.ts` (new)
- `packages/luca-framework/src/index.ts` (register command)

**Verification:**

- TypeScript compiles: `bunx --bun tsc --noEmit`
- Command registered and responds to `luca build --help`

## Verification

1. **TypeScript compilation**: `bunx --bun tsc --noEmit` passes after all changes
2. **Monorepo regression**: `bun run build:all` from monorepo root produces identical output to pre-change build
3. **Path resolution**: `resolvePackageRoot()` returns correct paths in dev mode
4. **Manifest completeness**: `.claude/.build-manifest.json` includes artifact counts
5. **Shell wrapper correctness**: Generated `.sh` wrappers resolve to correct TypeScript scripts

## Success Criteria

- [ ] `resolvePackageRoot()` utility exists and is the single source of truth for package root resolution
- [ ] All `scripts/*.ts` build files use `resolvePackageRoot()` instead of raw `process.cwd()` for package-relative paths
- [ ] `process.cwd()` is only used where it correctly means "user's project directory"
- [ ] Shell wrappers can resolve TypeScript implementations in both monorepo and global install contexts
- [ ] Build manifest includes artifact counts for programmatic discovery
- [ ] `luca build` CLI subcommand exists (or decision documented for deferral)
- [ ] Existing `bun run build:all` in monorepo still works identically (zero regression)

## Output Specification

- `src/shared/__helpers/resolve-package-root.ts` — New path resolution utility
- `scripts/build-all.ts` — Updated with portable path resolution
- `scripts/build-shared.ts` — Updated with portable path resolution
- `scripts/build-utils.ts` — Updated with portable path resolution
- `scripts/check-drift.ts` — Updated with portable path resolution
- `src/hooks/__helpers/generate-shell-wrappers.ts` — Context-aware wrapper generation
- `packages/luca-framework/src/commands/build.ts` — New CLI subcommand
- `.claude/.build-manifest.json` — Extended with artifact counts
