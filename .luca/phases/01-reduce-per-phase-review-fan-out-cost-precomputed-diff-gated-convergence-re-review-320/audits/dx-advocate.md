PERSPECTIVE: dx
VERDICT: APPROVE

# DX Audit — Diff-Gated Round-2 Re-Review (#320), instruction-prose review

Scope: the four changed instruction bodies (review.ts Step 3.5 + Route B, execute.ts cross-reference, lu-review Re-run gate + loop-back capture, phase-execute Step 8 gate + Step 8.1 capture). Reviewed cold from the changed sections + project conventions only.

> Current verdict is the Round 2 verdict below. Round 1 verdict was REQUEST_CHANGES; its findings are preserved verbatim for the record.

## Round 1 Verdict (historical)

MUST-FIX (1 blocking finding). The core gate algorithm is admirably consistent across the three gate-bearing bodies — the 4-step algorithm (read SHA → diff∪untracked with `.luca/` exclusion → collect prior cites → empty/zero-overlap/ambiguity decision) is near-verbatim identical in `review.ts:93-99`, `lu-review/index.ts:33-39`, and `phase-execute/index.ts:886-892`, and every post-skip routing explicitly states the skip exits the loop and never re-enters (`review.ts:104`, `lu-review/index.ts:45`, `phase-execute/index.ts:898`). But the lu-review variant's trigger condition has a lifecycle hole that can wrongly skip a first-pass review.

## MUST-FIX

- [MUST-FIX] **Stale SHA stash can wrongly skip a first-pass review in lu-review — nothing ever deletes `.luca/tmp/review-prefix-sha.json`.**
  File: packages/luca-tools/src/artifacts/skills/lu-review/index.ts:29
  Evidence: the Re-run gate "Applies ONLY when `.luca/tmp/review-prefix-sha.json` exists" — a pure file-existence trigger. Grep across `packages/` confirms no body (nor any CLI/hook) deletes or invalidates the stash on ANY path: not the skip path (lines 41–45), not the full-re-review path, not the all-APPROVE advance (line 68). `.luca/tmp/` is gitignored and persists across sessions. Failure scenario: phase N stashes the SHA, its loop resolves, the file survives; phase N+1's *genuinely first* review pass finds the stale file, treats it as a re-run, diffs against the ancient SHA, checks overlap against phase N's obsolete MUST-FIX cites — zero overlap with those stale cites → **skip round-2 → advance to learn**, and phase N+1's brand-new code is never reviewed. The "when in doubt, re-review" ambiguity clause does not catch this because a clean parse of stale data is not ambiguous. (review.ts is safe here — its `reviewIteration > 0` trigger implies Route B rewrote the stash this phase; phase-execute's `--quality-fixes` context trigger is mostly safe — but both share the missing-cleanup smell.)
  Suggestion: two complementary fixes — (a) add an explicit "consume-once" instruction: after the gate reads the stash (both the skip branch and the full-re-review branch), and on the all-APPROVE advance, delete `.luca/tmp/review-prefix-sha.json`; (b) harden the stash contents to `{"sha": "<HEAD>", "phase": "<currentPhaseSlug>"}` in all three writers (review.ts Route B, lu-review Aggregate, phase-execute Step 8.1) and add to the gate: phase mismatch with the active slug → treat as no stash file. Either alone closes the hole; both together make it robust. Mirror the cleanup instruction in review.ts and phase-execute for consistency.
  Cross-phase: false

## SHOULD-FIX

- [SHOULD-FIX] **execute.ts cross-reference mislabels Review's Step 3 as "re-verify".**
  File: packages/luca-tools/src/artifacts/modes/execute.ts:412
  "Review's Step 3 re-verify is NOT gated and runs as today" — review mode's Step 3 is **Automated Checks** (`luca checks run`, review.ts:83-85); verification (verify.json) belongs to the verify step before review. The mislabel points a cross-referencing agent at the wrong step (review.ts:91's own "NOT re-verify, which has already run" has the same fuzzy referent). Safe direction (both are "not gated"), but the mirror should teach the right map. Suggestion: "Review's Step 3 automated checks — and the earlier verify step — are NOT gated and run as today."
  Cross-phase: false

- [SHOULD-FIX] **phase-execute gate imports "MUST-FIX" vocabulary into a CRITICAL/HIGH/MEDIUM/LOW body.**
  File: packages/luca-tools/src/artifacts/skills/phase-execute/index.ts:888
  Steps 3–4 of the gate say "prior MUST-FIX `File:line` cites" with a parenthetical mapping to "the CRITICAL findings". phase-execute's severity scheme (Step 8.1 table, reviewer return format) has no MUST-FIX tier — an agent may wonder whether HIGH findings belong in the overlap set. The parenthetical rescues it, but the decision bullets (lines 891–892) repeat bare "MUST-FIX" without it. Suggestion: use "CRITICAL" throughout the Step 8 gate prose, with one parenthetical noting it corresponds to MUST-FIX in the review-mode variant of this gate.
  Cross-phase: false

