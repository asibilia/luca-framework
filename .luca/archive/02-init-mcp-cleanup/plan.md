# Plan: Phase 2 — init/MCP cleanup (WS5 + WS6 + WS7)

## Objective
Low-risk cleanup of the init/MCP path: delete dead `autoCreateApiKey`, extract a shared `readMuninnToken()` helper for the duplicated `~/.muninn/mcp.token` read, and document the `build-muninn-instruction.ts` native-invocation change. No behavior change beyond removing dead code.

## Context
Grounded in parent plan `.claude/plans/mcp-antigravity-remediation.md` (WS5/WS6/WS7, sequencing step 2; decisions D2/D3). Phase 3 (harness abstraction), phase 4 (Claude parity / D2 file-merge), and phase 5 (test policy) are OUT OF SCOPE.
Grep-verified ground truth: `autoCreateApiKey` is referenced only at its definition (`vault-setup.ts:135`) and its import (`init.ts:71`) — dead; its `mk_` regex never matches real `mdb_` tokens. `writeApiKeyToEnv` (used by `vault-init.ts:108`) and `autoCreateVault` (used by `init.ts:261`) are LIVE — keep both.
The token read is duplicated: `wire-claude-hooks.ts:177-187` (phase-1 inline try/catch, left swap-ready) and `init.ts:265-271`. New helper home: `packages/luca-cli/src/utils/muninn-token.ts` (credential-file read is a distinct concern from the service/port/registration utils; 2+ cross-module callers → shared utility per the promotion model).

## Phases

### Phase 1: init/MCP cleanup

#### Wave 1: Tracer slice — extract helper + rewire both readers (WS6)
- [ ] **Task 1.1.1**: Create `readMuninnToken(path?: string): Promise<string | undefined>` in new `packages/luca-cli/src/utils/muninn-token.ts` — `path` defaults to `join(homedir(), '.muninn', 'mcp.token')`; reads + trims it, returns `undefined` on absent/error (mirror existing try/catch). The optional param exists only to make ac-06 non-destructive; the two real callers pass nothing.
  - Files: packages/luca-cli/src/utils/muninn-token.ts
  - Verification: ac-04, ac-06
- [ ] **Task 1.1.2**: Rewire `wireAntigravityMcp` to `const token = opts.token ?? (await readMuninnToken())`, deleting the inline read block; preserve the phase-1 token gate + chmod 0600 path exactly.
  - Files: packages/luca-cli/src/init/helpers/wire-claude-hooks.ts
  - Verification: ac-05.1, ac-07, anti-02
  - Dependencies: 1.1.1
- [ ] **Task 1.1.3**: Rewire the `init.ts` token read (lines ~265-271) to `const token = await readMuninnToken()`; leave the `claude mcp add` shell-out untouched (phase-4 scope). Then GUARD-remove orphans: for each of `existsSync` (41), `readFile` (42), `homedir` (43), grep its remaining usage in init.ts — drop only the imports with zero other uses (keep `join`, used elsewhere).
  - Files: packages/luca-cli/src/commands/init.ts
  - Verification: ac-05.2, ac-09, anti-02
  - Dependencies: 1.1.1

#### Wave 2: Remove dead code (WS5)
- [ ] **Task 1.2.1**: Delete `autoCreateApiKey` (+ its JSDoc) from `vault-setup.ts` (~lines 130-158); this also disposes of the uncommitted `(match && match[1])` tweak. Do NOT touch `writeApiKeyToEnv`/`autoCreateVault`.
  - Files: packages/luca-cli/src/utils/vault-setup.ts
  - Verification: ac-01, ac-02, anti-01
- [ ] **Task 1.2.2**: Remove the now-unused `autoCreateApiKey` import in `init.ts` (~line 71), keeping `suggestVaultName`/`autoCreateVault`/`writeVaultConfig`.
  - Files: packages/luca-cli/src/commands/init.ts
  - Verification: ac-02, ac-03
  - Dependencies: 1.2.1

#### Wave 3: Documentation (WS7)
- [ ] **Task 1.3.1**: Add a load-bearing code comment in `build-muninn-instruction.ts` explaining WHY agents must call the MCP tool natively (not via `call_mcp_tool`): the Antigravity flattened-tool failure mode where `mcp__muninn__*` tools returned "not enabled"/"unknown tool name" until invoked natively (ref pitfall:antigravity-mcp-enabledtools-required). Keep the instruction text unchanged.
  - Files: packages/luca-cli/src/write-surface/helpers/build-muninn-instruction.ts
  - Verification: ac-08

