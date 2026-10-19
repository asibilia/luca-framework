# @luca/engine: how a run moves

## How a run moves

```
startRun ──> run_started
  decide ──> read_intake          execute: read spec, sub-tickets, outside blockers ──> intake_read
  decide ──> refuse_intake        execute: comment + needs-info on each bad issue   ──> intake_refused
          or finish_nothing_to_do execute:                                          ──> nothing_to_do
          or snapshot_intake      execute: ──> spec_snapshot, ticket_snapshot × n
  decide ──> done (refused, nothing to do) or build:

create_run_branch       git: fetch the base, worktree for the run branch from origin/<base> ──> run_branch_created
install_dependencies    bun install --frozen-lockfile, if there's a package.json ──> dependencies_installed
for each ticket, at the same time, once every ticket it waits on has pushed:
  create_ticket_worktree  git: worktree on a new branch from the run branch ──> ticket_worktree_created
  install_dependencies    bun install --frozen-lockfile, before any test or agent ──> dependencies_installed
  run_baseline_tests      the config's prepare command, if any, then its bun test
                          commands, before any agent ──> prepare_made (if it made new untracked paths),
                                                        baseline_prepared (with a prepare), baseline_tests
    or reuse_baseline_tests  another ticket's baseline from the same run-branch commit ──> baseline_reused
  launch_agent test-writer                                               ──> agent_started, agent_finished
    already_done: check_already_done  the commits are on the ticket's base,
                          the named tests (just those, after prepare) pass ──> already_done_checked
      failed: follow_up_agent test-writer (same session), a failed try, ≤ 3 tries
      then mark_already_done  comment on the spec issue; the ticket
                          is done, like a pushed one                     ──> ticket_already_done
  run_red_check           criteria covered (≤ 3 tests each), every new test
                          mapped, a new test file listed in the feature map
                          (if the repo has one), new tests fail, old pass,
                          and some file changed                          ──> red_check
    failed: follow_up_agent test-writer (same session), check again, ≤ 3 rounds
  commit_ticket red       leftover scan, then commit                     ──> leftover_scan, commit_made
  launch_agent implementer                                               ──> agent_started, agent_finished
    bad_test: reset_ticket_worktree, then a fresh test-writer, red check,
              second red commit, fresh implementer (once)               ──> worktree_reset
  run_gates ticket        install if a manifest changed, then tests, types, lint ──> gates_run
    failed: follow_up_agent implementer (same session), gates again, ≤ 3 rounds
    a mapped test passed with no expect(): reset_ticket_worktree, then as for
              a bad test, counted toward the same cap (#581)            ──> worktree_reset (with bad_test)
  commit_ticket green     leftover scan, then commit                     ──> leftover_scan, commit_made
  launch_agent ticket-reviewer  a fresh reviewer: the diff, the gate results ──> agent_started, agent_finished
    blockers or should-fixes: a review fix round, ≤ 3 rounds
      launch_agent test-writer    (fresh) the test findings, if any
      launch_agent implementer    (fresh) the code findings, if any
      run_gates ticket            (and the gate fix loop)
      commit_ticket fix           leftover scan, then commit             ──> leftover_scan, commit_made
      launch_agent ticket-reviewer  (fresh) only the new changes and the earlier findings
  then it waits in the join queue; one ticket joins at a time, in the order their reviews finally approved:
  join_run_branch         git: cherry-pick the ticket's commits          ──> join_started, ticket_joined
  run_gates run_branch    the gates again, on the joined run branch      ──> gates_run
  push_run_branch         git: push to origin                            ──> run_branch_pushed
    a clash, or failed gates after joining (≤ 3 times, then stuck):
      rebase_ticket       git: undo the join if its gates failed, then put the
                          ticket's whole change on the run branch's tip,
                          uncommitted, conflict markers kept              ──> ticket_rebased
      clashed tests: launch_agent test-writer (fresh, told the files)
      clashed code:  launch_agent implementer (fresh, told the files)
      bad_test:      send_tests_back (what joined, the files it changed) ──> tests_sent_back
                     launch_agent test-writer (fresh: update the tests, keep the code)
                     then the implementer (same session), ≤ 2 times, then stuck
      then run_gates ticket (and its fix loop), one commit_ticket green,
      a fresh launch_agent ticket-reviewer (re-review only the new changes),
      and the join again
once every ticket pushed, the final review, on the run branch's worktree:
  start_final_review        HEAD, the files since, the rule files         ──> final_review_started
  launch_lens × 5           at once, each a fresh read-only lens          ──> lens_started, agent_started, agent_finished, lens_finished
  run_final_slow_tests      round 1 with checks.slow_test (#563), once every lens is in ──> gates_run (target final_slow)
  pass_final_review         every lens due this round approved (and the slow tests passed) ──> final_review_passed
    blockers or should-fixes, or failed slow tests: a final review fix round, ≤ 3 rounds
      start_final_fix                                                     ──> final_review_fixing
      launch_final_fixer test-writer   (fresh) the test findings, if any
      launch_final_fixer implementer   (fresh) the code findings, if any
      run_final_gates                  (and the gate fix loop, in the implementer's session); also the slow tests (#563) ──> gates_run
      commit_final_fix                 leftover scan, then commit         ──> leftover_scan, commit_made
      push_final_fixes                                                    ──> run_branch_pushed
      start_final_review               only the lenses with findings, only the new changes
                                       (a fix round only failed slow tests opened passes here instead)
    still asking after 3 fix rounds (or a failed loop): mark_final_review_stuck ──> final_review_stuck
      done (final_review_stuck); a ship reply (edits left uncommitted get their own commit
      "fix: final review round N, shipped with open findings", then shipFinalReview ──> final_review_shipped) opens the PR anyway
with a changesets config (.changeset/config.json when the run branch was made, #461):
  write_changeset           git: commit one changeset, and only it (the changed workspace packages
                            minus the config's ignore, the bump from the spec's release:*
                            label, patch with none; no changeset for release:none), then push ──> changeset_written
with memory on (#370), before the PR:
  launch_learner            a fresh read-only learner, the journal's digest ──> agent_started, agent_finished (role learner)
  save_memories             update a similar memory or add one, then feedback ──> memory_write_started, memory_write_done (each write), memories_saved
open_pull_request         tracker: re-read the spec's sub-issues, save pull-request.md, reuse an open PR
                          from the run branch or open one, then post what didn't fit as PR comments ──> pull_request_opened
                          (gh pr create failed: ──> run_stuck (reason pull_request_failed); see "Opening the PR")
remove_worktrees          git: every ticket's and the run branch's worktree ──> worktrees_removed
done (pr_opened)
with no ticket pushed, but some already done (#484):
  close_ticket × n          tracker: comment on each already-done ticket, then close it ──> ticket_closed
  remove_worktrees          git: every ticket's and the run branch's worktree ──> worktrees_removed
  finish_nothing_to_do      every ticket was already done                ──> nothing_to_do (already_done)
  done (nothing_to_do)      or, with a ticket skipped, done (all_skipped)
```