- [SHOULD-FIX] **Step 8.1 never mandates durably recording the CRITICAL findings' `File:line` cites the Step 8 gate depends on.**
  File: packages/luca-tools/src/artifacts/skills/phase-execute/index.ts:1253
  Gate step 3 (line 888) reads cites from "the fix plan and the active phase's audit artifact", but Step 8.1's bullet list (architect fix plan → plan-reviewer → SHA stash → EXIT) never instructs that the fix plan/audit artifact MUST carry each CRITICAL finding as `File: path:line`. The display table (lines 1241–1243) is ephemeral output, not a durable record, and `--quality-fixes` runs in a fresh session. Missing cites degrade safely ("ambiguity → full round-2") but that silently defeats the entire cost-saving lever. Suggestion: add to Step 8.1's CRITICAL branch: "Record each CRITICAL finding with its `File: path:line` in the fix plan (the Step 8 re-entry gate collects these cites)."
  Cross-phase: false

- [SHOULD-FIX] **Overlap set is MUST-FIX-only while SHOULD-FIX is also fixed in-pipeline, and "unresolved" is undefined in post-skip routing.**
  File: packages/luca-tools/src/artifacts/modes/review.ts:98
  Review.ts declares SHOULD-FIX items "Tackled in the same execute loop as MUST-FIX" (line 147) and Route B's iteration plan covers both (line 259) — yet gate step 3 collects only MUST-FIX cites. A fix touching only SHOULD-FIX-cited files yields zero overlap with MUST-FIX cites → skip → that fix ships without re-review. Relatedly, post-skip step 1 (review.ts:102, lu-review:43) says capture "every unresolved MUST-FIX and SHOULD-FIX item" but gives no rule for determining resolution — under zero-overlap some SHOULD-FIX items may have been fixed and would be re-captured as spurious backlog todos. Suggestion: either widen step 3 to "prior MUST-FIX and SHOULD-FIX cites", or state explicitly: "by construction of the skip conditions, treat ALL prior actionable findings as unresolved — capture them all."
  Cross-phase: false

- [SHOULD-FIX] **"the active phase's audit artifact" names no writable path.**
  File: packages/luca-tools/src/artifacts/modes/review.ts:103
  Post-skip step 2 (also phase-execute:897, and pre-existing Route B steps 2–3) tells the orchestrator to note the skip reason in "the active phase's audit artifact" — but the LUCA_DIR_CONTRACT only allows `audits/<reviewer>.md` with reviewer-derived names, and the reviewer subagents own those. Which concrete file does the orchestrator write? An agent must guess. Suggestion: name the canonical consolidated-report target explicitly (e.g. "the consolidated report file `audits/<orchestrator-report-name>.md`" or whatever slot the contract designates for the Step 6 report).
  Cross-phase: false

## Notes

- [NOTE] Three different trigger mechanisms for the same gate — `reviewIteration > 0` (review.ts:89), stash-file existence (lu-review:29), `--quality-fixes` re-entry context (phase-execute:884). Each is justified by its context's available signals, but the divergence is undocumented; a one-line "trigger differs per body because …" in each would prevent a future editor from 'harmonizing' toward the weakest (existence-based) variant.
- [NOTE] Filename `review-prefix-sha.json` reads as "prefix" (string prefix) while every prose mention says "pre-fix SHA". `review-pre-fix-sha.json` would be self-describing; renaming now is cheap (one convention, four files), later it isn't.
- [NOTE] lu-review:68 parenthetical "(the `verify → checks → execute` loop-back path)" lists pipeline steps in reverse execution order — reads as a forward path to a skimmer. Minor.
- [NOTE] Positive: the `.luca/` exclusion scoping note ("keeps the empty-diff branch reachable") is repeated verbatim in all three gate bodies (review.ts:94, lu-review:34, phase-execute:887), and "only when provably safe — when in doubt, re-review" appears in all four. Strong terminology discipline on the new prose.

CONSOLIDATED:
  MUST_FIX_COUNT: 1
  SHOULD_FIX_COUNT: 5
  NOTE_COUNT: 4
  CROSS_PHASE_COUNT: 0

## Round 2

PERSPECTIVE: dx
VERDICT: APPROVE

Re-read the four fixed files cold (review.ts Step 3.5 + Route B, lu-review Re-run gate + Aggregate, phase-execute Step 8 gate + Step 8.1, execute.ts cross-reference). The Round 1 MUST-FIX is genuinely resolved; no new MUST-FIX-severity issue was introduced by the fixes.

### MUST-FIX disposition: RESOLVED

The stale-stash lifecycle hole is closed by all three requested mechanisms, applied consistently:

