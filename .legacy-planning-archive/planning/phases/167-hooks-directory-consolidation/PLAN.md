---
phase: 167
plan: 1
type: improvement
autonomous: true
wave: 1
depends_on: []
---

# Phase 167 Plan 1: Hooks Directory Consolidation

## Objective

Eliminate the layered `impl/` and `adapters/` subdirectories from `src/hooks/`, consolidating to the standard domain architecture pattern (`__schemas/`, `__helpers/`, `scripts/`). The current structure has three redundant layers: `.sh` shims in `scripts/`, `.ts` implementations in `impl/`, and generated copies in `.claude/hooks/`. This phase collapses them into a single source of truth where `.ts` files in `scripts/` are the hook implementations and a build-time generator produces `.sh` wrappers automatically.

Executed in three waves to keep each step independently verifiable.

## Context

- @src/hooks/impl/ — 15 TypeScript hook implementations to move
- @src/hooks/impl/\_\_helpers/ — 4 helper modules (bridge.ts, vault.ts, muninn.ts, hook-io.ts) to move
- @src/hooks/adapters/ — adapter-registry.ts, adapter.schemas.ts, claude.adapter.ts, index.ts to redistribute
- @src/hooks/scripts/ — 15 .sh shims to delete
- @src/hooks/\_\_helpers/ — existing helpers (hook-registry.ts, config-generators.ts, platform-adapters.ts, portable-hook.ts)
- @src/hooks/\_\_schemas/ — existing schema (hook.schemas.ts)
- @src/hooks/index.ts — barrel to update
- @scripts/build-shared.ts — generateHookOutputs() to update
- @.planning/phases/167-hooks-directory-consolidation/167-CONTEXT.md — all architecture decisions

## Tasks

### 1. Wave 1 — Move impl/**helpers/ to **helpers/

**Type:** auto
**TDD:** false
**Depends on:** —

Move the 4 shared helper files from `src/hooks/impl/__helpers/` to `src/hooks/__helpers/` using `git mv` to preserve history. These files are imported by all 15 hook implementations using `./__helpers/` paths. The files themselves import each other, but those intra-helper paths remain unchanged since all four land in the same destination directory.

**Files to create/edit:**

- `git mv src/hooks/impl/__helpers/bridge.ts src/hooks/__helpers/bridge.ts`
- `git mv src/hooks/impl/__helpers/vault.ts src/hooks/__helpers/vault.ts`
- `git mv src/hooks/impl/__helpers/muninn.ts src/hooks/__helpers/muninn.ts`
- `git mv src/hooks/impl/__helpers/hook-io.ts src/hooks/__helpers/hook-io.ts`
- Update `src/hooks/__helpers/bridge.ts` — fix any relative imports that pointed to peer files (`./hook-io.ts` still resolves correctly since bridge and hook-io now live in the same directory)
- Update `src/hooks/__helpers/muninn.ts` — same check
- Update `src/hooks/__helpers/vault.ts` — same check

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `src/hooks/impl/__helpers/` directory no longer exists
- All four files appear under `src/hooks/__helpers/`

### 2. Wave 1 — Update import paths in the 15 hook implementations

**Type:** auto
**TDD:** false
**Depends on:** Task 1

All 15 hook implementation files import their helpers with `./__helpers/...` (relative to `impl/`). After the helpers move, those files still live in `impl/` temporarily, so the paths must be updated to `../__helpers/...` to point to the new location. This must be done before Wave 3 moves the implementations, because Task 1 has already moved the destination.

The import pattern to update across all 15 files:

```
"./__helpers/hook-io.ts"  → "../__helpers/hook-io.ts"
"./__helpers/bridge.ts"   → "../__helpers/bridge.ts"
"./__helpers/vault.ts"    → "../__helpers/vault.ts"
"./__helpers/muninn.ts"   → "../__helpers/muninn.ts"
```

Files to update (each has one to four of these imports):

