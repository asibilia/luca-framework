---
phase: 160
plan: 1
type: improvement
autonomous: true
wave: 1
depends_on: []
---

# Phase 160 Plan 1: Migrate Hook Implementations to TypeScript

## Objective

Move all 12 hook script implementations from shell to TypeScript. Shell scripts in `src/hooks/scripts/` become thin shims that `exec bun` into TypeScript files under `src/hooks/impl/`. A shared `_lib/` layer (4 modules) replaces `_lib/common.sh`. No new hook functionality — pure migration.

> Note: Do NOT run `bun run build:all` during this phase. The compiled `.sh` shims live in `src/hooks/scripts/` (source). The build pipeline compiles them to `.claude/hooks/`. User runs `bun run build:all` after the phase.

## Context

- `src/hooks/scripts/` — 12 existing shell hook scripts + `_lib/common.sh`
- `src/hooks/scripts/_lib/common.sh` — provides `run_bridge()`, `read_runtime()`, `read_session_id()`, `guard_dedup()`
- `src/hooks/impl/` — new directory for TypeScript implementations (to be created)
- `src/hooks/impl/_lib/` — new shared TypeScript utility modules (to be created)
- `.planning/phases/160-migrate-hooks-to-typescript/160-CONTEXT.md` — all architectural decisions

## Tasks

### Wave 1: Shared Library (`_lib/` modules)

#### Task 1.1: Create `src/hooks/impl/_lib/hook-io.ts`

**Type:** auto
**TDD:** false
**Depends on:** nothing

Implement the shared stdin/stdout contract module. Replaces the `bun -e` inline JSON patterns scattered across every hook.

**Logic to implement:**

- `parseHookInput<T>(schema: ZodSchema<T>): Promise<T | null>` — reads `Bun.stdin.text()`, JSON-parses with safeParse, returns typed object or null on empty/malformed stdin
- `emitResult(result: { systemMessage?: string; followupMessage?: string; hookSpecificOutput?: unknown })` — writes stdout JSON using platform detection (`CLAUDE_PROJECT_DIR` env var to distinguish Claude vs Cursor output shape)
- `exitBlock(reason: string): never` — emits deny JSON (`hookSpecificOutput.permissionDecision: 'deny'` for Claude, `permission: 'deny'` for Cursor) and calls `process.exit(2)`
- `exitSuccess(): never` — calls `process.exit(0)`
- `guardDedup(hookName: string, ttlSeconds?: number): void` — TypeScript port of `guard_dedup()` from common.sh: uses `/tmp/.luca-dedup-{hookName}-{projectHash}` timestamp file, exits 0 if within TTL

Use Bun APIs (`Bun.stdin`, `Bun.write`) per project convention. No classes — functional exports only.

**Files to create:**

- `src/hooks/impl/_lib/hook-io.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes with no errors on this file
- Exported function signatures match what all 12 hook implementations will need

---

#### Task 1.2: Create `src/hooks/impl/_lib/bridge.ts`

**Type:** auto
**TDD:** false
**Depends on:** nothing

TypeScript port of `run_bridge()` from common.sh. Cascading bridge lookup: installed `luca-bridge` bin → monorepo source `packages/luca-framework/src/state/bridge.ts` → skip silently.

**Logic to implement:**

- `runBridge(args: string[]): Promise<string>` — runs bridge via `Bun.spawnSync` or `Bun.$`, returns stdout string, swallows errors silently (all bridge calls in hooks are fire-and-forget with `|| true`)
- Cascading lookup: check `luca-bridge` in PATH first, then check `${CLAUDE_PROJECT_DIR}/.../bridge.ts`
- Returns `''` on any error (never throws)

**Files to create:**

- `src/hooks/impl/_lib/bridge.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `runBridge(['snapshot'])` executes without throwing when bridge is not installed

---

#### Task 1.3: Create `src/hooks/impl/_lib/vault.ts`

**Type:** auto
**TDD:** false
**Depends on:** nothing

Vault resolution from `.planning/config.json`. Replaces the `bun -e` JSON extraction pattern used in hooks that need the muninn vault name.

**Logic to implement:**

- `resolveVault(): Promise<string>` — reads `${CLAUDE_PROJECT_DIR}/.planning/config.json` via `Bun.file`, extracts `muninn.vault` field, falls back to `'default'` on any error or missing file
- Uses `Bun.file` per project convention (not `node:fs`)

**Files to create:**

