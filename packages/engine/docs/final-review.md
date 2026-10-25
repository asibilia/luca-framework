# @luca/engine: the final review

## The final review

Once every ticket pushed (where the run used to open its PR), the whole run
branch is reviewed before the PR opens (`decide-final-review.ts`). It always
runs, even for a one-ticket spec.

- **Five lenses, at once.** `architecture` (developer experience folded in),
  `simplification`, `security`, `integration` (how the tickets fit together),
  and `rules`. Each is its own role (`<lens>-lens`), so every agent record
  names its lens and failed tries count per lens. Each is a fresh, read-only
  reviewer (the guard's `reviewer` role) in the run branch's worktree, with
  its own instructions (`role-instructions.ts`). All five start in one pass
  of the scheduler.
- **What a lens gets.** Its task, the spec, every ticket (title, body,
  criteria), the whole branch's diff (`git diff <base>..<head>`, from where
  the run branch started) and its files, and the latest gate results on the
  run branch.
- **The rules lens** also gets the rule files of the engine config
  (`rule_files`), word for word. The executor reads them when a round starts
  and journals them in `final_review_started` (`rules: { path, text }[]`), so
  the decision step stays pure and the journal holds the lens's input. A path
  is read in the run branch's worktree; `~/` means the home folder, and an
  absolute path stays. A file that can't be read has `text: null`, and the
  prompt says so. The engine inlines them because a reviewer's sandbox can't
  read `~/.claude*`. With no rule files, the lens is told to use the repo's
  own AGENTS.md or CLAUDE.md. Mechanical rules belong in the lint gate.
- **Findings** are like a ticket review's (a `blocker`, `should_fix`, or
  `nit`; `code` or `test`; the verdict must match). Lenses pick their own ids,
  so the engine namespaces each as `<lens>-<id>` (an id that already starts
  with `<lens>-` stays), and fixers and re-reviewers see and answer those.
