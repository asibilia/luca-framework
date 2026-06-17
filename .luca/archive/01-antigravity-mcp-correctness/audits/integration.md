# Integration Audit (re-review) — Phase 1: antigravity-mcp-correctness

Confirmation review after the review-fix wave (commit `d41c13982` on `1678dcbd4`).

## MUST-FIX resolution: CONFIRMED

1. **SECURITY (was HIGH) — RESOLVED.** `chmodSync(mcpConfigPath, 0o600)` runs after the successful `writeFile` and after the no-token early `return`, so only on the write path. `chmodSync` imported from `node:fs`. Mirrors `writeApiKeyToEnv` SEC-002.
2. **CORRECTNESS (was MEDIUM) — RESOLVED.** `isMuninnRegistered` now probes `~/.gemini/antigravity-cli/mcp_config.json` (matching the writer's `mcpConfigPath`), both keyed on `mcpServers.muninn`. Producer/consumer agree.

## No new MUST-FIX
- Detector retains all prior probes (project `.mcp.json`, user `~/.claude.json`, per-project `projects[cwd].mcpServers`) — the Antigravity probe was added, nothing removed.
- try/catch parse guard wraps only the existing-config read (fallback `{}`); write/chmod success path is outside the try — no masking.
- `MUNINN_MCP_SERVER_URL` const used identically in idempotency-check and write — drift eliminated.

## LOW (non-blocking)
- `readJsonObject` uses `Bun.file` while `wire-claude-hooks.ts` uses `node:fs/promises` — harmless runtime inconsistency.

**Verdict:** `must_fix_resolved: true`, `issues: []` → advance to learn.
