# Phase 160 Context: Migrate Hook Implementations to TypeScript

## Decision 1: Shim Pattern [researched]

**Decision:** Each compiled `.sh` becomes a thin shim using dirname-relative path resolution:

```bash
#!/bin/bash
# Thin shim — all logic in TypeScript
exec bun "$(dirname "$0")/../../impl/hook-name.ts" "$@" <&0
```

The path `../../impl/` is relative to `src/hooks/scripts/` → `src/hooks/impl/`. The `<&0` ensures stdin piping works for hooks that receive JSON payloads.

## Decision 2: Hook I/O Contract [researched]

**Decision:** Create a shared `_lib/hook-io.ts` that handles the stdin/stdout contract:

```typescript
// parseHookInput() — reads stdin JSON, returns typed object via Zod safeParse
// emitResult(result) — writes stdout JSON (systemMessage, statusMessage fields)
// exitBlock() — exits with code 2 (blocks PreToolUse hooks)
// exitSuccess() — exits with code 0
```

All TypeScript hook implementations import from `_lib/hook-io.ts`. No hook directly reads stdin or writes stdout — the shared lib handles the contract.

## Decision 3: Exit Code Semantics [researched]

**Decision:** Preserve exact exit code semantics per hook type:

- `PreToolUse` hooks (pre-commit-gate): exit 0 = allow, exit 2 = block the tool call
- `PostToolUse` hooks (post-edit-typecheck, statusline): exit 0 = success (non-blocking)
- `Stop` hooks (context-monitor): exit 0 = success
- Async hooks: exit code doesn't block but is logged

The `hook-io.ts` lib provides `exitBlock()` and `exitSuccess()` helpers to make this explicit.

## Decision 4: Shared Library Design [researched]

**Decision:** Create 4 shared utility modules in `src/hooks/impl/_lib/`:

1. **hook-io.ts** — Stdin JSON parsing, stdout JSON emission, exit code helpers
2. **bridge.ts** — Typed wrapper around luca-bridge CLI calls (cascading lookup like common.sh's `run_bridge()`)
3. **vault.ts** — Vault resolution from .planning/config.json (replaces bash JSON extraction)
4. **muninn.ts** — MuninnDB HTTP client for checkpoint write/read (replaces curl calls in shell)

All modules use Bun APIs (`Bun.file`, `Bun.stdin`, `Bun.$`) per project conventions.

## Decision 5: Wave Structure [researched]

**Decision:** 4 waves matching the migration order in the todo:

| Wave | Hooks                                                                                              | Rationale                                     |
| ---- | -------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 1    | \_lib/ shared utilities (4 modules)                                                                | Foundation — all hooks depend on this         |
| 2    | post-edit-format, post-edit-typecheck, snapshot-sync, statusline                                   | Simple (69-154 lines each), fast feedback     |
| 3    | pre-commit-gate, pre-commit-drift-check, context-monitor, session-persist, session-compact-restore | Medium (94-217 lines), more complex logic     |
| 4    | session-start, context-check-throttled, pre-compact-checkpoint + remove \_lib/common.sh            | Complex (209-366 lines), MuninnDB integration |

## Decision 6: build:all Timing [researched]

**Decision:** Same as Phase 159 — do NOT run `bun run build:all` during Claude Code session. The compiled `.sh` shims are in `src/hooks/scripts/` (source, not generated output). The build pipeline compiles them to `.claude/hooks/`. User runs `bun run build:all` after this phase.

## Scope

- 12 hook scripts → TypeScript implementations
- 4 new shared utility modules
- \_lib/common.sh removal after all hooks migrated
- Compiled .sh shims updated to call TS implementations
- NO new hook functionality — pure migration

## Verification

- `bunx --bun tsc --noEmit` — validates all new TypeScript compiles
- Manual: each hook must be tested end-to-end after migration (per QA analysis)
- Pre-commit gate is the highest-risk hook (blocks commits if broken)