With memory on, a `recall_memories` search (──> `memory_recalled`) also comes
before the run branch (the run's start), before a ticket's first test-writer
or implementer, before each ticket review and final review round, and before
each fix round; see "Memory" below.

**Many tickets at once.** `decideSteps` returns every action that can run
now, at most one per ticket, and `runEngine` schedules them: it starts what
it can, waits for any one to settle, and decides again from the journal.
What may run together: one action per ticket; a run-level action (intake,
the run branch, the PR, removing worktrees) only alone; one action on the
run branch at a time (a new worktree, a join, its gates, a push, a rebase,
and the final review's round start, fixers, gates, commit, and push); and
one action per lens (`lens:<lens>`), so the five lenses review at once,
while the final review's other steps share one key (`final`). A
ticket starts from the run branch's tip once every ticket it waits on has
pushed, and only while no ticket waits to join, so it never builds on joined
commits whose gates haven't passed yet. Its join-queue place is the seq of
the review that **finally** approved it, after any review fix rounds.
`max_steps` counts started actions; if one action throws (such as a launcher
stop), the others are let finish, then the error is thrown.

**A shared baseline (#404).** Tickets whose worktrees start from the same
run-branch commit (`base_sha`) have the same tests, so they share one
baseline test run. The first such ticket in order runs it
(`run_baseline_tests`) while the others wait; each other one then takes it
(`reuse_baseline_tests` ──> `baseline_reused { from_ticket, base_sha }`), and
replay gives it that ticket's `baseline_tests` as it stood then. A baseline
belongs to the commit it was taken at: a rebase moves the worktree but not
its baseline, so a ticket starting from a newer commit (after a join) runs a
fresh one. Nothing else is shared or skipped: each red check runs the tests
in its own worktree, the gates run in full before every green and fix
commit, and again on the run branch after every join, since each of those
sees code no earlier run saw.

**Plan limits with many tickets.** A limit wait and a billing stop are the
whole run's: while one is due, `decideSteps` returns only it, so no ticket
starts a step. The scheduler lets everything in flight settle first (other
tickets' turns may be cut off by the plan too, journaling only their
sessions), then waits once. After it, every ticket takes the step the plan
cut off again, with the same prompt, using no round or try. A billing stop
also waits for what is in flight, then records the run's usage and ends the
run for good (its worktrees stay). Usage is recorded for each ticket as it
pushes or gets stuck, beside the other tickets' steps, and for the run just
before it ends, after its worktrees are removed.

**A clash on the run branch.** A join that clashes (git aborts the
cherry-pick), or gates that fail after joining, don't make the ticket stuck
at once. `rebase_ticket` undoes a join whose gates failed (the run branch is
reset to before its first commit), resets the ticket's worktree to the run
branch's tip, and applies the ticket's whole diff there with a three-way
merge (`git apply --3way`), all uncommitted, with conflict markers in the
files that clash. `ticket_rebased` names them, split into `tests` and `code`
by the config's test file patterns. Clashed tests go to a fresh test-writer
and clashed code to the implementer's session, each told the files; neither
answer counts as a fix round. Then the gates run in the worktree (after a
failed join, they fail again, and go through the gate fix loop), the ticket's
change becomes **one** commit (`fix: rejoin #n <title> onto the run branch`;
its old red and green commits are left behind), a fresh reviewer re-reviews
only the new changes, and the ticket joins again. A ticket is rebased at most
`MAX_REJOINS` (3) times; the next clash is stuck (`join_failed`), and so are
failed gates after joining (`join_gates_failed`).

**A test the run branch made wrong (#489).** On top of the run branch, the
implementer may answer `bad_test`: another ticket joined first and changed
what the test should expect. Resetting the worktree would throw the ticket's
change away, so the engine sends the tests back to the ticket's test-writer
instead (`send_tests_back`). It looks up which tickets' commits the run
branch got since the ticket's old base, and the files they changed, and
journals it all with the bad test as `tests_sent_back`. A fresh test-writer
is told what joined, the test, and the implementer's reason. It updates the
tests (test files only) to fit the run branch, and still maps a test to
every criterion. The implementer's code stays in the worktree. Then the
implementer's session (a fresh one if it is gone) hears the tests changed,
and finishes. There is no red check this time: the code is already there, so
the updated tests may pass, and the ticket's red commit already proved its
tests failed first. Instead, an answer that leaves a criterion without a test
is stuck (`red_check_failed`), the gates run every test (the updated ones and
the run branch's together), and a fresh reviewer re-reviews the change. A
ticket gets at most `MAX_TEST_UPDATES` (2) of these; the next bad test is
stuck (`bad_test`). A refactor ticket has no test-writer, so its bad test on
the run branch is stuck at once.

After a rebase the ticket review starts over: the first reviewer on top of
the run branch gets the review's own re-review section (only the changes
that fixed the clash or the failed gates, with what clashed and the earlier
findings), and its findings open review fix rounds as usual, counted from
zero, with their own `fix` commits. Nits and declined findings stay for the
PR. The ticket's diff that moves is everything up to its latest commit (a
review fix round's, or its green one).

**Installs after a rebase (#388).** When the dependency files (a
`package.json`, `bun.lock`) differ between the ticket's old base and the run
branch's tip, and the ticket's own change touches no manifest,
`ticket_rebased` says `reinstall: true` and the worktree gets its
`bun install --frozen-lockfile` again (`install_dependencies`) before anything
else runs there. A ticket that changes a manifest gets the install in its
gates, as always. Undoing a join whose commits changed dependency files runs
the frozen install on the run branch's checkout again
(`dependencies_installed`, target `run_branch`); a failed one is stuck
(`install_failed`).
