# Plan 11-04: Shell Injection Fixes & Shared Hook Library

## Frontmatter

- **ID**: 11-04
- **Title**: Shell Injection Fixes & Shared Hook Library
- **Phase**: 11 (Hooks)
- **Wave**: 1
- **Depends on**: None
- **Delivers**: Roadmap items "Fix shell variable interpolation" and "Create hook \_lib/ shared library"

## Objective

Fix the shell injection vulnerability where `$PROJECT_DIR` is interpolated directly into `bun -e` JavaScript strings (allowing path traversal / code injection if the directory path contains shell metacharacters), and extract duplicated shell functions (`run_bridge()`, `read_runtime()`, `read_session_id()`) into a shared `_lib/common.sh` library sourced by all hook scripts. Extend the build pipeline to copy the `_lib/` directory to all output directories.

## Context

- `src/hooks/scripts/context-check-throttled.sh` -- line 133: `$PROJECT_DIR` in `bun -e` JS string
- `src/hooks/scripts/post-edit-typecheck.sh` -- line 178: `$PROJECT_DIR` in `bun -e` JS string
- `src/hooks/scripts/pre-commit-gate.sh` -- lines 229, 247: `$PROJECT_DIR` in `bun -e` JS strings (2 occurrences)
- `src/hooks/scripts/session-persist.sh` -- line 82: `$PROJECT_DIR` in `bun -e` JS string
- `src/hooks/scripts/snapshot-sync.sh` -- uses `$PROJECT_DIR` safely (file path variable, not in JS strings)
- `src/hooks/scripts/session-start.sh` -- uses `$PROJECT_DIR` safely (shell-only context)
- `src/hooks/scripts/pre-commit-drift-check.sh` -- uses `$PROJECT_DIR` safely (cd commands)
- `src/hooks/scripts/post-edit-format.sh` -- contains `read_runtime()` duplicate
- `src/hooks/pi-extensions/__helpers/hook-handlers.ts` -- line 86: `${filePath}` interpolated into shell command string (different class: TypeScript string interpolation into shell command)
- `scripts/build-shared.ts` -- `generateHookOutputs()` function (lines 676-711) copies scripts but NOT subdirectories

## Tasks

### 1. Create shared hook library `_lib/common.sh`

**Type:** auto
**TDD:** false
**Depends on:** None

Create `src/hooks/scripts/_lib/common.sh` containing the three shared functions extracted from existing hook scripts:

1. **`run_bridge()`** -- Cascading bridge lookup (6 scripts have byte-identical copies)
2. **`read_runtime()`** -- Runtime detection from `.planning/config.json` with command fallback (3 scripts have copies)
3. **`read_session_id()`** -- Extract `session_id` from `state.json` using `process.env` pattern (5 scripts have the inline bun -e block)

The `read_session_id()` function must use the safe `process.env.PROJECT_DIR` pattern (not `$PROJECT_DIR` interpolation) so this task inherently fixes the injection for session ID extraction.

Path resolution: Use `BASH_SOURCE[0]` to locate the `_lib/` directory relative to the sourcing script, making it portable across platforms.

**Files to create:**

- `src/hooks/scripts/_lib/common.sh`

**Verification:**

- File exists at `src/hooks/scripts/_lib/common.sh`
- Contains `run_bridge()`, `read_runtime()`, `read_session_id()` functions
- `read_session_id()` uses `process.env.PROJECT_DIR` (NOT `$PROJECT_DIR` in JS strings)
- `shellcheck src/hooks/scripts/_lib/common.sh` passes (if shellcheck available)

### 2. Fix shell injection in hook scripts and source shared library

**Type:** auto
**TDD:** false
**Depends on:** 1

Update all 9 hook scripts in `src/hooks/scripts/`:

**Injection fixes (5 files, 5 occurrences of `$PROJECT_DIR` in `bun -e` JS strings):**

- `context-check-throttled.sh` (line 133): Replace inline `bun -e` session ID block with `read_session_id` call
- `post-edit-typecheck.sh` (line 178): Replace inline `bun -e` session ID block with `read_session_id` call
- `pre-commit-gate.sh` (lines 229, 247): Replace both inline `bun -e` session ID blocks with `read_session_id` calls
- `session-persist.sh` (line 82): Replace inline `bun -e` session ID block with `read_session_id` call

**DRY extraction (all 9 scripts):**

