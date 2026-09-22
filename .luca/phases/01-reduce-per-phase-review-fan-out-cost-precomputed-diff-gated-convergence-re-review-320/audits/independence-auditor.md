PERSPECTIVE: independence
VERDICT: REQUEST_CHANGES

## Verdict

MUST-FIX. The diff-gated re-review feature (#320) has structural holes that let the gate skip reviews it must not skip — the exact quality regression the project's hard constraint ("never sacrifice review quality") forbids — plus a stash-file lifecycle that can suppress an entire first-pass review, and a no-commit-path contradiction that makes the gate a no-op in the flagship mode-agent pipeline. Re-derived from the diff alone; all citations verified by reading the four files in full plus `packages/luca-core/src/state/machine/actions.ts` and a repo-wide grep for `review-prefix-sha`.

## MUST-FIX

- [MUST-FIX] **"Provable zero overlap → skip" proves the opposite of safety: any nonempty fix diff that misses the prior cite paths advances entirely UNREVIEWED.** A fix routinely lands in a different file than the symptom cite (callee vs. caller, a new helper module, a new test file added to satisfy a missing-requirement finding — new/untracked files can NEVER overlap prior cites by construction). In every such case the changed code was written AFTER round 1, so no reviewer has ever seen it, yet the gate skips round-2 and routes forward to learn. Simultaneously the genuinely-fixed finding is mislabeled "unresolved" and dumped to backlog (post-skip routing item 1). The zero-overlap branch is unsound in both directions.
  File: packages/luca-tools/src/artifacts/modes/review.ts:98
  File: packages/luca-tools/src/artifacts/skills/lu-review/index.ts:38
  File: packages/luca-tools/src/artifacts/skills/phase-execute/index.ts:891
  Suggestion: Delete the zero-overlap skip branch on all three surfaces. Only the empty-diff branch is arguably safe. If cost reduction on nonempty diffs is required, replace skip with a scoped single-reviewer pass over the diff — never zero review of new code.
  Cross-phase: false

- [MUST-FIX] **Empty cite set makes "zero overlap" vacuously true → wrongful skip, including skipping a phase's FIRST review.** (a) review.ts Route B loops back on SHOULD-FIX-only findings (line 257: "MUST-FIX or SHOULD-FIX"), but Step 3.5 point 3 collects only MUST-FIX cites — so every SHOULD-FIX-only re-entry has an empty cite set, trivially zero overlap, and auto-skips with its fix diff unreviewed. (b) lu-review's gate triggers on stash-file existence alone (line 29); with a stale stash (see next finding) and a new phase whose `audits/` directory is empty, the cite set is empty (zero audit files is not "a malformed audit file", so the ambiguity clause doesn't fire) → the entire first review of the phase is skipped.
  File: packages/luca-tools/src/artifacts/modes/review.ts:95
  File: packages/luca-tools/src/artifacts/skills/lu-review/index.ts:35
  Suggestion: Collect MUST-FIX **and** SHOULD-FIX cites (both are fixed in-pipeline per Route B), and add an explicit rule: an empty cite set, or zero readable prior audit files, is AMBIGUITY → full re-review.
  Cross-phase: false

- [MUST-FIX] **`.luca/tmp/review-prefix-sha.json` is never consumed, deleted, or scoped — one shared mutable file across three surfaces.** Grep confirms no surface (and nothing in luca-core/luca-cli) deletes or invalidates it: not the post-skip path, not the full-round-2 path, not Route A/APPROVE. It carries no phase slug, no iteration, no timestamp. lu-review fires purely on file existence, so a stash written weeks earlier by phase-execute Step 8.1 (user never ran `--quality-fixes`), or by a previous phase's Route B, triggers the gate on what is actually a first pass — and combined with the empty-cite-set hole above, suppresses review outright. Additionally, after a rebase or branch switch the stashed SHA may not resolve; `git diff <sha>` then ERRORS, a case none of the three gate texts handles ("file missing or unparsable" does not cover a failing git command).
  File: packages/luca-tools/src/artifacts/skills/lu-review/index.ts:29
  File: packages/luca-tools/src/artifacts/modes/review.ts:93
  File: packages/luca-tools/src/artifacts/skills/phase-execute/index.ts:886
  Suggestion: Write `{"sha", "phaseSlug", "reviewIteration", "writtenAt"}`; validate slug+iteration at gate entry (mismatch → treat as missing → full review); DELETE the file at every gate exit (skip or full) and on APPROVE/Route A; treat any `git diff` failure (unknown SHA) as ambiguity → full re-review.
  Cross-phase: true

- [MUST-FIX] **Post-skip routing demotes unresolved MUST-FIX/CRITICAL findings to backlog and advances the pipeline — contradicting "MUST-FIX blocks proceeding."** An empty diff means the executor fixed nothing; the prior correctness/security findings are all still live. Instead of escalating, the gate captures them as backlog todos and advances `--to-step learn` (review.ts 101–104; lu-review 41–45; phase-execute 894–898 jumps to step 9). This grants on iteration 1 the demotion that previously required exhausting `maxReviewIterations` (review.ts Step 7 Route B point 3), and directly contradicts phase-execute's own severity table "CRITICAL | Block — must fix before continuing" (index.ts:1228) and review.ts Step 5 "MUST-FIX — Blocks proceeding" (review.ts:146). Net effect: known correctness/security bugs ship to finalize silently.
  File: packages/luca-tools/src/artifacts/modes/review.ts:101
  File: packages/luca-tools/src/artifacts/skills/phase-execute/index.ts:894
  Suggestion: Empty diff with open MUST-FIX/CRITICAL findings must ESCALATE to the user (executor made no changes — that is a stall, same class as the checks-loop `stalled` verdict), not advance. Reserve backlog demotion for the budget-exhausted path where it originated.
  Cross-phase: false

- [MUST-FIX] **`git rev-parse HEAD` does not capture the pre-fix state under the stage-gate no-commit path — the gate is a structural no-op in the mode-agent pipeline.** execute.ts's own gotcha (line 433) states commits are DENIED in EXECUTING until idle/finalize, so in the review-mode pipeline the entire phase's work sits uncommitted in the worktree when Route B stashes `HEAD` (review.ts:259). `HEAD` therefore predates the whole phase; on re-entry, `git diff <pre-fix-sha>` returns ALL phase changes (round-1 work + fixes conflated), which will always overlap the cites (they point into phase-changed files) → the gate can never skip. Fail-safe for quality, but the phase's stated requirement — reduce re-review fan-out cost — is structurally unmet in the flagship pipeline, and the mechanism silently depends on the contradictory execute.ts Step 6 per-task-commit text (execute.ts:324–361) being the true behavior.
  File: packages/luca-tools/src/artifacts/modes/review.ts:259
  File: packages/luca-tools/src/artifacts/modes/execute.ts:433
  Suggestion: Snapshot the worktree, not HEAD — e.g., stash `git stash create` / `git write-tree` output and diff against that tree id — or explicitly scope the gate to the commit-per-task skill pipeline and remove Step 3.5 from review.ts until the commit-model contradiction is resolved.
  Cross-phase: true

## SHOULD-FIX

- [SHOULD-FIX] The `.luca/` exclusion is worded for the untracked union only ("Scoping note: `.luca/` paths in the untracked union…"), but the tracked side of `git diff <sha> --name-only` also picks up committed `.luca/` artifact churn (verify.json rewritten by re-verify, committed audits) in repos that commit phase artifacts — making the empty-diff branch unreachable there. Fail-safe direction, but defeats the cost goal. State that the exclusion applies to both outputs (the parenthetical "both outputs empty after the `.luca/` exclusion" is not enough to override the explicit untracked-only scoping note).
  File: packages/luca-tools/src/artifacts/modes/review.ts:94 (same wording at lu-review/index.ts:34 and phase-execute/index.ts:887)
  Cross-phase: false
- [SHOULD-FIX] phase-execute Step 8.1 stashes the SHA but never instructs persisting the CRITICAL findings with `File:line` cites to a durable on-disk record; the `--quality-fixes` run is a FRESH session (the flow EXITs at 1255), so gate point 3's cite sources ("the fix plan and the active phase's audit artifact") may not exist deterministically. Falls to the ambiguity branch → full round-2, silently defeating the feature on its primary surface. Add an explicit findings-persist step next to the stash at 1253.
  File: packages/luca-tools/src/artifacts/skills/phase-execute/index.ts:1253
  Cross-phase: false
- [SHOULD-FIX] lu-review's loop-back (stash SHA → "direct the user back to `/phase-execute`") leaves `pipelineStep` at `review`, but phase-execute Step 0 hard-STOPs unless the step is `execute` or `plan-review` (index.ts:183–187). The new stash instruction builds on a path that dead-ends as written. Specify the accompanying state transition (or the intended re-entry command) alongside the stash.
  File: packages/luca-tools/src/artifacts/skills/lu-review/index.ts:68
  Cross-phase: true
- [SHOULD-FIX] review.ts post-skip item 2 says to note the skip reason "in the active phase's audit artifact", but on a skipped round no consolidated report is generated (Steps 4.5–6 are bypassed) and `audits/` filenames are fixed per-reviewer — there is no defined artifact to receive the note. Name the canonical destination file.
  File: packages/luca-tools/src/artifacts/modes/review.ts:103
  Cross-phase: false

## Notes

- [NOTE] `reviewIteration` resets on the `review->learn` edge (`packages/luca-core/src/state/machine/actions.ts:77`, `resetFixLoop`), so review.ts's `reviewIteration > 0` key is safe cross-phase; the cross-phase hazard is confined to the file-existence-keyed lu-review gate and the shared stash path (covered in MUST-FIX 3).
- [NOTE] Route B now instructs the "READ-ONLY" review mode (review.ts:42, 276) to Write the stash file — legal because `.luca/tmp/` is writable in any pipelineStep, but a doctrinal tension worth one clarifying sentence in the read-only preamble.
- [NOTE] The execute.ts cross-reference (lines 406–412) is accurate as a mirror and correctly defers the algorithm to review.ts Step 3.5; no drift found between the two beyond the substantive issues above.
- [NOTE] Overlap is path-granular (cites are `path:line`, comparison is by path) — conservative and fine; do not tighten to line-level, which would widen the wrongful-skip surface.

CONSOLIDATED:
  MUST_FIX_COUNT: 5
  SHOULD_FIX_COUNT: 4
  NOTE_COUNT: 4
  CROSS_PHASE_COUNT: 3
