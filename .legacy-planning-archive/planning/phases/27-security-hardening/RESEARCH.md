# Phase 27: Security Hardening — Research

## Executive Summary

Phase 27 addresses all 5 LOW-severity security findings from the v1.3.0 milestone audit. All findings are surgical fixes — no architectural changes required. The work naturally groups into two parallel plans:

- **Plan 01 (Hook Hardening)**: SEC-01, SEC-02, SEC-05 — Three hook script fixes across 3 source files (each compiled to 3 locations)
- **Plan 02 (Build Pipeline + Schema Hardening)**: SEC-03, SEC-04 — One build utility guard + one schema constraint addition

Estimated total effort: ~2-3 hours. All 5 fixes are isolated and independently testable.

---

## Per-Requirement Analysis

### SEC-01: Validate `transcript_path` in `context-monitor.sh`

**Source file**: `src/hooks/scripts/context-monitor.sh` (lines 42-47)

**Current code**:

```bash
# Extract transcript path
TRANSCRIPT_PATH=$(printf '%s' "$INPUT" | bun -e "
  const data = JSON.parse(await Bun.stdin.text());
  const tp = data.transcript_path;
  if (tp) process.stdout.write(tp);
")

# Used at line 53:
if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
  FILE_SIZE=$(wc -c < "$TRANSCRIPT_PATH" | tr -d ' ')
```

**Vulnerability**: The `transcript_path` value is extracted from stdin JSON and used directly in a `[ -f ]` check and `wc -c` command. While the `-f` check prevents non-existent paths from being read, there are two gaps:

1. **No path traversal guard**: A crafted `transcript_path` like `../../etc/passwd` would pass the `-f` check and have its size read. While this only leaks file _size_ (not content), it violates the principle of least privilege.
2. **No existence validation before use**: The path is trusted to be a real transcript file. If an attacker controlled the stdin JSON, they could point it at any readable file.

**Mitigating factors**: The stdin JSON comes from Claude Code / Cursor, not from external users. The risk is very low. Additionally, line 53 already checks `[ -f "$TRANSCRIPT_PATH" ]`, preventing errors on non-existent files.

**Proposed fix**: Add a path validation block after extracting `TRANSCRIPT_PATH` (between lines 47 and 49):

