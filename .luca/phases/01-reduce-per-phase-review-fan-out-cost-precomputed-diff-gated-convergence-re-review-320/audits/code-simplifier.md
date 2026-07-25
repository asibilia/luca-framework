PERSPECTIVE: simplification
VERDICT: REQUEST_CHANGES

## Verdict

MUST-FIX (2 findings). The intended token-uniform mirroring of the gate body across the three gate sites (review.ts Step 3.5, lu-review Re-run gate, phase-execute Step 8) is verbatim-consistent and correctly NOT flagged. Two logic gaps in the gate lifecycle are correctness bugs, plus two advisory tightenings.

## MUST-FIX

- [MUST-FIX] The `.luca/tmp/review-prefix-sha.json` stash is never consumed/invalidated after the gate reads it — no gate body or post-skip routing deletes or marks it. In `lu-review` the gate trigger is *file existence* ("Applies ONLY when `.luca/tmp/review-prefix-sha.json` exists"), so a stale stash left over from a previous review loop (or a previous phase) fires the gate on a genuinely first-pass review. On that stale pass, step 3 finds no prior MUST-FIX cites (fresh phase, no prior audits), the empty cite set makes "provable zero overlap" trivially true, and the gate can skip the *first* reviewer fan-out entirely — the exact opposite of "only when provably safe." review.ts is shielded by its `reviewIteration > 0` guard and phase-execute by its "no prior CRITICAL round this phase" guard, but lu-review has no equivalent.
  File: packages/luca-tools/src/artifacts/skills/lu-review/index.ts:29
  Suggestion: Add one line to each gate body (all three sites, keeping the mirror uniform): after reading the SHA and deciding, invalidate the stash — delete `.luca/tmp/review-prefix-sha.json` (or overwrite it with `{"consumed": true}` via Write). One-shot consumption is safe because every loop-back re-stashes a fresh SHA (lu-review/index.ts:68, review.ts:259, phase-execute/index.ts:1253). Alternatively embed the phase slug in the stash JSON and treat a slug mismatch as "no stash."
  Cross-phase: false

- [MUST-FIX] Vacuous zero-overlap when the prior cite set is empty. review.ts Route B loops back to execute on "MUST-FIX **or** SHOULD-FIX" (review.ts:257), but the gate's step 3 collects only the prior **MUST-FIX** cites (review.ts:95). On a SHOULD-FIX-only iteration, the cite set is empty, so *any* non-empty fix diff has "provable zero overlap" and round-2 is skipped — the SHOULD-FIX fix changes are never re-reviewed, and post-skip routing then files the (actually fixed) SHOULD-FIX items as "unresolved" backlog todos. This defeats the gate's own "only when provably safe" contract. (lu-review and phase-execute are structurally exempt: their loop-backs fire only on MUST-FIX / CRITICAL findings, so their cite sets are non-empty by construction — but the lu-review stale-stash path in the first MUST-FIX hits the same empty-set hole.)
  File: packages/luca-tools/src/artifacts/modes/review.ts:95
  Suggestion: One clause in the decision list (step 4): "If the prior cite set is empty and the diff is non-empty → full round-2." Or collect SHOULD-FIX cites into the overlap set alongside MUST-FIX.
  Cross-phase: false

## SHOULD-FIX

- [SHOULD-FIX] Terminology drift in the execute.ts cross-reference mirror: it says "Review's Step 3 re-verify is NOT gated," but review mode's Step 3 is titled "Automated Checks" (review.ts:83) — there is no step named "re-verify," and review.ts:91's own "NOT re-verify, which has already run" is ambiguous between the `verify` pipeline step and review Step 3. An executing agent following the cross-reference cannot resolve which step is exempt.
  File: packages/luca-tools/src/artifacts/modes/execute.ts:412
  Suggestion: Name the exempt step consistently in both places, e.g. "NOT Step 3 (Automated Checks) nor the earlier `verify` pipeline step — both run as today."
  Cross-phase: false

- [SHOULD-FIX] review.ts Route B item 2 is now a single ~60-word run-on packing four sequential actions (write iteration plan → emit iteration telemetry → stash pre-fix SHA → transition), with the new SHA-stash instruction embedded mid-sentence between em-dashes. This is the highest-drop-risk phrasing for an executing agent — the one new action the whole feature depends on is the least prominent.
  File: packages/luca-tools/src/artifacts/modes/review.ts:259
  Suggestion: Split item 2 into lettered sub-steps (a–d) so the stash is its own line. Same pattern, milder, at lu-review/index.ts:68 (stash + redirect in one sentence).
  Cross-phase: false

## Notes

- [NOTE] Filename `review-prefix-sha.json` reads as "prefix" (string-prefix) rather than "pre-fix" (before the fix). It is used consistently across all four files so it functions, but `review-pre-fix-sha.json` would be self-describing if renamed before this ships.
- [NOTE] review.ts "Iteration Awareness" (review.ts:281–288) still says a `reviewIteration > 0` pass should "focus on whether previous items were resolved" with no mention that Step 3.5 may skip that pass entirely; a one-line cross-ref would prevent an agent reading sections out of order from seeing a contradiction.
- [NOTE] Mirror-duplication check performed as instructed: the gate bodies at review.ts:87–104, lu-review/index.ts:28–45, and phase-execute/index.ts:884–898 carry the standard literal tokens verbatim (pre-fix SHA read, `git diff <pre-fix-sha> --name-only` ∪ `git ls-files --others --exclude-standard`, `.luca/` exclusion with empty-diff-reachability note, empty-diff branch, provable-zero-overlap branch, any-overlap/parse-failure/ambiguity escape, backlog-todo capture, skip-reason note, forward-exit). No duplication beyond the intended token-uniform mirroring found; the 2-line execute.ts cross-reference correctly defers the algorithm to review.ts Step 3.5 instead of copying it.

