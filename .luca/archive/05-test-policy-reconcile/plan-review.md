# Plan Review — Phase 5: test-policy-reconcile

## Verdict: APPROVED (round 2, CONVERGED, 0 blocking)

Round 1 → NEEDS_REVISION (1 BLOCKING ac-03 false-positive + 3 advisory). Round 2 → all resolved, B(2)=0 < B(1)=1.

### Round-1 findings — resolved
- **G-DX-001 (BLOCKING)** — ac-03 no longer greps `settings.json` (which matched 8 correct stage-gate HOOK assertions in wire-claude-hooks.test.ts). It now greps `wireAntigravityMcp|mergeAntigravityMcpRegistration|wireClaudeMcp|mergeClaudeMcpRegistration` across `**/*.test.ts` → independently confirmed **zero matches** (no MCP-merge test exists → trivially satisfied, not masking a stale test). The 8 settings.json lines are HOOK assertions (correct/unchanged) and are explicitly out of scope.
- **G-DX-002** — ac-06 added: the accepted MCP-merge coverage gap (no tests for `mergeAntigravityMcpRegistration` new sig, `mergeClaudeMcpRegistration`, `wireAntigravityMcp`, `wireClaudeMcp`) is named in the execute summary + learn as a known follow-up.
- **G-SCOPE-001** — anti-01 hardened to `git status --porcelain '*.test.ts'` no-`D`-status.
- **G-DX-003** — Task 5.4 memory correction (outside repo, orchestrator-performed) confirmed appropriately scoped.

### Verified facts
- No test references the deleted `autoCreateApiKey` (tsc-green guarantees no dangling import) — no hard break possible.
- No `muninn-mcp-registration`/`vault-setup` test exists.
- `wire-claude-hooks.test.ts` covers hooks (settings.json) = correct; `build-muninn-instruction.test.ts` assertions (tool name + JSON.parse + description substring) still valid post native-call edit.
- User directive correctly encoded: keep all 105 tests (anti-01), keep valid test scripts (anti-02), commit the 2 dead-script removals + 4 pre-existing .test.ts edits, correct the stale memory.

## Confidence Gate: ALL-AUTO (empty)
`luca confidence gate --slug 05-test-policy-reconcile` → auto=0, research=0, ask=0. Proceeding to execute.
