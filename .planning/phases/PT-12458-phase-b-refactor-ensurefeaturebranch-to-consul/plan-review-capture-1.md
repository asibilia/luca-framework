# Plan Review Capture — Iteration 1

**Subagent**: plan-reviewer
**Iteration**: 1
**Timestamp**: 2026-05-07T15:25:00Z

## Findings

STATUS: NEEDS_REVISION
CONVERGENCE: CONVERGING
BLOCKING_COUNT: 4
ADVISORY_COUNT: 6

## MUST-FIX (Blocking)

**G-ARCH-001 [BLOCKING]** — Phase A artifacts do not exist on current branch. Plan claims Phase A merged but grep returns 0 hits for projectPreferences/BranchingSection/guardedBranches. No src/state/project-preferences.ts. Wave 1 unsatisfiable as written.

**G-DX-001 [BLOCKING]** — All instruction/subagent paths wrong. src/agents/modes/* should be src/instructions/*. src/agents/subagents/executor.ts should be src/subagents/executor.ts. No src/agents/ dir exists.

**G-ARCH-002 [BLOCKING]** — PT-12458 regression test does not pin original bug. Only tests new resolve path. Must also test status returns role:"guarded" and assert-not-default hard-fails on ENG-1428--release.

**G-DX-002 [BLOCKING]** — BaseRule.kind === 'ask' semantics undefined. Plan never specifies what 'ask' does at resolve time vs confirmBaseBeforeCreate.

## SHOULD-FIX (Advisory)

**G-DX-003** — Wave 2 status upgrade is behavior change for back-compat callers; preserve string values, only add role field.
**G-DX-004** — Architect prose obligation (ask_user between resolve and apply) should be explicit grep verification.
**G-ARCH-003** — guardedBranches defense-in-depth confirmed present (no fix needed).
**G-DX-005** — Back-compat for status|create|rename: add grep verification BRANCH_TYPES/buildBranchName retained.
**G-ARCH-004** — Tool-manifest verification: assert default-deny pattern (omission == denial).
**G-DX-006** — Add `! grep -q discriminatedUnion` verification line.

## Confirmations

- gh-prepare scoped OUT ✅
- No shallow extractions ✅
- Promotion model N/A ✅
- Pure resolve testable ✅

RECOMMENDATION: revise
