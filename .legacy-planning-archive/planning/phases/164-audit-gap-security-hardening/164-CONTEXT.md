# Phase 164 Context: Security Hardening & Architecture Cleanup

All decisions come directly from the v4.5.0 milestone audit findings. No gray areas — every fix is prescribed.

## Security Fixes (3 HIGH, 4 MEDIUM, 3 LOW)

### HIGH — Path Validation (3 files)

Add `projectDir()` boundary check to all file paths from stdin before use:

- `src/hooks/impl/post-edit-format.ts` — validate filePath resolves within projectDir before passing to Prettier
- `src/hooks/impl/post-edit-typecheck.ts` — validate filePath resolves within projectDir; sanitize before embedding in systemMessage
- `src/hooks/impl/statusline.ts` — validate cwd resolves within projectDir or HOME before passing to git -C

Pattern: `const resolved = resolve(filePath); if (!resolved.startsWith(projectDir() + "/")) return exitSuccess();`

### MEDIUM — Schema-First Parsing

- `src/hooks/impl/_lib/hook-io.ts` — create typed Zod schemas for hook-specific inputs; add `parseTypedInput<T>(schema)` helper alongside existing `readStdinJson()`
- Apply to hooks that read specific fields: pre-commit-gate (command), pre-compact-checkpoint (trigger), subagent-stop (subagent_id, summary)

### MEDIUM — Environment Safety

- `src/hooks/impl/session-start.ts` — quote env file values with single quotes; parse session-end marker with Zod schema
- `src/hooks/impl/_lib/muninn.ts` — validate MUNINN_DB_URL starts with http://127. or http://localhost before use
- `src/hooks/impl/context-check-throttled.ts` — truncate and sanitize note content before systemMessage injection (max 500 chars, strip markdown headers)

### LOW — Defense in Depth

- `src/hooks/impl/session-start.ts` — parse session-end marker JSON through Zod schema (already covered above)
- `packages/luca-observer/lib/muninn-config.ts` — validate engram ID matches /^[a-zA-Z0-9_-]+$/ before URL interpolation
- `src/hooks/impl/context-monitor.ts` — use realpathSync instead of resolve for symlink-safe path validation

## Architecture Fixes (2 MEDIUM)

### Dead Code Removal

- `src/hooks/impl/_lib/hook-io.ts` — remove else branches from emitResult() and exitBlock() that emit Cursor-shaped output. Simplify to Claude-only output.

### Naming Convention

- Rename `src/hooks/impl/_lib/` to `src/hooks/impl/__helpers/` — update all import paths in 16 hook implementation files

## Tech Debt (2 items)

- `scripts/build-utils.ts` — remove `.cursor` and `.pi` from SAFE_CLEAN_ROOTS array
- `src/hooks/impl/context-check-throttled.ts` — replace hardcoded `"luca-framework"` vault name with `resolveVault()` call

## Wave Structure

| Wave | What                                                        | Files                            |
| ---- | ----------------------------------------------------------- | -------------------------------- |
| 1    | Rename \_lib/ → \_\_helpers/ + remove dead Cursor code      | hook-io.ts + all 16 import paths |
| 2    | HIGH security fixes (path validation) + MEDIUM schema-first | 5 files                          |
| 3    | MEDIUM env safety + LOW defense-in-depth + tech debt        | 6 files                          |