## Deliverables
- **D1** (WS5): dead `autoCreateApiKey` + its import removed, no symbol left → ac-01, ac-02, ac-03
- **D2** (WS6): single shared `readMuninnToken()` consumed by both former inline readers, no orphaned imports → ac-04, ac-05.1, ac-05.2, ac-06, ac-07, ac-09
- **D3** (WS7): native-invocation rationale documented in build-muninn-instruction.ts → ac-08

## Verification Criteria
- **ac-01**: `grep -rn 'autoCreateApiKey' packages/ --include='*.ts'` returns zero non-`.test.ts` matches.
- **ac-02**: `bunx --bun tsc --noEmit` exits 0.
- **ac-03**: `grep -n 'autoCreateVault' packages/luca-cli/src/commands/init.ts` still matches (live import preserved).
- **ac-04**: `grep -c 'export async function readMuninnToken' packages/luca-cli/src/utils/muninn-token.ts` equals 1.
- **ac-05**: [SPLIT → ac-05.1, ac-05.2]
- **ac-05.1**: `grep -n 'readMuninnToken' packages/luca-cli/src/init/helpers/wire-claude-hooks.ts` shows a call site (wire-claude-hooks rewired).
- **ac-05.2**: `grep -n 'readMuninnToken' packages/luca-cli/src/commands/init.ts` shows a call site (init.ts rewired).
- **ac-06**: `bun -e` probe using a TEMP fixture path (never the real token file) — `readMuninnToken('<temp file containing " tok \n">')` returns `"tok"` (trimmed) AND `readMuninnToken('<nonexistent path>')` returns `undefined`.
- **ac-07**: `grep -n 'chmodSync(mcpConfigPath, 0o600)' packages/luca-cli/src/init/helpers/wire-claude-hooks.ts` still matches (phase-1 chmod path intact).
- **ac-08**: `grep -nE '^\s*(//|\*).*(call_mcp_tool|not enabled|flattened|Antigravity)' packages/luca-cli/src/write-surface/helpers/build-muninn-instruction.ts` returns ≥1 — a `//` or JSDoc `*` COMMENT line referencing the failure mode (NOT the instruction-string literal, which already contains `call_mcp_tool` today).
- **ac-09**: After Task 1.1.3, init.ts has no unused `existsSync`/`readFile`/`homedir` import — for each symbol, `grep -c '<symbol>' packages/luca-cli/src/commands/init.ts` shows 0 (import line gone) OR ≥2 (still genuinely used).

### Anti-criteria (regression guards)
- **anti-01**: MUST NOT — `grep -n 'writeApiKeyToEnv\|autoCreateVault' packages/luca-cli/src/utils/vault-setup.ts` must still match both definitions (live functions not deleted).
- **anti-02**: MUST NOT — change the phase-1 Antigravity writer behavior; `grep -n "serverUrl: MUNINN_MCP_SERVER_URL\|enabledTools: \['\*'\]\|chmodSync(mcpConfigPath, 0o600)" packages/luca-cli/src/init/helpers/wire-claude-hooks.ts` must still match all three (mcp_config.json target, enabledTools `["*"]`, chmod 0600, token gate untouched).

## Risks & Mitigations
- Removing the import without removing the call could break tsc — Wave 2 deletes definition + import together, gated by ac-02.
- Helper proliferation — justified: two cross-module callers, deletion test passes (deleting it redistributes the duplicate read).
- Reviewer may expect the `claude mcp add` shell-out removed too — explicitly deferred to phase 4 (D2); only the token READ seam is in scope here.
- No new/restored `.test.ts`; ac-06 is an ephemeral `bun -e` spec probe against a TEMP fixture path (never the real `~/.muninn/mcp.token`), not a persisted test (repo policy).
- Rewiring init.ts orphans `existsSync`/`readFile`/`homedir`; tsc won't catch them (noUnusedLocals:false), so Task 1.1.3 guard-removes them (ac-09).

## Decisions
- 2026-06-13 — `readMuninnToken()` lives in new `packages/luca-cli/src/utils/muninn-token.ts` (logged: WS6-readMuninnToken-home).
- 2026-06-13 — init.ts token-read swapped only; `claude mcp add` shell-out left for phase 4 (logged: WS6-init.ts-scope).
- 2026-06-13 — `readMuninnToken(path?: string)` gains an optional path (default `~/.muninn/mcp.token`) so ac-06 probes a temp fixture, never the real credential (logged: design-readMuninnToken-signature).
