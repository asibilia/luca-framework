---
phase: 165
plan: 1
type: improvement
autonomous: true
wave: 1
depends_on: []
---

# Phase 165 Plan 1: Hook Contract Validation

## Objective

Validate all 15 TypeScript hook implementations in `src/hooks/impl/` end-to-end by writing a temporary validation script that feeds mock stdin JSON to each hook via `bun`, captures stdout/stderr/exit code, and verifies the hook contract. Results are documented in SUMMARY.md.

This is a read-only validation pass — no hook source code is modified. The script itself is a one-time utility and is not committed as a test file (per no-tests rule).

## Context

- @src/hooks/impl/ — 15 hook implementations to validate
- @src/hooks/impl/\_\_helpers/hook-io.ts — Contract helpers: readStdinJson, emitResult, exitBlock, exitSuccess, guardDedup
- @.planning/phases/165-hook-contract-validation/165-CONTEXT.md — Hook contract reference and per-hook expected behavior

## Tasks

### 1. Create the hook validation script

**Type:** auto
**TDD:** false
**Depends on:** none

Write `scripts/validate-hooks.ts` as a standalone Bun script. The script:

1. Defines mock stdin payloads for each of the three event types:
   - **PostToolUse** (used by most hooks): `{ "session_id": "test-session", "workspace": { "current_dir": "/tmp" }, "tool_name": "Write", "tool_input": { "file_path": "/tmp/test.ts" } }`
   - **PreToolUse** (pre-commit-gate, pre-commit-drift-check): same shape but with a non-commit command (`{ "tool_name": "Bash", "tool_input": { "command": "echo hello" } }`) to exercise the fast-exit (allow) path
   - **Stop** (context-monitor): `{ "session_id": "test-session", "stop_hook_reason": "end_turn", "transcript_path": "/tmp/test-transcript.jsonl", "stop_hook_active": false }`

2. For each of the 15 hooks, spawns `bun src/hooks/impl/<hook>.ts` with:
   - The appropriate mock payload piped to stdin
   - `CLAUDE_PROJECT_DIR` set to the repo root (so `projectDir()` resolves correctly)
   - `HOME` set to `/tmp` (safe sandbox for path validation in context-monitor)
   - A 10-second timeout (hooks should complete well under this)
   - stdout and stderr captured separately

3. Validates each result against its expected contract:
   - **Exit code**: must be 0; for pre-commit hooks with a non-commit command, 0 is the fast-exit allow path
   - **stdout validity**: if the hook is expected to emit stdout, verify it is parseable JSON; if not expected, treat empty stdout as passing and non-empty as a warning
   - **No crash**: exit code must not be 1 (unhandled exception) — 0 or 2 are the only valid codes

4. Prints a structured result table and exits non-zero if any hook crashes (exit 1) or emits malformed JSON when output is expected.

**Hook contract table** (drives validation logic):

| Hook                    | Event type  | Expected exit | Emits stdout JSON?                        |
| ----------------------- | ----------- | ------------- | ----------------------------------------- |
| post-edit-format        | PostToolUse | 0             | No                                        |
| post-edit-typecheck     | PostToolUse | 0             | Conditional                               |
| snapshot-sync           | PostToolUse | 0             | No                                        |
| statusline              | PostToolUse | 0             | Yes (statusMessage text, not JSON object) |
| pre-commit-gate         | PreToolUse  | 0 (fast-exit) | No (fast-exit path)                       |
| pre-commit-drift-check  | PreToolUse  | 0 (fast-exit) | No (fast-exit path)                       |
| context-monitor         | Stop        | 0             | Conditional                               |
| session-persist         | PostToolUse | 0             | No                                        |
| session-compact-restore | PostToolUse | 0             | Conditional                               |
| session-start           | PostToolUse | 0             | Conditional                               |
| context-check-throttled | PostToolUse | 0             | Conditional                               |
| pre-compact-checkpoint  | PostToolUse | 0             | Conditional                               |
| user-prompt-submit      | PostToolUse | 0             | No                                        |
| subagent-stop           | PostToolUse | 0             | No                                        |
| post-tool-use-failure   | PostToolUse | 0             | No                                        |

"Conditional" means the hook may emit stdout JSON depending on runtime state — validate that if stdout is non-empty it parses as valid JSON. Do not fail on empty stdout for conditional hooks.

