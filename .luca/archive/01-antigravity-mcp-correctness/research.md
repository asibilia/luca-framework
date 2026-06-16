# Research — WS0+WS1+WS2: Fix the Antigravity MCP Registration Writer

## Summary

The uncommitted diff regressed the Antigravity MuninnDB MCP writer in three correctness-critical ways: it switched the write target from `mcp_config.json` to `settings.json`, it dropped the required `enabledTools: ["*"]` field, and it kept the `${MUNINN_DB_API_KEY}` placeholder fallback that Antigravity never interpolates. The fix is fully contained in one file — `packages/luca-cli/src/init/helpers/wire-claude-hooks.ts` — touching `wireAntigravityMcp` (the I/O wrapper), `mergeAntigravityMcpRegistration` (the pure merge), and the `AntigravitySettings.mcpServers` type. No test file references these symbols (the working-tree tests only cover `wireClaudeHooks`), so the verification gate is `bunx --bun tsc --noEmit` plus golden-config/idempotency assertions described below. WS6 token-helper extraction is explicitly out of scope for this phase but the token block should be left swap-ready.

## Current Code State (exact line refs)

File: `packages/luca-cli/src/init/helpers/wire-claude-hooks.ts` (278 lines total).

- **`AntigravitySettings` interface** — lines **54–67**. The `mcpServers` value type (lines 56–65) currently models: `command?`, `args?`, `env?`, `serverUrl?`, `headers?`. It does **not** model `enabledTools`, and it correctly already lacks `url` (the prior `url`-keyed shape is gone from the type, though prior runs may have written `url` to disk — see Risks).
- **`wireAntigravityMcp` (I/O wrapper)** — lines **138–169**.
  - Line **143**: `const settingsPath = join(agyHome, 'settings.json')` — WRONG target (must be `mcp_config.json` per D1).
  - Lines **147–151**: reads existing config from `settingsPath`, cast to `AntigravitySettings`.
  - Lines **153–163**: token-read block — uses `opts.token`, else reads `~/.muninn/mcp.token` via `homedir()`/`existsSync`/`readFile`, swallowing errors. This is the duplicate of `commands/init.ts:265–271` (WS6 target — leave in place this phase).
  - Line **165**: `const next = mergeAntigravityMcpRegistration(existing, token)`.
  - Lines **167–168**: writes `next` to `settingsPath` and logs.
- **`mergeAntigravityMcpRegistration` (pure merge)** — lines **247–277**.
  - Line **254**: `const authHeader = token ? \`Bearer ${token}\` : 'Bearer ${MUNINN_DB_API_KEY}'` — the placeholder fallback violates D3.
  - Lines **257–264**: idempotency/correctness check — verifies only `existing.serverUrl === 'http://127.0.0.1:8750/mcp'` and `existing.headers?.Authorization === authHeader`. Does NOT check `enabledTools` (D4 gap).
  - Lines **266–268**: stale comment "native SSE transport for MuninnDB via serverUrl … falling back to the legacy environment variable if missing." — must be fixed (WS1.7 + WS2).
  - Lines **269–274**: the written entry — `{ serverUrl, headers: { Authorization } }`. Missing `enabledTools`. Note this is a full **replace** of `next.mcpServers.muninn`, not a merge of `...existing` (WS1.3 gap).

Imports already present and reused (no new imports needed): `existsSync` (1), `mkdir/readFile/writeFile` (2), `homedir` (3), `join` (4), `defaultAntigravityHome` (6).

## Required Edits (itemized, file:line)

All edits in `packages/luca-cli/src/init/helpers/wire-claude-hooks.ts`.

