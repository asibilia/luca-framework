# Plan: Fix reviewer-dx/simpl usage self-report drift

## Objective
Ensure all 4 reviewer perspectives emit `<!-- usage: ... -->` at end of response.

## Context
Root cause: `reviewer.ts` instructions end with `## Constraints` block — usage instruction in `SUBAGENT_SHARED_PREFIX` is prepended but gets buried under 107 lines of reviewer-specific prose. reviewer-arch/sec happen to emit it; reviewer-dx/simpl don't. Fix: add explicit usage instruction inside `reviewer.ts` Output Format closing block (where the reviewer always terminates). Also add presence test for reviewer.ts.

## Phase 1: Fix reviewer subagent + add test

### Wave 1: Add usage instruction + test (AFK)

- [ ] **Task 1.1**: Add `<!-- usage -->` self-report line to `reviewer.ts` Output Format section
  - File: `packages/luca-mastracode/src/subagents/reviewer.ts`
  - Edit: append usage instruction line after the CONSOLIDATED block in the Output Format section (line ~89)
  - Verification: `grep -c 'usage.*inputTokens' src/subagents/reviewer.ts` returns ≥1

- [ ] **Task 1.2**: Add presence test for reviewer.ts in subagent-telemetry-prose.test.ts
  - File: `packages/luca-mastracode/src/__tests__/subagent-telemetry-prose.test.ts`
  - Add: describe block asserting `reviewer.ts` contains `<!-- usage:` string (reads from SUBAGENTS_DIR not INSTRUCTIONS_DIR)
  - Verification: test passes; `bun test subagent-telemetry-prose` green

## Verification Criteria
- `reviewer.ts` contains usage self-report instruction
- `subagent-telemetry-prose.test.ts` asserts its presence
- All existing tests pass

## Risks
None — prose-only change to reviewer subagent instructions.
