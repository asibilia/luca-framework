# Plan: Fix luca:5-review outer reviewer fanout (success:false)

## Objective

Fix all 4 outer reviewer subagents in `luca:5-review` returning `success:false` with null
tokens/model and `durationMs:0`. Synthesis currently runs with zero reviewer input.

## Root Cause

Single root cause in `review.md` Step 4: **the subagent telemetry block uses a fenced code
block as the spawn-site directive**, making it an illustrative example the agent reads as
documentation rather than an executable instruction sequence.

Mechanistically: the agent reads the fenced block, treats it as a literal call sequence with
placeholder values (`<ts>`, `null` durationMs, hardcoded `success: true`), and emits those
placeholder values verbatim via `record-subagent`. The observed `success:false` + `durationMs:0`
in telemetry is the agent copying the fenced example values — NOT a validation rejection
(`record-subagent` always returns `{success:true}` at line ~1454 of workflow-state.ts;
the schema regex `/^[^\r\n\t]+$/` permits `<>` chars so no validation rejection occurs).

**Why execute.md works**: execute.md also has a fenced block (lines 156–163) but that block is
labelled as "Example" and is preceded by separate inline `// →` directive comments at every
actual spawn site (e.g., `// → emit 4 record-subagent invoke...` at line 294). The inline
directives are the actionable instructions; the fenced block is documentation.
review.md's fenced block IS the only spawn-site directive — there is no separate inline
`// →` comment for the reviewer fanout. When the agent sees only a code block with no
accompanying directive comment, it treats the block as an example, not a command.

**Additionally**: review.md's correlationId format uses `<ts>` as a literal placeholder in the
fenced example. The agent copies this literally into the `record-subagent` call, producing
correlationIds from stale epoch timestamps (confirmed: `1747180880` = 74 min before run start).
This is a self-report fidelity issue, not a validation failure.

## Context

- `execute.md`: inline `// →` directive at line 294 → 4 inner reviewers succeed (wave-3 telemetry shows success:true + populated tokens/model)
- `review.md`: only a fenced block in Step 4 → all 4 outer reviewers fail (two consecutive run telemetry)
- `record-subagent` schema: `correlationId` regex `/^[^\r\n\t]+$/` — permits `<>`, angle brackets do not cause failure
- `reviewer.ts`: correct (updated PR #245); fenced block is the instruction-path problem

## Phases

### Phase 1: Fix review.md spawn prose + regression test

#### Wave 1: Fix review.md subagent telemetry block (AFK)

- [ ] **Task 1.1**: Replace the fenced-block subagent telemetry section in `review.md` Step 4
  (lines 56–74) with an inline directive comment matching `execute.md` pattern.
  - File: `src/instructions/review.md` lines 56–74
  - Remove the entire fenced ` ``` ` block containing `record-subagent` calls
  - Replace with inline prose directive (matching execute.md:149–153 + line 294 style):
    `// → Before batch: generate 4 correlationIds as \`<role>-<Date.now()>\` (e.g. "reviewer-arch-1747185300123"). Emit 4 record-subagent invoke records. Spawn 4 reviewers in parallel. After batch returns, emit 4 record-subagent complete records with measured inputTokens/outputTokens/success/model. See "Subagent Telemetry" in execute.md for token-parsing pattern.`
  - Keep the surrounding prose (before/after explanation) — only the fenced block needs replacing
  - Verification: `grep -n 'record-subagent' src/instructions/review.md` — all occurrences are outside ` ``` ` fences

#### Wave 2: Add regression test for prose format (AFK)

- [ ] **Task 2.1**: Extend `subagent-telemetry-prose.test.ts` with a new describe block
  asserting the `review.md` reviewer telemetry directive is NOT inside a fenced code block.
  - File: `src/__tests__/subagent-telemetry-prose.test.ts`
  - Algorithm: read `review.md`; split by ` ``` ` fences; find segments containing `record-subagent`;
    assert those segments have an even index (0, 2, 4, ... = outside fences).
    Odd-indexed segments are inside fences (content between alternating ` ``` ` delimiters).
  - Scope: check `review.md` only (execute.md intentionally has fenced *example* blocks)
  - Add second test: assert `review.md` correlationId directive references `Date.now()` (no raw epoch integers as placeholders)
  - Keep existing `toContain('record-subagent')` test — add new tests alongside, don't replace
  - Verification: `bun test subagent-telemetry-prose` passes; test FAILS if fenced block reintroduced

## Verification Criteria

1. `bun test` — all tests pass (including new regression tests)
2. `tsc` — no type errors
3. `review.md` Step 4 telemetry block uses inline directive, not fenced block
4. `review.md` correlationId directive references `Date.now()` not a literal epoch integer
5. New tests catch both issues if re-introduced

## Risks & Mitigations

- Risk: Inline directive may still be ambiguous without a concrete example. Mitigation: include
  a concrete example inline (e.g., `"reviewer-arch-1747185300123"`) matching execute.md style.
- Risk: Fence-split test fragile if review.md contains nested ``` blocks. Mitigation: scope
  test to the exact line range of the Step 4 section only.
