# Plan: Phase 4 — Claude MCP parity (file-merge) + harness gating

## Objective
Bring Claude Code MCP registration to parity with Antigravity: a global file-merge `wireClaudeMcp` writing the `muninn` entry into `~/.claude.json` top-level `mcpServers` (WS4, decision D2), replacing the per-project `claude mcp add` shell-out. Add per-harness skip flags + `isInstalled()` gating so init only scaffolds harnesses the user has (WS8).

## Context
- **Confirmed Claude SSE schema** (from live `~/.claude.json`): `{ "type": "sse", "url": "http://127.0.0.1:8750/mcp", "headers": { "Authorization": "Bearer <token>" } }` under top-level `mcpServers`. DIFFERENT from Antigravity's `serverUrl`/`enabledTools` — do not copy those.
- Mirror phase-1 Antigravity patterns in `wire-claude-hooks.ts`: pure merge fn + I/O wrapper, idempotency short-circuit, try/catch parse guard, inline token via `readMuninnToken()` (WS6 done), skip+log if absent (D3).
- `~/.claude.json` is the user's PRIMARY config — merge-not-replace is catastrophic if violated. Preserve all other top-level keys AND other `mcpServers` entries.
- `claudeHarness` has no `mcp` field; init.ts Step-4 loop (219-222) iterates ALL harnesses unconditionally; `--skip-claude` (214) gates the WHOLE block; `isInstalled()` exists but is unused (phase-3 anti-03).
- `isMuninnRegistered` already probes `~/.claude.json` top-level `mcpServers` (muninn-mcp-registration.ts:46-47) — aligns with the write target; no change needed (confirm only).

## Phases

### Phase 1: Claude MCP file-merge writer (WS4)

#### Wave 1: Pure merge fn + writer (tracer bullet — full path schema→merge→write)
- [ ] **Task 1.1.1**: Add `ClaudeUserConfig` type (top-level `mcpServers?: Record<string, {type?,url?,headers?,command?,args?,env?}>` + `[k:string]:unknown` passthrough) and `mergeClaudeMcpRegistration(config, token)` in `wire-claude-hooks.ts`. Pure: spread-preserve all config keys + all other `mcpServers`; idempotency short-circuit when `muninn` already has `type:'sse'`, matching `url`, and `Bearer <token>` header; else write `{ type:'sse', url, headers:{...existing, Authorization } }` using the confirmed Claude schema (NOT serverUrl/enabledTools).
  - Files: `packages/luca-cli/src/init/helpers/wire-claude-hooks.ts`
  - Verification: ac-01, ac-02, ac-03, anti-01, anti-04
  - Dependencies: none
- [ ] **Task 1.1.2**: Add `wireClaudeMcp(opts)` I/O wrapper writing `~/.claude.json` (path via `join(homedir(),'.claude.json')`, NOT `home/settings.json`): read+try/catch parse guard (fall back to `{}` only on parse error, never on a populated file), resolve `opts.token ?? await readMuninnToken()`, skip+log actionable guidance if absent (D3), call merge, write. FIRST stat existing mode; chmod 0600 after write but never loosen a stricter existing mode.
  - Files: `packages/luca-cli/src/init/helpers/wire-claude-hooks.ts`
  - Verification: ac-04, ac-05, anti-01

#### Wave 2: Register on descriptor + remove shell-out
- [ ] **Task 1.2.1**: Add `mcp: { wire: (opts) => wireClaudeMcp(opts) }` to `claudeHarness` in `harness.ts`; update the descriptor JSDoc (drop the "Claude MCP via Step-5 shell-out" note).
  - Files: `packages/luca-cli/src/init/helpers/harness.ts`
  - Verification: ac-06
- [ ] **Task 1.2.2**: Remove the Step-5 `claude mcp add` Bun.spawn block (init.ts ~262-284) and its now-unused readout guidance if newly dead; Claude MCP now flows through the Step-4 `h.mcp.wire` loop. Keep `automatedVaultName`/vault creation.
  - Files: `packages/luca-cli/src/commands/init.ts`
  - Verification: ac-07, anti-03

### Phase 2: Flags + isInstalled gating (WS8)

#### Wave 3: Per-harness skip flags + loop gating
- [ ] **Task 2.1.1**: Add `--skip-antigravity` boolean arg; keep `--skip-claude` but redefine it to mean Claude ONLY. Map each harness `id` to its skip flag (`claude`→`skip-claude`, `antigravity`→`skip-antigravity`). Chose per-harness booleans over `--skip-harness=<id>` repeatable: simpler, matches existing `--skip-*` arg style, only 2 harnesses (justify in Decisions).
  - Files: `packages/luca-cli/src/commands/init.ts`
  - Verification: ac-08, ac-09
- [ ] **Task 2.1.2**: In the Step-4 loop, gate each harness's `wireHooks`+`mcp.wire` on `!skipped(h) && h.isInstalled()`. Run `installSkills`/`installStatusline` unconditionally if ANY harness active (carry-forward deferred — see Decisions). Keep MCP token/health: writers already skip+log when no token (D3); do not force a write.
  - Files: `packages/luca-cli/src/commands/init.ts`
  - Verification: ac-10, ac-11, anti-02