- `src/hooks/impl/_lib/vault.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Returns `'default'` when config.json is absent

---

#### Task 1.4: Create `src/hooks/impl/_lib/muninn.ts`

**Type:** auto
**TDD:** false
**Depends on:** Task 1.3 (`vault.ts`)

MuninnDB HTTP client for checkpoint write/read. Replaces the `curl` calls in `pre-compact-checkpoint.sh`.

**Logic to implement:**

- `writeMuninnEngram(engram: { vault: string; concept: string; content: string; type: string; tags: string[] }): Promise<void>` — POSTs to `${MUNINN_DB_URL:-http://127.0.0.1:8476}/api/engrams`, sets `Authorization: Bearer ${MUNINN_DB_API_KEY}` header if env var is set, 5-second timeout, swallows all errors silently (fire-and-forget)
- Use built-in `fetch` (Bun has it natively) — no external HTTP libraries

**Files to create:**

- `src/hooks/impl/_lib/muninn.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Does not throw on network failure or missing env vars

---

### Wave 2: Simple Hooks (4 hooks)

#### Task 2.1: Migrate `post-edit-format`

**Type:** auto
**TDD:** false
**Depends on:** Wave 1 complete (Tasks 1.1–1.4)

Migrate the formatter hook. Extracts `file_path` from stdin, picks formatter by extension, runs `bunx --bun prettier --write` or skips.

**Shell logic to port (`post-edit-format.sh`):**

- Read stdin JSON, extract `tool_input?.file_path ?? file_path`
- Exit 0 if empty/malformed, file not found, or unknown extension
- Read runtime from `read_runtime()` → use `readRuntime()` from bridge.ts or inline from config.json
- Map extensions (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.json`, `.css`, `.scss`, `.less`, `.html`, `.htm`, `.md`, `.mdx`, `.yaml`, `.yml`) to `bunx --bun prettier --write` (or `npx prettier --write`)
- Always exit 0 (non-blocking)

**Shim pattern** for `src/hooks/scripts/post-edit-format.sh`:

```bash
#!/bin/bash
# Thin shim — all logic in TypeScript
exec bun "$(dirname "$0")/../../impl/post-edit-format.ts" "$@" <&0
```

**Files to create/edit:**

- `src/hooks/impl/post-edit-format.ts` (create)
- `src/hooks/scripts/post-edit-format.sh` (replace with shim)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Shim executes without error when called with empty stdin

---

#### Task 2.2: Migrate `post-edit-typecheck`

**Type:** auto
**TDD:** false
**Depends on:** Wave 1 complete

Port the async type-checker hook. Reads stdin, skips non-TS files, runs `bunx --bun tsc --noEmit`, emits `systemMessage` JSON with truncated errors on failure.

**Shell logic to port (`post-edit-typecheck.sh`):**

- Read stdin JSON, extract `tool_input?.file_path ?? file_path`
- Skip if empty, file not found, or not `.ts`/`.tsx`
- Skip if no `tsconfig.json` in project root
- Run `bunx --bun tsc --noEmit` in project dir, capture output
- On failure: truncate to first 20 lines, emit `{ systemMessage: 'TypeScript type errors found after editing {path}:\n{errors}' }`
- Always exit 0

**Files to create/edit:**

- `src/hooks/impl/post-edit-typecheck.ts` (create)
- `src/hooks/scripts/post-edit-typecheck.sh` (replace with shim)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Shim is a valid thin wrapper

---

#### Task 2.3: Migrate `snapshot-sync`

**Type:** auto
**TDD:** false
**Depends on:** Wave 1 complete

Port the throttled state sync hook. Checks throttle timestamp, skips if too recent, runs `runBridge(['snapshot'])`.

**Shell logic to port (`snapshot-sync.sh`):**

- Drain stdin (not parsed)
- Throttle: skip if `/tmp/.luca-snapshot-sync-{projectHash}-ts` timestamp is within 120 seconds
- Skip if `.planning/state.json` not found
- Update throttle timestamp
- Call `runBridge(['snapshot'])`
- Always exit 0

**Files to create/edit:**

- `src/hooks/impl/snapshot-sync.ts` (create)
- `src/hooks/scripts/snapshot-sync.sh` (replace with shim)

**Verification:**

- `bunx --bun tsc --noEmit` passes

---

#### Task 2.4: Migrate `statusline`

**Type:** auto
**TDD:** false
**Depends on:** Wave 1 complete

This hook is already almost entirely TypeScript via `bun -e` inline script. Port the inline script to a proper TypeScript file.

**Shell logic to port (`statusline.sh`):**

