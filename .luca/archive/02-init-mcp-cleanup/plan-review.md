# Plan Review — Phase 2: init-mcp-cleanup

## Verdict: APPROVED (round 2, CONVERGED)

Round 1 → NEEDS_REVISION (1 BLOCKING + 3 advisory). Round 2 → all resolved, B(2)=0 < B(1)=1, CONVERGED. No new issues; ID-stability + deliverables mapping compliant.

### Round-1 findings — confirmed resolved
- **G-CRIT-001 (BLOCKING)** — ac-08 repinned to a comment-anchored probe `grep -nE '^\s*(//|\*).*(call_mcp_tool|not enabled|flattened|Antigravity)'`. Verified it returns 0 against build-muninn-instruction.ts today (the only `call_mcp_tool` is the line-56 string literal, not a comment) → correctly fails until the WS7 comment lands.
- **G-SCOPE-001** — Task 1.1.3 guard-removes orphaned `existsSync`/`readFile`/`homedir` from init.ts (keeps `join`, which has 4 other uses); new ac-09 probes zero unused refs.
- **G-DX-001** — `readMuninnToken(path?: string)` optional path (defaults to `~/.muninn/mcp.token`); ac-06 uses a temp fixture + nonexistent path, never the real credential.
- **G-DX-002** — ac-05 tombstoned `[SPLIT → ac-05.1, ac-05.2]`; ac-05.1 (wire-claude-hooks) / ac-05.2 (init.ts) distinct.

### Coverage
- Deliverables: D1→ac-01/02/03 (WS5), D2→ac-04/05.1/05.2/06/07/09 (WS6), D3→ac-08 (WS7). Anti: anti-01 (writeApiKeyToEnv/autoCreateVault stay), anti-02 (phase-1 Antigravity writer invariants unchanged).
- Ground truth verified: `autoCreateApiKey` dead (def + import only); `writeApiKeyToEnv`/`autoCreateVault` live; token-read sites at wire-claude-hooks.ts:177-187 + init.ts:265-271.

## Confidence Gate: ALL-AUTO

`luca confidence gate --slug 02-init-mcp-cleanup` → counts auto=3, research=0, ask=0. Entries (all medium, routed auto): (1) WS5 helper home = new `utils/muninn-token.ts`; (2) WS6 init.ts scope = swap token read only, leave `claude mcp add` shell-out for phase 4; (3) `readMuninnToken(path?: string)` optional path for non-destructive testability. No research, no user questions. Proceeding to execute.
