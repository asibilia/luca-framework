# Plan: Antigravity MCP Registration Correctness (Phase 1/5)

## Objective
Fix the Antigravity MuninnDB MCP writer in `wire-claude-hooks.ts` so `luca init`
writes a correct, idempotent `~/.gemini/antigravity-cli/mcp_config.json` — right
target file (D1), inlined real token (D3), and load-bearing `enabledTools: ["*"]`
(D4) — merging-not-replacing and migrating stale `url` entries.

## Context
Single-file scope: `packages/luca-cli/src/init/helpers/wire-claude-hooks.ts`,
touching `AntigravitySettings`, `wireAntigravityMcp` (I/O wrapper, lines 138-169),
and `mergeAntigravityMcpRegistration` (pure merge, lines 247-277). Decisions are
pre-locked in `context.md` (D1/D3/D4/Q1/Q2) and edit points are itemized in
`research.md`. Out of scope: WS6 token-helper extraction (note as deferred seam),
all later phases. Repo policy: NO `bun test`, no new/restored `.test.ts` — gate is
`bunx --bun tsc --noEmit`; golden/idempotency/migration assertions are
SPECIFICATION probes the verifier checks by reading code + reasoning (or an
ephemeral `bun -e` eval), NOT persisted test files.

## Phases

### Phase 1: Antigravity MCP writer fix

#### Wave 1: Single-file correctness (tracer = the whole fix)
One file, one barrel export surface unchanged; tasks are sequential but each is
independently verifiable. Each task keeps the file `tsc`-clean.