- The entire logic is a `bun -e` inline script — extract it verbatim into a `.ts` file
- Parse stdin JSON with try/catch
- Write `.planning/.context-metrics.json` side effect
- Get git branch via `Bun.spawnSync(['git', ...])`
- Assemble ANSI-colored status line parts and write to stdout
- Always exit 0

**Files to create/edit:**

- `src/hooks/impl/statusline.ts` (create)
- `src/hooks/scripts/statusline.sh` (replace with shim — removes the `bun -e` inline)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Output is a non-empty string when given valid session JSON

---

### Wave 3: Medium Hooks (5 hooks)

#### Task 3.1: Migrate `pre-commit-gate`

**Type:** checkpoint:human-verify
**TDD:** false
**Depends on:** Wave 2 complete

**HIGHEST RISK HOOK** — blocks commits if broken. Port the gatekeeper logic carefully.

**Shell logic to port (`pre-commit-gate.sh`):**

- Read stdin JSON, extract `tool_input?.command ?? command ?? ''`
- Fast exit 0 if command does not match `*git commit*|*git merge*|*bun run commit*|*bunx commit*|*bunx --bun commit*`
- Advisory: check `.planning/notes/` for pending notes, log count to stderr
- Sync STATE.md: if `state.json` exists, `runBridge(['snapshot'])` then `git add .planning/STATE.md`
- Quality check 2 (tests disabled, only typecheck): run `bunx --bun tsc --noEmit`
- On failure: build deny payload:
  - Claude (`CLAUDE_PROJECT_DIR` set): `{ hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: '...' } }`
  - Cursor: `{ permission: 'deny', user_message: '...' }`
- Exit 2 on failure, exit 0 on success

**Security note (from shell source):** NEVER eval or exec the extracted command — use string matching only.

**Files to create/edit:**

- `src/hooks/impl/pre-commit-gate.ts` (create)
- `src/hooks/scripts/pre-commit-gate.sh` (replace with shim)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Manual: run a test `git commit` in the repo — confirm the hook runs and typechecks

---

#### Task 3.2: Migrate `pre-commit-drift-check`

**Type:** auto
**TDD:** false
**Depends on:** Wave 2 complete

Port the drift check gate. Filters non-commit commands fast, checks staged files relevance, runs drift check script.

**Shell logic to port (`pre-commit-drift-check.sh`):**

- Read stdin, extract command, fast exit 0 if not a commit command
- Get staged files via `git diff --cached --name-only`
- Fast exit 0 if no staged files, or none in `.claude/`, `dist/plugin/`, `src/agents/`, `src/skills/`, `src/rules/`, `src/hooks/`, `src/compilers/`
- Run `bun run ./scripts/check-drift.ts`
- On failure: emit deny payload with fix instructions, exit 2
- Exit 0 on success

**Files to create/edit:**

- `src/hooks/impl/pre-commit-drift-check.ts` (create)
- `src/hooks/scripts/pre-commit-drift-check.sh` (replace with shim)

**Verification:**

- `bunx --bun tsc --noEmit` passes

---

#### Task 3.3: Migrate `context-monitor`

**Type:** auto
**TDD:** false
**Depends on:** Wave 2 complete

Port the Stop-event context monitor. Checks statusline metrics or transcript size, emits warning systemMessage.

**Shell logic to port (`context-monitor.sh`):**

- Read stdin, check `stop_hook_active || loop_count > 0`, exit 0 if true (loop guard)
- Extract `transcript_path`, validate: must be absolute path within `$HOME`
- Check `.planning/.context-metrics.json` for fresh statusline data (source=statusline, within 120s)
  - If fresh: classify zone by `usage_percent` (30%→MODERATE, 50%→HIGH, 70%→CRITICAL)
- Fallback: transcript file size heuristics (100K→MODERATE, 200K→HIGH, 300K→CRITICAL)
- Read STATE.md/state.json sizes for breakdown info
- If zone is not NONE: emit `{ systemMessage: '[Context Monitor: {LEVEL}] {msg}' }` with `context_breakdown` field
- Always exit 0

**Files to create/edit:**

- `src/hooks/impl/context-monitor.ts` (create)
- `src/hooks/scripts/context-monitor.sh` (replace with shim)

**Verification:**

- `bunx --bun tsc --noEmit` passes

---

#### Task 3.4: Migrate `session-persist`

**Type:** auto
**TDD:** false
**Depends on:** Wave 2 complete

Port the SessionEnd hook. Removes session lock, writes session-end marker.

**Shell logic to port (`session-persist.sh`):**