**Key implementation notes:**

- The dedup guard writes to `/tmp/.luca-dedup-<hook>-<hash>` — this is fine in test context; each hook invocation gets its own guard file scoped to the project hash
- MuninnDB calls and bridge calls inside hooks will fail gracefully (connection refused / binary missing) — hooks must still exit 0, not crash
- `statusline` writes its status line as plain text to stdout (not JSON) — this is correct behavior; treat non-empty stdout as passing
- Use `Bun.spawnSync` with explicit env, stdin piped from a Buffer, and capture stdout/stderr as strings

**Files to create:**

- `/Users/alecsibilia/Github/luca-framework/scripts/validate-hooks.ts`

**Verification:**

- File exists at `scripts/validate-hooks.ts`
- Script is valid TypeScript: `bunx --bun tsc --noEmit scripts/validate-hooks.ts` (or type-check passes overall)
- Script runs without syntax errors: `bun scripts/validate-hooks.ts --dry-run` (add a `--dry-run` flag that prints the hook list and exits 0 without executing)

### 2. Run the validation script and capture results

**Type:** auto
**TDD:** false
**Depends on:** 1

Execute the validation script against all 15 hooks from the repo root:

```
CLAUDE_PROJECT_DIR=/Users/alecsibilia/Github/luca-framework bun scripts/validate-hooks.ts
```

Capture the full output (pass/fail per hook, stdout snippets, any errors). Note which hooks:

- Pass cleanly (exit 0, stdout valid or empty as expected)
- Emit warnings (unexpected stdout, slow execution)
- Fail (exit 1 / crash, malformed JSON output)

If any hooks fail, diagnose the root cause from stderr output. Common expected non-failures:

- MuninnDB connection refused — fire-and-forget, should not cause crash
- Bridge binary not found — graceful degradation via `2>/dev/null || true` patterns
- `snapshot-sync` may skip silently if git state is clean — exit 0 is still correct

**Files to create/edit:**

- None (read-only execution)

**Verification:**

- Script completes without hanging (all hooks exit within 10s timeout)
- Output shows per-hook pass/fail summary
- No hook exits with code 1 (unhandled crash)

### 3. Document results in SUMMARY.md

**Type:** auto
**TDD:** false
**Depends on:** 2

Write `.planning/phases/165-hook-contract-validation/SUMMARY.md` with:

1. **Overall result**: PASS / PARTIAL / FAIL with a one-line summary
2. **Per-hook results table**: hook name, exit code, stdout (truncated), stderr (truncated), pass/fail verdict
3. **Findings**: any unexpected behavior discovered (e.g., a hook that crashes on malformed stdin, an unexpected stdout shape, a hook that is slower than expected)
4. **Contract gaps**: if any hook's actual behavior differs from the contract table in 165-CONTEXT.md, document the discrepancy
5. **Recommendations**: if any hooks need fixes, describe what needs to change (fixes are out of scope for this phase)

**Files to create:**

- `/Users/alecsibilia/Github/luca-framework/.planning/phases/165-hook-contract-validation/SUMMARY.md`

**Verification:**

- SUMMARY.md exists and is non-empty
- Contains results for all 15 hooks
- Overall verdict is clearly stated

## Verification

After all tasks complete:

1. `scripts/validate-hooks.ts` exists and is importable/runnable
2. Running `bun scripts/validate-hooks.ts` from the repo root produces a summary with results for all 15 hooks
3. `SUMMARY.md` exists with findings documented
4. No hook implementation files were modified (this is a read-only validation phase)
5. Type check still passes: `bunx --bun tsc --noEmit`

## Success Criteria

- All 15 hooks are exercised with mock stdin payloads
- No hook exits with code 1 (unhandled exception) — exit 0 or 2 are both valid
- Hooks that are expected to emit stdout JSON do so with parseable output when the conditions are met
- MuninnDB and bridge failures are confirmed to degrade gracefully (no crash)
- Findings are captured in SUMMARY.md for use in any follow-on fix phase

## Output Specification

- `scripts/validate-hooks.ts` — temporary validation utility (not committed as a test, may be cleaned up after results are captured)
- `.planning/phases/165-hook-contract-validation/SUMMARY.md` — validation results and findings
