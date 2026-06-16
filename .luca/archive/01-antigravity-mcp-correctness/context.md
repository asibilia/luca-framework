# Context — Phase 1: antigravity-mcp-correctness

**Scope (FIXED):** WS0+WS1+WS2 only — fix the Antigravity MuninnDB MCP registration writer in `packages/luca-cli/src/init/helpers/wire-claude-hooks.ts`. Nothing else (harness abstraction, Claude parity, cleanup, test policy are later phases).

**Oversight:** full-auto. Decisions below were pre-locked from `.claude/plans/mcp-antigravity-remediation.md` (evidence + web research) and the phase research at `research.md`. No open user questions remain.

## Locked Decisions

| ID | Decision | Rationale (evidence) |
|----|----------|----------------------|
| D1 | Write `~/.gemini/antigravity-cli/mcp_config.json` **only**. Revert the uncommitted `settings.json` switch. Never write `settings.json mcpServers`. | Antigravity moved MCP config into the dedicated `mcp_config.json`; `settings.json mcpServers` is legacy Gemini-CLI style. Confirmed by antigravity.google/docs/mcp + the proven-working local file (tool cache enumerated from `mcp_config.json`). |
| D3 | Inline the real token read from `~/.muninn/mcp.token`. Never emit the literal `${MUNINN_DB_API_KEY}` placeholder. | Antigravity CLI/IDE does NOT interpolate env vars (Medium CLI/IDE config article + local logs). A placeholder would be written literally and never resolve. |
| D4 | Write `enabledTools: ["*"]` — **required, load-bearing.** | Without it Antigravity connects but every tool call fails: `tool muninn_recall is not enabled for server muninn` (proven from `~/.gemini/antigravity-cli/log/*.log`). `"*"` enables all tools. |
| Q1 | Preserve user-set custom headers: `headers: { ...(existing?.headers ?? {}), Authorization: authHeader }`. | Don't clobber user-added headers; only guarantee Authorization. Low risk. |
| Q2 | Token contract = `mergeAntigravityMcpRegistration` is a **total function over a present token** (`token: string`). `wireAntigravityMcp` resolves the token, and if none is found it **skips the write and logs actionable guidance** (no empty/partial file). | Keeps the merge pure for the golden-config assertion; keeps the no-token path safe. |

## Implementation Constraints (HOW, not WHETHER)

- **Merge-not-replace:** build the muninn entry by spreading the existing entry, then overriding `serverUrl`, `headers` (with preserved customs), and `enabledTools`.
- **Stale `url` migration:** an existing entry written by a prior buggy run (or the `settings.json` leftover shape) may carry a `url` key. The merge MUST explicitly drop `url` so the migrated entry is canonical (destructure-omit or `delete`).
- **Idempotency / correctness short-circuit:** treat an entry as already-correct (no-op) ONLY when it has `serverUrl === 'http://127.0.0.1:8750/mcp'` AND `headers.Authorization === authHeader` AND `Array.isArray(enabledTools) && enabledTools.includes('*')` AND no stale `url` key. Anything else triggers a rewrite/migration.
- **Type:** add `enabledTools?: string[]` to the `AntigravitySettings.mcpServers` value type; keep `serverUrl`/`headers` (remote) and `command`/`args`/`env` (stdio); keep `url` absent.
- **Comments:** fix the stale "native SSE transport via serverUrl … legacy environment variable" comment; add a WS2 header comment documenting `mcp_config.json` (not `settings.json`) is the Antigravity MCP file and why; add a load-bearing comment on `enabledTools` citing the "not enabled" failure mode.

## Canonical output shape (the writer must produce exactly this)

```jsonc
// ~/.gemini/antigravity-cli/mcp_config.json
{ "mcpServers": { "muninn": {
  "serverUrl": "http://127.0.0.1:8750/mcp",
  "headers": { "Authorization": "Bearer <inlined-real-token>" },
  "enabledTools": ["*"]
}}}
```

## Out of Scope (deferred to later phases)

- WS6 — extract a shared `readMuninnToken()` helper (the duplicate token read in `commands/init.ts` stays this phase; keep the block swap-ready: `const token = opts.token ?? (await readMuninnToken())`).
- WS3/WS4/WS8 — harness abstraction, Claude global MCP parity, per-harness flags/gating.

## Verification

- `bunx --bun tsc --noEmit` (only mandated automated gate; **no `bun test`**, no new/restored `.test.ts`).
- Golden-config assertion: `mergeAntigravityMcpRegistration({}, 'mdb_x')` deep-equals the canonical shape (no `url`, `enabledTools: ["*"]`).
- Idempotency assertion: re-feeding the golden output is a no-op.
- Stale-`url` migration assertion: input `{ mcpServers: { muninn: { url, headers: {} } } }` → canonical shape with NO `url`.
- Skip path: no token + no `~/.muninn/mcp.token` → no file written, guidance logged.