- Read stdin, extract `reason`, sanitize (alphanumeric + ` _.-`, max 100 chars)
- Remove `.claude/.session-lock` file
- Read session_id from `state.json` (`context.session_id` field)
- Write `.planning/.session-end-marker.json` with `{ session_id, ended_at, reason, cleanup_pending: true }` via `Bun.write`
- Always exit 0

**Files to create/edit:**

- `src/hooks/impl/session-persist.ts` (create)
- `src/hooks/scripts/session-persist.sh` (replace with shim)

**Verification:**

- `bunx --bun tsc --noEmit` passes

---

#### Task 3.5: Migrate `session-compact-restore`

**Type:** auto
**TDD:** false
**Depends on:** Wave 2 complete

Port the post-compaction context restore hook. Reads checkpoint file, emits systemMessage, deletes checkpoint.

**Shell logic to port (`session-compact-restore.sh`):**

- Drain stdin
- Check `.planning/.context-checkpoint.json` — exit 0 if not found
- Parse checkpoint JSON, build multi-line restore message covering: trigger, branch, issue, status, phase, complexity, milestone, context at compaction, recent files, completed_summary, vault
- Include call to action: `Run /context-restore for deeper context recovery`
- Emit `{ systemMessage: restoreMsg }` via stdout
- Delete checkpoint file
- Always exit 0

**Files to create/edit:**

- `src/hooks/impl/session-compact-restore.ts` (create)
- `src/hooks/scripts/session-compact-restore.sh` (replace with shim)

**Verification:**

- `bunx --bun tsc --noEmit` passes

---

### Wave 4: Complex Hooks + Cleanup (3 hooks + removal)

#### Task 4.1: Migrate `session-start`

**Type:** checkpoint:human-verify
**TDD:** false
**Depends on:** Wave 3 complete

Largest hook (366 lines). Port full initialization logic.

**Shell logic to port (`session-start.sh`):**

1. Check `bun` availability — emit systemMessage warning and exit 0 if missing
2. Create `.planning/` and `.planning/notes/done/` directories
3. Create `STATE.md` if missing (with default template)
4. Create `ROADMAP.md` if missing (with default template)
5. Initialize state machine via bridge:
   - If `state.json` exists and age < 86400s: `runBridge(['snapshot'])`
   - If stale: `runBridge(['ensure-init', '--force'])`
   - If absent: `runBridge(['ensure-init'])`
6. Check `.planning/.session-end-marker.json` — read stale session message, delete marker
7. Detect runtime (`bun` or `node`)
8. Create `config.json` if missing (full default config object — port the large JSON structure from shell verbatim)
9. If `config.json` exists: update `runtime` field only
10. Write env vars to `CLAUDE_ENV_FILE` if set (`LUCA_RUNTIME`, `LUCA_PLANNING_DIR`, `LUCA_SESSION_ACTIVE`)
11. Clean stale session lock (older than 7200s)
12. Write `.claude/.session-lock` with `{ created_at, pid, build_manifest_at }`
13. Count pending notes in `.planning/notes/`
14. Emit summary systemMessage only if files were created or notes/stale session messages exist

- Claude: `{ systemMessage: '...' }`, Cursor: `{ followup_message: '...' }`

**Note:** The default `config.json` structure is large — port it exactly from the shell script without changes.

**Files to create/edit:**

- `src/hooks/impl/session-start.ts` (create)
- `src/hooks/scripts/session-start.sh` (replace with shim)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Manual: start a new Claude Code session, confirm `.planning/` is initialized and `config.json` is created

---

#### Task 4.2: Migrate `context-check-throttled`

**Type:** auto
**TDD:** false
**Depends on:** Wave 3 complete

Port the PostToolUse throttled context monitor. More complex than `context-monitor` due to zone-worsening detection and proactive checkpoint logic.

**Shell logic to port (`context-check-throttled.sh`):**

- Throttle: skip if `/tmp/.luca-context-check-{projectHash}-ts` within 60 seconds; update timestamp
- Check urgent developer notes (`0-*.md` in `.planning/notes/`), emit and move to `done/` if found; exit 0
- Read fresh statusline metrics (within 120s) from `.planning/.context-metrics.json`
- Fallback: estimate zone from `$CLAUDE_SESSION_DIR/transcript` file size
- If using heuristic: write updated context metrics snapshot
- Zone worsening detection: compare previous zone (from metrics file) to current
  - If zone worsened and checkpoint throttle (`/tmp/.luca-ctx-checkpoint-{hash}-ts`) allows (>300s): `runBridge(['snapshot'])`
