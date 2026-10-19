# @luca/engine: tests

## Tests

The tests go through the seams spec #359 sets: the decision step (`decide`
given a journal), the engine with the in-memory tracker, the journal file
(append and replay), and the config loader.

`src/core/run-one-ticket.e2e.test.ts` is seam 2, the end-to-end test. Through
`src/testing/practice-repo.ts`, it makes a throwaway git repo in a temp folder
with a local bare repo as its `origin`,
fills the in-memory tracker with a practice spec and ticket, and runs the
engine with scripted agents. The gates, commits, join, push, journal, and PR
step are real. No GitHub, no models, no setup. One ticket adds a local
workspace package as a dependency, so the engine's install runs offline.
Another starts from a repo that already depends on its workspace package, so
its first gates only pass after the engine's install in the new worktrees; and
one whose committed manifest names a missing package, so that install fails
and the ticket is stuck before any agent.
`src/core/decide-review.test.ts` tests the ticket review through the decision
step: the reviewer's prompt, findings to the right fixer in the right order,
the gates and the fix commit, re-reviews of only the new changes, pushback,
the round cap, a verdict that disagrees with its findings, and nits and
declined findings in the PR.
`src/core/ticket-review.e2e.test.ts` runs it end to end with scripted reviewers:
findings fixed and pushed back on, and a re-review of the new changes only.
`src/core/decide-final-review.test.ts` tests the final review through the
decision step: it runs before the PR even for one ticket, the five lens
prompts (the whole branch's diff, the rule files), clean → passed → PR, test
findings to a fresh test-writer then code findings to a fresh implementer,
the gates and their fix loop, the fix commit and push, re-reviews of only the
new changes by only the lenses with findings, pushback, the round cap, failed
lens and fixer tries, and a stuck final review ending the run, then `ship`
opening the PR with the open findings at the top. `src/core/final-review.e2e.test.ts`
runs it end to end with scripted lenses: a clean one, with the rules lens
reading a rule file from the practice repo's config, and a code and a test
finding fixed on the whole run branch (the fix commit on origin, the fixers'
and re-reviewers' prompts). `src/core/run-ship-uncommitted.e2e.test.ts` runs
one stuck at the cap and then shipped, after which `shipFinalReview` refuses
it.
`src/core/agent-guards.e2e.test.ts` runs the practice ticket with agents that
break their role's rules, fail, crash, or stop, and checks the failed tries
and retries that follow. Its rule breaks share three runs, each with up to two
per role. `src/core/decide-build.test.ts` checks the caps: a third failed try,
or a third engine failure in a row, makes the ticket stuck.
`src/core/run-many-tickets.e2e.test.ts` runs three tickets through
`src/testing/many-tickets.ts`: #11 and #12 build at the same time (each
test-writer waits until the other has started), #12 finishes and joins first,
#11 clashes on `src/index.ts`, is fixed on top of the run branch, re-reviewed,
and joins, and #13 starts only after both pushed. It checks the order of the
joins, the follow-up and re-review prompts, origin's run branch, and that the
worktrees are gone. A second run with a decision model that always picks another ticket
shows its pick journaled and ignored. `src/core/run-broken-join.e2e.test.ts` runs
`BROKEN_JOIN`: #21 adds `double` on top of `helper` in `src/util.ts`, and
#22 renames `helper`, so both pass alone and git sees no clash, but the
types gate fails on the run branch after #22 joins. The join is undone (the
run branch goes back to #21's push, and origin never gets the broken
commits), #22 is fixed on top through the gate fix loop, re-reviewed, and
joins. `src/core/run-limit-many-tickets.e2e.test.ts` hits a plan limit while
#11's and #12's test-writers are both in flight: one wait (by a fake clock),
then both launch again with the same prompts and the run builds to its PR.
`src/core/run-rebase-reinstall.e2e.test.ts` rebases a ticket across another's
new workspace dependency and checks the moved worktree's frozen install.
`src/core/decide-many-tickets.test.ts` covers the same rules at the decision
step, limits and billing stops with two tickets in flight included.
`src/core/decide-stuck.test.ts`, with the `decide-stuck-*.test.ts` files
beside it, covers stuck work at the decision step: the
comment, other tickets building, the join undone, each reply word, named
tickets when several are stuck, replies from others ignored, retry with and
without ticket edits, skip with dependents and the PR, stop, a test setup
change, and a stuck final review's replies (`ship`, `retry`, `stop`, and
`skip` sent back). `src/core/run-ship-uncommitted.e2e.test.ts` runs a final
review stuck after its fix rounds, told on the spec, then shipped by the
owner's `ship` reply on the tracker (someone else's is ignored), ending in a
PR that starts with the open findings. `src/core/run-stuck.e2e.test.ts` runs it end to end, with a
scripted person replying on the in-memory tracker through a fake clock:
retry keeping the owner's fix, retry after a ticket edit, and skip while
another ticket builds and pushes. `src/core/decide-stuck.test.ts` checks
`stop` and `src/core/decide-stuck-setup-file.test.ts` a test setup change, and both run end to end in
`src/core/run-session-close.e2e.test.ts`. The other
end-to-end tests stop at the first `wait_for_reply` (the practice harnesses'
default `stop_before`).

