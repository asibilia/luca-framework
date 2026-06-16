# Plan Review — Phase 1: recall-outcome-attribution

**Verdict: APPROVED · Convergence: CONVERGED** (blocking 2 → 0 across 2 rounds)

## Round 1 → Round 2

| Finding | Severity | Status |
|---|---|---|
| G-CRIT-001 — anti-01 probe false-positive on doc-comment `v: 2` (schemas.ts:13) | BLOCKING | RESOLVED — re-anchored to `^\s*v:\s*2\b`; verified empty on live file, still catches a real bump at `:46` |
| G-SCOPE-001 — Task 2.3.2 said "all 5 modes" but Files/ac covered review.ts only | BLOCKING | RESOLVED — `recalledIds` capture moved into Wave 1 (tasks 1.1.1–1.1.5); 2.3.2 narrowed to outcome-time `recall.utilization` emit; ac-14 added for per-mode capture |
| G-CRIT-002 — ac-06 single-file 6-key check | ADVISORY | Folded — ac-06 reworded as smoke check; ac-07 named authoritative per-mode gate |
| G-CRIT-003 — test must assert per-mode independently | ADVISORY | Folded — Task 1.2.1/ac-07 now per-mode, fails if ANY mode lacks a key |
| G-DX-001 — schema def + barrel re-export both required | ADVISORY | Folded — Task 2.3.1 spells out the two edits |
| G-DX-002 — meta-key source path | ADVISORY | Folded — corrected to `tools/workflow-state.ts:1851-1858` (`callerMode`) |

## Runnability contract (adversarial re-check) — INTACT

ac-01..05 require `luca telemetry emit --kind recall.(hit|miss) --run-id` per mode (no bare token probe). ac-07 is the binding gate: runnable `bun test` asserting `--run-id` + all 6 meta keys INDEPENDENTLY per mode. ac-11 requires the full `recall.utilization` emit command.

## Remaining advisories (executor-time hardening, non-gating)

- **G-DX-003** — ac-14 runs `bun test -t recalledIds`; if the executor folds the `recalledIds` assertion into a generically-named block, `-t recalledIds` matches nothing and `bun test` exits 0 → **vacuous pass**. Executor MUST name the test block to contain the literal `recalledIds`, OR assert via source grep. **Carry to executor.**
- **G-DX-004** — consider adding ac-07 to D1's deliverable mapping for traceability tightness. Cosmetic.

## ac-ID inventory (stable)
ac-01 … ac-14; anti-01, anti-02, anti-03. No renumbering; ac-14 appended.