1. Verify the path is absolute (starts with `/`)
2. Verify the path is within a known safe directory (e.g., check it contains a known transcript directory pattern, or verify it's under `$HOME`)
3. Optionally use `realpath` to resolve symlinks and re-check containment

```bash
# Validate transcript path: must be absolute and exist as a regular file
if [ -n "$TRANSCRIPT_PATH" ]; then
  # Reject relative paths (must be absolute)
  case "$TRANSCRIPT_PATH" in
    /*) ;; # absolute path — OK
    *)
      TRANSCRIPT_PATH=""  # reject relative paths
      ;;
  esac
fi

# Resolve symlinks and verify path is within home directory
if [ -n "$TRANSCRIPT_PATH" ]; then
  RESOLVED_PATH=$(realpath "$TRANSCRIPT_PATH" 2>/dev/null || echo "")
  case "$RESOLVED_PATH" in
    "$HOME"/*) ;; # within home directory — OK
    *)
      TRANSCRIPT_PATH=""  # outside home directory — reject
      ;;
  esac
fi
```

**Blast radius**: Read-only check. No behavioral change for legitimate transcript paths. Zero risk of breaking existing functionality since valid Claude Code transcript paths are always absolute paths under `$HOME`.

---

### SEC-02: Sanitize `END_REASON` in `session-persist.sh`

**Source file**: `src/hooks/scripts/session-persist.sh` (lines 24-27, 48-58, 61)

**Current code**:

```bash
# Extract session end reason (for logging)
END_REASON=$(printf '%s' "$INPUT" | bun -e "
  const data = JSON.parse(await Bun.stdin.text());
  process.stdout.write(data.reason || 'unknown');
")

# Used in two places:

# Place 1 (line 48-58): Regex replacement inside bun -e
content = content.replace(
  /\*Session ended:.*\*/,
  '*Session ended: ' + ts + ' (reason: ' + reason + ')*'
);

# Place 2 (line 61): printf into markdown file
printf '\n\n---\n*Session ended: %s (reason: %s)*\n' "$TIMESTAMP" "$END_REASON" >> "$WORKING_MD"
```

**Vulnerability**: The `END_REASON` value is extracted from stdin JSON `data.reason` and interpolated directly into WORKING.md markdown content without sanitization. Potential issues:

1. **Markdown injection**: A reason string containing `](https://evil.com)` or `\n## Injected Header` could inject arbitrary markdown into WORKING.md.
2. **Regex injection (Place 1)**: The `reason` value is used in a string replacement. While it's not in the regex pattern itself, special characters like `$` or backtick sequences could produce unexpected replacement results.
3. **Shell injection (Place 2)**: The `$END_REASON` variable is used in a `printf` format string. While `%s` is safe against format string attacks, the value itself is unescaped in the output.

**Mitigating factors**: WORKING.md is a developer-facing session log, not rendered in a browser or executed. The risk is cosmetic/informational rather than exploitable. The reason values come from Claude Code/Cursor, which sends predictable strings like `"user_request"`, `"timeout"`, `"error"`.

**Proposed fix**: Sanitize `END_REASON` by stripping or replacing characters that could break markdown structure. Add sanitization after extraction (after line 27):

```bash
# Sanitize END_REASON: strip markdown-breaking characters
# Allow only alphanumeric, spaces, hyphens, underscores, periods
END_REASON=$(printf '%s' "$END_REASON" | tr -cd '[:alnum:] _.-')

# Truncate to reasonable length (prevent absurdly long reasons)
END_REASON="${END_REASON:0:100}"
```

**Blast radius**: Minimal. Known reason values (`user_request`, `timeout`, `error`, `unknown`) all pass the sanitization filter unchanged. Only exotic/unexpected values would be modified.

---

### SEC-03: Add root path guard to `cleanDirectory()` in `build-utils.ts`

**Source file**: `scripts/build-utils.ts` (lines 17-51)

**Current code**:

```typescript
export async function cleanDirectory(
  dir: string,
  extensions: string[],
): Promise<string[]> {
  const removed: string[] = [];
  let entries: string[];

  try {
    entries = await readdir(dir);
  } catch {
    return removed;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    try {
      const stat = await lstat(fullPath);
      if (stat.isSymbolicLink()) {
        await unlink(fullPath);
        removed.push(fullPath);
      } else if (stat.isDirectory()) {
        await rm(fullPath, { recursive: true });
        removed.push(fullPath);
      } else if (extensions.some((ext) => entry.endsWith(ext))) {
        await unlink(fullPath);
        removed.push(fullPath);
      }
    } catch (error) {
      console.warn(`Failed to clean ${fullPath}:`, error);
    }
  }
  return removed;
}
```

**Vulnerability**: `cleanDirectory()` accepts any `dir` string and will recursively delete subdirectories and unlink files matching the extensions. There is no guard preventing calls like:

- `cleanDirectory("/", [".md"])` — would attempt to delete markdown files from root
- `cleanDirectory("/Users", [".md"])` — would delete user files
- `cleanDirectory("/etc", [".sh"])` — would delete system scripts

While callers currently pass safe paths (`.claude/agents`, `.cursor/rules`, etc.), a future bug or refactor could introduce a dangerous call.

**Callers** (3 files):

- `scripts/build-claude.ts` — calls with `.claude/{agents,skills,rules,hooks}` paths
- `scripts/build-cursor.ts` — calls with `.cursor/{agents,skills,rules,hooks}` paths
- `scripts/build-all.ts` — calls with both `.claude/`, `.cursor/`, and `dist/plugin/` paths

All callers construct paths from `process.cwd()` + known relative segments, so the risk is low.

**Proposed fix**: Add a root path guard at the top of both `cleanDirectory()` and `cleanSkillsDirectory()`:

```typescript
/** Known safe root directories for clean operations. */
const SAFE_CLEAN_ROOTS = [".claude", ".cursor", "dist"];

/**
 * Validate that a directory path is within the project and within
 * an allowed output root. Throws if the path is unsafe.
 */
function assertSafeCleanTarget(dir: string): void {
  const resolved = path.resolve(dir);
  const projectRoot = path.resolve(process.cwd());

  // Must be within the project root
  if (
    !resolved.startsWith(projectRoot + path.sep) &&
    resolved !== projectRoot
  ) {
    throw new Error(
      `cleanDirectory() refused: "${dir}" is outside the project root "${projectRoot}"`,
    );
  }

  // Must be within an allowed output subdirectory
  const relative = path.relative(projectRoot, resolved);
  const isAllowed = SAFE_CLEAN_ROOTS.some(
    (root) => relative === root || relative.startsWith(root + path.sep),
  );

  if (!isAllowed) {
    throw new Error(
      `cleanDirectory() refused: "${relative}" is not within an allowed output directory (${SAFE_CLEAN_ROOTS.join(", ")})`,
    );
  }
}
```

Then call `assertSafeCleanTarget(dir)` as the first line in both `cleanDirectory()` and `cleanSkillsDirectory()`.

**Blast radius**: Zero impact on existing callers. All current invocations pass paths under `.claude/`, `.cursor/`, or `dist/plugin/`, which are within the allowed roots. Only dangerous future misuse would be caught. New tests should verify the guard rejects dangerous paths.

---

### SEC-04: Add description length + keywords array size limits to `pluginManifestSchema`

**Source file**: `src/compilers/plugin.types.ts` (lines 101-134)

**Current code**:

```typescript
export const pluginManifestSchema = z.object({
  name: z.string().min(1).regex(KEBAB_CASE_REGEX, "..."),
  version: z.string().regex(SEMVER_REGEX, "...").default("0.1.0"),
  description: z.string().optional(), // <-- No length limit
  author: pluginAuthorSchema.optional(),
  homepage: z.string().url().optional(),
  repository: z.string().url().optional(),
  license: z.string().default("MIT"),
  keywords: z.array(z.string()).default([]), // <-- No array size limit
});
```

**Vulnerability**: Two fields lack sensible bounds:

1. **`description`**: No maximum length. A manifest could have a multi-megabyte description, causing memory issues during validation, serialization, or display.
2. **`keywords`**: No maximum array size or per-keyword length limit. A manifest could contain thousands of keywords, or keywords that are each thousands of characters long.

These are not exploitable vulnerabilities but are defensive programming gaps. Plugin manifests may come from external sources (community plugins), making input validation important.

**Proposed fix**: Add constraints:

```typescript
/** Human-readable description of the plugin's purpose. */
description: z.string().max(500).optional(),

/** Searchable keywords / tags for discovery. Defaults to empty array. */
keywords: z
  .array(z.string().min(1).max(50))
  .max(20)
  .default([]),
```

Limits chosen:

- **Description**: 500 chars — generous for a summary, prevents abuse. npm uses 255 for `description`.
- **Keywords per item**: 50 chars — long enough for `"claude-code-integration"`, short enough to prevent abuse.
- **Keywords per item min**: 1 char — prevent empty strings.
- **Keywords array**: 20 items — generous for discoverability, prevents spam. npm allows 50.

**Blast radius**: The existing test suite (`src/compilers/plugin.types.test.ts`) has 303 lines of tests covering the schema thoroughly. Existing tests pass all valid values well within these limits. New tests should verify:

- Description at exactly 500 chars passes
- Description at 501 chars fails
- Keywords array with 20 items passes
- Keywords array with 21 items fails
- Individual keyword at 50 chars passes
- Individual keyword at 51 chars fails
- Empty string keyword fails

---

### SEC-05: Document `COMMAND` variable extraction logic in `pre-commit-gate.sh`

**Source file**: `src/hooks/scripts/pre-commit-gate.sh` (lines 29-46)

**Current code**:

```bash
# Extract the Bash command being executed
# Claude Code: tool_input.command, Cursor: command (top-level)
COMMAND=$(printf '%s' "$INPUT" | bun -e "
  const data = JSON.parse(await Bun.stdin.text());
  const cmd = data.tool_input?.command ?? data.command ?? '';
  process.stdout.write(cmd);
")

# Fast exit: Not a commit command? Allow immediately.
# This check must be near-instant since it runs on EVERY Bash call.
case "$COMMAND" in
  *"git commit"*|*"git merge"*|*"bun run commit"*|*"bunx commit"*|*"bunx --bun commit"*)
    # Potentially a commit command — continue to quality checks
    ;;
  *)
    # Not a commit command — allow immediately
    exit 0
    ;;
esac
```

**Analysis**: The extraction and matching logic is currently **safe** because:

1. The `COMMAND` value is extracted via `bun -e` JSON parsing — no shell injection possible in the extraction step.
2. The `case` statement uses shell glob matching (`*"git commit"*`), which is pattern matching — not command execution.
3. The `COMMAND` variable is never executed, only matched against patterns.
4. The `printf '%s'` format prevents format string attacks.

**However**, the logic is undocumented and could be misunderstood:

- A future maintainer might try to `eval "$COMMAND"` for some reason, not realizing it contains untrusted input.
- The dual-format extraction (`tool_input.command` for Claude, `command` for Cursor) is non-obvious.
- The glob pattern list could be extended without understanding the security implications.

**Proposed fix**: Add comprehensive documentation as a comment block. This is a documentation-only change:

```bash
# ─── COMMAND EXTRACTION: SECURITY NOTES ───────────────────────────────
#
# INPUT FORMAT (two platforms):
#   Claude Code: { "tool_input": { "command": "git commit -m 'msg'" } }
#   Cursor:      { "command": "git commit -m 'msg'" }
#
# EXTRACTION METHOD:
#   Uses bun -e with JSON.parse() to safely extract the command string.
#   No shell interpolation occurs — the command is never eval'd or exec'd.
#   The printf '%s' format prevents format string injection.
#
# MATCHING STRATEGY:
#   The case statement uses shell glob patterns (NOT regex).
#   Only substring matches are checked — the command is never executed.
#   This is safe because:
#     1. case/esac does pattern matching, not execution
#     2. $COMMAND is double-quoted, preventing word splitting
#     3. No eval, exec, or subshell uses $COMMAND
#
# MAINTENANCE WARNING:
#   - NEVER eval, exec, or source $COMMAND — it contains untrusted input
#   - NEVER use $COMMAND in arithmetic expressions
#   - Adding new case patterns is safe (glob matching only)
#   - If you need to pass $COMMAND to another tool, use environment
#     variables (like HOOK_CMD="$COMMAND" bun -e "...") — NOT arguments
# ──────────────────────────────────────────────────────────────────────
```

**Blast radius**: Zero. Documentation-only change. No behavioral change whatsoever.

---

## File Inventory and Blast Radius

### Source Files Modified

| #      | File                                   | Change Type                | Lines Changed (est.) |
| ------ | -------------------------------------- | -------------------------- | -------------------- |
| SEC-01 | `src/hooks/scripts/context-monitor.sh` | Add validation block       | +15 lines            |
| SEC-02 | `src/hooks/scripts/session-persist.sh` | Add sanitization           | +5 lines             |
| SEC-03 | `scripts/build-utils.ts`               | Add guard function + calls | +30 lines            |
| SEC-04 | `src/compilers/plugin.types.ts`        | Add `.max()` constraints   | +4 lines (net)       |
| SEC-05 | `src/hooks/scripts/pre-commit-gate.sh` | Add documentation block    | +18 lines            |

### Compiled Output Files (auto-generated, must be rebuilt)

Hook script changes (SEC-01, SEC-02, SEC-05) propagate to **3 output locations each** via the build pipeline:

| Source                                 | Built Copies                                                                                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/hooks/scripts/context-monitor.sh` | `.claude/hooks/context-monitor.sh`, `.cursor/hooks/context-monitor.sh`, `packages/luca-framework/templates/hooks/scripts/context-monitor.sh` |
| `src/hooks/scripts/session-persist.sh` | `.claude/hooks/session-persist.sh`, `.cursor/hooks/session-persist.sh`, `packages/luca-framework/templates/hooks/scripts/session-persist.sh` |
| `src/hooks/scripts/pre-commit-gate.sh` | `.claude/hooks/pre-commit-gate.sh`, `.cursor/hooks/pre-commit-gate.sh`, `packages/luca-framework/templates/hooks/scripts/pre-commit-gate.sh` |

**Note**: The `.claude/hooks/` and `.cursor/hooks/` copies are generated by `bun run build:claude` and `bun run build:cursor` (or `bun run build:all`). The `packages/luca-framework/templates/` copies are maintained manually or via a separate sync mechanism; the existing drift-check test (`scripts/check-drift.test.ts`) and template test (`__tests__/packages/luca-framework/hooks-template.test.ts`) verify they stay in sync.

### Consumer Files (no changes needed)

| File                      | Role                     | Impact                        |
| ------------------------- | ------------------------ | ----------------------------- |
| `scripts/build-claude.ts` | Calls `cleanDirectory()` | No change — passes safe paths |
| `scripts/build-cursor.ts` | Calls `cleanDirectory()` | No change — passes safe paths |
| `scripts/build-all.ts`    | Calls `cleanDirectory()` | No change — passes safe paths |

---

## Test Coverage Analysis

### Existing Tests

| File Under Change                | Existing Test File                                         | Coverage                                                                                                                                               |
| -------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/hooks/scripts/*.sh` (all 3) | `__tests__/src/hooks/hook-registry.test.ts`                | Tests registry metadata only (event types, matchers, script existence). Does NOT test script logic.                                                    |
| `src/hooks/scripts/*.sh` (all 3) | `__tests__/packages/luca-framework/hooks-template.test.ts` | Tests template sync and structure. Does NOT test script logic.                                                                                         |
| `src/compilers/plugin.types.ts`  | `src/compilers/plugin.types.test.ts`                       | **Comprehensive** — 303 lines covering regex, author schema, manifest schema, and `generatePluginManifest()`. Will need new tests for max constraints. |
| `scripts/build-utils.ts`         | None                                                       | **No existing tests**. Unit tests should be added for the path guard.                                                                                  |

### New Tests Needed

| Requirement | Test File                                       | Tests to Add                                                                                                                                                                                                                                                                     |
| ----------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-03      | `scripts/build-utils.test.ts` (NEW)             | - `cleanDirectory()` rejects paths outside project root<br>- `cleanDirectory()` rejects paths not in allowed roots<br>- `cleanDirectory()` accepts `.claude/agents` path<br>- `cleanDirectory()` accepts `dist/plugin/agents` path<br>- `cleanSkillsDirectory()` has same guards |
| SEC-04      | `src/compilers/plugin.types.test.ts` (EXISTING) | - Description at 500 chars passes<br>- Description at 501 chars fails<br>- Keywords array with 20 items passes<br>- Keywords array with 21 items fails<br>- Keyword at 50 chars passes<br>- Keyword at 51 chars fails<br>- Empty string keyword fails                            |

**SEC-01, SEC-02, SEC-05**: Hook scripts are shell scripts without existing unit tests. The changes are simple enough (validation, sanitization, documentation) that manual verification during build + existing drift-check tests provide sufficient coverage. Shell script unit testing would add complexity disproportionate to the risk level.

---

## Recommended Plan Structure

### Wave 1 (2 plans, parallel)

Both plans can run in parallel because they touch completely independent files.

#### Plan 01: Hook Script Hardening (SEC-01, SEC-02, SEC-05)

**Files**: 3 source scripts + their compiled copies (9 files total after build)

**Tasks**:

1. SEC-01: Add path validation to `context-monitor.sh`
2. SEC-02: Add reason sanitization to `session-persist.sh`
3. SEC-05: Add security documentation to `pre-commit-gate.sh`
4. Run `bun run build:all` to propagate changes to `.claude/hooks/`, `.cursor/hooks/`
5. Manually sync to `packages/luca-framework/templates/hooks/scripts/`
6. Verify existing tests pass (`bun test`)

**Complexity**: SIMPLE (3 files, all low-risk, all hook scripts with similar patterns)

#### Plan 02: Build Pipeline + Schema Hardening (SEC-03, SEC-04)

**Files**: `scripts/build-utils.ts`, `src/compilers/plugin.types.ts` + new test file

**Tasks**:

1. SEC-03: Add `assertSafeCleanTarget()` guard to `build-utils.ts`
2. SEC-04: Add `.max()` constraints to `pluginManifestSchema`
3. Create `scripts/build-utils.test.ts` with path guard tests
4. Add constraint boundary tests to `src/compilers/plugin.types.test.ts`
5. Verify all tests pass (`bun test`)

**Complexity**: SIMPLE (2 source files + 2 test files, all low-risk)

### Verification

Standard verification after both plans complete:

- `bun test` (all 945+ tests pass, 6 skip)
- `bunx --bun tsc --noEmit` (type-check passes)
- `bun run build:all` (build succeeds)
- Drift check: `bun test scripts/check-drift.test.ts` (templates in sync)

---

## Risk Assessment

| Requirement | Risk Level | Confidence | Notes                                                     |
| ----------- | ---------- | ---------- | --------------------------------------------------------- |
| SEC-01      | Very Low   | High       | Path validation is additive. Legitimate paths unaffected. |
| SEC-02      | Very Low   | High       | Known reason values pass sanitization unchanged.          |
| SEC-03      | Very Low   | High       | Guard only rejects paths outside allowed directories.     |
| SEC-04      | Low        | High       | Limits are generous. Existing tests well within bounds.   |
| SEC-05      | None       | Certain    | Documentation-only change.                                |

**Overall phase risk**: Very Low. All changes are defensive additions that do not alter happy-path behavior.