## Deliverables
- **D1** (WS4 — global Claude MCP file-merge replacing shell-out) → ac-01, ac-02, ac-04, ac-06, ac-07
- **D2** (WS8 — per-harness skip flags + isInstalled gating) → ac-08, ac-10, ac-11

## Verification Criteria
- **ac-01**: `bunx --bun tsc --noEmit` exits 0.
- **ac-02**: `grep -n "export function mergeClaudeMcpRegistration" wire-claude-hooks.ts` returns a match (pure, exported).
- **ac-03**: `bun -e` on a TEMP fixture: `mergeClaudeMcpRegistration({foo:'keep',mcpServers:{other:{}}},'mdb_x')` deep-equals `{foo:'keep',mcpServers:{other:{},muninn:{type:'sse',url:'http://127.0.0.1:8750/mcp',headers:{Authorization:'Bearer mdb_x'}}}}` (preserves unrelated keys + other servers, Claude schema).
- **ac-04**: `grep -nE "type: ?'sse'|url:|Authorization" wire-claude-hooks.ts` shows the Claude entry uses `type`/`url`/`headers` (NOT serverUrl/enabledTools) in `mergeClaudeMcpRegistration`.
- **ac-05**: `grep -n "chmodSync.*0o600\|readMuninnToken" wire-claude-hooks.ts` confirms 0600 chmod + token read in `wireClaudeMcp`.
- **ac-06**: `grep -n "mcp:" harness.ts` shows `claudeHarness` now has an `mcp` field.
- **ac-07**: `grep -rn "claude.*mcp.*add\|Bun.spawn" packages/luca-cli/src/commands/init.ts` returns NO `claude mcp add` shell-out match.
- **ac-08**: `grep -n "'skip-antigravity'" init.ts` shows the arg is defined.
- **ac-09**: `grep -n "skip-claude" init.ts` shows it no longer guards the whole Step-4 block (gates only the claude harness).
- **ac-10**: `grep -n "isInstalled" init.ts` returns a match (phase-3 anti-03 reversed — now USED).
- **ac-11**: `bun -e` against TEMP fixture dirs: the Step-4 loop's gating predicate skips a harness whose `home()` does not exist (isInstalled gate active).

### Anti-criteria (regression guards)
- **anti-01**: MUST NOT clobber/replace whole `~/.claude.json` — merge only. Probe: ac-03 shows unrelated top-level keys + sibling mcpServers survive.
- **anti-02**: MUST NOT let `--skip-claude` govern Antigravity. Probe: ac-09 — skip-claude no longer wraps the loop.
- **anti-03**: MUST NOT write the `${MUNINN_DB_API_KEY}` placeholder for Claude. Probe: `grep -n 'MUNINN_DB_API_KEY' wire-claude-hooks.ts` returns no match in the Claude writer.
- **anti-04**: MUST NOT alter phase-1 Antigravity writer invariants. Probe: `grep -nE "serverUrl|enabledTools.*\*|0o600|readMuninnToken" wire-claude-hooks.ts` still shows the Antigravity `serverUrl`/`enabledTools:['*']`/0600/token invariants intact.

## Risks & Mitigations
- **Catastrophic `~/.claude.json` corruption**: it is the user's PRIMARY config. Mitigate: pure merge with full key-spread preservation (ac-03), parse-guard falls back to `{}` ONLY on JSON error never on a readable populated file, idempotency short-circuit. Spec probes run against TEMP fixtures — NEVER the real `~/.claude.json`.
- **Mode loosening**: existing `~/.claude.json` may have a stricter mode; stat-first, never loosen.
- **Health gating drift**: keep existing D3 contract (writer skips+logs on missing token); do not add a `muninndbHealthy` force-write for Claude.

## Decisions
- 2026-06-14 — Claude SSE schema confirmed from live `~/.claude.json`: `{type:'sse',url,headers:{Authorization:'Bearer …'}}` top-level `mcpServers`. Distinct from Antigravity serverUrl/enabledTools.
- 2026-06-14 — Per-harness `--skip-claude`/`--skip-antigravity` booleans over `--skip-harness=<id>` repeatable: only 2 harnesses, matches existing `--skip-*` style, simpler.
- 2026-06-14 — `mergeClaudeMcpRegistration`/`wireClaudeMcp` live alongside the Antigravity writer in `wire-claude-hooks.ts` (cohesive harness-wiring module, one place for all three harnesses; deletion test: extracting to a new file = pass-through, no complexity concentration).
- 2026-06-14 — DEFER carry-forward (driving `installSkills` off `h.installArtifacts`/`h.home()`, modeling `installStatusline` as per-harness capability): larger refactor, out of WS4+WS8 scope. `installSkills`/`installStatusline` stay unconditional this phase. Follow-up.
- 2026-06-14 — confidence-log + `luca plan lint` not run: this is the plan step under full-auto; Bash for those CLI surfaces is gated here. Rationale captured in lieu of the journal entry.
