---
phase: 171
plan: 1
type: bug
autonomous: true
wave: 1
depends_on: []
---

# Phase 171 Plan 1: Fix Shell Wrapper Path Resolution in Global Deploy

## Objective

Fix the "Module not found" error that occurs when hooks are deployed globally to `~/.claude/hooks/`. The shell wrappers use `$(dirname "$0")/../../src/hooks/scripts/` which resolves correctly inside the monorepo (`.claude/hooks/` -> `src/hooks/scripts/`) but breaks when copied to `~/.claude/hooks/` because `~/../src/` does not exist.

The fix goes in `scripts/deploy-global.ts` — after copying each `.sh` file, rewrite the relative `$(dirname "$0")/...` path to an absolute path pointing back to the monorepo's `src/hooks/scripts/`.

**CRITICAL**: Do NOT modify `src/hooks/__helpers/generate-shell-wrappers.ts`. That file generates correct wrappers for the project-local case. The fix is deploy-time path rewriting only.

## Context

@scripts/deploy-global.ts (lines 315-394: deployHooks + deployStatusline)
@src/hooks/\_\_helpers/generate-shell-wrappers.ts (read-only — understand the wrapper template)
@.claude/hooks/context-monitor.sh (example of current wrapper output)
@.claude/statusline.sh (example of statusline wrapper — uses `../` prefix, not `../../`)

## Tasks

### 1. Add path rewriting to deployHooks()

**Type:** auto
**TDD:** false
**Depends on:** none

In `scripts/deploy-global.ts`, modify the `deployHooks()` function. After each `.sh` file is deployed (copied) to `~/.claude/hooks/`, read the file content and rewrite the `$(dirname "$0")/../../src/hooks/scripts/` pattern to use the absolute monorepo path instead.

The current wrapper pattern is:

```sh
exec bun "$(dirname "$0")/../../src/hooks/scripts/{name}.ts" "$@" <&0
```

After rewriting, deployed wrappers should read:

```sh
exec bun "{projectRoot}/src/hooks/scripts/{name}.ts" "$@" <&0
```

Where `{projectRoot}` is the value of `projectRoot` already available in the `deployHooks()` function signature.

Implementation approach:

1. After the `deployFile()` call and `chmodSync()` call for each script, add a post-deploy rewrite step
2. Read the file content from the target path
3. Replace the `$(dirname "$0")/../../src/hooks/scripts/` pattern with `${projectRoot}/src/hooks/scripts/`
4. Also replace the `$(dirname "$0")/../src/hooks/scripts/` pattern (used by statusline-level wrappers, though unlikely in hooks/)
5. Write the modified content back
6. Skip rewriting in dry-run mode

Also rewrite the `_lib/common.sh` files if they contain similar relative path patterns (check first).

**Files to create/edit:**

- `scripts/deploy-global.ts` — add rewriting logic inside `deployHooks()` after the deploy loop

**Verification:**

- The `deployHooks()` function contains a path rewriting step after each `.sh` deploy
- The regex/string replacement handles the `../../src/hooks/scripts/` pattern
- Dry-run mode skips rewriting
- `projectRoot` is used as the absolute path prefix

### 2. Add path rewriting to deployStatusline()

**Type:** auto
**TDD:** false
**Depends on:** none

The statusline wrapper uses a different prefix (`../src/hooks/scripts/` instead of `../../src/hooks/scripts/`). Apply the same path rewriting treatment in `deployStatusline()`.

The current statusline wrapper:

```sh
exec bun "$(dirname "$0")/../src/hooks/scripts/statusline.ts" "$@" <&0
```

After rewriting:

```sh
exec bun "{projectRoot}/src/hooks/scripts/statusline.ts" "$@" <&0
```

Implementation approach:

1. After `deployFile()` and `chmodSync()` in `deployStatusline()`, read the target file
2. Replace `$(dirname "$0")/../src/hooks/scripts/` with `${projectRoot}/src/hooks/scripts/`
3. Also handle the `../../` variant for robustness
4. Write the modified content back
5. Skip in dry-run mode

Since `deployStatusline()` receives `projectRoot` as its parameter, this is straightforward.

**Files to create/edit:**

- `scripts/deploy-global.ts` — add rewriting logic inside `deployStatusline()`

**Verification:**

- The `deployStatusline()` function contains a path rewriting step
- Both `../` and `../../` prefix patterns are handled
- Dry-run mode skips rewriting

### 3. Extract rewriting into a shared helper

**Type:** auto
**TDD:** false
**Depends on:** 1, 2

To avoid duplication between `deployHooks()` and `deployStatusline()`, extract the path rewriting logic into a shared helper function within `deploy-global.ts`.

```typescript
/**
 * Rewrites relative paths in a deployed shell wrapper to absolute monorepo paths.
 * Replaces $(dirname "$0")/../../src/ and $(dirname "$0")/../src/ patterns
 * with {projectRoot}/src/.
 */
function rewriteWrapperPaths(targetPath: string, projectRoot: string): void {
  if (dryRun) return;
  const content = readFileSync(targetPath, "utf-8");
  const rewritten = content
    .replace(/\$\(dirname "\$0"\)\/\.\.\/\.\.\//g, `${projectRoot}/`)
    .replace(/\$\(dirname "\$0"\)\/\.\.\//g, `${projectRoot}/`);
  if (rewritten !== content) {
    writeFileSync(targetPath, rewritten);
  }
}
```

Then call `rewriteWrapperPaths(targetPath, projectRoot)` in both `deployHooks()` and `deployStatusline()`.

**Files to create/edit:**

- `scripts/deploy-global.ts` — add helper function, refactor both deploy functions to use it

**Verification:**

- A `rewriteWrapperPaths()` helper exists in `deploy-global.ts`
- Both `deployHooks()` and `deployStatusline()` call it
- The helper handles both `../../` and `../` patterns (order matters: replace longer pattern first)
- No duplication between the two deploy functions

## Verification

1. Run `bunx --bun tsc --noEmit` to verify TypeScript compiles
2. Read the modified `scripts/deploy-global.ts` and confirm:
   - A `rewriteWrapperPaths()` function exists
   - It replaces `$(dirname "$0")/../../` and `$(dirname "$0")/../` with `{projectRoot}/`
   - It is called after each `.sh` file is deployed in `deployHooks()` and `deployStatusline()`
   - It is skipped in dry-run mode
   - It handles both prefix lengths (the `../../` pattern MUST be matched before `../` to avoid partial replacement)

## Success Criteria

- Shell wrappers deployed to `~/.claude/hooks/` contain absolute paths to the monorepo's `src/hooks/scripts/` directory
- The statusline wrapper deployed to `~/.claude/statusline.sh` also uses an absolute path
- The original wrapper generation in `generate-shell-wrappers.ts` is NOT modified
- TypeScript compiles without errors

## Output Specification

- Modified file: `scripts/deploy-global.ts` with `rewriteWrapperPaths()` helper and calls in both deploy functions
