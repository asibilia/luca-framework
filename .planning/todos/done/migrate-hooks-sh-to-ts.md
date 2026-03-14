---
title: Migrate hook implementations from shell scripts to TypeScript
area: hooks
created: 2026-03-14
source: conversation
---

## Context

All 12 hook scripts are currently pure shell (`.sh`) with a shared `_lib/common.sh` library. The functional logic — reading STATE.md, parsing JSON, writing checkpoints, calling MuninnDB, running typecheck commands — is all implemented in bash. This makes hooks hard to test, hard to type-check, and disconnected from the rest of the TypeScript codebase.

The goal is to move all hook logic into TypeScript source files in `src/hooks/`, and reduce the compiled `.sh` files to thin shims that call `bun <ts-file>` with the appropriate arguments.

## Task

For each hook script, create a TypeScript implementation in `src/hooks/` and reduce the `.sh` file to a thin shim.

### Current Hook Scripts (12 total)

| Script                       | Purpose                                                        | Complexity |
| ---------------------------- | -------------------------------------------------------------- | ---------- |
| `context-check-throttled.sh` | Monitor context usage, zone transitions, proactive checkpoints | High       |
| `context-monitor.sh`         | Check context at session stop                                  | Medium     |
| `post-edit-format.sh`        | Format code after Edit/Write                                   | Low        |
| `post-edit-typecheck.sh`     | Type-check single file (async)                                 | Low        |
| `pre-commit-drift-check.sh`  | Check output drift before commit                               | Medium     |
| `pre-commit-gate.sh`         | Test + typecheck before commit (blocking)                      | Medium     |
| `pre-compact-checkpoint.sh`  | Save checkpoint to MuninnDB before compaction                  | High       |
| `session-compact-restore.sh` | Restore context after compaction                               | Medium     |
| `session-persist.sh`         | Save session state at end                                      | Medium     |
| `session-start.sh`           | Initialize Luca at session start                               | High       |
| `snapshot-sync.sh`           | Sync STATE.md (async)                                          | Low        |
| `statusline.sh`              | Update status line display                                     | Low        |

Shared: `_lib/common.sh` — utility functions (JSON parsing, bridge calls, vault resolution)

### Target Architecture

```
src/hooks/
├── __schemas/           # (existing) Hook schemas
├── __helpers/           # (existing) Hook registry, config generators
├── adapters/            # (existing) Platform adapters
├── scripts/             # Compiled .sh shims (thin wrappers)
│   ├── context-check-throttled.sh   # #!/bin/bash → bun src/hooks/impl/context-check-throttled.ts "$@"
│   ├── ...
│   └── _lib/common.sh              # May be removed if all logic moves to TS
└── impl/                # NEW: TypeScript implementations
    ├── context-check-throttled.ts
    ├── context-monitor.ts
    ├── post-edit-format.ts
    ├── post-edit-typecheck.ts
    ├── pre-commit-drift-check.ts
    ├── pre-commit-gate.ts
    ├── pre-compact-checkpoint.ts
    ├── session-compact-restore.ts
    ├── session-persist.ts
    ├── session-start.ts
    ├── snapshot-sync.ts
    ├── statusline.ts
    └── _lib/              # Shared TS utilities (replaces _lib/common.sh)
        ├── hook-io.ts     # Parse stdin JSON, emit stdout JSON (systemMessage, statusMessage)
        ├── bridge.ts      # luca-bridge read/write wrappers
        ├── vault.ts       # Vault resolution from config
        └── muninn.ts      # MuninnDB HTTP client (checkpoint write/read)
```

### Shim Pattern

Each compiled `.sh` becomes a 3-line shim:

```bash
#!/bin/bash
# Thin shim — all logic in TypeScript
exec bun "$(dirname "$0")/../../impl/context-check-throttled.ts" "$@" <&0
```

The shim:

1. Receives stdin JSON from Claude Code (hook event payload)
2. Pipes it to the TypeScript implementation via `bun`
3. Forwards stdout (systemMessage, statusMessage) back to Claude Code
4. Exits with the TS process exit code

### TypeScript Implementation Pattern

Each TS file follows a standard pattern:

```typescript
import { parseHookInput, emitResult } from "./_lib/hook-io";

const input = await parseHookInput(); // Reads stdin, parses JSON
// ... hook logic using Bun APIs, typed schemas, etc.
await emitResult({ systemMessage: "..." }); // Writes stdout JSON
process.exit(0); // or process.exit(1) to block
```

### Migration Order

1. **Phase 1: Shared library** — Create `src/hooks/impl/_lib/` with hook-io, bridge, vault, muninn utilities
2. **Phase 2: Simple hooks first** — `post-edit-format`, `post-edit-typecheck`, `snapshot-sync`, `statusline` (low complexity, fast feedback)
3. **Phase 3: Medium hooks** — `pre-commit-gate`, `pre-commit-drift-check`, `context-monitor`, `session-persist`, `session-compact-restore`
4. **Phase 4: Complex hooks** — `session-start`, `context-check-throttled`, `pre-compact-checkpoint` (most logic, MuninnDB integration)
5. **Phase 5: Remove `_lib/common.sh`** — Once all hooks are migrated, delete the shared shell library

### Considerations

- **stdin/stdout contract**: Claude Code hooks communicate via stdin JSON and stdout JSON. The TS implementations must honor this exact contract.
- **Exit codes**: Exit 0 = success, exit 2 = block (for PreToolUse hooks like pre-commit-gate). The TS implementations must preserve these semantics.
- **Async hooks**: Some hooks run async (`post-edit-typecheck`, `snapshot-sync`). The shim pattern works the same — Claude Code manages the async lifecycle.
- **Timeout**: Hooks have timeouts (10s-120s). TypeScript via Bun starts fast (~50ms) so this shouldn't be an issue.
- **`bun` vs `node`**: Per project conventions, use `bun` not `node` to run TS files directly.

## Notes

- This todo complements `remove-non-claude-platforms` — once we're Claude-only, the hook adapter layer simplifies and the TS implementations only need to handle one output format
- The `_lib/common.sh` file contains vault resolution, bridge calls, and JSON parsing — all of which have better equivalents in TypeScript (Zod parsing, typed bridge client, etc.)
- After migration, hook logic becomes type-checkable via `bunx --bun tsc --noEmit` and testable in the future
- The shell shims are still needed because Claude Code's hook system executes shell commands — but they become trivially thin
