PERSPECTIVE: architecture

## Verdict

MUST-FIX

Reviewed the staged Lever-2 diff-gated re-review changes across the four instruction bodies:
`packages/luca-tools/src/artifacts/modes/review.ts` (Step 3.5 gate + Route B stash), `packages/luca-tools/src/artifacts/modes/execute.ts` (cross-reference at line 412), `packages/luca-tools/src/artifacts/skills/lu-review/index.ts` (Re-run gate + loop-back stash), `packages/luca-tools/src/artifacts/skills/phase-execute/index.ts` (Step 8 gate at 884–898, Step 8.1 stash at 1253).

Module boundaries are respected: the gate is instruction-prose only, uses only pre-existing legal state transitions (`review → learn`, `review → execute`), and stashes to the documented `.luca/tmp/` ephemeral slot — no new luca-core surface, no state-machine change. The authoritative-gate-vs-mirror separation is clean (execute.ts explicitly says "this note is a cross-reference only"). However, two correctness gaps in the gate algorithm itself block approval.

## MUST-FIX

- [MUST-FIX] **Stale stash file can silently skip a first-pass review in `/lu-review`.** The lu-review gate triggers on *file existence alone* (`Applies ONLY when .luca/tmp/review-prefix-sha.json exists`), and no path in any of the four bodies ever deletes the stash after consumption (lu-review's all-APPROVE advance at line 68, review mode's Route A / budget-exhausted / post-skip exits at review.ts:253–260 and 101–104 all leave it behind). Cross-phase scenario: phase N's review loop leaves the file; phase N+1's *first* `/lu-review` pass fires the gate; the diff vs the stale SHA is non-empty, but the active phase N+1 `audits/` directory is empty, so the prior-MUST-FIX cite set is empty and "provable zero overlap" is vacuously true → round-2 skipped → phase N+1 advances to learn without a single reviewer ever running. The other two gates are anchored to state (`reviewIteration > 0`) or an explicit flag (`--quality-fixes`), so only lu-review is exposed — but the missing-cleanup root cause is shared.
  File: packages/luca-tools/src/artifacts/skills/lu-review/index.ts:29
  Suggestion: (a) instruct deletion of `.luca/tmp/review-prefix-sha.json` immediately after the gate consumes it (both skip and full-re-review branches) and on every loop-exit path in all three gate bodies; (b) include the phase slug in the stash payload (`{"sha": ..., "phase": "<slug>"}`) and treat a slug mismatch as no-gate/first-pass; (c) treat an *empty* prior-cite set as ambiguity → full re-review, closing the vacuous-truth branch.
  Cross-phase: true