- `src/hooks/impl/context-check-throttled.ts`
- `src/hooks/impl/context-monitor.ts`
- `src/hooks/impl/post-edit-format.ts`
- `src/hooks/impl/post-edit-typecheck.ts`
- `src/hooks/impl/post-tool-use-failure.ts`
- `src/hooks/impl/pre-commit-drift-check.ts`
- `src/hooks/impl/pre-commit-gate.ts`
- `src/hooks/impl/pre-compact-checkpoint.ts`
- `src/hooks/impl/session-compact-restore.ts`
- `src/hooks/impl/session-persist.ts`
- `src/hooks/impl/session-start.ts`
- `src/hooks/impl/snapshot-sync.ts`
- `src/hooks/impl/statusline.ts`
- `src/hooks/impl/subagent-stop.ts`
- `src/hooks/impl/user-prompt-submit.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- No remaining occurrences of `./__helpers/` in `src/hooks/impl/*.ts`

### 3. Wave 2 — Move adapter.schemas.ts to \_\_schemas/

**Type:** auto
**TDD:** false
**Depends on:** Task 2

Move `src/hooks/adapters/adapter.schemas.ts` to `src/hooks/__schemas/adapter.schemas.ts` using `git mv`. Update all files that import from `./adapter.schemas` (relative to `adapters/`) to use the new path:

- `src/hooks/adapters/claude.adapter.ts` — change `from "./adapter.schemas"` → `from "../__schemas/adapter.schemas"`
- `src/hooks/adapters/adapter-registry.ts` — change `from "./adapter.schemas"` → `from "../__schemas/adapter.schemas"`

**Files to create/edit:**

- `git mv src/hooks/adapters/adapter.schemas.ts src/hooks/__schemas/adapter.schemas.ts`
- `src/hooks/adapters/claude.adapter.ts` — update import path
- `src/hooks/adapters/adapter-registry.ts` — update import path

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `src/hooks/__schemas/` now contains both `hook.schemas.ts` and `adapter.schemas.ts`

### 4. Wave 2 — Move claude.adapter.ts and adapter-registry.ts to \_\_helpers/

**Type:** auto
**TDD:** false
**Depends on:** Task 3

Move the two runtime adapter files from `adapters/` to `__helpers/` using `git mv`. Then deduplicate `CLAUDE_EVENT_MAP`: the canonical version lives in `platform-adapters.ts`; the copy in `claude.adapter.ts` is removed and replaced with an import.

After the moves, update cross-file imports:

- `src/hooks/__helpers/claude-adapter.ts` (was claude.adapter.ts) — remove local `CLAUDE_EVENT_MAP` definition, import it from `./platform-adapters` instead
- `src/hooks/__helpers/adapter-registry.ts` (was adapter-registry.ts) — update `from "./claude.adapter"` → `from "./claude-adapter"` and `from "./adapter.schemas"` → `from "../__schemas/adapter.schemas"`
- `src/hooks/adapters/index.ts` — will be deleted in Task 6; no update needed here

Note: `claude.adapter.ts` becomes `claude-adapter.ts` (kebab-case, no dot in middle) in `__helpers/`.

**Files to create/edit:**

- `git mv src/hooks/adapters/claude.adapter.ts src/hooks/__helpers/claude-adapter.ts`
- `git mv src/hooks/adapters/adapter-registry.ts src/hooks/__helpers/adapter-registry.ts`
- `src/hooks/__helpers/claude-adapter.ts` — remove duplicate `CLAUDE_EVENT_MAP`, import from `./platform-adapters`
- `src/hooks/__helpers/adapter-registry.ts` — fix import paths for claude-adapter and adapter.schemas

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Only one definition of `CLAUDE_EVENT_MAP` exists in `src/hooks/__helpers/platform-adapters.ts`
- `src/hooks/__helpers/` now contains `claude-adapter.ts` and `adapter-registry.ts`

### 5. Wave 3 — Move 15 hook implementations from impl/ to scripts/

**Type:** auto
**TDD:** false
**Depends on:** Task 4

Move all 15 TypeScript hook implementations from `src/hooks/impl/` to `src/hooks/scripts/` using `git mv`. After Wave 1/2 the import paths in these files already point to `../__helpers/`, which remains correct after this move (they go from `impl/*.ts` to `scripts/*.ts`, same depth relative to `__helpers/`).

The `.sh` shim files currently in `scripts/` will be deleted in Task 7; staging both changes together is fine since git mv and rm are tracked separately.

Files to move (15):

- `src/hooks/impl/context-check-throttled.ts`
- `src/hooks/impl/context-monitor.ts`
- `src/hooks/impl/post-edit-format.ts`
- `src/hooks/impl/post-edit-typecheck.ts`
- `src/hooks/impl/post-tool-use-failure.ts`
- `src/hooks/impl/pre-commit-drift-check.ts`
- `src/hooks/impl/pre-commit-gate.ts`
- `src/hooks/impl/pre-compact-checkpoint.ts`
- `src/hooks/impl/session-compact-restore.ts`
- `src/hooks/impl/session-persist.ts`
- `src/hooks/impl/session-start.ts`
- `src/hooks/impl/snapshot-sync.ts`
- `src/hooks/impl/statusline.ts`
- `src/hooks/impl/subagent-stop.ts`
- `src/hooks/impl/user-prompt-submit.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `src/hooks/scripts/` now contains 15 `.ts` files (alongside the 15 `.sh` files that will be deleted in Task 7)
- `src/hooks/impl/` is empty (ready for deletion)

### 6. Wave 3 — Update hook-registry.ts script field extensions

**Type:** auto
**TDD:** false
**Depends on:** Task 5

Change each `script` field in `canonicalHookRegistry` from `.sh` to `.ts`. The registry has 15 entries; each `script` value like `"post-edit-format.sh"` becomes `"post-edit-format.ts"`. This is the signal the shell wrapper generator (Task 8) will use to construct the wrapper content.

**Files to create/edit:**

- `src/hooks/__helpers/hook-registry.ts` — change all `.sh` → `.ts` in `script` field values

**Verification:**

- `bunx --bun tsc --noEmit` passes
- No remaining `.sh` references in the `canonicalHookRegistry` entries

### 7. Wave 3 — Delete .sh shims, impl/, adapters/ directories

**Type:** auto
**TDD:** false
**Depends on:** Task 6

Delete the 15 `.sh` shim files from `src/hooks/scripts/` (they are replaced by the generator in Task 8), then delete the now-empty `src/hooks/impl/` and `src/hooks/adapters/` directories. Also delete `src/hooks/adapters/index.ts` (the sub-barrel that re-exported adapter symbols).

```bash
rm src/hooks/scripts/context-check-throttled.sh
rm src/hooks/scripts/context-monitor.sh
rm src/hooks/scripts/post-edit-format.sh
rm src/hooks/scripts/post-edit-typecheck.sh
rm src/hooks/scripts/post-tool-use-failure.sh
rm src/hooks/scripts/pre-commit-drift-check.sh
rm src/hooks/scripts/pre-commit-gate.sh
rm src/hooks/scripts/pre-compact-checkpoint.sh
rm src/hooks/scripts/session-compact-restore.sh
rm src/hooks/scripts/session-persist.sh
rm src/hooks/scripts/session-start.sh
rm src/hooks/scripts/snapshot-sync.sh
rm src/hooks/scripts/statusline.sh
rm src/hooks/scripts/subagent-stop.sh
rm src/hooks/scripts/user-prompt-submit.sh
rm src/hooks/adapters/index.ts
rmdir src/hooks/impl
rmdir src/hooks/adapters
```

**Verification:**

- `src/hooks/scripts/` contains only `.ts` files
- `src/hooks/impl/` does not exist
- `src/hooks/adapters/` does not exist

### 8. Wave 3 — Create generate-shell-wrappers.ts

**Type:** auto
**TDD:** false
**Depends on:** Task 7

Create `src/hooks/__helpers/generate-shell-wrappers.ts`. This build-time helper reads `canonicalHookRegistry`, resolves each entry, and generates a `.sh` wrapper for each hook. The wrapper content is:

```sh
#!/bin/sh
exec bun "$(dirname "$0")/../../scripts/{hook-name}.ts" "$@" <&0
```

The generator function signature:

```typescript
/**
 * Generates shell wrapper content for a single hook.
 *
 * @param hookName - Canonical hook name (e.g. "post-edit-format")
 * @returns Shell script string with exec bun invocation
 */