- [ ] **Task 1.1.1**: Add `enabledTools?: string[]` to the `AntigravitySettings.mcpServers` value type (after `headers`, lines 56-65); keep `url` absent. (D4 type / research edit #8)
  - Files: packages/luca-cli/src/init/helpers/wire-claude-hooks.ts
  - Verification: ac-01

- [ ] **Task 1.1.2**: In `wireAntigravityMcp`, revert target to `mcp_config.json` — rename local `settingsPath` -> `mcpConfigPath` (line 143) and propagate to read (147-149), write, and log (167-168). (D1 / research edit #1)
  - Files: packages/luca-cli/src/init/helpers/wire-claude-hooks.ts
  - Verification: ac-01, ac-06, anti-01
  - Dependencies: 1.1.1

- [ ] **Task 1.1.3**: In `wireAntigravityMcp`, gate on token presence (Q2/D3): if `token` is undefined after the read block, log actionable guidance and `return` before `writeFile` (never write a partial file); keep the token block swap-ready for WS6. Lands as one tsc-clean unit with 1.1.4 (the merge signature tightens to `token: string`). (research edit #6)
  - Files: packages/luca-cli/src/init/helpers/wire-claude-hooks.ts
  - Verification: ac-05.1, ac-05.2, ac-01, anti-02
  - Dependencies: 1.1.2

- [ ] **Task 1.1.4**: Tighten `mergeAntigravityMcpRegistration`'s param to required `token: string` (drop the `?`), making it a total fn over a present token; build the entry merge-not-replace: spread existing minus stale `url` (destructure-omit), set `serverUrl`, `headers: { ...(existing?.headers ?? {}), Authorization: authHeader }` (Q1), `enabledTools: ['*']`; remove the `${MUNINN_DB_API_KEY}` fallback. (D3/D4/Q1/Q2 / research edits #3,#4)
  - Files: packages/luca-cli/src/init/helpers/wire-claude-hooks.ts
  - Verification: ac-02, ac-04, ac-01, anti-02
  - Dependencies: 1.1.1, 1.1.3

- [ ] **Task 1.1.5**: Extend the idempotency/correctness short-circuit (lines 257-264) to require all four: `serverUrl === 'http://127.0.0.1:8750/mcp'` AND `headers.Authorization === authHeader` AND `Array.isArray(enabledTools) && enabledTools.includes('*')` AND no stale `url` key. (research edit #5)
  - Files: packages/luca-cli/src/init/helpers/wire-claude-hooks.ts
  - Verification: ac-03, ac-04, ac-01
  - Dependencies: 1.1.4

- [ ] **Task 1.1.6**: Fix comments: replace the stale SSE/legacy-env comment (266-268) with accurate Streamable-HTTP + inlined-token wording; add a WS2 header comment (mcp_config.json not settings.json, no env interpolation); add a load-bearing `enabledTools` comment citing the "tool ... is not enabled" failure mode. (D1/D3/D4 / research edits #2,#7)
  - Files: packages/luca-cli/src/init/helpers/wire-claude-hooks.ts
  - Verification: ac-01
  - Dependencies: 1.1.4

## Deliverables
- **D1-target**: writer targets `mcp_config.json` only; never `settings.json` mcpServers (locked D1) -> ac-06, anti-01
- **D3-token**: real token inlined; literal `${MUNINN_DB_API_KEY}` never reaches disk (locked D3) -> ac-02, ac-05.1, anti-02
- **D4-tools**: `enabledTools: ["*"]` written and required for idempotency (locked D4) -> ac-02, ac-03, ac-04
- **D-merge**: merge-not-replace, preserve user headers (Q1), migrate/drop stale `url` -> ac-02, ac-04
- **D-skip**: no token => no file written, guidance logged (Q2) -> ac-05.1, ac-05.2
- **D-gate**: file type-checks clean -> ac-01

## Verification Criteria
- **ac-01**: `bunx --bun tsc --noEmit` exits 0.
- **ac-02**: SPEC PROBE (read code + reason, or `bun -e`) — `mergeAntigravityMcpRegistration({}, 'mdb_x')` deep-equals `{ mcpServers: { muninn: { serverUrl: 'http://127.0.0.1:8750/mcp', headers: { Authorization: 'Bearer mdb_x' }, enabledTools: ['*'] } } }` with NO `url` key.
- **ac-03**: SPEC PROBE — feeding ac-02's golden output back: `mergeAntigravityMcpRegistration(<golden>, 'mdb_x')` deep-equals the same golden object (no-op).
- **ac-04**: SPEC PROBE — `mergeAntigravityMcpRegistration({ mcpServers: { muninn: { url: 'http://127.0.0.1:8750/mcp', headers: {} } } }, 'mdb_x')` deep-equals the ac-02 golden object (canonical shape, NO `url` key, Authorization injected into empty headers).
- **ac-05.1**: SPEC PROBE — `wireAntigravityMcp` with no `opts.token` and no `~/.muninn/mcp.token` present returns before `writeFile` (no file is written).
- **ac-05.2**: SPEC PROBE — same precondition as ac-05.1, `log` is invoked with actionable token-missing guidance.
- **ac-06**: Grep — `grep -n "mcp_config.json" packages/luca-cli/src/init/helpers/wire-claude-hooks.ts` matches in `wireAntigravityMcp`'s path/read/write.

### Anti-criteria (regression guards)
- **anti-01**: MUST NOT — writer MUST NOT reference `settings.json` in `wireAntigravityMcp`'s write path. Probe: `grep -n "settings.json" wire-claude-hooks.ts` shows zero hits inside `wireAntigravityMcp` (the Claude `wireClaudeHooks` hit is expected and allowed).
- **anti-02**: MUST NOT — the literal string `${MUNINN_DB_API_KEY}` MUST NOT appear anywhere in the file. Probe: `grep -F 'MUNINN_DB_API_KEY' wire-claude-hooks.ts` returns no matches.
- **anti-03**: MUST NOT — no new or restored `.test.ts` file introduced (repo no-tests policy). Probe: `git status --porcelain '**/*.test.ts'` shows no additions.

## Risks & Mitigations
- Stale `url` carried by `...existing` spread -> destructure-omit drop in 1.1.4; idempotency treats a remaining `url` as not-correct (1.1.5).
- Wholesale header replace clobbers user headers -> Q1 spread `{ ...existing.headers, Authorization }` (1.1.4).
- Empty/partial file on missing token -> skip-and-return before `writeFile` (1.1.3, ac-05/anti-02).
- WS6 seam: token read stays inline this phase but structured so `const token = opts.token ?? (await readMuninnToken())` is a one-line future swap (deferred, not in scope).

## Decisions
- 2026-06-13 — Stale `url` dropped via destructure-omit (pure) over post-build `delete` (logged: confidence high, design-choice).
- 2026-06-13 — Idempotency no-op is a four-part conjunction (serverUrl + Authorization + enabledTools includes '*' + no url) (logged: confidence high, design-choice).
- 2026-06-13 — Golden/idempotency/migration assertions are spec probes, NOT `.test.ts` (repo no-tests policy).
