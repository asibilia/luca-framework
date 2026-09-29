---
name: luca-unstick
description: Gets a stuck Luca run moving again. It reads the run's journal, the ticket's worktree, and the spec issue, says in plain words why a ticket (or the final review, or the whole run) is stuck, recommends one reply (retry, skip, stop, or ship) or a safe fix first, and posts that reply on the spec issue once the owner says yes. Use it for `/luca-unstick [run id] [#ticket]`, for the board's "Help me" button, and whenever someone asks why a Luca run or ticket is stuck, what to answer Luca's stuck comment, or how to get a run going again, even if they don't name the skill.
argument-hint: "[run id] [#ticket]"
---

# Get a stuck Luca run moving

When Luca's engine gets stuck, it doesn't guess. It posts a comment on the spec issue and waits for the spec's owner to reply with one word. Picking the right word takes reading: the journal, the ticket's worktree, the agent's reason. This skill does that reading, explains it, and posts the word for the owner once they say yes.

You were given: $ARGUMENTS

That is a run id, a ticket (`#139` or `139`), both, or nothing. The board's "Help me" button sends `/luca-unstick <run id> #<ticket>` or `/luca-unstick <run id>`.

Talk to the owner in plain words: short sentences, no jargon they didn't use first. They want to know what broke and what to do, not how the engine works.

## 1. Find the run and read what's stuck

Run the helper from the repo's folder. It only reads.

```bash
bun ~/.claude/skills/luca-unstick/scripts/stuck-summary.ts <run id> <ticket number>
```

Pass the ticket as a bare number (`134`, not `#134`): in the shell, `#` starts a comment, so `#134` would be lost. Leave out what you weren't given.

- With a run id, it sums up that run. With a ticket too, only that ticket (and the run itself).
- With no run id, it lists this repo's runs, newest first, and sums up the newest one that waits on a reply. If that isn't the one the owner means, ask.
- It prints: the spec, its owner, the repo (`owner/repo`), the Luca version the run is on, the run branch, whether the engine is running now, how the board saw it end, and, for each stuck thing, the stuck reason and detail, the worktree, the agent's last result (such as a `bad_test` with its file, test, and reason), the last failed checks with the end of their output, and the replies since.

Where things live, if you need more:

- The runs folder: `~/.local/state/luca/runs/<run id>/` (or `$LUCA_RUNS_DIR`). It holds `journal.jsonl`, the run branch's worktree (`run-branch/`), and each ticket's worktree (`tickets/<n>/`).
- `luca-run --unfinished` lists every run that isn't over, and whether it may restart by itself.
- The board's run registry: `~/.local/state/luca/board/runs.json`. It holds each run's token. Never print or copy it.
- One record in full: `jq -c 'select(.seq == 1234)' <journal>`. The records are JSON lines: `seq`, `time`, `kind`, `ticket`, `role`, `content`.
- The stuck comment itself: `gh api repos/<owner/repo>/issues/comments/<comment id>` (the id is in the `stuck_reported` line).

Then look where the reason points (the playbook below says where):

- The worktree: `git -C <worktree> status --short`, `git -C <worktree> diff`, and `git -C <worktree> log --oneline -5`.
- The run branch: `git -C <run branch worktree> log --oneline -10`.
- A test file the agent named: read it, and the code it tests.

## 2. Explain it, then recommend one action

Keep it short, like this:

> **Stuck:** ticket #134, "Rescue catch battle".
> **Why:** Two tests pin exact addresses from the build map. Any change to the game code moves them, so no correct version of this ticket can pass them.
> **What I'd do:** Rewrite those two tests so they check the layout, not exact addresses, then reply `retry #134`.
> **Why that:** The implementer is right, and a retry keeps the edited tests.

Recommend one action. Mention another only when it's a close call, in one line.

## 3. The playbook

Find the stuck reason: `ticket_stuck` (a ticket), `final_review_stuck` (the final review), or `run_stuck` (the whole run). Then:

