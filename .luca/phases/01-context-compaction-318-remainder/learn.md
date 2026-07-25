# Learn — context-compaction #318 remainder

Phase: `01-context-compaction-318-remainder` · Complexity MODERATE · Verify PASS (18/18 + 2 anti-criteria, one review fix-loop).

Learnings framed as corrected errors (conjecture → refutation → better explanation → guard).

---

## pitfall:markdown-header-guard-substring-false-positive

- **Type**: pitfall · **Confidence**: HIGH
- **Conjectured**: An idempotency/presence guard can test for a markdown section by `content.includes('## Compact Instructions')` — a substring match is "good enough" to tell whether the block was already seeded.
- **Refuted by**: Two independent reviewers (architecture + dx) converged on the SAME line of `packages/luca-cli/src/init/helpers/ensure-compact-instructions.ts`: a deeper heading such as `### Compact Instructions Notes` CONTAINS the substring `## Compact Instructions`, so the guard false-positives and silently skips the append (the block never lands). See wave `02.md` "Review fix (iteration 1) FIX 1".
- **Learned**: Match the header on a WHOLE-LINE boundary, not a substring: `content.split('\n').some((line) => line.trim() === HEADER)`. This mirrors the established `ensureLucaGitignore` trimmed-line semantics and is the pattern to copy for any "append-if-header-missing" helper. A markdown heading is a line-scoped token; `###` is a strict superstring of `##`, so substring tests over headings are structurally unsound.
- **Criterion now**: A test that seeds a CLAUDE.md containing ONLY the deeper heading (`### Compact Instructions Notes`) and asserts the managed block still appends (proven via block-unique content, e.g. the `session:phase-boundary-handoff` line, plus a line-exact header count == 1). Present at `ensure-compact-instructions.test.ts:64`.

## pitfall:pre-satisfied-grep-acceptance-criterion

- **Type**: pitfall · **Confidence**: HIGH
- **Conjectured**: A grep-based acceptance criterion like `grep -c "envelope" <file> >= 1` proves the task's edit landed.
- **Refuted by**: Plan-review flagged criteria whose probe token ALREADY matched the file before any change (e.g. `verifier.ts` already contained "envelope"/"verify.json" prose; a bare `grep "TO_PERSIST"` matches the pre-existing header). A criterion that is green on the untouched tree cannot distinguish "done" from "not started". The plan was hardened to probe tokens ABSENT today — e.g. ac-11 requires the NEW literal `"Return ONLY the TO_PERSIST envelope"` (grep -c == 1, explicitly "not the pre-existing header"), ac-12/12.1/12.2 require phrases confirmed absent from the file at plan time.
- **Learned**: A grep acceptance probe is only valid if it targets a string that is ABSENT before the change and PRESENT after. Prefer a distinctive new literal phrase the task must introduce over a generic word that already appears. Where the anti-criterion must guard an EXISTING token (TO_PERSIST contract), pair it with a positive criterion on a new token so "still present" and "newly added" are separately verified.
- **Criterion now**: Before accepting a grep criterion, run the probe against the pre-change tree; if it already matches, rewrite it to a token the edit uniquely introduces (or convert to a count-delta / line-anchored assertion).

## procedure:respawn-pinned-model-subagent-on-credit-error

- **Type**: procedure · **Confidence**: HIGH
- **Conjectured**: A Luca mode/subagent that terminates mid-run with a model error is a hard failure that aborts the pipeline step.
- **Refuted by**: The `plan` step's architect subagent terminated with "Usage credits are required for this model" — a PINNED-model credit/entitlement error, not a task error. The run recovered by respawning the same subagent with an explicit session-model override (opus). See signal-digest `[failure-dump] plan`.
- **Learned**: A pinned-model credit/usage/entitlement error is an infrastructure fault orthogonal to the work; the correct response is to respawn with an explicit session-model override rather than abort. (See procedure entry for the recipe.)
- **Criterion now**: On a subagent termination, classify the message — if it matches credit/usage/entitlement/model-availability (not a code/task failure), respawn once with `--session-model`/explicit model override before treating the step as failed.

## pattern:dual-lu-surface-sync

- **Type**: pattern · **Confidence**: MEDIUM
- **Conjectured**: Editing the `/lu` skill body (`skills/lu/index.ts`) is enough to change `/lu` behavior.
- **Refuted by**: `/lu` ships as TWO independent surfaces — the skill (`packages/luca-tools/src/artifacts/skills/lu/index.ts`) AND the slash command (`packages/luca-tools/src/artifacts/commands/lu.ts`). STEP 0/1 updated only the skill, leaving `commands/lu.ts:56` describing the pre-#318 "orchestrator persists research.md" flow and `:65` with no phase-boundary handoff — a live contradiction (research.md finding 3; the file header comment confirms both ship intentionally).
- **Learned**: Any change to `/lu` step-table semantics must be applied to BOTH `skills/lu/index.ts` and `commands/lu.ts` in the same change. The command body should mirror the skill's step table (terse pointer form, not a full copy) so the two shipped surfaces never diverge.
- **Criterion now**: When touching `skills/lu/index.ts` rows, grep `commands/lu.ts` for the same row semantics in the same PR; a divergence (e.g. one surface says "persist by writing", the other "researcher writes itself") is a regression.

## Signal Synthesis

Derived solely from the orchestrator-injected `<signal-digest>`.

- **Recurring failure themes**: One infra failure (plan step) — architect subagent killed by a pinned-model credit error, recovered by session-model override. Not a code/root-cause cluster; isolated to model entitlement, spanning a single step. No repeated failure signals elsewhere.
- **Satisfaction valence trends by step/source**: `checks` and `verify` trended POSITIVE throughout (typecheck + helper test green; 18/18 criteria both pre- and post-fix). `review` was the sole NEGATIVE valence step (first pass), driven by a cross-perspective CONVERGED finding (architecture + dx on the same line) plus a test-quality MEDIUM; it flipped POSITIVE after the isolated fix loop. Friction hotspot = review; everything else was clean.
- **Cross-cutting patterns**: The converged review finding (2 reviewers, same line) is the standout signal — cross-perspective convergence on an identical line is a strong TRUE-bug indicator and justified the single fix loop. The test-quality MEDIUM (untested no-trailing-newline append branch) confirms that idempotent-append helpers need explicit coverage of BOTH the header-boundary case and the newline-glue branch. Both are promoted to the pitfall entries above.