1. **D1 — revert file target.** Line **143**: change `join(agyHome, 'settings.json')` → `join(agyHome, 'mcp_config.json')`. Rename the local from `settingsPath` to `mcpConfigPath` for clarity (propagates to lines 147–149 read and 167–168 write/log). The doc-comment at lines 134–137 already says `mcp_config.json`, so it's currently inconsistent with the code; the code revert makes it correct.
2. **WS2 — header/exclusion comment.** Above `wireAntigravityMcp` (≈lines 134–137) or as a load-bearing comment in the merge: document that Antigravity reads MCP config from the dedicated `~/.gemini/antigravity-cli/mcp_config.json` and that `settings.json mcpServers` is legacy Gemini-CLI style and intentionally NOT written. Cite that env-var interpolation does not occur (D3) and that `enabledTools` is required (D4).
3. **D4 — add `enabledTools: ["*"]`.** In the written entry (lines 269–274), add `enabledTools: ['*']`. Add a load-bearing comment citing the failure mode: without it, Antigravity connects but every call fails with `tool muninn_recall is not enabled for server muninn`.
4. **WS1.3 — merge, don't replace.** Lines 269–274: spread the existing entry first: `next.mcpServers.muninn = { ...(existing ?? {}), serverUrl, headers: { ...(existing?.headers ?? {}), Authorization: authHeader }, enabledTools: ['*'] }`. **Stale `url` removal:** if `existing` was written by a prior buggy run containing a `url` key, spreading `...existing` carries `url` forward. The merge MUST explicitly drop it (destructure-and-omit `const { url: _drop, ...rest } = existing ?? {}` then spread `rest`, or `delete next.mcpServers.muninn.url` after building). Confirm a migrated entry is canonical (no `url`).
5. **D4 idempotency — check `enabledTools`.** Lines 257–264: extend the correctness short-circuit to also require `Array.isArray(existing.enabledTools) && existing.enabledTools.includes('*')` AND that no stale `url` key is present. Only then return the no-op `next`.
6. **D3 — token handling.** Line 254: remove the `${MUNINN_DB_API_KEY}` fallback. Recommended approach (option b): keep the merge a clean total function over a present `token: string`; gate in `wireAntigravityMcp` (lines 153–169): if `token` is undefined after the read block, skip the write entirely and `log` actionable guidance (e.g. "MuninnDB token not found at ~/.muninn/mcp.token — run `muninn init`; skipping Antigravity MCP registration"). The skip path must return before `writeFile`. This matches the WS0 golden-config contract (`mergeAntigravityMcpRegistration({}, 'mdb_x')`).
7. **WS1.7 — fix stale comment.** Lines 266–268: replace with an accurate comment: Streamable-HTTP MCP via `serverUrl`, token inlined from `~/.muninn/mcp.token` (no env-var interpolation in Antigravity), `enabledTools: ["*"]` required.
8. **Type fix (WS1.5).** `AntigravitySettings.mcpServers` value type (lines 56–65): add `enabledTools?: string[]`. Keep `command`/`args`/`env` (stdio) and `serverUrl`/`headers` (remote). `url` stays absent.

## Callers & Exports