| Reason | What it usually means | What to do |
| --- | --- | --- |
| `prepare_failed` | The repo's `prepare` command (a build) failed in a fresh worktree before any agent worked. | Read the end of its output. If it says "Timed out", or ended with no exit code, it ran out of time: check whether the build really finished (its outputs are in the worktree), and reply `retry #n`. The next build is quicker, since most of it is done. A missing tool or a real build error needs fixing on this computer first, then `retry #n`. Raising `prepare_timeout_ms` in `.luca/config.json` only helps the next run: a run keeps the config it started with. |
| `bad_test` | The implementer says a test is wrong, a second time. | Read the test and the implementer's reason. If the reason holds (the test pins something the ticket must change, such as build addresses or a line another ticket added), fix the test in the worktree (step 4), then `retry #n`. If the test is right and the code is wrong, say so, and reply `retry #n`: the fresh agent is told why it got stuck. After a rebase (a `tests_sent_back` line), Luca 14.0.0-alpha.3 and newer already gave the test-writer a turn to update the tests, so read what joined the run branch since: that is usually what the test must now expect. |
| `nothing_new_to_test` | The test-writer found nothing to test. | Two cases. (a) The ticket changes no behavior: add the `refactor` label to the ticket, then `retry #n` (a label change starts it over as a refactor). (b) The work is already on the base branch: check the commit it names is really there (`git log --oneline <base> -- <file>`). If nothing else in the run is left to build, reply `stop`, then offer to close the ticket with a comment naming the commit. If other tickets still build, reply `retry #n`: on Luca 14.0.0-alpha.2 or newer, a fresh test-writer can answer "already done", and the engine checks it and closes the ticket itself. |
| `red_check_failed` | The new tests don't fail the way they should, after every fix round (or a test update left a criterion with no test). | Read the red check's problems. Usually a criterion is vague, or a "new" test already passes. Make the ticket's criteria clearer (a text change starts it over), or fix the tests in the worktree (step 4). Then `retry #n`. |
| `agent_failed` | An agent failed on every try it had. | Read the last failed try. A guard failure means it wrote a file its role may not (such as a report file); a result failure means bad output. If the cause is in the ticket (unclear, too big), fix the ticket and `retry #n`. If it looks like the model had a bad day, `retry #n`. If it keeps failing the same way, it may be an engine bug (see below). |
| `gates_failed` | The checks (tests, types, lint) still fail after every fix round. | Read the failing check's output. If it's a real bug in the ticket's code, fix it in the worktree only if it's small and clear, else make the ticket clearer; then `retry #n`. If the check fails on `main` too (a flaky or broken test), fix that first. |
| `changes_requested` | The ticket review still asks for changes after every fix round. | Read the open findings. If they matter, fix them in the worktree (or clarify the ticket) and `retry #n`. If they can wait, `skip #n` keeps the rest of the run going. |
| `join_failed` | The ticket still clashes with the run branch after every rebase. | `retry #n` puts it on the run branch's tip again (uncommitted edits in its worktree are replaced). If two tickets keep fighting over the same lines, `skip #n` and build it in a later run. |
| `join_gates_failed` | The checks fail once the ticket joins the run branch. Its join was undone, so the run branch is safe. | Usually two tickets that pass alone but break together. `retry #n` fixes it on top of the run branch. |
| `install_failed` | Installing the dependencies failed. | Fix the manifest or lockfile on the base branch, then `retry #n`. |
| `leftovers_found` | The leftover scan found files that must not be committed (a report file, a nested git repo). | Delete or move those files out of the worktree (they're not the ticket's work), then `retry #n`. |
| `setup_change_needed` | An agent needs a test setup file changed, and only a person may do that. | Read what it asks for. If it's right, make that change yourself in the worktree (ask the owner first: this one isn't a test file), then `retry #n`. |
| `crashed` | The engine crashed in the same step, again and again. | That's an engine bug, not the ticket (see below). |
| `run_budget` | The whole run used up its budget of tokens. | Look at what used them (a ticket stuck in fix loops?). A bare `retry` gives one more full budget; `stop` ends the run. |

The final review, when `final_review_stuck`:

- `changes_requested`: read the lenses' open findings. If they can wait for review in the PR, reply `ship` (the PR opens with them listed at the top). If they matter, fix them in the run branch's worktree, then a bare `retry`.
- Anything else (`gates_failed`, `agent_failed`, `bad_test`, `leftovers_found`): fix what trips it in the run branch's worktree, then `retry`; or `ship` to open the PR anyway.
- `skip` doesn't apply to the final review.

The reply words, and when each fits:

- `retry #n`: go again with a fresh agent and fresh counts. It keeps edits in the worktree. If the ticket's title, text, or labels changed, it starts over from scratch instead.
- `skip #n`: leave the ticket out, with every ticket that waits on it. The rest ship. They stay open.
- `stop`: end the run without a PR. The branch is kept.
- `ship`: only for a stuck final review: open the PR anyway.