`src/agents/claude-launcher.test.ts` drives the real launcher with a fake
`query` that plays back SDK messages, follow-ups included. It calls
`send_message` through a real MCP client connected to the session's `luca`
server in memory, and runs the delivery hooks as the SDK would.
`src/messages/agent-messages.test.ts` tests the message rules on journals;
`src/messages/agent-messaging.test.ts` runs it on a real journal file, a
resumed engine included. The one-ticket end-to-end test sends a message from
the test-writer to the implementer, and `src/core/decide-build.test.ts` checks
which prompts a run note reaches;
`src/core/run-many-tickets-messages.e2e.test.ts` runs the many-ticket practice
run with messages across #11 and #12 while both build, `all`, a message
that waits for #11's clash follow-up, and a run note reaching #12 and #13.
`src/guards/*.test.ts` table-test the guard rules and the sandbox.

`src/jev/jev-shadow.e2e.test.ts` runs the same practice repo with a fake
decision model that disagrees with everything, or has its token turned down
(one ask, then off, and the next run asks again), and checks the run matches
a run without one. `src/jev/jev-shadow.test.ts` checks one that throws,
never answers, or has no credentials on `shadowAsker` itself: it journals
the failure and never throws, so the run goes on. `src/jev/clef-client.test.ts`
tests the Clef client with a fake `fetch`, and
`src/jev/decision-model-credentials.test.ts` reads Luca's env file from a
temp home; no test reaches the network or reads the real home folder.

`src/core/decide-limits.test.ts` hands the decision step scripted
rate-limit readings (allowed, allowed_warning, rejected days away, the Opus
weekly cap, overage, isUsingOverage, a billing error) and usage readings.
`src/core/limit-wait.e2e.test.ts` runs the practice ticket with an agent the
plan cuts off, a fake clock, and the in-memory tracker: the wait, its one
comment, and a billing stop that sticks. A restart mid-wait is decided in
`src/core/decide-crash-recovery.test.ts`, and `decide-limits.test.ts` checks
the wait itself from a later time, or past its end.

`src/core/decide-memory.test.ts` covers memory at the decision step: memory
off changes nothing, each recall point's search and query, tickets searching
at the same time, where the memories go in prompts and follow-ups, no repeats
of run-start memories, a failed try is no fix round, one search for all five
lenses, the learner before the PR, after a `stop`, and with every ticket
skipped, its routing by type and scope (unknown types and missing or
unknown scopes refused), feedback, the PR's "New
memories", the spec comment, a failed learner's tries and `learning_skipped`,
and no learner on a billing stop or a refused run.
`src/core/run-memory.e2e.test.ts` runs it end to end with a fake MuninnDB:
memories reach the agents at every point, the learner's memories are updated
or added and fed back, the PR lists them, a stopped run comments them on the
spec, and a MuninnDB that errors or hangs still lets the run open its PR,
with the errors journaled. `src/core/execute-memory.test.ts` checks the
search's merge, cap, and minimum score on a real journal file.
`src/memory/*.test.ts` unit-test the merge, the routing, `safeMemory`, the
settings resolution, and the MCP client's parsing and calls through a fake
connection; no test reaches a real MuninnDB.

`src/board/board-sync.test.ts` runs the engine with a board in memory: records
arrive in seq order, a board that restarted gets a replay, and a failing board
never breaks the run. `src/board/board-sync.e2e.test.ts` runs a practice repo
and checks that a slow test-writer turn reaches the board while it runs.
`src/cli/run-modes.e2e.test.ts` runs the demo and resumes a journal;
`src/cli/run-modes-spec.e2e.test.ts` and `src/cli/run-modes-clef.e2e.test.ts`
run the real-run path with the in-memory tracker and a scripted stand-in for
the Claude launcher: it builds to a PR and closes the sessions, asks Clef
through a fake `fetch` with the config's model, turns the decision model off
with no credentials, and ends on a launcher stop.
`src/cli/run-modes.test.ts` keeps what needs no practice repo: a repo with no
config, a run id with no journal, an empty journal, and the unfinished-runs
list. The `--resume` test in `run-modes.e2e.test.ts` crashes a real run after its red commit, lists it
in `unfinishedRuns`, then `resumeRun` finishes it: one PR, each commit once,
no comment twice, and `run_resumed` in the journal. `src/core/decide-crash-recovery.test.ts`
cuts journals anywhere and checks what the decision step does next, and
`src/core/run-crash-recovery.e2e.test.ts` crashes practice runs inside a step
(after a comment, a PR, a worktree, a commit, a join) and runs them again;
`src/core/run-crash-recovery.test.ts` keeps the intake refusals, which need
only the in-memory tracker.

```bash
bun test              # in packages/engine
bun run typecheck
bun run lint
```

## Smoke run (manual, uses your plan)

Real Claude agents are never part of `bun test`. Before a release, run one
tiny ticket end to end with real agents, in a throwaway repo with the
in-memory tracker:

```bash
bun packages/engine/scripts/smoke-run.ts
```

It prints each agent's tokens and rate-limit readings and where the journal
is, and closes every agent session at the end. The first run (2026-09-23, Opus
5.5, ticket "Add isEven", before follow-ups used open sessions) built,
reviewed, joined, and opened its PR in 0.8 min: 3 agents, 22 model turns,
3,192 output and about 139k cache tokens, list-price estimate $0.38 (paid by
the plan). The five-hour window stayed at 15% and the weekly at 25%. No guard
or permission denials; every `rate_limit_event` was `allowed`, no overage.
A second run after the rebase onto the fix loops (same ticket, sessions now
kept open for follow-ups) also opened its PR in 0.8 min: 22 model turns,
3,159 output tokens, list-price estimate $0.38, no denials, no overage, and
the process exited once `closeAll()` closed the sessions.
