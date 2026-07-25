# Context — #320 reduce per-phase review fan-out cost

Full-auto run. Decision made by the user via a grounded decision page (research.md verified the surfaces).

## HARD CONSTRAINT (user, non-negotiable)
**Never sacrifice output or review quality to save cost/tokens.** The user stressed this emphatically. Cost reduction is welcome ONLY where quality is provably unaffected. This overrides any token-savings temptation. See `preference:never-sacrifice-output-quality-for-cost` (default vault). Every criterion + the gate design below must honor it.

## Decision: Lever-2 ONLY — gate the convergence re-review
Ship ONLY the re-review/re-verify gate. **Explicitly NOT shipping:**
- Lever-1a (shared precomputed diff artifact) — set aside; only trims tool-call count, not ×N tokens, and widens surface across the 3 duplicated review bodies.
- Lever-1b (consolidate reviewers) — set aside; it is a review-quality regression (kills cross-perspective independence + the `convergence.ts:190` ≥2-perspective severity-promotion + the independence auditor). Rejected on the quality constraint.

## What Lever-2 does (quality-neutral by construction)
The per-phase review currently runs a full round-2 (all N reviewers + a re-verify) whenever round-1 produced ANY must-fix/should-fix — even when the subsequent fix was a no-op or touched none of the flagged locations (`review.ts:234-241` Route B; `budget-matrix.ts:23-79` `maxReviewIterations` MODERATE+ = 2). Lever-2 gates that round-2 so it only runs when the fix could actually change a finding.

## Gate design (CONSERVATIVE — skip only when provably safe)
1. Capture the **pre-fix HEAD SHA** when routing `review → execute` (rework).
2. On re-entry to review, compute `git diff <pre-fix-sha>..HEAD --name-only`.
3. **Skip round-2 (re-review + re-verify) ONLY when provably safe:**
   - the diff is **empty** (fix was a genuine no-op), OR
   - the changed paths have **provable zero overlap** with the `File:line` locations cited in the prior round's MUST-FIX findings (`audits/<reviewer>.md`, structured `File: {path:line}` per `reviewer.ts:122-137`).
4. **In every other case → re-review as today.** Any ambiguity, any overlap, any parse uncertainty about the prior findings → DO the full round-2. When in doubt, re-review. The skip must be a proven-safe fast path, never a heuristic guess.
5. Do NOT alter the reviewer fan-out, the number of perspectives, cold isolation, the independence auditor, or the `convergence.ts` promotion — those stay exactly as-is (they are the quality guarantees).

## Locked decisions
- **Instruction-body only** (luca-tools), advisory gating — no luca-core state-machine graph change (research confirmed none required). Pre-fix SHA: prefer a `.luca/tmp/<kebab>.json` stash (contract-legal, survives compaction) over a `LucaState` schema change, unless suspend/resume durability demands the latter — decide in planning; default to the lighter tmp-file approach.
- **Where to apply:** the live machine-driven path — `modes/review.ts` Route B (+ `modes/execute.ts` re-entry) and `skills/lu-review`. Mirror into the legacy `skills/phase-execute` Step 8.1 for parity. Confirm the live path in planning; apply to all review-driving bodies that gate round-2.
- **Anti-regression must be explicit:** the plan MUST carry anti-criteria asserting the reviewer fan-out / perspective count / cold isolation / independence auditor / convergence promotion are UNCHANGED, and that the gate defaults to re-review on any uncertainty.

## Deferred
- Lever-1a, Lever-1b (see above — set aside).
- Telemetry to quantify the no-op-round rate (`review->execute` edges) — nice-to-have, not this phase.