export function generateShellWrapper(hookName: string): string;

/**
 * Generates shell wrappers for all hooks in the canonical registry.
 *
 * @returns Record mapping output path (e.g. ".claude/hooks/post-edit-format.sh")
 *          to shell script content
 */
export function generateAllShellWrappers(): Record<string, string>;
```

The `statusline.sh` wrapper is special: it goes to `.claude/statusline.sh` (not `.claude/hooks/`). Handle it by checking if the hook name is `"statusline"`.

**Files to create/edit:**

- `src/hooks/__helpers/generate-shell-wrappers.ts` — new file

**Verification:**

- `bunx --bun tsc --noEmit` passes
- File exports `generateShellWrapper` and `generateAllShellWrappers`
- Calling `generateShellWrapper("post-edit-format")` returns a string containing `exec bun` and `post-edit-format.ts`

### 9. Wave 3 — Update build-shared.ts generateHookOutputs()

**Type:** auto
**TDD:** false
**Depends on:** Task 8

Update `scripts/build-shared.ts` `generateHookOutputs()` to call `generateAllShellWrappers()` from the new generator instead of reading `.sh` files from disk. Also clean up the dead code that attempts to copy `_lib/common.sh` (that file does not exist).

The updated function:

1. Import `generateAllShellWrappers` from `../src/hooks/__helpers/generate-shell-wrappers`
2. Replace the loop that reads `.sh` files with a call to `generateAllShellWrappers()` and merging the results into `generated`
3. Remove the `_lib/common.sh` copy block entirely (dead code — file never existed)
4. Keep the `statusline.sh` generation (the generator handles the path correctly for statusline)
5. Keep the Claude `settings.json` hooks fragment generation unchanged

**Files to create/edit:**

- `scripts/build-shared.ts` — update `generateHookOutputs()` function and its import block

**Verification:**

- `bunx --bun tsc --noEmit` passes
- No remaining references to `_lib/common.sh` in build-shared.ts
- `generateHookOutputs` no longer reads from `src/hooks/scripts/*.sh`

### 10. Wave 3 — Update hooks/index.ts barrel

**Type:** auto
**TDD:** false
**Depends on:** Task 9

Update `src/hooks/index.ts` to replace the `./adapters` barrel import with direct imports from `__schemas/` and `__helpers/`. The `adapters/index.ts` sub-barrel was deleted in Task 7. All the symbols it exported must now come from their new locations.

Replace:

```typescript
export {
  ADAPTER_PLATFORMS,
  adapterPlatformSchema,
  claudeAdapter,
  hookAdapterRegistry,
  resolveAdapter,
  getRegisteredPlatforms,
  generateConfigForPlatform,
} from "./adapters";
export type { AdapterPlatform, HookPlatformAdapter } from "./adapters";
```

With:

```typescript
export {
  ADAPTER_PLATFORMS,
  adapterPlatformSchema,
} from "./__schemas/adapter.schemas";
export type {
  AdapterPlatform,
  HookPlatformAdapter,
} from "./__schemas/adapter.schemas";

export { claudeAdapter } from "./__helpers/claude-adapter";

export {
  hookAdapterRegistry,
  resolveAdapter,
  getRegisteredPlatforms,
  generateConfigForPlatform,
} from "./__helpers/adapter-registry";
```

**Files to create/edit:**

- `src/hooks/index.ts` — update adapter-related exports

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `src/hooks/index.ts` contains no references to `./adapters`
- All previously-exported symbols remain accessible via the barrel

### 11. Final typecheck and structural verification

**Type:** checkpoint:human-verify
**TDD:** false
**Depends on:** Task 10

Run a final typecheck and verify the resulting directory structure matches the target from 167-CONTEXT.md.

```bash
bunx --bun tsc --noEmit
```

Expected `src/hooks/` structure:

```
src/hooks/
├── __schemas/
│   ├── hook.schemas.ts
│   └── adapter.schemas.ts
├── __helpers/
│   ├── hook-registry.ts
│   ├── config-generators.ts
│   ├── portable-hook.ts
│   ├── platform-adapters.ts
│   ├── bridge.ts
│   ├── vault.ts
│   ├── muninn.ts
│   ├── hook-io.ts
│   ├── claude-adapter.ts
│   ├── adapter-registry.ts
│   └── generate-shell-wrappers.ts
├── scripts/
│   └── *.ts (15 hook implementations)
└── index.ts
```

**Verification:**

- `bunx --bun tsc --noEmit` exits 0
- `src/hooks/impl/` does not exist
- `src/hooks/adapters/` does not exist
- `src/hooks/scripts/` contains exactly 15 `.ts` files and zero `.sh` files
- `src/hooks/__helpers/` contains 11 files (4 existing + 4 moved from impl/\_\_helpers/ + 2 moved from adapters/ + 1 new)
- `src/hooks/__schemas/` contains 2 files
- No `.sh` references remain in `canonicalHookRegistry` script fields
- No `./adapters` references remain in `src/hooks/index.ts`

## Verification

After all tasks complete:

1. `bunx --bun tsc --noEmit` — no errors
2. Directory structure matches target (no `impl/`, no `adapters/`)
3. `src/hooks/scripts/` contains only `.ts` files
4. `generate-shell-wrappers.ts` exports `generateShellWrapper` and `generateAllShellWrappers`
5. `build-shared.ts` uses the generator — no `.sh` file reads, no dead `_lib/common.sh` block
6. `CLAUDE_EVENT_MAP` has exactly one definition (in `platform-adapters.ts`)
7. All hook-registry script fields reference `.ts` extensions

User runs `bun run build:all` outside Claude Code after this phase to verify generated `.claude/hooks/*.sh` wrappers point to `scripts/*.ts`.

## Success Criteria

- `src/hooks/` follows the standard domain architecture: `__schemas/`, `__helpers/`, `scripts/`, `index.ts`
- Zero redundant directories (`impl/`, `adapters/`) remain
- Zero `.sh` shims remain as source files (all `.sh` are now build artifacts)
- `bunx --bun tsc --noEmit` exits 0
- Shell wrapper generator is the single source of truth for `.sh` wrapper content

## Output Specification

- `src/hooks/__helpers/generate-shell-wrappers.ts` (new)
- 4 files moved: `impl/__helpers/*.ts` → `__helpers/*.ts`
- 2 files moved: `adapters/claude.adapter.ts` → `__helpers/claude-adapter.ts`, `adapters/adapter-registry.ts` → `__helpers/adapter-registry.ts`
- 1 file moved: `adapters/adapter.schemas.ts` → `__schemas/adapter.schemas.ts`
- 15 files moved: `impl/*.ts` → `scripts/*.ts`
- 15 files deleted: `scripts/*.sh`
- 2 files deleted: `adapters/index.ts`, and `impl/` and `adapters/` directories
- 5 files updated: `hook-registry.ts`, `hooks/index.ts`, `build-shared.ts`, `claude-adapter.ts`, `adapter-registry.ts`
- 15 files updated: all hook implementations (import path fix)