- **The fix loop.** Once every due lens finished, their blockers and
  should-fixes open a fix round (`final_review_fixing`): a fresh test-writer
  for the test findings first, then a **fresh** implementer for the code
  findings (always fresh at the start of a round: "a fresh implementer on the
  whole branch"), both on the run branch's worktree. Findings a fixer
  answered `other_role` then go to a fresh agent of the other writer role,
  with only those findings; its answer is final, and a second `other_role`
  counts as `wont_fix` (#616). The fixes pass the
  gates on the run branch (failed gates go back to that round's implementer
  session, up to 3 times; with only test findings, a fresh implementer gets
  the failure), then the leftover scan (the spec and every ticket may name a
  new markdown file) and one commit, `fix: final review round <n> for spec
  #<n>` (nothing changed: the current commit, no files), then a push. The
  final review's gates are the only ones that also run the config's slow
  tests (`checks.slow_test`, #563), as `slow_test` checks.
- **Slow tests (#563).** With a slow test command, round 1 also runs the
  slow tests (`run_final_slow_tests`: prepare, then each slow command, in the
  run branch's worktree) once every lens is in, never while a lens runs: a
  lens's after-turn guard judges the run branch's worktree, so nothing else
  may write there while it runs. `final_review_started` says they're due
  (`slow_due: true` in round 1, `false` later; a config with none journals
  no `slow_due`), and they're journaled as `gates_run` with
  `target: final_slow`, which isn't the fix round's gates. The round settles
  only once they ran too. Failing slow tests open the round's fix round (or
  join it, with the lenses' findings). A fix round they alone opened has no
  findings, so its gates run first (the slow tests again among them), a
  fresh implementer gets their failure as it gets failed gates, and the gate
  fix loop runs until they pass, then the commit and the push. No lens
  re-reviews it; the fresh pass comes next. Still failing at the gate
  fix loop's cap, the final review is stuck with `gates_failed`, naming
  `slow_test`. So the review only passes once the slow tests passed on the
  run branch's latest commit: round 1 passes only after they passed on its
  HEAD, and every later commit comes from a fix round whose gates ran them.
- **Re-reviews.** Only the lenses that had blocking findings look again, and
  only at the new changes (`git diff <last round's head>..<head>`), with
  their earlier findings and each fixer's answer; they rule on each "won't
  fix" like a ticket re-reviewer. Clean lenses stay clean (the board shows
  them so). A final review still asking for changes after `MAX_FIX_ROUNDS`
  (3) fix rounds (the 4th round) is stuck (`changes_requested`, listing the
  open findings).
- **The fresh pass (#548).** Once a fix commit was pushed since round 1 (a
  findings fix or a slow-test fix) and no blocking finding is left, the review
  doesn't pass yet: all five lenses read the whole branch again, each a new
  agent with round 1's prompt (from where the run branch started), and no
  earlier findings, answers, or rulings. `final_review_started` says so
  (`fresh: true`; `false` otherwise and in older journals). Its blockers get
  one fix round, even past `MAX_FIX_ROUNDS`, and the lenses that had them
  re-review it as usual; then the review passes, and what they still hold
  open tops the PR's "Open findings". Its findings never get the review
  stuck, though its gate fix loop keeps its cap. Its nits join the PR's
  nits. There is one per final review, none with no fix commit (round 1
  was already a full read), and none after a `ship`.
- **Failed tries.** A lens's failed try launches a fresh lens, a fixer's gets
  a follow-up in its session (fresh with none); `MAX_FIX_ROUNDS` failed tries
  of one role in a row (a finished turn of the role gives its tries back, so
  a lens that failed once in round 1 starts the fresh pass with all its
  tries), or `MAX_ENGINE_FAILURES` engine failures of one role in a row, are
  stuck (`agent_failed`). So are a bad test
  while fixing (`bad_test`), leftovers (`leftovers_found`), and the gate fix
  loop at its cap (`gates_failed`).
- **Stuck.** `final_review_stuck`, then the tickets' worktrees are removed
  (the run branch's worktree stays), and the spec issue hears why, like a
  stuck ticket (see "Stuck work"). No PR opens while it waits for a reply.
- **Replies.** Only the spec owner's count: `ship` journals the reply, then
  the ship step (`shipFinalReviewIn`) commits any edits left uncommitted in
  the run branch's worktree (a fixer's cut-off work, or the owner's) as
  their own commit, "fix: final review round N, shipped with open
  findings", pushes it, and calls `shipFinalReview({ journal, commit })`,
  which journals `final_review_shipped { commit? }` (and refuses a final
  review that isn't stuck). With no edits, no commit. What prepare made
  stays out, and in a changesets run a changeset a fixer wrote is dropped
  (`changeset_dropped`), as at any engine commit. The PR then opens with an "Open findings" section at the very
  top (each with its lens, severity, and file, then the edits' files as
  "Uncommitted fixer edits, not reviewed"), and the worktrees are removed.
  The changeset commit, made after, holds only the changeset (#509). `retry`
  journals `final_review_retried`: fresh fixers (no session kept) and fresh
  counts, keeping the owner's edits in the run branch's worktree. The open
  fix round starts over as round 1 (a failed lens, failed gates, or a
  leftover just run again). `stop` ends the run without a PR. `skip` doesn't
  apply to the final review; the spec hears so.
- **In the PR.** The final review's nits (one per id), declined findings,
  and assumptions are listed with the tickets', labelled "final review" and
  the lens.
- **Records.** Its own kinds (`final_review_started`, `lens_started`,
  `lens_finished`, `final_review_fixing`, `final_review_stuck`,
  `final_review_passed`, `final_review_shipped`) and the usual agent, gate,
  scan, commit, and push kinds with `ticket: null`, which replay gives to the
  final review once it started. The launcher is handed the spec's number as a
  final review agent's `ticket`. Their sessions count in the run's usage.

Choices made:

- A lens that breaks the guard would also show up in the other lenses'
  after-turn checks, since all five share the run branch's worktree at once;
  each would lose a try. The sandbox keeps reviewers from writing there, so
  this should not happen.
- **Agent messages and run notes (#371).** Final review agents get no
  messaging: lenses are reviewers, and the fixers (test-writers and
  implementers with no ticket) have nobody left to talk to, since every
  ticket is over once it pushed. They are launched with `messaging: null`,
  their prompts name no address, and their instructions leave out agent
  messages (`roleInstructions({ messaging })`). Every fresh final review
  agent does get the run's newest notes, like a ticket's agents; notes a
  final review agent leaves are not kept, since no agent comes after them
  that would read them.
- Final review agents get no decision model asks (no skills ask for lenses), and their
  failures and findings are asked about only for records of their own lens.
