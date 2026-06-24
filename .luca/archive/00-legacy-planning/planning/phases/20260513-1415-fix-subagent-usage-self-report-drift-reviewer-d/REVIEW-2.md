# Code Review — Wave 2

**Date**: 2026-05-13
**Complexity**: SIMPLE
**Review Iteration**: 2 / 2

## Requirements Coverage

| Criterion | Status | Evidence |
|-----------|--------|----------|
| reviewer-dx and reviewer-simpl reliably emit usage comment | PARTIAL | Clarification added at reviewer.ts:91, but not in terminal position — 3 sections follow it. Structural root cause incompletely fixed. |
| Prose strengthened so reviewer agents see directive clearly | PARTIAL | Clarification references shared-prefix rule but is buried mid-file, not final instruction model reads. |
| Presence test validates runtime-composed prompt | MET | subagent-telemetry-prose.test.ts:63-81 assembles as launch.ts does, positional assert on assembled string. |
| No duplicate conflicting instruction | MET | reviewer.ts:91 is clarification only; sole `<!-- usage:` source is shared-prefix.ts:27. |

## Automated Checks

| Check | Status | Duration |
|-------|--------|----------|
| tsc | pass | 2.5s |
| bun-test | pass | 0.5s |
| eslint | skip | — |

## Code Review Findings

### MUST-FIX (2)

- **[DX]** Clarification is not terminal — 3 sections follow it in reviewer.ts, contradicting "that IS the last line"
  - File: `packages/luca-mastracode/src/subagents/reviewer.ts:91-108`
  - Fix: Move clarification to after `## Constraints` block (after line 108), OR fold into `## Constraints` as final bullet: "- Append the usage comment (Core Operating Rules) immediately after the closing ``` of your output — this is the last line of your response."

- **[DX]** Positional test uses `indexOf` with no guard against `CONSOLIDATED:` appearing in shared-prefix — silently fragile
  - File: `packages/luca-mastracode/src/__tests__/subagent-telemetry-prose.test.ts:63-81`
  - Fix: Add `expect(SUBAGENT_SHARED_PREFIX).not.toContain('CONSOLIDATED:')` at top of describe block

### SHOULD-FIX (2)

- **[DX]** Test positional assertion failure message is opaque (raw integers)
  - File: `subagent-telemetry-prose.test.ts:80`
  - Fix: Add custom failure message string to `expect(...).toBeGreaterThan(...)` call

- **[DX]** Clarification at line 91 is a bare paragraph — structurally invisible vs surrounding ## sections
  - File: `reviewer.ts:91`
  - Fix: Already addressed by MUST-FIX (move to ## Constraints bullet)

### NOTE (4)

- **[ARCH]** Only reviewer.ts gets runtime-composition test; plan-reviewer.ts also has structured output but no positional test
- **[ARCH]** Clarification brittle to output-block restructuring (if a second fenced block is added)
- **[SEC]** `readInstruction` has no path-traversal guard — test-only, all call sites hardcoded literals, not a live risk
- **[SIMP]** `assembled` computed at describe-scope outside any test callback — fine for current usage, track if side effects ever added

## Iter 1 MUST-FIX Resolution

| Iter 1 MUST-FIX | Status |
|---|---|
| Duplicate instruction with divergent phrasing | ✅ RESOLVED — sole `<!-- usage:` in shared-prefix.ts:27 |
| Positional test on source file not runtime prompt | ✅ RESOLVED — test now imports live modules, assembles as launch.ts does |

## Verdict

**ISSUES_FOUND** — At review iteration budget limit (2/2).

Two MUST-FIX items remain:
1. Clarification instruction is not terminal in reviewer.ts — attention-burial root cause incompletely fixed
2. Positional test fragile to shared-prefix drift (no CONSOLIDATED: guard)

**Action**: Iteration budget exhausted. Proceeding to Finalize with outstanding issues noted. Executor should address in follow-up PR if issues persist in production telemetry.
