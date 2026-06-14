# Learnings — Phase 5: test-policy-reconcile

**Outcome:** PASS. No tests deleted; dead scripts removed; pre-existing test edits committed (`793f942ad`); stale memory corrected in MuninnDB.

## High-value durable learning (persisted)
- **A documented "policy" memory can contradict repo reality — verify before acting destructively.** The saved memory said "tests intentionally removed — never restore/create `.test.ts`, tsc-only," but the repo had **105 maintained test files** and the branch was *improving* tests. The original WS9 plan ("delete the test files") inherited the stale framing. Surfacing the contradiction to the user (instead of mass-deleting 105 files in full-auto) was the correct move. Rule: when a stale/policy memory would drive a destructive or far-reaching action, re-survey the actual state and HALT for the user if reality contradicts the memory — even under full-auto. → `pitfall:stale-policy-memory-vs-repo-reality`.

## What the survey corrected
- Tests ARE maintained (luca-cli/luca-core/luca-mastracode); `luca-framework`/`luca-tools` have none (their `"test"` removal was correct dead-script cleanup, not a contradiction).
- The Luca pipeline gate stays tsc-only (historical: agent-spawned `bun test` orphaned processes), but tests are real/shippable — run `bun test` deliberately, not via an unbounded gate.

## Decisions
- 2026-06-14 — User decision: keep all tests, commit the dead-script + pre-existing edits, correct the memory (recorded in MuninnDB `brain:project-tests-are-maintained` since `~/.claude/` writes are hook-blocked).

## Accepted coverage gap (follow-up)
- No unit tests for the new MCP-merge fns: `mergeAntigravityMcpRegistration` (now `token: string`), `mergeClaudeMcpRegistration`, `wireAntigravityMcp`, `wireClaudeMcp`. Close in a future coverage pass.

## Stale artifacts to fix manually (hook-blocked from auto-edit)
- `~/.claude/projects/-Users-alecsibilia-Github-luca-framework/memory/MEMORY.md` ("Tests Intentionally Removed" section).
- `~/.claude/rules/no-tests.md` (global "never restore tests" rule).
