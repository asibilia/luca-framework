PERSPECTIVE: dx
VERDICT: APPROVE
FINDINGS:
- [SHOULD-FIX] Compound-connective lint check fires on probe-description prose, not just genuinely compound criteria. Evidence: this phase's own plan triggers it twice on non-compound criteria — ac-04 ("amended with explicit", plan.md:69) and ac-10.1 ("compound ` and ` criterion and zero", plan.md:78). Combined with architect.ts:344's instruction to "Address each warning: fix the criterion, or justify the deviation", agents will either write boilerplate justifications or learn to ignore the entire warning class (alert fatigue defeats the lint's purpose).
  File: packages/luca-cli/src/write-surface/handlers/luca-plan-lint.ts:30
  Suggestion: Strip backtick code spans from the line before testing COMPOUND_CONNECTIVE (connectives inside command text are never compound criteria), and/or soften the architect instruction to "fix, justify, or dismiss prose-only matches with a one-line note".
  Cross-phase: false
- [SHOULD-FIX] Split-parent fate is ambiguous across the rule, the template, and the consumers. Rule 3 (architect.ts:240) calls .M entries "replacements", but the template (architect.ts:217-218) shows ac-02 still live with its own probe alongside ac-02.1. The lint exempts a base criterion with .M siblings (luca-plan-lint.ts:98-103), implying the base stays live; the verifier enumerates "each live (non-tombstoned) criterion" (verifier.ts:90), which would double-count a live parent plus its splits. The next agent authoring a split cannot tell whether to keep, tombstone, or delete the parent line.
  File: packages/luca-tools/src/artifacts/modes/architect.ts:240
  Suggestion: Add one sentence to rule 3 stating the parent line's fate (e.g. "the parent line becomes a tombstone `[SPLIT → ac-NN.1, ac-NN.2]`" or "the parent line is removed and replaced in place by its sub-criteria"), update the template example to match, and mirror it in verifier.ts Criterion ID Rules.
  Cross-phase: false
- [SHOULD-FIX] The tombstone text "see decisions <date>" (architect.ts:240) and the lint-deviation instruction "justify the deviation in the plan's decisions/notes" (architect.ts:344) reference a decisions/notes location that does not exist in the plan.md template (architect.ts:184-225: Objective, Context, Phases, Verification Criteria, Risks & Mitigations — no Decisions section). An agent following the tombstone flow has no defined place to record the decision it is told to cite.
  File: packages/luca-tools/src/artifacts/modes/architect.ts:344
  Suggestion: Add a `## Decisions` (or `## Notes`) section to the plan template, or name the concrete destination (e.g. context.md) in rule 3 and the Pre-Review Lint paragraph.
  Cross-phase: false
- [SHOULD-FIX] The `/phase-plan` slash-command body (the inline-orchestrator planning path) never mentions `luca plan lint`. It states the criterion grammar (phase-plan.ts:34), persists plan.md, and advances straight to plan-review — while both architect mode (architect.ts:341) and the phase-plan skill (skills/phase-plan/index.ts:360) mandate the pre-review lint. An agent driving planning via the command will never discover the linter.
  File: packages/luca-tools/src/artifacts/commands/phase-plan.ts:47
  Suggestion: Insert the `luca plan lint --file <dir>/plan.md` invocation (with the same warn-only framing) between "Persist the plan" and "Advance".
  Cross-phase: false
- [NOTE] CLI help text says "Always exits 0" flatly (commands/write-surface/plan.ts:31), but an unreadable --file exits 1 (handler returns isError, run-handler.ts:96-99 exits 1). The handler JSDoc gets the distinction right (luca-plan-lint.ts:174-176); the help text should say "always exits 0 on lint findings" so scripting agents don't ignore real I/O failures.
- [NOTE] `--file` is a required flag rather than a positional arg; the natural invocation `luca plan lint <path>` fails. Evidence this trips real users: the phase's own plan wrote exactly that flagless form in ac-10 (plan.md:77). Consider accepting a positional path.
- [NOTE] COMPOUND_CONNECTIVE (luca-plan-lint.ts:30) lacks the /i flag that ABSOLUTE_QUANTIFIER (line 33) has — " And " / " With " escape detection. Minor regex inconsistency.
- [NOTE] Lint messages restate the fix but never name "Criteria Quality Rules" or cite the rule number, so an agent seeing a warning has no pointer back to the canonical grammar in architect mode. A short "(Criteria Quality Rules, rule 1)" suffix would aid discoverability.

EVIDENCE FOR APPROVE (verified locations):
1. packages/luca-tools/src/artifacts/modes/architect.ts:216-218 — grammar example shows both a base criterion (ac-01/ac-02) and a .M split case (ac-02.1 annotated "parent ID preserved, never renumbered"); :227-240 Criteria Quality Rules block is scannable (grammar literals first, three numbered bold rules, explicit "lint regexes key to this grammar" forward pointer) with a bidirectional cross-reference from Step 5 Pre-Review Lint (:344).
2. packages/luca-cli/src/write-surface/handlers/luca-plan-lint.ts:111-161 — all four warning messages are actionable and name the fix (a: states the expected prefix literally; b: cites the splitting test and the split action; c: shows the ac-NN.1/ac-NN.2 enumeration form; d: states the anti-NN line shape and its purpose). Output format `plan lint: <file>:<line>: <msg>` plus a summary line marked "(advisory — never blocking)" is parseable and self-describing.
3. packages/luca-cli/src/write-surface/handlers/luca-plan-lint.ts:166-182 — handler JSDoc documents all four checks, the warn-only contract, the one error case, and the rationale for keeping judgment checks (probe nameability, A-passes-while-B-fails) instruction-side; helper JSDoc on findVerificationCriteriaSection/lintPlanLines is complete.
4. Tombstone flow is explained at every site an agent will actually look: authoring (architect.ts:240), verification with the why (verifier.ts:87 — explains the allCriteriaMet gate rationale), review coverage (modes/review.ts:80-82, incl. the CRITERION_NOT_FOUND interplay), execution (modes/execute.ts:255), and revision review (plan-reviewer.ts:73 + G-CRIT gap ID at :85).
5. packages/luca-cli/src/commands/write-surface/plan.ts:25-49 — --help describes all four checks, the exit contract, and gives a concrete example path for --file; rejectUnknownFlags closes the typo'd-flag hole.

CONSOLIDATED:
  MUST_FIX_COUNT: 0
  SHOULD_FIX_COUNT: 4
  NOTE_COUNT: 4
  CROSS_PHASE_COUNT: 0