With one thing stuck, the bare word works. With more than one ticket stuck, `retry` and `skip` must name one (`retry #12`).

### Not stuck, but stopped

The helper's "State" and "Engine" lines tell these apart.

- **Engine not running, run not over** (a crash, a kill, a reboot). Replies wait until the run is resumed: the engine reads replies sent while it was down. For a run the board started, type `/luca-run resume <run id>` in a Paseo chat, so the board stays attached. Otherwise run `luca-run --resume <run id>`.
- **The engine crashed** ("The engine crashed: ..." in the board line or the log). That is an engine bug, not a reason to retry the ticket. Say so plainly. Show the error and the end of the log. Suggest filing an issue on `asibilia/luca-framework` with the run id, the Luca version, and the error, and resuming the run (as above). If a newer Luca fixes it, `luca upgrade` first; the run then resumes on the new version.
- **The launcher stopped it** (a `run_stopped` record with a reason such as the wrong login or model). A restart would stop the same way. Fix what the reason says (sign in with the right Claude plan, say), then resume.
- **A billing stop** (a `run_stopped` with billing). The run never goes on. Say why, and that a new run is the way forward once billing is sorted out.
- **A limit wait** (`limit_wait_started`). Not stuck: the run goes on by itself when the plan window resets.
- **Intake refused it** (`intake_refused`). That's the spec or its tickets, not a reply: say what intake wanted (the helper lists it). Fix the issues, then start a new run with `/luca-run <spec>`.
- **It crashed on a missing label** (the log names a label that isn't found). That's the repo's setup: run `luca setup` in the repo, which makes the labels a run needs. Luca 14.0.0-alpha.4 and newer create a missing label instead of crashing; on an older run, `luca upgrade` first, then resume or start again.

## 4. Fixing tests in the worktree

Only when the playbook says so, and only test files (the config's `test_file_patterns` in `.luca/config.json` say which files are tests). Never change the ticket's code yourself: the fresh agent does that after the retry.

1. Say which test you'll change and why, in one line, before you change it.
2. Edit the test in the ticket's worktree (`~/.local/state/luca/runs/<run id>/tickets/<n>/`), not in the owner's checkout.
3. Make it check what the ticket's criterion means, not a number the change is bound to move.
4. Run only that test file, with a time limit: `cd <worktree> && timeout 300 bun test <file>`. Some tests need the repo's `prepare` build first; if a test fails only because the build's outputs are missing, say so rather than running the build.
5. Never commit, never stage, never push. A `retry` keeps uncommitted edits, and the engine commits them with the ticket.
6. Show the owner the diff (`git -C <worktree> diff -- <file>`).

## 5. Ask, then post the reply

1. Check who's signed in: `gh api user --jq .login`. It must be the spec's owner (the "Spec owner" line), because the engine ignores replies from anyone else. If it isn't, don't post: give the owner the exact word to post themselves.
2. Ask the owner to confirm, showing the exact comment. For example: "Post `retry #134` on spec #133 in asibilia/heartgold-plus?" Wait for a yes. Don't post on your own judgment.
3. Post just the word, nothing else in the comment (a reply with other text isn't read as a reply):

   ```bash
   gh issue comment <spec> --repo <owner/repo> --body "retry #134"
   ```

4. Note the "Last record" seq from the summary before you post.

## 6. Check the engine took it

If the engine is running, wait for it to read the reply (it reads every minute or so):

```bash
bun ~/.claude/skills/luca-unstick/scripts/stuck-summary.ts <run id> --watch <last seq>
```

It reads the journal every few seconds for up to 3 minutes and prints what the engine did: `reply_received`, then `ticket_retried` (resume, restart, or refused), `ticket_skipped`, `final_review_retried`, or `final_review_shipped`. Or `reply_ignored` with why (such as `no_ticket_named` or `not_stuck`).

- Taken: say so in one line, and what happens next.
- `reply_ignored`, or a `ticket_retried` that was refused: say why, and what would work.
- Nothing after 3 minutes: check the engine is still running (run the helper again). If it isn't, resume the run (see above); the reply waits on the issue and counts once it's back.

If the engine isn't running when you post, skip the wait: tell the owner the reply counts once the run is resumed, and how to resume it.

## What not to do

- Don't reply for the owner without their yes.
- Don't retry a crash as if it were the ticket's fault.
- Don't edit code files, commit, push, or change the spec or tickets without asking.
- Don't edit the journal or the board's registry. They are the engine's.
