# Review Capture — DX [Wave 1]

**Subagent**: reviewer
**Perspective**: dx
**Timestamp**: 2026-05-13T20:00:00Z

## Findings

PERSPECTIVE: dx
VERDICT: REQUEST_CHANGES

FINDINGS:

- [MUST-FIX] Test for review.md only asserts `toContain('record-subagent')` — passes even when record-subagent calls are inside a fenced code block. False green. Test would stay green forever regardless of whether fix is applied.
  File: packages/luca-mastracode/src/__tests__/subagent-telemetry-prose.test.ts:51-55
  Suggestion: Add assertion: `const outsideFences = content.replace(/```[\s\S]*?```/g, ''); expect(outsideFences).toContain('record-subagent')`
  Cross-phase: false

- [MUST-FIX] review.md fenced block (lines 60–74) still present and unchanged. Executor applied wording tweaks to reviewer.ts but skipped Task 1.1 entirely. Primary acceptance criterion (#3) UNMET.
  File: packages/luca-mastracode/src/instructions/review.md:60-74
  Suggestion: Replace lines 60–74 with inline numbered steps or plain-prose directive.
  Cross-phase: false

- [MUST-FIX] reviewer.ts wording change at line 107 is a no-op improvement relative to the actual bug. Both old and new phrasing tell the model to append the usage comment. Neither addresses success:false root cause (fenced block in review.md).
  File: packages/luca-mastracode/src/subagents/reviewer.ts:107
  Suggestion: This change is harmless but meaningless without review.md fix. Should not be shipped as "the fix".
  Cross-phase: false

- [MUST-FIX] No regression test for fence-split problem was added (AC #5). Only test change is string-literal update to match new reviewer.ts wording. Not a regression test.
  File: packages/luca-mastracode/src/__tests__/subagent-telemetry-prose.test.ts (no new test)
  Suggestion: Add fence-split test in new describe block.
  Cross-phase: false

- [SHOULD-FIX] Test comment at lines 93-96 attributes drift to "attention burial when clarification was followed by other sections." Actual root cause per plan is fenced block in review.md. Misleading for future maintainers.
  File: packages/luca-mastracode/src/__tests__/subagent-telemetry-prose.test.ts:93-96
  Suggestion: Update comment to say "Primary fix (review.md fenced block) is tested in the fence-split regression test."

- [NOTE] String update at lines 83-84 and 97-98 mechanically tracks reviewer.ts wording change and is correct. But validates presentation text, not behavioral correctness.

CONSOLIDATED:
  MUST_FIX_COUNT: 4
  SHOULD_FIX_COUNT: 1
  NOTE_COUNT: 1
  CROSS_PHASE_COUNT: 0
