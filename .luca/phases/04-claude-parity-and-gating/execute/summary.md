# Execute Summary — 04-claude-parity-and-gating (3 waves)

WS4 (global Claude MCP file-merge replacing the `claude mcp add` shell-out) + WS8 (per-harness skip flags + isInstalled gating).

## Files changed (committed)
- `packages/luca-cli/src/init/helpers/wire-claude-hooks.ts` — `ClaudeUserConfig` type; pure `mergeClaudeMcpRegistration(config, token)` (Claude SSE schema `{type:'sse',url:MUNINN_MCP_SERVER_URL,headers:{...existing,Authorization}}`, merge-not-replace, strips stale Antigravity-shape `serverUrl`/`enabledTools`, 4-part idempotency); `wireClaudeMcp` I/O wrapper writing `~/.claude.json` (try/catch parse guard, `readMuninnToken` gate + skip/log, **atomic temp+rename**, chmod 0600 never-loosen).
- `packages/luca-cli/src/init/helpers/harness.ts` — `claudeHarness.mcp.wire = wireClaudeMcp`; JSDoc updated.
- `packages/luca-cli/src/commands/init.ts` — removed Step-5 `claude mcp add` Bun.spawn shell-out; added `--skip-antigravity`; per-harness `skipMap`; Step-4 loop gated on `!skipped && h.isInstalled()` (with a comment documenting the WS8 behavior change: no longer pre-seeds an absent harness home).

## Claude schema (confirmed from live ~/.claude.json)
`{ "type": "sse", "url": "http://127.0.0.1:8750/mcp", "headers": { "Authorization": "Bearer <token>" } }` in top-level `mcpServers` — distinct from Antigravity.

## Verification
- `bunx --bun tsc --noEmit` → exit 0; `luca rules run` → 0 findings.
- ac-01..ac-11 all PASS incl. ac-03 (preserves unrelated keys + sibling server) and the migration-strip fixture (stale serverUrl/enabledTools dropped → only type/url/headers).
- anti-01 (no clobber — merge-only), anti-02 (skip-claude excludes Claude only), anti-03 (no `${MUNINN_DB_API_KEY}` in Claude writer), anti-04 (Antigravity invariants intact) all PASS.
- `isMuninnRegistered` already probes `~/.claude.json` top-level mcpServers = the write target; aligned, no change.

## Safety
- Real `~/.claude.json` NOT touched (mtime/perms unchanged; writer runs only during a real `luca init`, not run here). All probes against temp fixtures. Atomic write = temp file in `$HOME` (`.claude.json.luca-<pid>-<ts>.tmp`) + `rename` (same-fs atomic replace).

## Commits (not pushed)
- `b03504727` feat(luca-framework): global Claude MCP file-merge (wireClaudeMcp)
- `a26885f40` refactor(luca-framework): route Claude MCP through harness registry
- `e4eef6306` feat(luca-framework): per-harness skip flags + isInstalled gating

## Deviations
1. Waves 2/3 committed split by file (harness.ts; init.ts) rather than shell-out-vs-flags — both init.ts changes are cohesive in one file.
2. Subagent could not write this summary (report-file policy) — persisted by orchestrator. Atomic-write/mode-preservation design logged via `luca confidence log`.

## Security-fix wave (loop-back from REVIEWING — security.md REQUEST_CHANGES)
Three findings from `audits/security.md` fixed in `wire-claude-hooks.ts` only:
- **FIX-1 (MUST, CRITICAL clobber).** Prior `wireClaudeMcp` read fell back to `existing = {}` on ANY `JSON.parse` throw — a populated-but-malformed `~/.claude.json` (trailing comma/comment) → `{}` → merge → atomic `rename` durably & TOTALLY replaced the user's primary config. Replaced with a three-case read guard: absent OR whitespace-only → `{}`; present + parses → parsed; present-non-empty + parse THROWS → **abort** (`log` actionable guidance + `return` before any write/rename). Same guard applied to `wireAntigravityMcp` for `mcp_config.json`.
- **FIX-2 (MUST, token temp world-readable window).** `wireClaudeMcp` now writes the temp restrictive FROM INCEPTION: `writeFile(tmpPath, data, { mode })` (mode = min(0o600, existingMode), 0o600 fresh); the temp never exists 0644 while holding the Bearer token. `chmodSync` retained as belt-and-suspenders. `wireAntigravityMcp` `writeFile` gained `{ mode: 0o600 }` (chmodSync retained).
- **FIX-3 (SHOULD, temp cleanup on failure).** `wireClaudeMcp` writeFile→chmod→rename wrapped in try/catch that `unlink`s the temp on error before rethrowing; `unlink` imported from `node:fs/promises`. No orphaned token-bearing `.tmp` left in `$HOME`.

### Verification (temp-HOME fixtures only — real configs untouched)
- `bunx --bun tsc --noEmit` → exit 0.
- Clobber guard: malformed populated fixture → file UNCHANGED, no muninn written, skip logged, NO write logged, no leftover `.tmp`. Absent → created (SSE+auth, mode 0600). Valid populated → theme/projects/sibling-mcp preserved + muninn added. Whitespace-only → treated as `{}`, muninn added.
- Temp perms: source confirms `writeFile(tmpPath, ..., { mode })` (inception mode); all fixtures end at final mode 0600 with no leftover `.tmp`. Transient temp mode not directly observable (renamed within microseconds) → reasoned over code per Verification Doctrine.
- ac-03 golden merge still deep-equals; anti-04 Antigravity invariants (`serverUrl`/`enabledTools:['*']`/0600/`readMuninnToken`) intact.
- Real `~/.claude.json` and `~/.gemini/antigravity-cli/mcp_config.json` never read/written by fixtures (every fixture overrode `HOME` to an `mktemp` dir in a fresh child process); mtimes predate this wave.

### Commit
Stage-gate-blocked in pipelineStep=execute (`bash-commit` not allowed in EXECUTING). Single file left unstaged for the orchestrator to commit with message: `fix(luca-framework): guard ~/.claude.json clobber on malformed JSON + restrict token temp perms`.