- Emit `{ systemMessage: 'Context usage at X% (zone: degrading/stop). ...' }` only for degrading/stop zones
- Always exit 0

**Files to create/edit:**

- `src/hooks/impl/context-check-throttled.ts` (create)
- `src/hooks/scripts/context-check-throttled.sh` (replace with shim)

**Verification:**

- `bunx --bun tsc --noEmit` passes

---

#### Task 4.3: Migrate `pre-compact-checkpoint`

**Type:** auto
**TDD:** false
**Depends on:** Wave 3 complete, Task 4.2

Port the PreCompact hook. Reads state from bridge + STATE.md + git, builds checkpoint JSON, writes filesystem fallback, fires MuninnDB REST call.

**Shell logic to port (`pre-compact-checkpoint.sh`):**

- Read stdin JSON, extract `trigger` field
- Read phase info via `runBridge(['read-phase'])`, extract `phase`
- Read status via `runBridge(['read-status'])`, extract `complexity`
- Read `milestone`, `branch`, `github_issue`, `status` from STATE.md via grep/sed (port to TypeScript string parsing)
- Get recent git log: `git log --oneline -5`
- Get recent changed files: `git diff --name-only HEAD~3 HEAD | head -10`
- Read context metrics from `.planning/.context-metrics.json` (`zone`, `usage_percent`)
- Build checkpoint object and write to `.planning/.context-checkpoint.json` via `Bun.write`
- Build engram JSON and POST to `${MUNINN_DB_URL}/api/engrams` via `writeMuninnEngram()` from `muninn.ts`
- Always exit 0

**Files to create/edit:**

- `src/hooks/impl/pre-compact-checkpoint.ts` (create)
- `src/hooks/scripts/pre-compact-checkpoint.sh` (replace with shim)

**Verification:**

- `bunx --bun tsc --noEmit` passes

---

#### Task 4.4: Remove `_lib/common.sh`

**Type:** auto
**TDD:** false
**Depends on:** Tasks 4.1, 4.2, 4.3 complete (all 12 hooks migrated)

Once all 12 shims have been updated and no longer source `common.sh`, delete the file.

**Steps:**

1. Verify no `.sh` file in `src/hooks/scripts/` still contains `source "${HOOK_SCRIPT_DIR}/_lib/common.sh"` (all should now be thin shims)
2. Delete `src/hooks/scripts/_lib/common.sh`
3. If `_lib/` directory is now empty, delete it too

**Files to edit/delete:**

- `src/hooks/scripts/_lib/common.sh` (delete)
- `src/hooks/scripts/_lib/` (delete directory if empty)

**Verification:**

- `grep -r 'common.sh' src/hooks/scripts/` returns no matches
- `bunx --bun tsc --noEmit` still passes after deletion

---

## Verification

After all 4 waves complete:

1. **Type check passes:** `bunx --bun tsc --noEmit` — zero errors across all new `.ts` files
2. **No shell references to common.sh:** `grep -r 'common.sh' src/hooks/scripts/` returns empty
3. **All 12 shims are thin:** Each `.sh` in `src/hooks/scripts/` is a 3-line shim using the `exec bun ... <&0` pattern
4. **All 12 TS implementations exist:** `ls src/hooks/impl/*.ts` shows all 12 files
5. **4 lib modules exist:** `ls src/hooks/impl/_lib/*.ts` shows `hook-io.ts`, `bridge.ts`, `vault.ts`, `muninn.ts`
6. **Manual session start test:** Start Claude Code session, confirm `.planning/` init works end-to-end
7. **Manual commit test:** Run a test commit, confirm `pre-commit-gate` typechecks and allows/blocks correctly

## Success Criteria

- All 12 TypeScript implementations exist at `src/hooks/impl/`
- All 12 shell scripts are thin shims (3 lines each)
- `_lib/common.sh` is deleted
- `bunx --bun tsc --noEmit` passes with zero errors
- No functional behavior changes — hooks behave identically before and after migration
- `bun run build:all` can be run by the user after the session to compile shims to `.claude/hooks/`

## Output Specification

- **New directory:** `src/hooks/impl/` with 12 `.ts` hook implementations
- **New directory:** `src/hooks/impl/_lib/` with 4 shared utility modules
- **Modified:** 12 `.sh` files in `src/hooks/scripts/` — each replaced with a 3-line shim
- **Deleted:** `src/hooks/scripts/_lib/common.sh` (and `_lib/` if empty)
