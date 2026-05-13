# Code Review — Wave 1

**Date**: 2026-05-13
**Complexity**: SIMPLE
**Review Iteration**: 1 / 2

## Requirements Coverage

| Criterion | Status | Evidence |
|-----------|--------|----------|
| reviewer.ts contains usage self-report instruction | MET | reviewer.ts:91-93 added after CONSOLIDATED block |
| test asserts presence + positional ordering | MET | subagent-telemetry-prose.test.ts:58-73, 2 new tests |
| All existing tests pass | MET | tsc: pass, bun-test: pass |

## Automated Checks

| Check | Status | Duration |
|-------|--------|----------|
| tsc | pass | 2.5s |
| bun-test | pass | 0.5s |
| eslint | skip | n/a |

## Code Review Findings

### MUST-FIX (2)

- **[architecture/dx]** Duplicate instruction with divergent phrasing — `reviewer.ts:91-93` adds a second usage instruction while `shared-prefix.ts:27` already instructs all subagents. The two instructions use different placement rules: shared-prefix says "at end of every response"; reviewer.ts says "after CONSOLIDATED block". Model receives both, leading to potential double-emit or unpredictable compliance.
  - File: `packages/luca-mastracode/src/subagents/reviewer.ts:91-93`
  - Fix: Rewrite reviewer.ts instruction as explicit clarification of the shared rule, not a duplicate: *"The usage comment (see Core Operating Rules) is required. For this subagent, place it immediately after the CONSOLIDATED block — that IS the last line of your response."* Remove the backtick-quoted format string (already in shared-prefix).

- **[architecture]** Positional test asserts source-file character offsets, not runtime prompt ordering. `SUBAGENT_SHARED_PREFIX` is prepended at `launch.ts:222`, so at runtime the shared-prefix copy of `<!-- usage:` appears BEFORE `CONSOLIDATED:` — inverted from what the test asserts. Test provides false confidence.
  - File: `packages/luca-mastracode/src/__tests__/subagent-telemetry-prose.test.ts:64-72`
  - Fix: Rewrite as runtime-composition test: `import { SUBAGENT_SHARED_PREFIX } from '../subagents/shared-prefix.js'` + `import { reviewerSubagent } from '../subagents/reviewer.js'`, compose `const assembled = SUBAGENT_SHARED_PREFIX + '\n\n' + reviewerSubagent.instructions`, then assert `assembled.lastIndexOf('<!-- usage:') > assembled.indexOf('CONSOLIDATED:')` (lastIndexOf to pick the reviewer-local copy).

### SHOULD-FIX (2)

- **[dx]** "After your CONSOLIDATED block" phrasing ambiguous — is CONSOLIDATED: the key or the entire fenced section? Rephrase to "After the closing \`\`\` of the output block" to eliminate ambiguity.
  - File: `packages/luca-mastracode/src/subagents/reviewer.ts:91`

- **[simplification]** `readSubagent()` and `readInstruction()` are structurally identical helpers differing only in dir constant. Add brief comment or extract to single parameterised helper to avoid silent copy-paste pattern.
  - File: `packages/luca-mastracode/src/__tests__/subagent-telemetry-prose.test.ts:20-26`

### NOTE (2)

- **[simplification]** Positional test comment at line 70 says "usage instruction must come AFTER the CONSOLIDATED block" — should add "(pre-prefix assembly)" to avoid misleading readers into thinking this is a runtime assertion.

- **[simplification]** No test asserts `SUBAGENT_SHARED_PREFIX` itself contains the usage instruction. Natural home: `memory-tier-prefix.test.ts` companion assertion.

## Verdict

ISSUES_FOUND

**Iteration plan**: Fix divergent phrasing (MUST-FIX 1) + rewrite positional test as runtime-composition test (MUST-FIX 2). Apply SHOULD-FIX phrasing clarification while touching reviewer.ts.
