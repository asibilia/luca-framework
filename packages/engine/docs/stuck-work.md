# @luca/engine: stuck work

## Stuck work (#366)

A stuck ticket never ends the run. The other tickets keep building; only the
stuck ticket and the tickets that wait on it pause.

```
ticket_stuck
  decide ──> undo_join        only if its join is still on the run branch  ──> join_undone
  decide ──> report_stuck     comment on the spec issue                     ──> stuck_reported
  decide ──> wait_for_reply   sleep, then read the spec's new comments      ──> comment_read × n
  decide ──> take_reply       the owner's reply word                        ──> reply_received
          or ignore_reply     answer on the spec why it can't be used       ──> reply_ignored
  retry ──> retry_ticket      re-read the ticket                            ──> ticket_retried (resume | restart | refused)
  skip  ──> skip_ticket × n   comment on each ticket left out               ──> ticket_skipped
  stop  ──> remove_worktrees (pushed tickets'), then done (stopped_by_user)

final_review_stuck
  decide ──> report_final_review_stuck  comment on the spec issue           ──> stuck_reported (ticket null)
  ship  ──> ship_final_review           commit edits left over, shipFinalReview ──> final_review_shipped, then the PR
  retry ──> retry_final_review                                              ──> final_review_retried
```

- **The comment** names the ticket, says why in one line, what was tried
  (fix rounds, failed tries, rebases, ...), the last error, a suggestion, the
  ticket's worktree, and the replies.
- **Replies.** Only comments by the spec's owner (the spec issue's author)
  count, and only a comment that is just a word: `retry`, `skip`, `stop`, or
  `ship`, optionally with a ticket (`retry #12`, `skip 12`). With more than
  one ticket stuck, `retry` and `skip` must name one. With the final review
  stuck, a bare `retry` or `ship` is its reply. A bare word with several
  tickets stuck, a ticket that isn't stuck, `ship` with no final review
  stuck, or `skip` for the final review gets an answer on the spec saying
  why, and nothing moves. Anyone else's comments, the owner's
  other comments, and the engine's own comments are never replies. Replies
  sent while the engine was down are read when it starts again.
- **`retry`** re-reads the ticket. If its title, body, or labels changed,
  its new copy is checked like at intake, journaled as a new
  `ticket_snapshot`, its worktree is reset to the run branch's tip, and it
  starts over from scratch (`restart`); a copy that isn't ready is refused
  on the spec, and the ticket stays stuck. Otherwise it resumes
  (`resume`): a fresh agent (no old session), fresh counts (fix rounds,
  failed tries, bad-test bounces, rebases, test updates), and whatever the
  owner changed in its worktree is kept. The first fresh agent is told why it got stuck. A
  review fix round starts over as round 1, so the owner's edits are gated,
  committed, and re-reviewed. A ticket stuck at its join joins again.
- **`skip`** leaves the ticket out, then every ticket that waits on it
  (and on those). Each gets a comment and stays open. The PR closes only the
  built tickets and lists the skipped ones with why. With every ticket
  skipped there is no PR (`all_skipped`).
- **`stop`** ends the run without a PR once the steps in flight finish.
  Nothing new starts; the run branch and the unfinished worktrees stay.
- **A stuck join is undone at once.** A ticket stuck after its join
  (`join_gates_failed`) has unpushed commits on the run branch; they are
  undone (`git.undoReplay`, and the install again if they changed
  dependencies) before any other ticket starts or joins.