- [MUST-FIX] **Review-mode gate overlap set is MUST-FIX-only, but Route B loops on MUST-FIX *or* SHOULD-FIX — SHOULD-FIX-only iterations always vacuously skip round-2.** Route B (review.ts:257–259) re-enters execute for "MUST-FIX or SHOULD-FIX", but Step 3.5 step 3 collects only "prior MUST-FIX `File: {path:line}` cites" (review.ts:95). When round-1 produced only SHOULD-FIX findings, the cite set is empty, so any fix diff has "provable zero overlap" (review.ts:98) → round-2 is skipped regardless of what the fixes touched, violating the gate's own "only when provably safe" invariant (review.ts:91). Worse, post-skip step 1 (review.ts:102) then backlogs those items as "unresolved" even though the executor just fixed them — false bookkeeping. (lu-review and phase-execute are internally consistent here because their loop-backs fire only on MUST-FIX/CRITICAL, guaranteeing a non-empty cite set within a phase.)
  File: packages/luca-tools/src/artifacts/modes/review.ts:95
  Suggestion: collect both MUST-FIX and SHOULD-FIX cites for the overlap computation (matching Route B's loop trigger), and add "empty prior-cite set → treat as ambiguity → full round-2" to the decide list at review.ts:96–99.
  Cross-phase: false

## SHOULD-FIX

- [SHOULD-FIX] **execute.ts mirror mislabels the ungated re-verify as "Review's Step 3".** Line 412 says "Review's Step 3 re-verify is NOT gated" — review mode's Step 3 is *Automated Checks* (`luca checks run`, review.ts:83–85); re-verification (verify.json) is the separate `verify` pipeline step that runs before review. review.ts:91 phrases it correctly ("NOT re-verify, which has already run"). A future editor following the mirror could gate or move the wrong step.
  File: packages/luca-tools/src/artifacts/modes/execute.ts:412
  Suggestion: reword to "the verify step's re-verification (upstream of review) is NOT gated; review's Step 3 automated checks also run ungated."
  Cross-phase: false

- [SHOULD-FIX] **Gate trigger conditions diverge across the three authoritative copies without a stated rationale.** review.ts keys on `reviewIteration > 0` (state-derived, robust), lu-review on stash-file existence (fragile — see MUST-FIX 1), phase-execute on the `--quality-fixes` flag. The bodies otherwise mirror each other verbatim (steps 1–4 + post-skip), so the trigger divergence reads as accidental rather than surface-adapted.
  File: packages/luca-tools/src/artifacts/skills/lu-review/index.ts:29
  Suggestion: anchor each trigger to that surface's authoritative signal and add a one-line comment in each body noting the intentional divergence (mode → state counter, skill → stash+slug match, phase-execute → flag), so future edits keep them aligned.
  Cross-phase: true

## Notes

- [NOTE] Filename `review-prefix-sha.json` reads as "prefix" but means "pre-fix". All four bodies use it consistently (review.ts:93,259; execute.ts:412; lu-review:29,33,68; phase-execute:886,1253), so it is functionally coherent — but `review-pre-fix-sha.json` would be self-describing. Rename only if done atomically across all four.
- [NOTE] phase-execute Step 8's changed-file scope for the fan-out is filtered (`git diff main...HEAD -- '*.ts' '*.tsx'`, line 878) while the gate's diff at line 887 is unfiltered. The gate being *stricter* than the fan-out is the safe direction (non-TS changes force a full round-2), so this is fine — recording it as intentional asymmetry.
- [NOTE] Verified the `.luca/` exclusion note ("keeps the empty-diff branch reachable") is present in all three gate copies (review.ts:94, lu-review:34, phase-execute:887) — good convention consistency; without it the stash write itself would make the diff perpetually non-empty on surfaces where `.luca/tmp/` is untracked.
- [NOTE] Pipeline state-machine integrity check passed: the skip path uses only the pre-existing `review → learn` edge (review.ts:104, lu-review:45) and phase-execute's skip jumps to its own Step 9 which advances `--to-step learn` (phase-execute:1287) — no new transitions were invented in prose.

CONSOLIDATED:
  MUST_FIX_COUNT: 2
  SHOULD_FIX_COUNT: 2
  NOTE_COUNT: 4
  CROSS_PHASE_COUNT: 2

## Round 2

PERSPECTIVE: architecture
VERDICT: APPROVE

Re-read the changed gate sections in all four staged files after the fix wave. Per-finding disposition:

### Round-1 MUST-FIX disposition

- **MUST-FIX 1 (stale stash → vacuous first-pass skip): RESOLVED.** All three suggested mitigations landed, verified independently in each body:
  - *(a) Consume-once*: an explicit step 5 "Consume the stash" now deletes `.luca/tmp/review-prefix-sha.json` on **every** branch — skip, full re-review, and even when step 1 declares the stash ABSENT (review.ts:101, lu-review/index.ts:41, phase-execute/index.ts:894). Each loop-back re-stashes a fresh value (review.ts Route B:261, lu-review Aggregate:70, phase-execute Step 8.1:1255), so consume-at-gate-entry plus re-stash-at-loop-back leaves no path where a live stash survives an exit. A stash orphaned by an abandoned loop is defused by (b).
  - *(b) Phase slug in payload*: the payload is now `{"sha": "<HEAD>", "phase": "<phase slug>"}` at all three stash sites (review.ts:261, lu-review:70, phase-execute:1255), and step 1 in all three gates treats a slug mismatch — plus unparsable payload or a SHA failing `git rev-parse --verify` — as ABSENT → full review (review.ts:93, lu-review:33, phase-execute:886). This closes the exact cross-phase scenario from round 1: phase N's leftover stash hitting phase N+1's first `/lu-review` pass now fails the slug match, runs the full review, and is deleted by step 5.
  - *(c) Empty-cite-set guard*: the decide list in all three gates now includes "prior cite set is EMPTY and the diff is NON-EMPTY → full round-2 … never a vacuous skip on an empty cite set" (review.ts:98, lu-review:38, phase-execute:891). The vacuous-truth branch is unreachable.

- **MUST-FIX 2 (overlap set MUST-FIX-only vs Route B looping on SHOULD-FIX): RESOLVED.** review.ts Step 3.5 step 3 now collects "prior MUST-FIX **and SHOULD-FIX** `File: {path:line}` cites" (review.ts:95), and the zero-overlap branch tests against both severities (review.ts:99) — now matching Route B's loop trigger (review.ts:259, "MUST-FIX or SHOULD-FIX"). lu-review:35,39 and phase-execute:888,892 mirror the widened set (phase-execute correctly maps to its CRITICAL and HIGH/MEDIUM vocabulary at :888). The round-1 false-bookkeeping corollary is also closed: with SHOULD-FIX cites in the overlap set, a zero-overlap skip now implies the fix diff did NOT touch any cited location, so post-skip step 1's backlogging of those items as unresolved (review.ts:104) is semantically correct rather than false.

### Round-1 SHOULD-FIX disposition

- **SHOULD-FIX 1 (execute.ts "Review's Step 3" mislabel): RESOLVED.** execute.ts:412 was reworded to "Only the reviewer fan-out is gated: the re-verification at the `verify` pipeline step (the verifier re-spawn on loop-back, which runs before review) is NOT gated, and review mode's automated checks also run ungated as today." No step number is misattributed; the mirror now matches review.ts:91's authoritative phrasing and still self-identifies as "a cross-reference only".
- **SHOULD-FIX 2 (divergent trigger rationale): SUBSTANTIALLY ADDRESSED.** The fragility that motivated the finding is gone — lu-review's existence-based trigger is now backstopped by the slug-match ABSENT rule (lu-review:33) and consume-once, so all three triggers are fail-safe. Each gate's step 1 also now names its own stash provenance inline ("stashed at Route B…" review.ts:93; "stashed at Step 8.1 before the `--quality-fixes` exit" phase-execute:886). A single-line "intentional divergence" comment per body was not added verbatim; residual risk is documentation-only. Advisory — does not block.

### New-issue check (fix-wave regression scan)

Checked the edited sections for newly introduced correctness/security/missing-requirement issues; found none. Specifically verified:
1. The ABSENT branch is fail-safe in all three gates (missing/unparsable file, slug mismatch, unresolvable SHA all → full review, never skip) — review.ts:93, lu-review:33, phase-execute:886.
2. Step 5's "delete … also when step 1 treats the stash as ABSENT" is coherent (deleting a missing file is a no-op; deleting a mismatched-slug file correctly garbage-collects the orphan) — review.ts:101, lu-review:41, phase-execute:894.
3. Consume-once does not starve legitimate re-entries: every loop-back path that returns to review re-stashes immediately before its exit transition (review.ts:261 "immediately before the transition", lu-review:70, phase-execute:1255), so the gate always finds a fresh stash on a genuine round-2 and finds nothing (→ full review) otherwise.
4. Skip-path routing is unchanged and still uses only pre-existing state-machine edges (`--to-step learn` at review.ts:106, lu-review:47; phase-execute skip → its own Step 9) — no new transitions introduced by the fix wave.
5. The three copies remain mutually consistent after the edits: identical step 1–5 structure and decide-list ordering, with only surface-appropriate wording differences (round-2/fan-out vs run-the-reviewers; MUST-FIX/SHOULD-FIX vs CRITICAL/HIGH/MEDIUM), and the execute.ts mirror stays algorithm-free.

Round-1 NOTEs (pre-fix filename, diff-scope asymmetry, `.luca/` exclusion, state-machine integrity) remain accurate against the edited text; line drift only (e.g. review.ts `.luca/` exclusion note now at :94 unchanged, phase-execute gate diff now :887).

CONSOLIDATED (Round 2):
  MUST_FIX_COUNT: 0
  SHOULD_FIX_COUNT: 0
  NOTE_COUNT: 1
  CROSS_PHASE_COUNT: 0
