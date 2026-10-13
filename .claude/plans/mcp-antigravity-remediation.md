# Remediation Plan — MuninnDB MCP Automation & Dual-Harness (Claude Code + Antigravity) Support

**Branch:** `feat/mcp-automation`
**Status:** Plan (pre-pipeline). Todos derived from this doc seed the MuninnDB backlog; the luca pipeline implements.
**Date:** 2026-06-13

---

## Background

`luca init` was extended to (1) automate MuninnDB vault creation + MCP registration so users don't hand-craft API keys / config, and (2) support the **Antigravity CLI** harness alongside **Claude Code**. An audit of the committed work (`c6a9c78dc` antigravity support, `a117a37b4` MCP automation) plus the uncommitted diff surfaced correctness regressions in the Antigravity MCP install and several modularity/cleanliness gaps.

## Confirmed ground truth (evidence-backed)

From this machine's working global Antigravity setup + the CLI's own logs + official docs:

1. **`enabledTools` is required.** Without it the server connects but every call fails: `tool muninn_recall is not enabled for server muninn`. The `"*"` wildcard enables all tools. (Source: `~/.gemini/antigravity-cli/log/*.log`; the 40-tool cache at `mcp/muninn/` populated 2026-06-12 12:32 from `mcp_config.json` during a session with **zero** "not enabled" errors.)
2. **`mcp_config.json` is the canonical Antigravity file** — CLI and IDE share it. Antigravity moved MCP config **out of `settings.json`** (that's the legacy Gemini CLI style). The live `settings.json` `mcpServers`/`url` entry is a debugging leftover, **not** a target. (Source: Google Antigravity docs; Medium "Configuring MCP Servers and Skills for Antigravity CLI and IDE".)
3. **`serverUrl` (not `url`)** is correct for Antigravity remote HTTP MCP servers — explicitly different from Cursor/VS Code/old Gemini CLI.
4. **Env-var interpolation does NOT work in Antigravity CLI/IDE.** A `${MUNINN_DB_API_KEY}` value is written literally and never expands — the token must be inlined, or the entry skipped.

## Decisions (locked)

- **D1 — Antigravity MCP target:** `mcp_config.json` **only**. Do not write `settings.json` `mcpServers`. (Web research overrode the initial "both files" lean.)
- **D2 — Claude MCP scope:** **Global, file-merge** (parity with Antigravity; drops the per-project `claude mcp add` shell-out).
- **D3 — Token handling:** Inline the real token from `~/.muninn/mcp.token`; never write the `${MUNINN_DB_API_KEY}` placeholder into Antigravity config (it won't interpolate). If no token is resolvable, skip the MCP write and log actionable guidance.
- **D4 — `enabledTools`:** Write `["*"]`, with a load-bearing code comment citing the "tool not enabled" failure mode.

---

## Workstreams

### WS0 — Canonical config contract (source of truth)
Single constant/factory describing the proven-working Antigravity entry, consumed by both the writer and its idempotency check:
```jsonc
// ~/.gemini/antigravity-cli/mcp_config.json
{ "mcpServers": { "muninn": {
  "serverUrl": "http://127.0.0.1:8750/mcp",
  "headers": { "Authorization": "Bearer <inlined-token>" },
  "enabledTools": ["*"]
}}}
```

### WS1 — Fix `wireAntigravityMcp` + `mergeAntigravityMcpRegistration` (CRITICAL)
File: `packages/luca-cli/src/init/helpers/wire-claude-hooks.ts`
1. Revert the uncommitted `settings.json` switch → write `mcp_config.json` again.
2. Add `enabledTools: ["*"]` to the written entry.
3. Merge, don't replace: `{ ...existing, serverUrl, headers, enabledTools }` so user-set fields survive.
4. Idempotency/correctness check verifies `serverUrl`, `headers.Authorization`, **and** `enabledTools` includes `"*"`.
5. Fix `AntigravitySettings.mcpServers[*]` type to model the real schema (`serverUrl`, `headers`, `enabledTools`, plus stdio `command`/`args`/`env`); drop `url`.
6. Per D3: inline the real token; if absent, skip the write + log guidance (no `${MUNINN_DB_API_KEY}` placeholder).
7. Fix the stale "native SSE transport via serverUrl" comment.

### WS2 — Document settings.json exclusion
Header comment in the writer explaining Antigravity uses the dedicated `mcp_config.json` (not `settings.json mcpServers`, which is legacy Gemini CLI), so the distinction isn't re-litigated. No `settings.json` MCP writes.

### WS3 — Harness abstraction (modular / extensible)
Replace hardcoded `wireClaude*` / `wireAntigravity*` duplication with a descriptor-driven model:
```ts
interface Harness {
  id: 'claude' | 'antigravity'
  displayName: string
  home(): string
  isInstalled(): boolean
  installArtifacts: { agents: boolean; commands: boolean; skills: boolean }
  wireHooks(settings): unknown          // pure merge, per-harness dialect
  mcp: { file: string; buildEntry(token): McpEntry; isCorrect(existing, token): boolean }
}
const HARNESSES: Harness[] = [claudeHarness, antigravityHarness]
```
`luca init` iterates `HARNESSES.filter(h => !skipped(h) && h.isInstalled())`. Per-harness merge fns stay pure + individually exported for testability. Adding a 3rd harness = add one descriptor.

### WS4 — Symmetric, global Claude MCP registration (D2)
Replace the Step-5 per-project `claude mcp add` shell-out with a global file-merge `wireClaudeMcp` routed through the same `Harness.mcp` path as Antigravity — same flow position, same health/token gating.

### WS5 — Remove dead `autoCreateApiKey` + wrong `mk_` regex
`packages/luca-cli/src/utils/vault-setup.ts` + `init.ts` import. It's never called and its regex doesn't match real tokens. Delete it + the unused import + the uncommitted `match && match[1]` tweak. (Live flow correctly uses `~/.muninn/mcp.token`.)

### WS6 — Shared `readMuninnToken()` helper
Extract the duplicated `~/.muninn/mcp.token` read (`init.ts:265-271` + `wire-claude-hooks.ts:153-163`) into one helper consumed by every harness's MCP writer.

### WS7 — Document `build-muninn-instruction.ts` change
Keep the "call directly, not via `call_mcp_tool`" instruction (evidence-backed). Add a comment citing the Antigravity flattened-tool failure mode.

### WS8 — Flags / gating / detection
- Add `--skip-antigravity` (or unified `--skip-harness=<id>`); stop letting `--skip-claude` silently govern both.
- Gate each harness's install/wire on `isInstalled()` so init doesn't scaffold a harness the user doesn't have.
- Align Antigravity MCP gating with the token/health gate (D3) instead of always writing.

### WS9 — Reconcile test-file churn with "tests removed" policy
The uncommitted set both removes `"test": "bun test"` from two `package.json`s and edits five `.test.ts` files. Pick one direction (delete the test files, consistent with policy) so the diff isn't self-contradictory. Orthogonal to MCP; clean before PR.

---

## Verification (no `bun test` per repo policy)
1. `bunx --bun tsc --noEmit` after each change.
2. Golden-config assertion: `mergeAntigravityMcpRegistration({}, 'mdb_x')` deep-equals the WS0 canonical shape incl. `enabledTools: ["*"]` and inlined token.
3. Idempotency: feeding the live working `mcp_config.json` back through the merge is a no-op.
4. Manual smoke: `luca init` into a temp `--home`; diff produced `mcp_config.json` vs the proven file; launch Antigravity CLI, confirm `mcp/<server>/` cache repopulates and a `muninn_recall` call succeeds with zero "not enabled" log errors.

## Sequencing
1. WS0 + WS1 + WS2 (restore Antigravity correctness — unblocks the harness).
2. WS5 + WS6 + WS7 (low-risk cleanup).
3. WS3 + WS4 (harness abstraction + Claude parity) — re-run golden assertions through the new path.
4. WS8 (flags/detection) + WS9 (test-policy cleanup) → PR.

## Sources
- https://antigravity.google/docs/mcp
- https://antigravity.google/docs/cli-features
- https://medium.com/google-cloud/configuring-mcp-servers-and-skills-for-antigravity-cli-and-ide-a938c7eebb78
- Local evidence: `~/.gemini/antigravity-cli/{mcp_config.json,log/*.log,mcp/muninn/}`