- **An undo never rewinds over other work (#519).** `undoReplay` undoes
  only commits the engine names: the ticket's own join and any later,
  unpushed joins. A join that isn't on the run branch, or other commits on
  top of it, and it refuses: the run branch is left alone and the ticket is
  stuck (`undo_refused`), never undone again until a `retry`. Every ticket
  whose joined commits an undo took (`join_undone`'s `shas`) has its join
  cleared, so it joins again on the run branch as it is now.
- **A run branch whose install failed** stops every ticket but the stuck
  one; a `retry` installs it again.
- **Waiting.** `wait_for_reply` sleeps `reply_poll_ms` (default
  `REPLY_POLL_MS`, 1 minute) by the engine's clock, then reads comments with
  an id above the last one seen. It runs beside the tickets' steps, under its
  own key, and doesn't count towards `max_steps`: once nothing else can
  move, the run waits this way with no time limit.
- **Owner changes.** A test-writer or implementer that can't go on
  without a change only the user may make (a test setup file, a binary
  file, something that needs the network) answers `needs_setup_change` with
  the file and why; the ticket is stuck (`setup_change_needed`) with that
  message. A final review fixer's answer makes the final review stuck the
  same way (#617), and its `retry` starts the fix round over. The stuck
  text calls it "a change only you may make", and says "test setup file"
  only when the file is one of the config's.
- **Environment failures (#613).** A test-writer or implementer that finds a
  failed red check or failed gates aren't its ticket's fault (a port already
  in use, an old test that fails at baseline too) answers `environment`, with
  its evidence. The engine reruns the failed check once, without using a fix
  round, and goes on if it passes. A rerun that fails the same way (the same
  red check problems, or the same failed gates), or an `environment` answer
  past `MAX_ENVIRONMENT_RERUNS` (2 per ticket), makes the ticket stuck
  (`environment_failed`), with the evidence and the clipped output. The
  final review's implementer fixer can do the same for the final gates, with
  the same cap. A `retry` gives fresh counts.
- The tracker's `comment` returns the new comment's id, and `listComments`
  reads an issue's comments after an id. The GitHub tracker posts and lists
  through `gh api`, and reads each issue's author.

### Opening the PR (#508)

The PR is the run's last step, so it must always open, however many
tickets and notes a run has.

- **The saved text.** Before `gh pr create`, the engine writes the PR's full
  text to `pull-request.md` in the run folder (next to the journal), so it
  is never lost.
- **The body budget.** GitHub takes at most 65,536 characters in a PR body
  or a comment. The body the engine sends stays under 60,000
  (`PULL_REQUEST_BUDGET`, `fitPullRequestBody`). The essentials always stay
  in it: the open findings of a shipped final review, the `Closes` list,
  and the skipped, for a person, waiting on a person, and not in this run
  sections. The long parts (the assumptions, nits, declined findings, and
  new memories) stay while they fit; the rest moves into **PR comments**
  posted right after the PR opens, each under the budget and cut between
  list items, and the body says so. Anything still too long is clipped,
  pointing at `pull-request.md`.
- **A failed `gh pr create`** is no crash. A failed tracker call throws a
  `TrackerError` (`src/tracker/tracker.ts`; the GitHub tracker's failed
  `gh` calls do), and one from `openPullRequest` or `findOpenPullRequest`
  (`isTrackerFailure`) journals the run
  stuck (`run_stuck`, reason `pull_request_failed`) with the error, tells
  the spec issue why, and waits: a bare `retry` tries the PR again (it adds
  no run budget), and `stop` ends the run without one. Any other error in
  the step is a crash, taken again on resume.
- **Never a second PR.** Before creating, the engine looks for an open PR
  from the run branch (`findOpenPullRequest`) and reuses it: the one a try
  opened before a crash or a failure, or one the owner opened by hand. Only
  a PR from the repo itself counts: `gh pr list --head` matches the branch
  name alone, so a fork's PR from a branch of the same name
  (`isCrossRepository`) is never taken for the run's. Its PR comments are
  posted once, even on a redo after a crash.

### A repo busy for a day (#615)

A run's repo wait (see "The repo wait" in the command line docs) that
lasts 24 hours journals the run stuck (`run_stuck`, reason `repo_busy`),
before intake, naming the earlier runs still going. The spec issue is told
why, and the run waits: a bare `retry` waits up to 24 hours more, and
`stop` ends the run. Start it again later, or with `luca-run --alongside`
to run both at once.

### Getting a stuck run moving (#504)

Picking the right reply takes reading: the journal, the ticket's worktree,
and the agent's reason. The `/luca-unstick` skill does that reading for you.
In Claude Code or a Paseo chat, in the run's repo, type:

```
/luca-unstick [run id] [#ticket]
```

With no run id, it picks this repo's newest run that waits on a reply. The
board's "Help me" button sends the same command. The skill:

1. Sums the run up with its helper, `scripts/stuck-summary.ts`, which only
   reads: what is stuck and why, the worktree, the agent's last result, the
   failed checks, the replies since, and whether the engine is running.
2. Says why in plain words, and recommends one reply (or a fix first), from
   a playbook with an entry for every stuck reason.
3. May fix tests (test files only) in the ticket's worktree, runs just those
   tests with a time limit, and never commits: a `retry` keeps the edits.
4. Asks you, then posts the one-word reply with `gh issue comment`, but
   only when `gh` is signed in as the spec's owner.
5. Waits up to 3 minutes for the engine to take it (`reply_received`, then
   `ticket_retried` and the like).

A crash is an engine bug, not the ticket's fault: the skill says so, and
points to `/luca-run resume <run id>` (or `luca-run --resume <run id>`) and
to filing an issue.

The skill lives in [`skills/luca-unstick/`](../skills/luca-unstick). The
publish package ships it as `skills/` next to `engine/`, and `luca init`
and `luca upgrade` copy it to `~/.claude/skills/luca-unstick/`, over Luca's
own earlier copy. `luca doctor` checks the copy is the one the installed
Luca ships, and `luca doctor --fix` copies it again. Its tests check that
every record kind and stuck reason it names is the journal's, and that its
playbook covers every stuck reason, so a new reason fails them until the
skill covers it.

### Looking back at a run (#514)

After a run, the `/luca-retro` skill asks what would have stopped the
agents' mistakes, and suggests changes to their environment, not the code.
In Claude Code or a Paseo chat, in the run's repo, type:

```
/luca-retro [run id ...]
```

With no run id, it takes this repo's newest finished run. With several, it
also looks for what repeats across them. The skill:

1. Sums the runs up with its helper, `scripts/retro-summary.ts`, which only
   reads the journal (agents keep no transcripts): what got stuck and why,
   fix loops at their cap, leftover scan hits, agents out of turns, failed
   agent turns and decision model calls, checks and tests that failed again and again,
   setup changes asked for, joins that clashed, the agents' assumptions,
   the findings fixers declined, slow steps, and tokens. Each line names
   its journal seq.
2. Ranks what went wrong, most serious first, each with its evidence and
   one of six changes: a check to add, a line for the repo's rules file, an
   instruction to delete, missing information for agents, waste to cut, or
   a Luca bug.
3. Stops until you pick findings by number. For each pick, it looks for an
   issue that already covers it, else shows the issue it would open and
   opens it once you say yes: Luca bugs on `asibilia/luca-framework`, the
   rest on the run's repo.

It never edits code or rule files, and never runs by itself. It ships, and
is installed and checked, the same way as `/luca-unstick`.