1. **Phase-keyed payload in all three writers.** `review.ts:261` (Route B), `lu-review/index.ts:70` (Aggregate), `phase-execute/index.ts:1255` (Step 8.1) all write `{"sha": "<HEAD>", "phase": "<slug>"}` with explicit sourcing (`git rev-parse HEAD`, active phase slug) and name the Write tool + exact path.
2. **Validity gate in all three readers.** `review.ts:93`, `lu-review/index.ts:33`, `phase-execute/index.ts:886` each treat missing/unparsable file, phase-slug mismatch, or a SHA failing `git rev-parse --verify` as ABSENT → full review. The bad-SHA check (rebase/squash resilience) goes beyond what Round 1 asked for.
3. **Consume-once in all three gates.** `review.ts:101`, `lu-review/index.ts:41`, `phase-execute/index.ts:894` — deletion fires on every branch (skip, full re-review, AND the step-1 ABSENT path), with the re-stash source named per body ("Route B loop-back" / "Aggregate below" / "Step 8.1 CRITICAL exit").

Lifecycle traced end-to-end for the original failure scenario: phase N stashes → loop abandoned or resolved → phase N+1 first pass finds the file → step 1 phase-mismatch → ABSENT → full review runs, and step 5 deletes the stale file. The wrong-skip path no longer exists. The all-APPROVE advance (lu-review:70) needs no cleanup step because any stash that existed was already consumed at gate entry — internally consistent.

### SHOULD-FIX dispositions

1. **execute.ts "re-verify" mislabel — RESOLVED.** `execute.ts:412` now reads "Only the reviewer fan-out is gated: the re-verification at the `verify` pipeline step (the verifier re-spawn on loop-back, which runs before review) is NOT gated, and review mode's automated checks also run ungated as today," plus an explicit pointer to "review mode's Step 3.5 (Re-entry Diff Gate); this note is a cross-reference only." No step mislabel remains; the map it teaches is correct.
2. **MUST-FIX vocabulary in phase-execute — RESOLVED.** `phase-execute/index.ts:888` step 3 now defines the mapping once for both tiers: "(in this skill's severity scheme: the CRITICAL and HIGH/MEDIUM findings recorded in the fix plan and the active phase's audit artifact)." The decision bullets (891–892) still use the bare cross-body terms, but they inherit the step-3 definition, and keeping the shared vocabulary preserves the near-verbatim tri-body algorithm — an acceptable trade.
3. **Step 8.1 cite recording — OPEN.** The Step 8.1 CRITICAL branch (`phase-execute/index.ts:1253-1257`) still never mandates recording each CRITICAL finding's `File: path:line` in the fix plan; gate step 3 (888) now *names* the fix plan as a cite source, but nothing guarantees the cites land there durably. Degrades safely (missing cites → ambiguity → full round-2), so non-blocking — but the cost-saving lever can still silently no-op on the `--quality-fixes` path.
4. **Overlap set + "unresolved" — PARTIALLY RESOLVED.** The cite set is widened to MUST-FIX AND SHOULD-FIX in all gate bodies (`review.ts:95,99`; `lu-review:35,39`; phase-execute via the HIGH/MEDIUM mapping at 888,892), and the new empty-cite-set + non-empty-diff guard (`review.ts:98`, `lu-review:38`, `phase-execute:891`) closes the vacuous-skip corner. This eliminates the Round 1 hazard (SHOULD-FIX-only fix shipping unreviewed). Remaining gap: post-skip capture still says "every unresolved … item" (`review.ts:104`, `lu-review:45`) / "every unresolved finding" (`phase-execute:898`) with no resolution rule — though with the widened set, a skip now implies no cited file was touched, so "treat all as unresolved" is the only coherent reading. Non-blocking.
5. **"the active phase's audit artifact" path — OPEN.** Unchanged at `review.ts:105`, `lu-review/index.ts:46`, `phase-execute/index.ts:899` (and Route B `review.ts:261-262`): still no concrete writable filename under the LUCA_DIR_CONTRACT `audits/` slot. Pre-existing ambiguity shared with Route B prose; non-blocking.

### New issues introduced by the fixes

None at MUST-FIX severity. Checked specifically: (a) consume-once vs. re-stash ordering — no branch deletes a stash it still needs; every loop-back re-stashes fresh after the gate has consumed the old value; (b) the lu-review step 1 omission of "File missing" is correct, not an inconsistency — its trigger (line 29) is file existence, so the missing case cannot reach step 1, while review.ts/phase-execute (iteration/context triggers) correctly include it; (c) the empty-cite-set guard composes correctly with the empty-diff branch (empty diff wins first, as intended); (d) the ABSENT path in lu-review deleting a phase-mismatched stash is correct (it is garbage from a dead loop, and the current phase's Aggregate re-stashes if needed).

### Round 2 consolidated

CONSOLIDATED:
  MUST_FIX_COUNT: 0
  SHOULD_FIX_COUNT: 2
  NOTE_COUNT: 0
  CROSS_PHASE_COUNT: 0