CONSOLIDATED:
  MUST_FIX_COUNT: 2
  SHOULD_FIX_COUNT: 2
  NOTE_COUNT: 3
  CROSS_PHASE_COUNT: 0

## Round 2

PERSPECTIVE: simplification
VERDICT: APPROVE

### Round-1 MUST-FIX dispositions

- [MUST-FIX 1 — stash never consumed] **RESOLVED**, by both suggested mechanisms simultaneously:
  - Consume-once deletion added as gate step 5 at all three sites, mirror-uniform, covering every branch including the step-1 ABSENT treatment: review.ts:101 ("Consume the stash: whichever branch step 4 selects (skip OR full round-2 — and also when step 1 treats the stash as ABSENT), delete `.luca/tmp/review-prefix-sha.json` now"), lu-review/index.ts:41, phase-execute/index.ts:894. Each variant names its own re-stash site (Route B / Aggregate loop-back / Step 8.1 CRITICAL exit) — intended site-specific variance, not drift.
  - Phase key added to the payload (`{"sha": ..., "phase": ...}`) at all three stash writers (review.ts:261, lu-review/index.ts:70, phase-execute/index.ts:1255) with phase-mismatch → ABSENT → full review at all three readers (review.ts:93, lu-review/index.ts:33, phase-execute/index.ts:886). The lu-review cross-phase stale-stash attack path (the core of the finding) is now closed twice over: mismatch forces a full first-pass review AND the stale file is deleted on that pass.
- [MUST-FIX 2 — vacuous zero-overlap on empty cite set] **RESOLVED**, again by both suggested mechanisms:
  - Cite collection widened to MUST-FIX **and** SHOULD-FIX at review.ts:95, lu-review/index.ts:35, and phase-execute/index.ts:888 (phase-execute correctly maps to its own CRITICAL / HIGH-MEDIUM severity scheme rather than copying foreign severity names).
  - Explicit guard added to the decision list at all three sites: "The prior cite set is **EMPTY** and the diff is NON-EMPTY → full round-2 … never a vacuous skip on an empty cite set" (review.ts:98, lu-review/index.ts:38, phase-execute/index.ts:891). Note this clause is NOT redundant with the widened cite set — a prior finding without a parseable `File:line` cite (e.g. a missing-feature MUST-FIX) can still yield an empty cite set on a genuine loop-back, so the guard carries real weight. Not flagging as duplication.

### Round-1 SHOULD-FIX dispositions

- [SHOULD-FIX 1 — execute.ts "Step 3 re-verify" terminology] **RESOLVED**. execute.ts:412 was reworded to name both exempt surfaces precisely: "Only the reviewer fan-out is gated: the re-verification at the `verify` pipeline step (the verifier re-spawn on loop-back, which runs before review) is NOT gated, and review mode's automated checks also run ungated as today," and it now correctly labels itself "a cross-reference only" deferring to review.ts Step 3.5. review.ts:91 still says "NOT re-verify, which has already run," but with the gate positioned at Step 3.5 (after Step 3 Automated Checks by construction) and the execute.ts side now unambiguous, the residual phrasing is no longer resolvable to the wrong step. Adequately closed.
- [SHOULD-FIX 2 — Route B item 2 run-on] **NOT ADDRESSED** (advisory; executor's prerogative). review.ts:261 remains a single sentence and has grown further with the embedded payload spec (`{"sha": ..., "phase": ...}` + two source commands) — now ~80 words carrying five actions. Same at lu-review/index.ts:70. Still SHOULD-FIX-tier only: the payload spec is load-bearing and verbatim-consistent with the reader sites, so correctness is unharmed; only drop-risk prominence suffers. Carried forward as an open advisory, not a blocker.

### New-issue sweep (simplification lens)

Checked the four edited regions for fix-induced bloat or redundancy beyond the intended mirroring:

1. review.ts:87–106 (Step 3.5) — new step 5 is one line; new decision clause is one line; payload/phase language in step 1 is one clause. No redundant restatement of the algorithm. PASS.
2. lu-review/index.ts:27–47 — mirror-uniform with review.ts except intended per-site wording ("run the reviewers" vs "proceed to Step 4"; "File unparsable" vs "File missing or unparsable," correct because lu-review's trigger is file existence). Post-skip line 47's "NEVER loops back into this gate" preserves the forward-exit literal. PASS.
3. phase-execute/index.ts:884–900 — same two additions, severity-scheme mapping localized to one parenthetical in step 3 rather than duplicated. PASS.
4. execute.ts:412 — still a 2-line cross-reference that defers the algorithm; the reword did not import any gate body text. PASS.

No new MUST-FIX findings. Both round-1 blockers are verifiably closed at all affected sites with belt-and-suspenders redundancy that is defensible (each layer covers a case the other does not).

### Round 2 CONSOLIDATED

  MUST_FIX_COUNT: 0
  SHOULD_FIX_COUNT: 1 (carried: Route B run-on phrasing, review.ts:261 / lu-review:70 — advisory)
  NOTE_COUNT: 0
  CROSS_PHASE_COUNT: 0