- Add `source` line near the top of each script: resolve `_lib/common.sh` path via `BASH_SOURCE[0]`
- Remove inline `run_bridge()` function definitions (6 scripts)
- Remove inline `read_runtime()` function definitions (3 scripts)
- Remove inline `bun -e` session ID extraction blocks (5 scripts, replaced by `read_session_id` call)

**Pattern for sourcing:**

```bash
# Source shared hook library
HOOK_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${HOOK_SCRIPT_DIR}/_lib/common.sh"
```

**Files to edit:**

- `src/hooks/scripts/context-check-throttled.sh`
- `src/hooks/scripts/context-monitor.sh`
- `src/hooks/scripts/post-edit-format.sh`
- `src/hooks/scripts/post-edit-typecheck.sh`
- `src/hooks/scripts/pre-commit-drift-check.sh`
- `src/hooks/scripts/pre-commit-gate.sh`
- `src/hooks/scripts/session-persist.sh`
- `src/hooks/scripts/session-start.sh`
- `src/hooks/scripts/snapshot-sync.sh`

**Verification:**

- No remaining `$PROJECT_DIR` inside `bun -e` JS strings: `grep -rn "Bun.file('\$PROJECT_DIR" src/hooks/scripts/` returns 0 results
- All scripts source `_lib/common.sh`
- No inline `run_bridge()` definitions remain (except in `_lib/common.sh`)
- `bunx --bun tsc --noEmit` passes (no TypeScript regressions)

### 3. Fix Pi hook-handlers.ts shell command injection

**Type:** auto
**TDD:** false
**Depends on:** None

Fix `src/hooks/pi-extensions/__helpers/hook-handlers.ts` line 86 where `filePath` is interpolated directly into a shell command string without escaping:

```typescript
// BEFORE (vulnerable):
const cmd = `${getFormatterCmd(rt)} --write "${filePath}"`;

// AFTER (safe):
const cmd = `${getFormatterCmd(rt)} --write ${shellEscape(filePath)}`;
```

Add a `shellEscape()` helper (or use an existing one) that properly quotes the path to prevent injection via filenames containing shell metacharacters (`;`, `$`, backticks, etc.).

**Files to edit:**

- `src/hooks/pi-extensions/__helpers/hook-handlers.ts`

**Verification:**

- `filePath` is no longer directly interpolated into shell command strings
- A shell-safe quoting mechanism is applied
- `bunx --bun tsc --noEmit` passes

### 4. Extend build pipeline to copy `_lib/` directory

**Type:** auto
**TDD:** false
**Depends on:** 1

Update `scripts/build-shared.ts` function `generateHookOutputs()` (line 676) to also copy the `_lib/` subdirectory alongside hook scripts to all three output directories:

- `.claude/hooks/_lib/common.sh`
- `.cursor/hooks/_lib/common.sh`
- `.pi/hook-scripts/_lib/common.sh`

The function currently iterates `resolved` hook entries and copies their `.script` files. Add logic to also scan `src/hooks/scripts/_lib/` and copy all files within to the corresponding `_lib/` subdirectory in each output directory.

Also update the plugin hook output section to copy `_lib/` to `dist/plugin/scripts/_lib/`.

**Files to edit:**

- `scripts/build-shared.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- After next `bun run build:all` (run manually by user), `_lib/common.sh` exists in `.claude/hooks/_lib/`, `.cursor/hooks/_lib/`, and `.pi/hook-scripts/_lib/`

## Verification

1. `grep -rn "Bun.file('\$PROJECT_DIR" src/hooks/scripts/` returns 0 results (injection fixed)
2. `grep -rn "run_bridge()" src/hooks/scripts/*.sh` returns 0 results (only in `_lib/common.sh`)
3. `bunx --bun tsc --noEmit` passes with no new errors
4. All hook scripts have `source` line for `_lib/common.sh`
5. `scripts/build-shared.ts` `generateHookOutputs()` includes `_lib/` directory copying logic

## Success Criteria

- Zero `$PROJECT_DIR` interpolations inside JavaScript string contexts across all hook scripts
- All duplicated shell functions consolidated into single `_lib/common.sh` source
- Build pipeline extended to propagate `_lib/` directory to all output targets
- Pi hook-handlers.ts `filePath` injection fixed with proper escaping
- No TypeScript regressions

## Output Specification

- `src/hooks/scripts/_lib/common.sh` (new file)
- 9 modified hook scripts in `src/hooks/scripts/`
- `src/hooks/pi-extensions/__helpers/hook-handlers.ts` (modified)
- `scripts/build-shared.ts` (modified)
