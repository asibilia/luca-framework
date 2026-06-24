# Phase 164 Summary: Security Hardening & Architecture Cleanup

## Outcome

All 14 audit findings from the v4.5.0 milestone audit addressed across 3 waves. Zero TypeScript errors introduced. No new files created — pure modification and rename.

## Waves Executed

### Wave 1 — Architecture (2 tasks)

**Task 1: Rename `_lib/` to `__helpers/`**

- Renamed `src/hooks/impl/_lib/` to `src/hooks/impl/__helpers/` (OS rename)
- Updated all 15 consumer files: `"./_lib/"` → `"./__helpers/"`
- `__helpers/` now contains: bridge.ts, hook-io.ts, muninn.ts, vault.ts
- Commit: `5007e819`

**Task 2: Remove dead Cursor output branches from hook-io.ts**

- `emitResult()`: removed `if (isClaude()) / else` branches on systemMessage and followupMessage — always emit `systemMessage`
- `exitBlock()`: removed else branch emitting `{ permission: "deny", user_message: reason }` — simplified to always call `emitResult()`
- Removed strings: `followup_message`, `user_message`
- Commit: `5007e819` (same commit as Task 1)

### Wave 2 — HIGH Security + Schema-First (4 tasks)

**Task 3: Path boundary check in post-edit-format.ts**

- Added `import { resolve } from "path"`
- Added `resolve(filePath)` + `startsWith(pd + "/")` check before Prettier invocation
- Uses resolved path for `existsSync` and the Prettier command

**Task 4: Path boundary check + basename sanitization in post-edit-typecheck.ts**

- Added `import { resolve, basename } from "path"`
- Same boundary check pattern as Task 3
- `systemMessage` now uses `basename(resolved)` instead of raw `filePath`

**Task 5: cwd boundary check in statusline.ts**

- Added `import { resolve } from "path"`
- `rawCwd` extracted from stdin, then validated: `resolve(rawCwd)` must be within `pd` or `home`
- Git branch fetch only runs if `cwd` passes validation; falls back to empty string otherwise

**Task 6: Schema-first parsing for 3 hooks**

- `pre-commit-gate.ts`: `PreCommitInputSchema` + `parseHookInput` replaces `readStdinJson()` + `extractCommand()`
- `pre-compact-checkpoint.ts`: `PreCompactInputSchema` + `parseHookInput` replaces unsafe `(data.trigger as string)` cast
- `subagent-stop.ts`: `SubagentStopInputSchema` + `parseHookInput` replaces all `(data.X as string)` casts

- Commit: `335e5b74`

### Wave 3 — MEDIUM + LOW + Tech Debt (6 tasks)

**Task 7: Env value quoting + Zod session-end schema in session-start.ts**

- Env export lines now single-quote dynamic values: `'${runtime}'`, `'${planningDir}'`
- Added `SessionEndMarkerSchema` Zod schema; marker reading uses `safeParse` with typed `.data` access

**Task 8: Validate MUNINN_DB_URL origin in muninn.ts**

- Added `validateMuninnUrl()` helper checking `ALLOWED_ORIGINS = ["http://127.", "http://localhost", "http://[::1]"]`
- Both `writeMuninnEngram` and `recallMuninnEngrams` reject non-loopback URLs with early return

**Task 9: Note content sanitization + vault fix in context-check-throttled.ts**

- Strip markdown headers (`lines starting with #`) and control characters from note body before injection
- Truncate sanitized body to 500 chars max
- Replaced hardcoded `"luca-framework"` vault string with `await resolveVault()` call

**Task 10: Engram ID validation in muninn-config.ts**

- Added regex check `/^[a-zA-Z0-9_-]+$/` before interpolating engram ID into `/api/engrams/${id}/links` URL
- Invalid IDs silently skip the links fetch

**Task 11: realpathSync for symlink-safe validation in context-monitor.ts**

- Replaced `resolve` from `"path"` with `realpathSync` from `"fs"`
- `realpathSync` resolves symlinks, preventing symlink-based path traversal bypass
- Removed unused `import { resolve } from "path"`

**Task 12: Remove .cursor and .pi from SAFE_CLEAN_ROOTS in build-utils.ts**

- `SAFE_CLEAN_ROOTS` now contains only `[".claude", "dist"]`
- Removed outdated platform outputs that are no longer generated

- Commit: `3d92707a`

## Verification Results

| Check                                                         | Result |
| ------------------------------------------------------------- | ------ |
| `ls src/hooks/impl/__helpers/` shows 4 files                  | PASS   |
| `grep -r '"\./_lib/' src/hooks/impl/` returns empty           | PASS   |
| `grep followup_message hook-io.ts` returns empty              | PASS   |
| `grep user_message hook-io.ts` returns empty                  | PASS   |
| Path boundary checks in 3 HIGH security files                 | PASS   |
| `validateMuninnUrl` in muninn.ts                              | PASS   |
| `.slice(0, 500)` in context-check-throttled.ts                | PASS   |
| No hardcoded `"luca-framework"` in context-check-throttled.ts | PASS   |
| `SAFE_CLEAN_ROOTS` contains only `.claude` and `dist`         | PASS   |
| `bunx --bun tsc --noEmit` exits 0                             | PASS   |

## Files Modified

- `src/hooks/impl/__helpers/hook-io.ts` (renamed + dead Cursor code removed)
- `src/hooks/impl/__helpers/muninn.ts` (renamed + URL origin validation)
- `src/hooks/impl/__helpers/bridge.ts` (renamed only)
- `src/hooks/impl/__helpers/vault.ts` (renamed only)
- `src/hooks/impl/post-edit-format.ts` (path boundary check)
- `src/hooks/impl/post-edit-typecheck.ts` (path boundary check + basename sanitize)
- `src/hooks/impl/statusline.ts` (cwd boundary check)
- `src/hooks/impl/pre-commit-gate.ts` (schema-first input)
- `src/hooks/impl/pre-compact-checkpoint.ts` (schema-first input)
- `src/hooks/impl/subagent-stop.ts` (schema-first input)
- `src/hooks/impl/session-start.ts` (env quoting + Zod session-end schema)
- `src/hooks/impl/context-check-throttled.ts` (note truncation + vault fix + import path)
- `src/hooks/impl/context-monitor.ts` (realpathSync + removed path import)
- `src/hooks/impl/post-tool-use-failure.ts` (import path only)
- `src/hooks/impl/pre-commit-drift-check.ts` (import path only)
- `src/hooks/impl/session-compact-restore.ts` (import path only)
- `src/hooks/impl/session-persist.ts` (import path only)
- `src/hooks/impl/snapshot-sync.ts` (import path only)
- `src/hooks/impl/user-prompt-submit.ts` (import path only)
- `packages/luca-observer/lib/muninn-config.ts` (engram ID validation)
- `scripts/build-utils.ts` (SAFE_CLEAN_ROOTS cleanup)

## Success Criteria

- All 14 audit findings addressed (3 HIGH + 4 MEDIUM + 3 LOW + 2 arch + 2 tech debt): COMPLETE
- Zero TypeScript errors introduced: COMPLETE
- No new files created (pure modification/rename): COMPLETE
- `_lib/` directory gone, `__helpers/` contains the same 4 files: COMPLETE
- Dead Cursor output code removed from hook-io.ts: COMPLETE
