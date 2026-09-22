PERSPECTIVE: dx
VERDICT: APPROVE

## Verdict

APPROVE — 0 MUST-FIX. The new TS code follows repo conventions (kebab-case filenames, functional style, no classes, JSDoc on every export, snake_case CLI output keys `changed_paths`/`cite_paths`), error messages are actionable, and the reworked gate prose is followable by a consuming agent on all three surfaces. Three advisory improvements below.

Evidence verified (cold, from source):

1. `packages/luca-cli/src/write-surface/handlers/luca-snapshot-diff.ts:143-149` — diff output keys are snake_case (`verdict`, `changed_paths`, `cite_paths`, `reason`) per the API snake_case convention; create output (`luca-snapshot-create.ts:187-196`) likewise (`ok`, `tree`, `phase`, `payload`).
2. `packages/luca-cli/src/write-surface/handlers/luca-snapshot-diff.ts:204-211` — the missing-payload error tells the agent exactly what to do ("run luca snapshot create before the diff-gate"); every `ambiguous` branch carries a distinct, specific `reason` string. Error-message quality is high throughout.
3. Gate prose walk-through as a consuming agent: `modes/review.ts:89-102` (applies only at `reviewIteration > 0`, ABSENT check → run `luca snapshot diff` → verdict table → post-skip routing), `skills/lu-review/index.ts:29-42` (ABSENT check inverted correctly for the payload-exists trigger), `skills/phase-execute/index.ts:884-898` (same sequence + honest `G-ARCH-001` accepted-limitation note at line 892 explaining why this path always re-reviews). The ABSENT-check → run-diff → act-on-verdict sequence is unambiguous and consistent on all three; "the CLI consumes the payload, do NOT delete it yourself" is stated on each, preventing the most likely agent misstep.
4. `packages/luca-tools/src/artifacts/subagents/reviewer.ts:140` — the anti-drift note pins the `File: {path:line}` cite format to the CLI parsing contract and names the failure mode (silent `ambiguous` degrade). Excellent producer/consumer contract documentation.
5. `packages/luca-cli/src/hook/helpers/classify-bash-command.ts:266-270` — the `snapshot: create|diff → luca-write` classification carries a comment explaining why neither verb is read (both run on the gated REVIEWING path), so the next editor won't "fix" `diff` into `LUCA_READ_VERBS`.
6. Wiring: `snapshot` command registered in `cli.ts:87-90`, handlers exported from `write-surface/index.ts:85-86`, `commands/write-surface/snapshot.ts` uses the shared `rejectUnknownFlags`/`runWriteHandler` helpers consistently with sibling command groups.
7. Tests exercise real git repos (no vacuous mocks) including the unborn-branch no-commit path (`luca-snapshot-create.test.ts:28-32` `initRepoNoCommit`).

## MUST-FIX

None.

## SHOULD-FIX

- [SHOULD-FIX] Post-skip routing instructs the agent to note the skip reason "citing the snapshot tree sha", but the sha is unobtainable at that point: `luca snapshot diff` output contains only `verdict`/`changed_paths`/`cite_paths`/`reason` (no tree sha), and the CLI has already deleted the payload on every path — while the prose simultaneously says "never short-circuit on payload contents". The instruction is unfollowable as written; agents will either omit the sha, hallucinate one, or pre-read the payload against the spirit of the delegation rule. Suggest adding `prior_tree` (and optionally `current_tree`) to the diff JSON output, or dropping the sha-citation requirement from the three prose sites.
  File: packages/luca-tools/src/artifacts/modes/review.ts:101
  File: packages/luca-tools/src/artifacts/skills/lu-review/index.ts:41
  File: packages/luca-tools/src/artifacts/skills/phase-execute/index.ts:897
  Suggestion: extend `diffResult` in luca-snapshot-diff.ts to include `prior_tree`, and reword the prose to "citing the `prior_tree` sha from the diff output"; or delete the sha clause.
  Cross-phase: false

- [SHOULD-FIX] Payload validation in the diff handler is manual destructuring-with-typeof (`parsed as { tree?: unknown; phase?: unknown }` plus two `typeof` checks) instead of the repo's schema-first Zod pattern — `z` is already imported from `../__schemas/write-surface.schemas.ts` at line 11. A `z.object({ tree: z.string().min(1), phase: z.string().min(1) }).safeParse(...)` collapses the JSON-shape branch and the missing-fields branch into one validated parse with a single source of truth for the payload contract shared with the create handler.
  File: packages/luca-cli/src/write-surface/handlers/luca-snapshot-diff.ts:216
  Suggestion: define a shared `SnapshotPayloadSchema` (exported next to `REVIEW_PREFIX_TREE_RELPATH` in luca-snapshot-create.ts so producer and consumer share it) and `safeParse` the payload, mapping failure to the existing `ambiguous` reasons.
  Cross-phase: false

- [SHOULD-FIX] Review-mode Route B step 2 is one ~90-word sentence chaining four ordered actions (write iteration plan, emit telemetry, run `luca snapshot create`, transition) with the load-bearing ordering constraint ("immediately before the transition") buried mid-sentence behind two em-dash asides. For a consuming LLM this is the highest-risk sentence in the change: the snapshot-before-transition ordering is what makes the whole gate work on the live path. Split into lettered sub-steps so the sequence is structural, not prose-embedded.
  File: packages/luca-tools/src/artifacts/modes/review.ts:257
  Suggestion: restructure as `2a. write iteration plan → 2b. emit iteration telemetry → 2c. run luca snapshot create (must be the last action before the transition) → 2d. luca state advance --to-step execute`.
  Cross-phase: false

## Notes

- [NOTE] Cite-format wording drifts across the three prose surfaces: lu-review says "parses the prior MUST-FIX and SHOULD-FIX `File:line` cites" (skills/lu-review/index.ts:33) while review mode and phase-execute say "`File: {path:line}` cites" (modes/review.ts:94, skills/phase-execute/index.ts:887). Harmless — the CLI owns the parsing — but aligning on `File: {path:line}` keeps the reviewer.ts anti-drift contract wording exact everywhere.
- [NOTE] "Note the skip reason … in the active phase's audit artifact" does not name a concrete file, and the `.luca/` contract only allows `audits/<reviewer>.md` inside a phase. An orchestrator may invent an arbitrary kebab-case audit filename for the skip note. Benign today (post-skip the phase advances to learn, so the note is never re-parsed by the gate), but naming a canonical target (e.g. append to the consolidated audit) would remove the guesswork.
- [NOTE] `runGit` is duplicated across luca-snapshot-create.ts, luca-snapshot-diff.ts, and both test files (flagged for the simplification lane; no DX action).

CONSOLIDATED:
  MUST_FIX_COUNT: 0
  SHOULD_FIX_COUNT: 3
  NOTE_COUNT: 3
  CROSS_PHASE_COUNT: 0
