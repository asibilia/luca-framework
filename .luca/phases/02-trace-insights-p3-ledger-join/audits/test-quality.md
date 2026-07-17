PERSPECTIVE: test-quality
VERDICT: APPROVE
FINDINGS:
- [SHOULD-FIX] Ledger-interval construction mechanics are unpinned. The interval-source test (index.test.ts:281-288) pins the preference order ("prefer telemetry ... WHEN they yield >=1 step interval" / "fall back per repo to ledger `mode-transition` rows", both unique to index.ts:139) but nothing asserts the delta construction: "consecutive-timestamp deltas, interval = [row N ts, row N+1 ts), step = the row's `to` value" (index.ts:139). A regression flipping `to` -> `from` (attributing cost to the outgoing step instead of the incoming one — a real off-by-one in attribution semantics) passes the whole suite.
  File: packages/luca-tools/src/artifacts/skills/trace-insights/index.test.ts:281
  Suggestion: Add to the interval-source test: `expect(body).toContain("interval = [row N ts, row N+1 ts), step = the row's \`to\` value")` — the string is unique to the A5 Interval-source paragraph.
  Cross-phase: false
- [SHOULD-FIX] The "never guess a slug" / "attribution unavailable" degradation directive has zero pins. The degraded-tuple test (index.test.ts:290-297) covers the nullable tuple and the nearest-slug source, but the third leg of that rule — "mark per-phase attribution for that interval unavailable with an explicit note ... never guess a slug" (index.ts:141; rendered in Stage D at index.ts:212 as the '"attribution unavailable" note') — is asserted nowhere. Its silent deletion would let the skill fabricate phase attribution and every test still passes. Verified via grep: "never guess a slug" occurs exactly once (index.ts:141) and appears in no test literal.
  File: packages/luca-tools/src/artifacts/skills/trace-insights/index.test.ts:290
  Suggestion: Extend the degraded-tuple test with `expect(body).toContain('never guess a slug')` and pin the Stage D rendering with `expect(body).toContain('"attribution unavailable" note')` (unique to index.ts:212).
  Cross-phase: false
- [SHOULD-FIX] Test-name-vs-assertion drift: 'emits the three aggregates with consumers named inline' (index.test.ts:312-320) verifies the inline consumer for only 1 of 3 aggregates. The `costByPipelineStep` literal includes its consumer ("-> Stage D Pipeline Attribution per-step table", index.ts:149), but the `costByPhase` literal is truncated at "dollar cost per phase slug" (index.ts:150 continues with the unavailable-marking parenthetical and the per-phase-table consumer) and the `reviewIterationsVsCost` literal is truncated at "count" (index.ts:151 continues with "-> Stage D review-convergence cost trajectory"). The name claims an invariant ("no dead fields — consumer named inline") that the body only enforces for one field.
  File: packages/luca-tools/src/artifacts/skills/trace-insights/index.test.ts:312
  Suggestion: Extend the two truncated literals through their "-> Stage D ..." consumer clauses (both full lines are section-unique), or rename the test to match what it asserts.
  Cross-phase: false
- [SHOULD-FIX] The unallocated-cost invariant is unpinned. "Window portions that fall outside every known interval go to the unjoined tail as unallocated cost" (index.ts:143) and "total unallocated cost (including window portions of joined runs that fell outside every known interval)" (index.ts:215) appear in no assertion — grep for "unallocated cost" hits index.ts:143 and 215 only, and no test literal contains it. The asserted 'never silently dropped' (index.test.ts:333) is the tail of the line-215 sentence, so deleting "and unallocated cost" from "Unjoined traces and unallocated cost always appear here" (or the whole line-143 routing rule) still passes.
  File: packages/luca-tools/src/artifacts/skills/trace-insights/index.test.ts:331
  Suggestion: Pin the full sentence: `expect(body).toContain('Unjoined traces and unallocated cost always appear here — never silently dropped')`, and add `expect(body).toContain('go to the unjoined tail as unallocated cost')` to the proportional-allocation test.
  Cross-phase: false
- [NOTE] The ledger-join block contains no negative anchors (`not.toContain`). Acceptable for P3: the change is additive (no stale P2 literal had to die — the existing `not.toContain('MuninnDB persistence is P2')` anchor at index.test.ts:21 still guards the P2 pivot), but if a later phase changes the interval-source preference, a negative anchor on the superseded phrasing should accompany it.

CONSOLIDATED:
  MUST_FIX_COUNT: 0
  SHOULD_FIX_COUNT: 4
  NOTE_COUNT: 1
  CROSS_PHASE_COUNT: 0

---

## APPROVE evidence (anti-sycophancy record)

Every brief-listed invariant was checked for section-uniqueness by grepping the BODY template in index.ts and counting hits (assertions run against the real export `traceInsightsSkill.body`, index.test.ts:13-15 — not a fixture copy, so the `defineSkill` render path is exercised):

1. Interval-source rule — "prefer telemetry" and "fall back per repo" each occur exactly once (index.ts:139); both asserted literals encode direction, so flipping the preference breaks the test (index.test.ts:281-288).
2. Proportional allocation + degenerate case — "wall-clock overlap fraction" and "full-cost-to-that-interval" each occur once (index.ts:143); pinned at index.test.ts:299-304.
3. Degraded tuple nullables — "runId: null" occurs once (index.ts:141); the full nullable-tuple literal is unique (the non-null tuple forms at index.ts:153/176 do not satisfy it); pinned at index.test.ts:291-293.
4. Nearest-slug source — "nearest-in-time" occurs once (index.ts:141); pinned at index.test.ts:294-296.
5. Unjoined tail — "#### Unjoined traces" (index.ts:214), "never silently dropped" and "broken down by reason" (index.ts:215) each occur once; other "silently"/"reason" phrasings (index.ts:167, 212, 299, 327) do not satisfy the literals; pinned at index.test.ts:331-335.
6. Pool rule 7 — "review loop exceeded" occurs once (index.ts:165); the ambiguous token "per-phase `review.iteration` count" appears at both index.ts:151 and 165, but the aggregates test disambiguates with the `reviewIterationsVsCost` prefix (unique to 151), so no cross-section satisfaction.
7. Stage C joined-context — "joined traces only" and "never fabricate" each occur once (index.ts:176); pinned at index.test.ts:326-329.
8. Privacy binding for ledger strings — "same 300-character cap and secret scan" ("300-character cap" occurs once, index.ts:50, in the NEW A5 binding sentence — distinct from the pre-existing "300 char"/"<=300 chars" tokens at index.ts:50/183/237); pinned at index.test.ts:337-339.
9. Report-sections extension — "### Pipeline Attribution" with the `### ` prefix is unique to index.ts:211 (the six prose references at index.ts:22/141/145/149/150/329 lack the heading prefix); pinned at index.test.ts:154.
10. Aggregate-name collision check — "dollar cost per pipelineStep" appears at index.ts:20 (JSDoc, outside BODY) and :334 (description field, outside `body`) plus :149 (BODY); only the BODY occurrence is reachable by the assertions, so no false-pass channel.

No asserted literal in the new block is satisfiable by a different section of the body; all findings above are coverage/drift advisories, not blockers.
