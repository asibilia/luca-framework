# Plan: Phase 5 — test-policy reconcile (WS9, revised by user decision)

## Objective
Reconcile the test situation WITHOUT deleting maintained tests. User decision (2026-06-14): KEEP all 105 `.test.ts` files; the 2 package.json `"test"` removals (luca-framework, luca-tools — both test-less) are correct dead-script cleanup; the 4 pre-existing `.test.ts` edits stay. Verify the tests covering code changed in phases 1–4 still typecheck and aren't semantically stale; fix/flag stale ones (NEVER delete). Correct the stale "tests intentionally removed" memory.

## Context
- Survey: 105 test files (luca-cli 26, luca-core 60, luca-mastracode 31). Root + luca-cli + luca-core + luca-mastracode keep `"test"` scripts; luca-framework + luca-tools have none (their `"test"` removal in the uncommitted diff was dead-script cleanup — NOT a contradiction).
- Phases 1–4 changed: `wire-claude-hooks.ts` (heavy: mcp_config.json target, enabledTools, `mergeAntigravityMcpRegistration` signature `token: string`, new `wireClaudeMcp`/`mergeClaudeMcpRegistration`, three-case read guard), `muninn-mcp-registration.ts` (Antigravity probe → mcp_config.json), `build-muninn-instruction.ts` (native-call instruction + comment), `vault-setup.ts` (removed dead autoCreateApiKey), new `muninn-token.ts`, `harness.ts`, `commands/init.ts`.
- Test files most likely affected: `wire-claude-hooks.test.ts`, `build-muninn-instruction.test.ts`, and any `muninn-mcp-registration` test. Since `bun test` is NOT run, semantic staleness (asserting old behavior) is invisible to the tsc gate — must be read-checked.

## Tasks (single wave)
- [ ] **Task 5.1**: Confirm `bunx --bun tsc --noEmit` exits 0 with ALL test files present (proves the .test.ts covering changed code still type-check). (ac-01)
- [ ] **Task 5.2**: Read the test files covering phase-1–4 changes and confirm none asserts REMOVED behavior. Plan-review already verified: `wire-claude-hooks.test.ts` tests only the stage-gate HOOK write to `~/.claude/settings.json` (via `wireClaudeHooks`) — that is CURRENT, correct behavior, untouched by phases 1–4 (the Antigravity MCP→mcp_config.json migration lives in `wireAntigravityMcp`, which this test does not cover). `build-muninn-instruction.test.ts` asserts the tool name + `JSON.parse` + a description substring — all still true after the native-call edit. So expect NO edits. IF (and only if) a genuine stale assertion of pre-phase-1 behavior is found, UPDATE it to the new behavior, or add a `// STALE(phase-1..4): …` flag — never delete. Also RECORD (in the execute summary + learn) the ACCEPTED coverage gap: no tests exist for the new/changed MCP-merge functions (`mergeAntigravityMcpRegistration` new `token: string` sig, `mergeClaudeMcpRegistration`, `wireAntigravityMcp`, `wireClaudeMcp`) — a reconcile phase declines to add coverage; this is a known follow-up, not a silent omission. (ac-02, ac-03, ac-06)
- [ ] **Task 5.3**: Stage + commit the legitimate pre-existing uncommitted edits — the 2 package.json dead-script removals (`packages/luca-framework/package.json`, `packages/luca-tools/package.json`) and the 4 pre-existing `.test.ts` edits (handle-stage-gate-hook, skill-validation, write-project-skeleton, phase-write-tools) — plus any Task-5.2 test fixes. Conventional message. (ac-04)
- [ ] **Task 5.4**: Correct the stale memory: update `~/.claude/projects/-Users-alecsibilia-Github-luca-framework/memory/MEMORY.md` (and the global `~/.claude/rules/no-tests.md` if present) so they no longer claim "tests intentionally removed / never restore" — state that tests ARE maintained in luca-cli/luca-core/luca-mastracode and tsc-only was a transitional state. (ac-05) — orchestrator performs (memory dir is outside the repo / not stage-gated).

## Deliverables
- **D1** (keep tests; reconcile diff): tests intact, dead scripts removed, pre-existing edits committed → ac-01, ac-04
- **D2** (no stale tests for changed code; coverage gap recorded): tests covering phase-1–4 changes confirmed non-stale (or flagged); MCP-merge coverage gap named → ac-02, ac-03, ac-06
- **D3** (memory corrected): no-tests memory reflects reality → ac-05

## Verification Criteria
- **ac-01**: `bunx --bun tsc --noEmit` exits 0.
- **ac-02**: neither `wire-claude-hooks.test.ts` nor `build-muninn-instruction.test.ts` silently asserts behavior REMOVED in phases 1–4 (the settings.json lines in wire-claude-hooks.test.ts are HOOK assertions = correct/unchanged, NOT Antigravity-MCP assertions — do not touch them).
- **ac-03**: `grep -rn "wireAntigravityMcp\|mergeAntigravityMcpRegistration\|wireClaudeMcp\|mergeClaudeMcpRegistration" packages/**/*.test.ts` — confirm NO test asserts the pre-phase-1 Antigravity-MCP behavior (expected: zero matches → no stale MCP-registration test exists; trivially satisfied). If any match asserts old behavior, fix or flag it.
- **ac-06**: the execute summary + learn.md explicitly NAME the accepted coverage gap (no tests for the 4 new/changed MCP-merge functions) as a known follow-up.
- **ac-04**: `git log --oneline -1` shows the reconcile commit; `git status --porcelain` shows the 2 package.json + 4 .test.ts edits committed (no longer dirty).
- **ac-05**: the auto-memory MEMORY.md no longer contains an unqualified "NEVER restore test files / tests intentionally removed" claim.

### Anti-criteria
- **anti-01**: MUST NOT delete ANY `.test.ts`/`.spec.ts` file (user directive: keep). Probe: `git status --porcelain '*.test.ts' '*.spec.ts'` shows NO deletion (`D`) status (directly enforces "never delete", stronger than a count).
- **anti-02**: MUST NOT remove the `"test"` script from root/luca-cli/luca-core/luca-mastracode package.json (those packages HAVE tests).
- **anti-03**: MUST NOT alter any phase-1–4 SOURCE behavior (this phase touches tests + memory only, plus committing pre-existing package.json edits).

## Decisions
- 2026-06-14 — User chose "no-op + keep tests": repo actively maintains 105 tests; the "tests removed" memory was stale. Phase 5 keeps tests, fixes/flags stale ones, corrects the memory. (Supersedes the original WS9 "delete the test files" todo framing.)