- **Export site:** `packages/luca-cli/src/init/index.ts` — `wireAntigravityMcp` (line 11) and `mergeAntigravityMcpRegistration` (line 14) re-exported from the `wire-claude-hooks.ts` barrel (lines 8–15); `WireClaudeHooksOptions` at line 16. No signature change planned — exports unaffected (`opts.token` on `WireClaudeHooksOptions` at wire-claude-hooks.ts:14–15 stays).
- **Runtime caller:** `packages/luca-cli/src/commands/init.ts` — import at line **56**; call at line **227** `await wireAntigravityMcp({ log: (msg) => p.log.info(msg) })`, inside Step-4 (lines 220–232), gated only by `!args['skip-claude']`. (WS8 adds per-harness + token gating later — out of scope; the writer's own skip-and-log path from edit #6 already prevents bad writes when the token is absent.)
- **No other callers** of either symbol across `packages/` (grep-verified). `mergeAntigravityMcpRegistration` has exactly one internal caller (wire-claude-hooks.ts:165) plus the barrel export.

## Type Changes

`AntigravitySettings` (wire-claude-hooks.ts:54–67). Target `mcpServers` record value:

```ts
mcpServers?: Record<
    string,
    {
        // stdio transport
        command?: string
        args?: string[]
        env?: Record<string, string>
        // remote HTTP transport (Antigravity uses serverUrl, NOT url)
        serverUrl?: string
        headers?: Record<string, string>
        enabledTools?: string[]
    }
>
```

Only addition is `enabledTools?: string[]`. `url` stays absent so a stale `url` key can't be assigned through the typed path (it can only arrive via untyped JSON.parse of disk — handled by the merge's explicit drop in edit #4).

## Token Handling

- Token read lives in `wireAntigravityMcp` lines **153–163**: prefer `opts.token`, else read+trim `~/.muninn/mcp.token` (`homedir()` join), swallowing errors.
- Duplicates `commands/init.ts:265–271`. **Do NOT extract a shared helper this phase** (WS6). Keep the read block self-contained and structured so a future `readMuninnToken()` drop-in is a one-line swap: `const token = opts.token ?? (await readMuninnToken())`.
- Per D3, after the read block `token` may be `undefined`. The writer must then skip the file write and log guidance (no `${MUNINN_DB_API_KEY}` placeholder ever reaches disk). The pure merge only runs with a present token (golden-config contract).

## Risks & Edge Cases

- **Stale `url`-keyed entry from prior runs.** Earlier code wrote `url` (and the live `settings.json` debugging leftover uses `url`). When migrating an existing `mcp_config.json` muninn entry, the `...existing` spread carries `url` forward unless explicitly dropped. The merge MUST remove `url`. The idempotency check (edit #5) should treat an entry still holding `url` as NOT correct so the migration runs.
- **User-set `enabledTools`.** If a user narrowed `enabledTools`, overwriting to `["*"]` is correct for Luca (D4 load-bearing) but technically clobbers. Overwrite to `["*"]`; document in the load-bearing comment. The idempotency check treats anything not including `"*"` as needing a rewrite.
- **Idempotency when already correct.** Feeding the live working `mcp_config.json` (serverUrl + Bearer <real-token> + `["*"]`, no `url`) back through the merge must be a no-op. The extended check must match the exact `authHeader` derived from the same token; if the on-disk token differs, the merge correctly rewrites the header (same token in practice).
- **Header merge granularity.** Wholesale `headers` replacement drops user-added headers. Prefer `headers: { ...(existing?.headers ?? {}), Authorization: authHeader }`.
- **No-op vs skip ambiguity.** With merge-requires-token, the only skip path is in `wireAntigravityMcp` (token absent). Ensure it returns before `writeFile` so an empty/partial `mcp_config.json` is never produced.

## Verification Plan

Per repo policy: **NO `bun test`**, no new `.test.ts`, no restoring test files. No working-tree test references `mergeAntigravityMcpRegistration`/`wireAntigravityMcp`/the `serverUrl` shape (grep across `packages/**/*.test.ts` = no matches), so nothing breaks from the type/shape change.

1. **Type gate:** `bunx --bun tsc --noEmit` after each edit (verifies the `enabledTools` type addition and merge assignments compile). The only mandated automated gate.
2. **Golden-config assertion (ephemeral):** `mergeAntigravityMcpRegistration({}, 'mdb_x')` deep-equals:
   ```jsonc
   { "mcpServers": { "muninn": {
     "serverUrl": "http://127.0.0.1:8750/mcp",
     "headers": { "Authorization": "Bearer mdb_x" },
     "enabledTools": ["*"]
   }}}
   ```
   (no `url` key; `enabledTools` present).
3. **Idempotency assertion:** feeding the golden output (or the live `~/.gemini/antigravity-cli/mcp_config.json`) back through `mergeAntigravityMcpRegistration(golden, 'mdb_x')` returns an equal object (no-op).
4. **Stale-`url` migration assertion:** `mergeAntigravityMcpRegistration({ mcpServers: { muninn: { url: 'http://127.0.0.1:8750/mcp', headers: {} } } }, 'mdb_x')` produces the canonical shape with NO `url` key.
5. **Skip path (manual smoke):** call `wireAntigravityMcp` with no token and no `~/.muninn/mcp.token` — confirm no file is written and guidance is logged.
6. **Manual smoke (optional, plan step 4):** `luca init` into a temp home; diff produced `mcp_config.json` against the proven file; launch Antigravity CLI; confirm `mcp/muninn/` cache repopulates and a `muninn_recall` call succeeds with zero "not enabled" errors.

## Open Questions

- Header preservation: preserve user custom headers (`{ ...existing.headers, Authorization }`) — recommended yes, low risk.
- Skip-vs-write contract: "merge requires token; skip+log in the wrapper" (edit #6 option b) so the golden-config assertion holds as written.
