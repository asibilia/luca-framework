# @luca/engine

The Luca v1 **engine**: plain Bun and TypeScript that drives a **run** of one
**spec** and picks every next step. See `CONTEXT.md` at the repo root for the
domain words, and spec #359 for the plan.

This package covers the start of a run (#360): the engine config, the
**journal**, and **intake**. It also builds each ticket end to end (#361), with
scripted stand-in **agents**, up to the run's one pull request, with capped
**fix loops** for a failed red check, failed gates, and a bad test (#363), and
runs real Claude agents under the **guard** (#362). A fresh reviewer checks
each ticket, with a capped review fix loop (#364). It builds a spec's tickets
at the same time, joins them to the **run branch** one at a time, and fixes a
clash on top of the run branch (#365). And it sends its journal to the Paseo
board plugin, and has a command line, `luca-run` (#374). A hit plan limit is
a **limit wait**, any sign of per-token billing stops the run for good, and
usage is journaled per ticket and per run (#368).
Agents send each other one-way **agent messages**, even across tickets that
build at the same time, and hand **run notes** on to later agents (#371).
Once every ticket pushed, a **final review** looks at the whole run branch
through five **lenses** before the PR opens, with its own capped fix loop
(#367).
Stuck work reaches the spec's owner as a comment on the spec issue, the other
tickets keep building, and the owner's one-word replies (`retry`, `skip`,
`stop`) move it on (#366).
With **memory** on, the engine searches MuninnDB at four **recall points** and
hands the memories to agents, and at the end of every run a learner proposes
new memories that plain code routes to a vault by type and scope and saves
(#370, #406).
A run survives crashes: the journal marks where each step starts and ends,
a restarted engine takes a cut-off step again (an agent's turn in a fresh
session) without posting a comment, opening a PR, or committing twice, a
step that keeps crashing gets stuck, and `luca-run --resume <run-id>` goes
on with a run from its journal (#369).

## Modules

| Module | What it does |
| --- | --- |
| `src/config/engine-config.ts` | Loads the per-repo engine config (`.luca/config.json`). |
| `src/journal/journal-record.ts` | The journal's record kinds and their content, as Zod schemas. |
| `src/journal/journal.ts` | One append-only JSONL journal per run, outside git. |
| `src/journal/replay.ts` | Rebuilds a run's state from its journal. There is no status file. |
| `src/journal/step-records.ts` | Pure: the steps a crash cut off (`resumeEntry`, the `run_resumed` a restarted engine appends), each step's crashes in a row, and a redo's first try. |
| `src/intake/intake-checks.ts` | Intake's pure checks: refused, nothing to do, or a snapshot. |
| `src/core/decide.ts` | **The decision step.** Pure: journal in, every action that can run now out (`decideSteps`); `decide` gives the first. |
| `src/core/decide-build.ts` | The build half of the decision step: each ticket's spine, the join queue, rebases after a clash, the PR, and removing worktrees. |
| `src/core/decide-final-review.ts` | The final review's half of the decision step: its rounds, the five lenses at once, its fix rounds, and passed, stuck, or shipped. |
| `src/core/loop-caps.ts` | The caps of every fix loop (`MAX_FIX_ROUNDS`, ...), shared by the ticket steps and the final review. |
| `src/core/decide-plan.ts` | The plan half of the decision step: limit waits and billing stops. |
| `src/core/decide-crashes.ts` | The crash half of the decision step: a run-level step cut off by `MAX_CRASHES` crashes in a row stops the run for good. |
| `src/core/decide-stuck.ts` | The stuck half of the decision step: undoing a stuck ticket's join, telling the spec issue, reading replies, and acting on `retry`, `skip`, and `stop`. |
| `src/core/stuck-text.ts` | The stuck comment (ticket, why, what was tried, last error, suggestion, replies), a skipped ticket's comment, answers to replies that can't be used, and the retry note in a fresh agent's prompt. |
| `src/core/execute-stuck.ts` | Carries out the stuck steps on the tracker (comments, reading replies, skips), and `retry` (re-read the ticket: resume, start over, or refuse). |
| `src/core/decide-usage.ts` | The usage half of the decision step: each finished ticket's usage, then the run's. |
| `src/limits/plan-signals.ts` | Pure: what a rate-limit reading or a session says (fine, a limit, or billing). |
| `src/limits/plan-usage.ts` | Pure: a ticket's or the run's tokens and plan-window movement. |
| `src/limits/limit-wait.ts` | The engine's clock, waiting until a time, and the spec's limit-wait comment. |
| `src/core/fix-loop-text.ts` | The follow-up messages a fix loop sends: a failed red check's or gate's output, a failed try's error, or the files that clashed on the run branch. |
| `src/core/review-text.ts` | The **ticket review**'s texts: the reviewer's diff, gate results, and earlier findings (also after a ticket was sent back onto the run branch), and what each review fixer is sent. |
| `src/core/final-review-text.ts` | The **final review**'s texts: each lens's prompt (the whole run branch, the rule files for the rules lens, or a re-review of only the new changes), what each fixer is sent, and the open findings of a shipped final review. |
| `src/core/pull-request-text.ts` | The PR title and body: a shipped final review's open findings first, then the tickets it closes, the agents' **assumptions**, the reviews' nits, and declined findings (the final review's too). |
| `src/core/execute.ts` | Carries out an action (tracker calls, journal appends), and `runEngine`: the scheduler that runs tickets' steps at the same time. |
| `src/core/execute-build.ts` | Carries out a build step through the git adapter, the gates, and the agent launcher. Its turn, gates, and commit helpers serve the final review too. |
| `src/core/execute-final-review.ts` | Carries out a final review step on the run branch's worktree (reading the rule files for the rules lens), and `shipFinalReview`, the seam for a `ship` reply (#366). |
| `src/agents/agent-launcher.ts` | The agent launcher interface (`launch` a fresh session, or `followUp` in an open one), its failure kinds, and the session summary. |
| `src/agents/claude-launcher.ts` | The real launcher: one Claude Agent SDK session per agent, with every guard on, kept open for follow-ups. |
| `src/agents/claude-options.ts` | Pure: the model, effort, clean environment, and SDK options for one agent. |
| `src/agents/role-instructions.ts` | Each role's instructions, appended to Claude Code's system prompt. |
| `src/agents/scripted-launcher.ts` | Scripted stand-in agents: write files, act (sending and receiving agent messages too), return a result or a failure, and record each launch and follow-up with its session and what it was handed. |
| `src/agents/message-tool.ts` | The engine's in-process MCP server `luca` with its `send_message` tool, and the hook that hands messages over after each tool call. |
| `src/messages/agent-messages.ts` | **Agent messages'** rules. Pure: journal records in, a message's fate (queued, not delivered, refused) or what waits for an agent out. |
| `src/messages/agent-messaging.ts` | One agent's messaging, backed by the journal: journals each message and each delivery word for word. |
| `src/agents/role-results.ts` | Each **role**'s result, as Zod schemas. |
| `src/agents/role-prompts.ts` | The prompt each agent starts with (spec, ticket, criterion ids, its address for messages, and the run's newest **run notes**), and its section after a clash: the clashed tests, the clashed code, or "re-review only the new changes". |
| `src/guards/role-rules.ts` | Pure: what each role may write and run, checked per tool call (`checkToolCall`). |
| `src/guards/guard-hook.ts` | The guard as the SDK's `PreToolUse` hook. |
| `src/guards/sandbox-settings.ts` | Pure: each role's OS sandbox, in absolute paths. |
| `src/guards/after-turn-check.ts` | Pure: compares a worktree before and after an agent's turn. |
| `src/guards/worktree-state.ts` | Snapshots a worktree and its git state, and undoes violations. The engine's own refs (the run branch, other tickets' branches) don't count. |
| `src/git/git-adapter.ts` | Every git side effect, one call at a time: worktrees (made and removed), commits, throwing away uncommitted work, replaying onto the run branch and undoing it, moving a ticket's change onto the run branch, pushes. |
| `src/gates/test-runner.ts` | Runs the config's test command with bun's JUnit reporter. |
| `src/gates/red-check.ts` | The **red check**. Pure. |
| `src/gates/gate-runner.ts` | Runs the config's **gates**: tests, types, lint. First, the install when a manifest changed. |
| `src/gates/lockfile-install.ts` | Which install to run: in a new worktree, or before the gates when a manifest changed. Pure. |
| `src/gates/leftover-scan.ts` | The **leftover scan**. Pure. |
| `src/shell/run-command.ts` | Runs a command with a timeout and collects its output. |
| `src/tracker/tracker.ts` | The tracker interface: an object of async functions. |
| `src/tracker/in-memory-tracker.ts` | A tracker in memory, for tests. It records the PRs it opens. |
| `src/tracker/github-tracker.ts` | The real tracker, through the `gh` CLI. |
| `src/tracker/post-comment-once.ts` | Engine comments carry an invisible marker, so a step redone after a crash adopts its comment instead of posting it again, and the engine never takes its own comments as replies. |
| `src/testing/intake-fixtures.ts` | Spec, ticket, and journal builders for tests. |
| `src/testing/build-fixtures.ts` | Journal entry builders for each build step. |
| `src/testing/final-review-fixtures.ts` | Journal entry builders for the final review: rounds, lens turns, fix rounds, passed, stuck, shipped. |
| `src/testing/practice-repo.ts` | The end-to-end practice repo: a throwaway git repo, local `origin`, tracker, and scripted turns (or any launcher). `CLEAN_LENS_TURNS` are five approving lenses; its runs fall back on them for any lens the turns don't script. |
| `src/testing/many-tickets.ts` | The many-ticket practice runs: three tickets, two at once with a clash and one waiting on both (`SUM_PRODUCT_AVERAGE`); two tickets that break each other's gates after joining (`BROKEN_JOIN`); a plan limit with two tickets in flight (`LIMIT_HIT`); and a rebase across a new dependency (`REINSTALL`). |
| `src/jev/jev-schemas.ts` | Jev's questions, requests, and answers, and the engine's fixed choices, as Zod schemas. |
| `src/jev/jev-client.ts` | The Jev client through TypeSafe's API. Never throws. |
| `src/jev/jev-jobs.ts` | What to ask Jev around each step, with the engine's fixed choice. Pure. |
| `src/jev/jev-shadow.ts` | Asks Jev in **shadow mode** and journals each call and answer. |
| `src/memory/memory-schemas.ts` | **Memory**'s shapes as Zod schemas (a hit, a shown memory, a vault's search, a save, a feedback) and its numbers: `MIN_MEMORY_SCORE`, `MAX_MEMORIES_PER_RECALL`, `SIMILAR_MEMORY_SCORE`, `DEFAULT_MEMORY_TIMEOUT_MS`. |
| `src/memory/memory-client.ts` | The memory client interface (an object of async functions), and `safeMemory`: every call with a timeout, every error a value. Never throws. |
| `src/memory/memory-recall.ts` | Pure: the vaults a search covers, and the merge by score (minimum score, one per vault and id, at most 5). |
| `src/memory/memory-routing.ts` | Pure: each proposed memory's vault by its type and scope (`MEMORY_ROUTES`, `MEMORY_SCOPES`), refusals, the stored concept, and the helped / didn't-help feedback. |
| `src/memory/muninn-mcp-client.ts` | The real client: MuninnDB's MCP tools over Streamable HTTP (SSE as a fallback), with pure settings resolution and result parsing. |
| `src/core/decide-memory.ts` | Memory's half of the decision step: the recall points (a search before the step that needs it, then its memories in the prompt), and the learner, its saves, and the spec comment at the end of a run. |
| `src/core/execute-memory.ts` | Carries out memory's steps: searches, the learner's turn, saves (update a similar memory or add one), feedback, and the spec comment. |
| `src/core/learner-digest.ts` | Pure: the learner's prompt, a capped digest of the journal. |
| `src/core/memory-text.ts` | Memory's texts: prompt sections, queries, the PR's "New memories", and the spec comment. |
| `src/testing/fake-muninn.ts` | A fake MuninnDB for tests and the demo: vaults in memory with scripted scores, every call recorded, told to fail or hang per vault and operation. |
| `src/testing/memory-fixtures.ts` | Journal entry builders for memory: a run with memory on, searches, the learner's turns, saves. |
| `src/testing/practice-run.ts` | The `--demo` run: `practice-repo.ts`'s repo and turns, plus a second ticket (#12, blocked by #11) and its turns. |
| `src/board/board-sync.ts` | Keeps the board in step with the journal: a cursor, batches, replays. Never throws. |
| `src/board/paseo-board-link.ts` | The board link over Paseo: the plugin's `engine.event` RPC through the daemon. |
| `src/cli/luca-run.ts` | The `luca-run` command line (the package's `bin`). |
| `src/cli/run-args.ts` | Reads `luca-run`'s flags. |
| `src/cli/run-modes.ts` | A real run of a spec (`runSpec`), going on with a run from its journal (`resumeRun`), the runs that are not over (`unfinishedRuns`), and the practice `--demo`. |

## How a run moves

```
startRun ──> run_started
  decide ──> read_intake          execute: read spec, sub-tickets, outside blockers ──> intake_read
  decide ──> refuse_intake        execute: comment + needs-info on each bad issue   ──> intake_refused
          or finish_nothing_to_do execute:                                          ──> nothing_to_do
          or snapshot_intake      execute: ──> spec_snapshot, ticket_snapshot × n
  decide ──> done (refused, nothing to do) or build:

create_run_branch       git: worktree for the run branch, from the base ──> run_branch_created
install_dependencies    bun install --frozen-lockfile, if there's a package.json ──> dependencies_installed
for each ticket, at the same time, once every ticket it waits on has pushed:
  create_ticket_worktree  git: worktree on a new branch from the run branch ──> ticket_worktree_created
  install_dependencies    bun install --frozen-lockfile, before any test or agent ──> dependencies_installed
  run_baseline_tests      the config's test command, before any agent    ──> baseline_tests
    or reuse_baseline_tests  another ticket's baseline from the same run-branch commit ──> baseline_reused
  launch_agent test-writer                                               ──> agent_started, agent_finished
  run_red_check           criteria covered, new tests fail, old pass     ──> red_check
    failed: follow_up_agent test-writer (same session), check again, ≤ 3 rounds
  commit_ticket red       leftover scan, then commit                     ──> leftover_scan, commit_made
  launch_agent implementer                                               ──> agent_started, agent_finished
    bad_test: reset_ticket_worktree, then a fresh test-writer, red check,
              second red commit, fresh implementer (once)               ──> worktree_reset
  run_gates ticket        install if a manifest changed, then tests, types, lint ──> gates_run
    failed: follow_up_agent implementer (same session), gates again, ≤ 3 rounds
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
      then run_gates ticket (and its fix loop), one commit_ticket green,
      a fresh launch_agent ticket-reviewer (re-review only the new changes),
      and the join again
once every ticket pushed, the final review, on the run branch's worktree:
  start_final_review        HEAD, the files since, the rule files         ──> final_review_started
  launch_lens × 5           at once, each a fresh read-only lens          ──> lens_started, agent_started, agent_finished, lens_finished
  pass_final_review         every lens due this round approved            ──> final_review_passed
    blockers or should-fixes: a final review fix round, ≤ 3 rounds
      start_final_fix                                                     ──> final_review_fixing
      launch_final_fixer test-writer   (fresh) the test findings, if any
      launch_final_fixer implementer   (fresh) the code findings, if any
      run_final_gates                  (and the gate fix loop, in the implementer's session) ──> gates_run
      commit_final_fix                 leftover scan, then commit         ──> leftover_scan, commit_made
      push_final_fixes                                                    ──> run_branch_pushed
      start_final_review               only the lenses with findings, only the new changes
    still asking after 3 fix rounds (or a failed loop): mark_final_review_stuck ──> final_review_stuck
      done (final_review_stuck); a ship reply (shipFinalReview ──> final_review_shipped) opens the PR anyway
with memory on (#370), before the PR:
  launch_learner            a fresh read-only learner, the journal's digest ──> agent_started, agent_finished (role learner)
  save_memories             update a similar memory or add one, then feedback ──> memory_write_started, memory_write_done (each write), memories_saved
open_pull_request         tracker: one PR from the run branch            ──> pull_request_opened
remove_worktrees          git: every ticket's and the run branch's worktree ──> worktrees_removed
done (pr_opened)
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
failed gates after joining (`join_gates_failed`). A bad test while fixing on
the run branch is stuck too: resetting the worktree would throw the ticket's
change away.

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

**Cleaning up.** Once the PR is open, every ticket's worktree and the run
branch's are removed (`git worktree remove --force`, then `git worktree
prune`). After a `stop` reply, only the worktrees of the tickets that pushed
are removed; the rest stay for later. Branches and the journal always stay.

Each agent turn (`launch_agent` or `follow_up_agent`) may also journal
`agent_session` (the launcher's summary), `agent_failed` (a failed turn, with
how it failed), `shared_git_changed` (something else changed the shared
`.git` during the turn; see Guards), or `run_stopped` (see Guards). Once
nothing can send an agent a follow-up, its session's close is journaled as
`agent_session_closed`. Any step may be preceded by a
limit wait or a billing stop, and a finished ticket and the run's end by
`usage_recorded` (see Plan limits and billing). The scheduler wraps every
step but a wait in `step_started` and `step_ended`, and a restarted engine
may append `run_resumed` (see Crash recovery).

While a test-writer or implementer works, it may send **agent messages**
(`agent_message`), and each tool call it makes may hand it messages waiting
for it (`agent_message_delivered`). Neither changes a ticket's progress; see
"Agent messages" below.

A refactor ticket (labelled `refactor`) skips the test-writer, the red check,
and the red commit: its implementer may follow renames into test files, but
must not change what a test checks.

**Fix loops.** A failed red check goes back to the same test-writer session,
and failed gates to the same implementer session, with their output
(`follow_up_agent` ──> `agent_started` with `follow_up_of`, then
`agent_finished`). Each gets `MAX_FIX_ROUNDS` (3) follow-ups after its first
try; a failure after the last one is stuck. The rounds are counted from the
order of journal records (a test-writer result after a red check is an
answered round), so a crashed run counts them the same way, and a follow-up
that started but never finished is sent again, not counted.

**A bad test** (the implementer answers `bad_test`) throws away the
implementer's uncommitted work (`git reset --hard` and `git clean -fd`,
ignored files kept) and sends the ticket to a fresh test-writer, told which
test was bad and why. Its tests get their own red check and their own red
commit (`test: replace a bad test for ...`), then a fresh implementer builds.
The second bad test (`MAX_BAD_TEST_BOUNCES` is 1) is stuck, and so is any bad
test on a refactor ticket.

**Failed tries.** A failed agent turn is journaled once as `agent_failed`
with its `failure` kind and session; the decision step picks what comes next,
so a crashed run decides the same way again. An `agent` (an error result, a
timeout), `result` (no structured output, or output that misfits the role's
schema), or `guard` failure uses up one of the role's tries on the ticket
(`MAX_FIX_ROUNDS`, 3, in all): the test-writer or implementer gets a
follow-up in the same session saying what failed, the error, and that the
disallowed changes were undone (`failedTryMessage`); a reviewer, or an agent
with no session, gets a fresh launch. The last try's failure is stuck. An
`engine` failure (the SDK crashed, or a follow-up's session is gone) starts a
fresh agent of that role without using up a try; three in a row
(`MAX_ENGINE_FAILURES`) are stuck. A retry that finishes flows on like any
result: it can set the role's first result, or answer a fix round and rerun
the red check or the gates.

**The ticket review.** After the green commit, a fresh, read-only
reviewer gets the ticket's committed diff (`git diff <base>..<green>` and the
files it changes), the engine's gate results, and the acceptance criteria.
On a refactor ticket it also checks that behavior didn't change. Each
**finding** is a `blocker`, a `should_fix`, or a `nit`, and a `code` or a
`test` finding. The verdict must match the findings (`changes_requested`
exactly when one is a blocker or should-fix); one that doesn't is a failed
try (`result`), and a fresh reviewer tries again.

Blockers and should-fixes open a **review fix round**. Test findings go
first, to a fresh test-writer (who may edit only tests); then code findings
go to a fresh implementer (the first one's session closed with the green
commit; the implementer's session is followed up only if it is still open).
Each fixer answers every finding it got in `finding_responses`: `fixed`, or
`wont_fix` with a reason. The fixes must pass the gates (with the usual gate
fix loop, counted afresh each round), get their own commit
(`fix: review round <n> for ...`; nothing changed means no commit, and the
journal notes the current commit), and then a fresh reviewer sees **only the
new changes** (`git diff <last reviewed>..<fix>`) plus the earlier findings
with each fixer's answer. It rules on each "won't fix" in `rulings`:
`accepted` declines the finding, `rejected` keeps it open (and it lists it
again). A "won't fix" with no ruling that isn't listed again counts as
declined. A review that still asks for changes after `MAX_FIX_ROUNDS` (3)
fix rounds is stuck (`changes_requested`). An implementer that answers
`bad_test` while fixing review findings is stuck (`bad_test`).

Nits never go back. They stay in the reviewers' `agent_finished` records,
and the PR description lists every nit (one per id) and every declined
finding with the fixer's and the reviewer's reasons.

Anything else that fails (the leftover scan, a join after its last rebase),
a fix loop or failed tries at their cap, a second bad test, a test-writer
with nothing new to test, or an agent that needs a test setup file changed
becomes `mark_stuck` ──> `ticket_stuck` with its reason. What happens next
is in "Stuck work" below.

`runEngine` reads the journal before every step, so it can resume a journal
left by a crashed engine. A snapshot cut short by a crash is taken again; replay
keeps the latest snapshot of each ticket. The rest is in "Crash recovery".

## Crash recovery (#369)

A **step** is one action the scheduler starts, named by its key (the
ticket, `run`, `replies`, `final`, or `lens:<lens>`) and `step` (the action's
type, plus `:<role>` for an agent's turn). A step is a **checkpoint** once
its records, then its `step_ended`, are in the journal.

- **Step records.** `runEngine` journals `step_started { key, step,
  first_seq }` right before it carries out an action and `step_ended { key,
  step }` right after it settles. Waits (`wait_for_reply`, `wait_for_limit`)
  and stops get none: a crash during a wait is not the step's fault.
- **A cut-off step.** On start, any `step_started` with no later
  `step_ended` for its key was cut off. The engine appends one `run_resumed
  { interrupted: [{ key, step, ticket, role, started_seq, first_seq }] }`
  (`resumeEntry`) before its first step, then decides again: the step is
  taken again. A redo's `step_started` names its first try in `first_seq`.
- **Fresh sessions.** A cut-off agent turn's session is forgotten, so a redo
  never follows up in it. Where a follow-up would have gone (a red check's or
  gate's fix, a review fix, a failed try, a final fixer), a fresh agent of
  that role gets the same message as an extra section, and is told that a
  crash cut off an earlier try and the worktree may hold its partial edits.
  With memory on, that fresh agent gets the run's start memories, its
  ticket's, and the fix round's the follow-up would have carried.
  Fix rounds are counted from record order, so every cap still holds.
- **Crashes in a row.** Replay counts, per key, how many `run_resumed` in a
  row cut off the same step; its `step_ended` clears the count. At
  `MAX_CRASHES` (3), a ticket's step is stuck (`crashed`), the final
  review's is stuck (`crashed`), and a run-level step stops the run for
  good (`run_stopped` with `crashed: true`, then `done` with outcome
  `crashed`). A `retry` gives fresh counts.
- **Side effects made once.** Every engine comment carries an invisible
  marker `<!-- luca:<run_id>:<first_seq>:<n> -->`; a redo adopts a comment
  with its marker instead of posting it again, and a comment with a marker
  is never a reply. Opening the PR adopts an open PR for the run branch.
  Making the run branch or a worktree adopts one already there. A commit
  adopts a HEAD commit with the same message that the journal doesn't know
  yet. A join journals `join_started` (where the run branch stood) before it
  cherry-picks, so a cut-off join is redone from there. The memories'
  comment on the spec (`report_memories`) carries a marker too.
- **Memory writes.** `save_memories` journals each MuninnDB write before it
  (`memory_write_started`) and its outcome after (`memory_write_done`),
  under a key within the step (`save:<op_id>`, `feedback:<vault>:<id>`);
  only records after the step's first try count. A redo reuses a write
  done, repeats a save started but not done as it started (an update of the
  same memory with the same content, or an add with the same `op_id`, which
  MuninnDB adds once), and never sends a feedback in doubt again (it could
  count twice): that one is journaled as not ok, "unknown: a crash cut it
  off...". Then `memories_saved` is journaled once, complete, in order.
  Searches (`recall_memories`) only read, so a cut-off one is made again.
- **Limit waits and replies.** A restarted engine waits until the reset
  time a limit wait named, never less, and doesn't announce it again. It
  reads the spec issue again, so replies sent while it was down count.

**Going on with a run.** `luca-run --resume <run-id>` (`resumeRun`) reads
the spec and base branch from the journal's `run_started`, and the repo
from `--repo`, else the one `run_started` names (`repo`), else the current
folder; it keeps the journal and runs the engine on it. A run id with no
journal, or an empty one, is an error (exit 1). `unfinishedRuns({ runs_dir
})` lists the runs whose next action is not a stop (`done`,
`invalid_journal`).

**Restarting runs from Paseo (#375).** `luca-run --unfinished` prints one
JSON object to stdout, and nothing else, then exits 0:

```json
{ "runs": [{ "run_id": "luca-20260923-141500-ab12", "restart": true, "reason": "resumable", "message": null }] }
```

It lists every unfinished run in the runs folder (`restartableRuns`, built
on `unfinishedRuns`), with whether it may be restarted:

- `resumable` (`restart: true`): the engine was cut off, by a crash or a
  kill, so the run can go on from its journal.
- `launcher_stopped` (`restart: false`): its last record is a launcher stop
  (`run_stopped` without `billing` or `crashed`, such as the wrong login or
  model). A restart would stop the same way, so it waits for you to fix it
  and run `--resume` yourself. `message` is the stop's reason.
- `billing_stopped` (`restart: false`): a billing stop anywhere in the
  journal. It never goes on. `message` is the stop's reason.

A finished run, or a folder with no journal, is not listed. The board
plugin calls it when Paseo starts and every 15 s after that, for its runs
whose engine process is gone. It restarts the ones with `restart: true`
with `--resume <run-id> --repo <repo> --board-plugin luca-board`, and shows
the rest as "engine stopped" (see the board's README, "Restarts").

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
  whole branch"), both on the run branch's worktree. The fixes pass the
  gates on the run branch (failed gates go back to that round's implementer
  session, up to 3 times; with only test findings, a fresh implementer gets
  the failure), then the leftover scan (the spec and every ticket may name a
  new markdown file) and one commit, `fix: final review round <n> for spec
  #<n>` (nothing changed: the current commit, no files), then a push.
- **Re-reviews.** Only the lenses that had blocking findings look again, and
  only at the new changes (`git diff <last round's head>..<head>`), with
  their earlier findings and each fixer's answer; they rule on each "won't
  fix" like a ticket re-reviewer. Clean lenses stay clean (the board shows
  them so). A final review still asking for changes after `MAX_FIX_ROUNDS`
  (3) fix rounds (the 4th round) is stuck (`changes_requested`, listing the
  open findings).
- **Failed tries.** A lens's failed try launches a fresh lens, a fixer's gets
  a follow-up in its session (fresh with none); `MAX_FIX_ROUNDS` failed tries
  per role over the whole final review, or `MAX_ENGINE_FAILURES` engine
  failures of one role in a row, are stuck (`agent_failed`). So are a bad test
  while fixing (`bad_test`), leftovers (`leftovers_found`), and the gate fix
  loop at its cap (`gates_failed`).
- **Stuck.** `final_review_stuck`, then the tickets' worktrees are removed
  (the run branch's worktree stays), and the spec issue hears why, like a
  stuck ticket (see "Stuck work"). No PR opens while it waits for a reply.
- **Replies.** Only the spec owner's count: `ship` journals the reply, then
  calls `shipFinalReview({ journal })`, which journals
  `final_review_shipped` (and refuses a final review that isn't stuck); the
  PR then opens with an "Open findings" section at the very top (each with
  its lens, severity, and file), and the worktrees are removed. `retry`
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
- Final review agents get no Jev asks (no skills ask for lenses), and their
  failures and findings are asked about only for records of their own lens.
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
  ship  ──> ship_final_review           shipFinalReview                     ──> final_review_shipped, then the PR
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
  failed tries, bad-test bounces, rebases), and whatever the owner changed in
  its worktree is kept. The first fresh agent is told why it got stuck. A
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
- **A run branch whose install failed** stops every ticket but the stuck
  one; a `retry` installs it again.
- **Waiting.** `wait_for_reply` sleeps `reply_poll_ms` (default
  `REPLY_POLL_MS`, 1 minute) by the engine's clock, then reads comments with
  an id above the last one seen. It runs beside the tickets' steps, under its
  own key, and doesn't count towards `max_steps`: once nothing else can
  move, the run waits this way with no time limit.
- **Test setup files.** A test-writer or implementer that can't go on
  without a change to a test setup file answers `needs_setup_change` with the
  file and why; the ticket is stuck (`setup_change_needed`) with that
  message, since only the user may change one.
- The tracker's `comment` returns the new comment's id, and `listComments`
  reads an issue's comments after an id. The GitHub tracker posts and lists
  through `gh api`, and reads each issue's author.

## The board

The engine sends its journal records to the board plugin as they are
appended, verbatim: the event *is* the record (`seq`, `time`, `kind`,
`ticket`, `role`, `content`). The plugin keeps and reduces the run's state;
the engine computes nothing for the board. Every kind above maps onto the
board, Jev's included (only counted, since shadow mode decides nothing); see
"The board's vocabulary" in `packages/board/README.md`.

`runEngine` takes an optional `board` (from `createBoardSync`) and syncs it
once before its first step, so a resumed run catches the board up, and after
every step. It also syncs as soon as a slow step starts (an install, a test
run, or an agent's turn), so the board shows it while it runs. `createBoardSync` holds a cursor: the next seq the board wants,
from 1. Each sync sends every record from the cursor on, at most 100 per send,
and moves the cursor to the board's `next_seq`. A board that answers with a
lower `next_seq` (it restarted, or saw a gap) gets the journal again from
there. A failed send or a not-ok answer is logged once per message and
swallowed: the board never breaks a run. `end` syncs what is left, sends
`ended: { ok, message }`, and closes the link.

Over Paseo, each send is one plugin RPC call,
`invokePluginRpc(plugin_id, 'engine.event', input)`:

```ts
// input
{ run_id: string, token: string, records: JournalRecord[], ended: { ok: boolean, message: string } | null }
// output, checked with BoardReplySchema
{ ok: boolean, next_seq: number, message: string }
```

The link finds the daemon at `PASEO_HOST`, or the `listen` field of
`$PASEO_HOME/paseo.pid` (`~/.paseo/paseo.pid`), connects on the first send to
`ws://<listen>/ws` as a `cli` client (with `PASEO_PASSWORD` if set), keeps
that connection for the run, and reconnects once when a send fails.

## The command line: `luca-run`

```bash
bun packages/engine/src/cli/luca-run.ts --spec <n> [--repo <path>] [--run-id <id>] [--base <branch>] [--board-plugin <id>]
bun packages/engine/src/cli/luca-run.ts --demo [--run-id <id>] [--board-plugin <id>]
bun packages/engine/src/cli/luca-run.ts --resume <run-id> [--repo <path>] [--board-plugin <id>]
bun packages/engine/src/cli/luca-run.ts --unfinished
```

| Flag | What it does |
| --- | --- |
| `--spec <n>` | A real run of spec #n, on the repo's GitHub issues (through `gh`). |
| `--demo` | A practice run instead (below). Give exactly one of `--spec` and `--demo`. |
| `--resume <run-id>` | Go on with a run that crashed or was killed, from its journal: its spec and base branch come from `run_started`. Not with `--spec`, `--demo`, `--run-id`, or `--base`. |
| `--unfinished` | Print the runs that are not over, and whether each may be restarted, as one JSON object (see Crash recovery). Takes no other flags. |
| `--repo <path>` | The repo to run on. Defaults to the current folder; for `--resume`, to the repo the run started in. |
| `--run-id <id>` | The run's id: letters, digits, `-`, `_`. Defaults to a new one. The journal goes in `<runs folder>/<id>/`; a run id that already has a journal resumes it. |
| `--base <branch>` | The branch the run starts from. Defaults to `main`. |
| `--board-plugin <id>` | Send the journal to this Paseo plugin (such as `luca-board`). The per-run token comes from `LUCA_BOARD_TOKEN`. Without the flag, no board. |

The board plugin launches it as a detached Bun process by absolute path:
`bun <abs>/packages/engine/src/cli/luca-run.ts --spec <n> --repo <abs repo> --run-id <id> --board-plugin luca-board`,
with `LUCA_BOARD_TOKEN` set and stdout pointed at a log file. The package's
`bin` also names it `luca-run`, so an installed command can be found.

It logs to stdout, always tells the board how it ended, and exits 0 when the
run finished (PR opened, or nothing to do), 1 when it stopped (refused,
stuck, stopped by the launcher, crashed, or `--resume` of a run with no
journal to go on from), and 2 on bad flags. `--unfinished` exits 0 once it
printed the list.

**A real run** (`--spec`) builds with real Claude agents: `runSpec` gets
`createClaudeLauncher({})` (Claude Opus 5.5 at `high` effort, every guard on,
paid by your Claude plan; see Guards) and closes its open sessions with
`closeAll()` however the run ends. It asks Jev in shadow mode with
`jev: { client: createTypeSafeJev() }`, which reads `TYPESAFE_API_KEY`; with
no key each ask is journaled as `jev_failed` (`missing_key`), nothing is
sent, and the run goes on. A launcher stop (`run_stopped`) ends the process
with "Run stopped: <reason>"; run it again with `--resume <run-id>` (or the
same `--spec` and `--run-id`) to pick the step up again. `runSpec` takes the launcher as an argument, so its tests
hand in scripted agents and never call a model.

**The demo** (`--demo`) is safe to try the board with: it makes the practice
repo (`src/testing/practice-repo.ts`, with a local bare `origin`) in a temp
folder, fills an in-memory tracker with the practice spec and two tickets
(#12 blocked by #11), and runs the engine with scripted agents that take
1.5 s per turn. Jev is asked in shadow mode with no key, and memory is a fake
MuninnDB with two seeded memories and a scripted learner, so their records
show up but nothing leaves the machine. No GitHub, no models. It prints the temp
paths and the PR it opened in memory, then removes the temp folder (which
also holds its journal).

## Choices made

- **Config file:** `.luca/config.json` in the repo a run works on. Its
  `muninn.vault` field names the project's memory vault; it stays at that path
  because memory tooling outside the engine reads it there. Unknown keys (such
  as old Luca's) are dropped on read. The test command is optional in the
  schema so a config without it loads and intake refuses the run with a clear
  reason.
- **Runs folder:** `~/.local/state/luca/runs/<run_id>/journal.jsonl`, outside
  git. Set `LUCA_RUNS_DIR` to move it.
- **Refusal beats nothing to do:** config and spec problems refuse even a spec
  with no open tickets. Only a clean spec with no open tickets has nothing to
  do.
- **Refusing a ticket** comments with what is missing, adds `needs-info`, and
  removes `ready-for-agent`. Spec problems land on the spec the same way.
  Config problems (no issue to comment on) are only journaled.
- **Blockers** are native "blocked by" links plus `#N` refs in a ticket's
  "Blocked by" section. A closed blocker is fine anywhere; an open one must be
  an open ticket of the same spec, and those must not form a loop.

- **Run branch:** `luca/spec-<n>-<run_id>`, in a worktree at
  `<run folder>/run-branch`. Each ticket's branch is `<run branch>--ticket-<n>`,
  in `<run folder>/tickets/<n>`. Test reports go in `<run folder>/reports`, so
  they are never leftovers.
- **Test command:** it must be a `bun test` command. The engine adds bun's
  JUnit reporter flags to its end to learn each test's outcome. A repo with no
  test files passes the baseline.
- **A new test file that doesn't load yet** (it imports code not written yet)
  reports no results. Its tests count as failing if their names are in it.
- **Engine commits skip git hooks** (`--no-verify`): the engine already ran
  the gates, and hooks that run tests from inside a run have frozen machines.
- **A test-writer answering "nothing new to test"** makes the ticket stuck at
  once, with a hint: if the ticket changes no behavior, add the `refactor`
  label and start the run again.
- **`may_edit_tests`** on each launch tells the launcher's guards whether the
  agent may edit test files: true for the test-writer and for a refactor
  ticket's implementer, false otherwise (`mayEditTests`). A follow-up keeps
  the guards its session was launched with; the engine looks the value up
  again from the ticket for its after-turn check.
- **The PR's assumptions** come from every agent turn on a ticket, fix rounds
  and bounced test-writers included, each listed once.
- **Run notes:** every fresh agent (`launch_agent`, reviewers included) gets
  the run's `MAX_RUN_NOTES` (10) newest notes at the end of its prompt, under
  "Run notes from earlier agents in this run", oldest first, each with who
  wrote it (`- <note> (test-writer, #11)`). The same text twice is listed
  once, where it was last written. With no notes there is no section.
  Follow-ups don't repeat them. Replay keeps every note in `run_notes`, from
  the `agent_finished` records, in journal order; the prompt itself is
  journaled word for word in `agent_started`. Recalled memories (#370) sit
  next to them, after them at the prompt's end; the run's start memories
  sit at its top (see "Memory").
- **Lockfile updates (#373):** agents never run the install; the prompts say
  so, and every guard layer blocks it (#384). The hook denies package
  managers, `bun` install subcommands, `bunx <package>`, and Bun's
  auto-install flags (`-i`, `--install`) even on the test command; the
  permission rules deny the same for every role; no role writes a lockfile
  or `node_modules`, and the sandbox shuts both. The engine runs it itself, between agent
  turns, so its changes are never blamed on an agent: each turn's after-turn
  snapshot is taken right before that turn. When a `package.json` differs from the worktree's base, the gates
  start with an `install` check: `bun install` in a ticket worktree (it may
  update `bun.lock`, which the green commit then takes), and
  `bun install --frozen-lockfile` on the run branch. A failed install fails the
  gates without running the rest, and goes through the gate fix loop like
  any failed gate: the implementer gets its output in a follow-up.
- **Review rounds:** "at most 3 review rounds" means 3 review fix rounds,
  like the other loops: the first review, then up to 3 fixes, each checked
  by a fresh re-review. The 4th review still asking for changes is stuck.
- **Findings are the truth** for what goes back: the verdict must agree with
  them, and only blockers and should-fixes are sent to fixers.
- **Installs in new worktrees (#382):** a fresh worktree has no
  `node_modules`, so right after the engine makes the run branch's checkout
  or a ticket worktree it runs `bun install --frozen-lockfile` there, before
  any test, agent, or gate, and journals `dependencies_installed` (`check` is
  `null` when there's no `package.json`, so nothing to install). The install
  must not change the lockfile. A failed install is stuck at once as
  `install_failed`, with the command and its output: no agent can fix it,
  since agents never run the install. A failure in the run branch's checkout
  makes the first ticket stuck, before its worktree is made.
- **SDK version:** `@anthropic-ai/claude-agent-sdk` 0.3.273, pinned. Newer
  releases were younger than `bunfig.toml`'s 7-day minimum release age.
- **Reviewers can't run the tests.** They get read-only commands only; the
  engine already ran the gates.
- **A check command with shell syntax** (such as `... > /dev/null` or
  `a && b`) runs only exactly as configured, and gets one exact permission
  rule. Checked against the live CLI (Claude Code 2.1.280, SDK 0.3.273) for
  #384: under `dontAsk` both a redirect and `&&` run. The test command may
  take extra arguments only when it is one plain command. A check that
  redirects into the worktree writes a file there, which a test-writer may
  not: prefer `> /dev/null`.
- **`rm` takes files one by one** (`-f` at most): no folders, wildcards, or
  `~`, so every path is checked against the role's rules.
- **`sed` is `sed -n '<from>,<to>p'` only**, and `git` only `status`, `diff`,
  `log`, `show`, `ls-files`, and `blame` with no options before the
  subcommand, no `--output`, and no `--ext-diff`.
- **Undoing a violation** puts back each offending path's bytes from before
  the turn (tracked paths from HEAD, new paths removed), and moves HEAD and
  the branch back with a mixed reset, which keeps the files (#384):
  - In the shared `.git`, only the ticket branch's own config section
    (`branch.<branch>.*`) is the agent's: no one else works on that branch
    during the turn, and the engine pushes without `-u`. A change there is
    undone key by key (its keys unset, the saved entries added back in
    order); every other key in `.git/config` stays as it is (#396).
  - The rest of the shared `.git` (other config keys, `info/exclude`,
    `hooks`) is changed by other processes in the same repo, such as
    another agent's `git push -u`, and the sandbox and guard keep the agent
    out of it. A change there is journaled as `shared_git_changed`, never
    blamed on the agent, and never undone. It can't fool the check either:
    every git command the check runs has `core.fsmonitor=false` and
    `core.hooksPath=/dev/null`, and files are listed with the ignore rules
    from before the turn (the global excludes file, then `info/exclude`),
    not the live ones, so an excludes entry added mid-turn hides nothing.
  - A new branch or tag at HEAD is moved to `refs/luca-undone/...`, never
    deleted: refs are shared, and the engine can't tell who made one. The
    engine's own run and ticket branches are left out of this check.
  - A new stash entry on the ticket branch is dropped.
  - A changed or deleted file under `node_modules` can't be put back from
    saved bytes (there are too many), so its package folder is removed and
    the engine runs `bun install --frozen-lockfile`. If that fails, the
    turn's error says so.
- **Ignored files the after-turn check watches:** anything under
  `node_modules`, lockfiles, test and test setup files, and `.env` files
  (Bun loads them into every check). Other ignored paths, such as build
  output and caches, are what check commands write, so they are not
  watched. Under `node_modules` a file's fingerprint is its size, inode, and
  change time, not a content hash: hashing every file each turn takes
  seconds, and no process can set a change time back.
- **Engine retries live in the decision step,** not the executor: the
  executor journals each failed turn once, and replay counts `failed_tries`
  per role (cumulative on the ticket) and `engine_failures` (in a row, reset
  when any other turn ends), so a crash never loses or repeats a count.
- **Follow-ups use the SDK's streaming input.** The Claude launcher keeps
  each session open after its turn, keyed by the `session_id` from its init
  message, and `followUp` pushes the next user message into the same
  session, with the same checks on its messages. A session with no init id
  is closed at once, so a follow-up to it fails as `engine`. A stop, an
  engine failure, or a timeout closes the session; so does sitting idle past
  `idle_timeout_ms` (30 minutes by default). `closeAll()` closes the rest;
  call it when the run ends.
- **Finished agents' sessions close during the run** (#409). Before each
  decision, `runEngine` closes every session nothing can send a follow-up
  anymore (`finishedSessions`) with `closeSession`, and journals each as
  `agent_session_closed`: the test-writer's after the red commit, the
  implementer's after the green (or a review fix round's) commit, the final
  review's fixers after the round's fix commit, and reviewers, lenses, and
  the learner once their turn ends. A stuck ticket or final review closes its
  sessions before `ticket_stuck` or `final_review_stuck`; a plan cut-off or a
  stop closes the turn's session at once; a stopped, finished, or crashed run
  closes the rest. A same-session fix round keeps its session until its loop
  is over. The decision step never follows up a closed session: a review
  fix round or a clash fix after the green commit goes to a fresh
  implementer.
- **A stop leaves the step open.** `run_stopped` changes no ticket's state
  and closes every open step without counting it as a crash, so a later
  `runEngine` on the same journal takes the step again as it was; it does not
  count toward `MAX_CRASHES`. A billing stop (`billing: true`) and a stop for
  crashes (`crashed: true`) are the exceptions: they stick.
- **Denial counts** come from the result's `permission_denials` only (the
  tracer counted them twice), plus the guard hook's own denials.

## Agent messages

Test-writers and implementers can send each other a one-way heads-up
(decision #338). Reviewers can't send or receive, and the learner (#370)
can't either.

- **Addresses.** An agent's address is `<role>#<ticket>`, such as
  `implementer#11`; its prompt names it. A fresh test-writer after a bad test
  keeps the address, and its count. `to` is an address or `all`.
- **The tool.** A Claude agent calls `send_message({ to, text })` on the
  engine's in-process MCP server `luca` (`mcp__luca__send_message`). The
  answer says what happened; a refused message is an error result. Reviewers
  get no `luca` server and no delivery hooks, and the guard denies the tool
  to the reviewer and learner roles anyway.
- **Delivery.** At the receiver's next tool call, failed ones too: the
  `PostToolUse` and `PostToolUseFailure` hooks add the waiting messages as
  `additionalContext`, one line each, and journal `agent_message_delivered`
  (the receiver, the ids, the tool it rode on, and the text word for word; the
  record's time is when it was seen). Each message is handed over once. A
  session keeps its messaging for its follow-ups.
- **Who counts as live.** Tickets build at the same time, so the receiver
  may be on another ticket, working right now. A named address whose ticket
  is in the run and not over gets the message queued, even if that agent
  hasn't started yet: it gets it at its first tool call. A ticket is over
  (`isOver`) once it pushed, is stuck, was skipped (by a `skip` reply, or
  because it waits on a skipped ticket), the owner replied `stop` (every
  ticket), a billing stop ended the run, or the run's PR is open. A `retry`
  makes a stuck ticket live again for its fresh agents; messages queued
  before the retry were for the old agents, and are never handed over. Run
  notes are the run's, so the fresh agents get them as usual. A ticket that joined but hasn't pushed isn't over: a
  clash or failed gates after joining sends it back to its agents, and the
  implementer's follow-up (same session) or a fresh test-writer gets what
  waits. `all` goes to every other test-writer and implementer that has
  started on a ticket that isn't over, on any ticket; if there is none, it
  is not delivered.
- **Not delivered.** A message to an agent whose ticket is over is journaled
  as `not_delivered`, with why, and stays in the journal. It counts toward the
  cap.
- **Refused.** A reviewer sender, a reviewer or malformed address, the
  sender itself, a ticket not in the run, empty text, text over 2,000
  characters, or a sixth message from one address
  (`MAX_MESSAGES_PER_AGENT`, 5, per address: `implementer#11` and
  `implementer#12` each have their own 5; a fresh agent on a rejoin keeps its
  address's count). Refused messages are
  journaled too, with the reason, and don't count toward the cap.

Every message is journaled word for word as `agent_message` (`ticket` and
`role` are the sender's):

```ts
{ id: 'msg-<n>', from: 'test-writer#11', to: 'implementer#11' | 'all', text,
  status: 'queued' | 'not_delivered' | 'refused', recipients: string[], reason: string | null }
```

The rules are pure (`planMessage`, `pendingMessages`, `deliveryText`,
`isOver` in `src/messages/agent-messages.ts`) and read the journal on every
call: liveness, the cap, and what waits come from the journal alone, never
from memory, so a resumed run hands over exactly what is still waiting.

## Guards

Every agent runs Claude Opus 5.5 (`claude-opus-5-5`) at `high` effort. The
launcher refuses Fable and non-Claude models. Three layers keep each **role**
to its rules; each one alone should hold.

| Role | Writes | Runs |
| --- | --- | --- |
| test-writer | test files only (`test_file_patterns`), and only with `may_edit_tests` | read-only commands, the config's checks, `rm` of what it may write |
| implementer | anything but `test_setup_files`, and test files only with `may_edit_tests` (a refactor ticket) | the same |
| reviewer (the ticket reviewer and every lens) | nothing | read-only commands only |
| learner (#370) | nothing | no shell |

No agent writes a test setup file, git, or GitHub, installs packages, reaches
the network or local ports, or gets Paseo or any MCP tool but the engine's own
(`mcp__luca__*`). Reviewers and the learner don't get `send_message`.

1. **Before a call.** `checkToolCall` runs as a `PreToolUse` hook and fails
   closed: unknown tools, paths outside the worktree, and shell commands off
   the list are denied. A shell call is one plain command: no chains, pipes,
   redirects, or subshells. Under `dontAsk`, only the role's pre-approved
   calls (`permissionRules`) run at all.
2. **The sandbox.** Absolute paths only: git's shared folder, the worktree's
   `.git`, `node_modules`, lockfiles, and the test setup files are never
   writable; an implementer that
   may not edit tests can't write test files; reviewers can't write the
   worktree. No network, no local ports, no unsandboxed commands.
   `~/.claude*`, `~/.paseo`, `~/.ssh`, and `~/.config/gh` can't be read.
3. **After the turn.** The engine, not the launcher, compares the worktree
   and its git state with a snapshot from right before the turn (content
   hashes, never mtimes), ignored files that matter included. Any path the
   agent may not write, or any git change (HEAD, the branch, new refs at
   HEAD other than the run branch and its ticket branches, the branch's
   stash, the index, the ticket branch's own section of the shared
   `.git/config`), is undone and fails the turn as `guard`. Other changes
   to the shared `.git` (other config keys, `info/exclude`, hooks) are
   other processes', not the agent's: they are journaled as
   `shared_git_changed`, never blamed or undone, and the check ignores the
   live excludes, fsmonitor, and hooks.
   This holds for every launcher and every turn, follow-ups too.

Before each launch, the launcher checks `accountInfo()` for a Claude plan
(pro, max, team, or enterprise) and no API key, before the prompt is sent.
The agent's environment comes from an allow-list, so `ANTHROPIC_API_KEY`,
`ANTHROPIC_AUTH_TOKEN`, and `ANTHROPIC_BASE_URL` never reach it. It loads no
settings, MCP servers, or skills, and keeps no session on disk.

The launcher stops the run (`run_stopped`, and `runEngine` throws) on the
wrong credentials or plan, an init with an API key, a Fable or non-Claude
model, or a foreign MCP server, in a launch or a follow-up alike. A rejected
rate limit, overage, or a billing error cuts the turn off as `plan` instead;
see "Plan limits and billing".

## Plan limits and billing

Every agent turn's `agent_session` holds its `rate_limit_event` readings
(`status`, `rateLimitType`, `resetsAt` in Unix seconds, and each window's
`utilization`, a 0-to-1 fraction, under `unifiedWindows`), and
`billing_error` when an assistant message came back with one. The launcher
cuts a turn off (`failure: 'plan'`, the session closed) at the first
reading that isn't fine. The executor journals the session and nothing
else: the turn uses up no try, and its step stays open. The decision step
reads the journal (`decidePlan`, `src/limits/plan-signals.ts`):

| Reading | What the run does |
| --- | --- |
| `allowed`, `allowed_warning` | Goes on. The board colors plan usage. |
| `rejected` | A **limit wait** for the whole run, for the window it names. |
| `isUsingOverage` or `overageInUse` true, or `rateLimitType: "overage"` (any status) | Stops at once, for good. |
| an assistant `billing_error` | Stops at once, for good. |

Billing beats a limit. `overageStatus: "rejected"` alone (overage off) is fine.

```
agent_session with a rejected reading
  decide ──> start_limit_wait     comment on the spec (once per reset) ──> limit_wait_started
  decide ──> wait_for_limit       sleep by the clock until `until`    ──> limit_wait_ended
  decide ──> the step the limit cut off, again, on the same model
agent_session with a billing sign
  decide ──> stop_for_billing                                          ──> run_stopped (billing: true)
  decide ──> record_usage (the run's), then done (stopped), however often the engine starts again
```

- **Until when.** A limit wait ends at `resetsAt` plus
  `LIMIT_WAIT_MARGIN_MS` (1 minute). A reading with no `resetsAt` waits
  `DEFAULT_LIMIT_WAIT_MS` (15 minutes) from the hit. A weekly window can
  reset days out; the engine sleeps in naps of at most 5 minutes and checks
  the clock after each, so a laptop that slept wakes on time.
- **Restarts.** The wait is in the journal, so a restarted engine waits out
  only what is left, and one whose reset already passed goes on at once. The
  spec hears of each new reset once (`announce` is false for a reset it
  already heard of).
- **No model switch.** When Opus's weekly cap (`seven_day_opus`) runs out,
  the whole run waits like any other limit. The launcher always runs Opus.
- **A cut-off follow-up.** The session closed with the limit, so after the
  wait the follow-up fails as `engine` and a fresh agent of that role
  starts, as for any lost session.
- **A plan cut-off with no sign in its session** (it shouldn't happen) is
  journaled as an ordinary `run_stopped`, and `runEngine` throws.
- **The clock.** `runEngine({ ..., clock })` takes an `EngineClock`
  (`now`, `sleep`); it defaults to `SYSTEM_CLOCK`. Tests fake it, so nothing
  really waits.

**Usage** (`decideUsage`, `src/limits/plan-usage.ts`). Tokens per agent are
each `agent_session`'s `usage`. Once a ticket is pushed or stuck, and once
the run is about to end (its next action is `done`), the engine journals
`usage_recorded`: the agent turns, tokens summed, and each plan window's
`{ from, to, used }` in percent. A ticket's window starts from the last
reading before its first agent; a reading lower than the one before means
the window reset, so it counts from 0 again. A retried ticket that finishes
again (stuck again, or pushed) with agent sessions newer than its last
record gets a new record over all of its sessions, so a ticket's latest
`usage_recorded` is its whole usage. Readings come in hundredths, so
per-ticket numbers are rough, and other sessions on the same plan count too.
A ticket or run with no agent sessions (scripted agents) records nothing.

## Jev in shadow mode

Jev is TypeSafe's labeling model. `runEngine({ ..., jev })` asks it around
each step in **shadow mode**: every call and answer goes in the journal, and
the engine still acts on its own fixed choices. `decide` never reads Jev's
records, so the run goes exactly as it would without Jev.

| Job | Asked | The engine's fixed choice |
| --- | --- | --- |
| `ticket_order` | Before a ticket's worktree: which ticket next? (Only tickets with no worktree are candidates.) | The ticket it is starting. |
| `ticket_model` | Before a ticket's worktree: which model? | `claude-opus-5-5`. |
| `agent_skills` | Before each agent: which stock skills? (one yes/no each) | None. |
| `failure_kind` | After a failure: `code`, `test`, `agent`, or `clash`? | Where the engine routes it. |
| `finding_severity` | After a ticket review with findings: how severe is each? | The reviewer's severity. |

Each call writes `jev_asked` (the job, the request, the fixed choice), then
`jev_answered` (the answers, each with its value and confidence) or
`jev_failed` (`missing_key`, `timeout`, or `error`). Both point back with
`asked_seq`. A Jev error, timeout, or missing key is journaled and the run
goes on. Each call waits at most `timeout_ms` (default 10 seconds).

```ts
import { createTypeSafeJev, runEngine } from '@luca/engine'

// Reads TYPESAFE_API_KEY on each call. With no key, each ask is journaled
// as jev_failed with reason missing_key, and nothing is sent.
await runEngine({ journal, tracker, git, launcher, jev: { client: createTypeSafeJev() } })
```

Leave `jev` out to run without Jev; the journal is then exactly as before.
With many tickets at once, the asks after a step look only at the new
records of that step's own ticket.

## Memory (#370)

Only the engine talks to MuninnDB, over MCP; agents get no memory tools, and
the guard keeps the MuninnDB connection they would inherit away from them.
Memory is **off** unless `run_started` turns it on (`memory: { project_vault }`,
from `startRun({ memory })`), so a run without it goes exactly as before.
`runEngine({ ..., memory: { client, timeout_ms } })` takes the client; each
call waits at most `timeout_ms` (default 10 s), and an error or a timeout is
journaled as a value, never thrown: memory never breaks a run.

**Recall points.** Each search covers the project vault (the engine config's
`muninn.vault`) and `default` (just `default` with no project vault, or once
if they're the same), passes `threshold: MIN_MEMORY_SCORE` (0.5, MuninnDB's
own default; its scores can go above 1) and `limit: 5` to each, then merges
the hits by score, drops those below the minimum, keeps one per vault and id,
and keeps at most `MAX_MEMORIES_PER_RECALL` (5). When a step needs a search
whose key isn't journaled yet, the decision step returns `recall_memories`
in its place, under the same scheduler key (so tickets search at the same
time; the run's start is run-level, the final review's under `final`). A
search is a step like any other: it gets step records under that key, and
one a crash cut off is searched again.

| Point | When | Key | Query | Where the memories go |
| --- | --- | --- | --- | --- |
| `run_start` | once intake passed, before the run branch | `run_start` | the spec's title and body | the TOP of every fresh agent's prompt in the run, so every prompt starts the same and is cached |
| `ticket` | before a ticket's first test-writer or implementer | `ticket:<n>` | the ticket's title and body | the end of that ticket's fresh test-writers' and implementers' prompts, next to the run notes |
| `review` | before each ticket review, and each final review round's lenses (one search for all five) | `review:<n>:<commit>`, `review:final:<head>` | the ticket's (or spec's) title and the files changed | the reviewer's or lenses' prompts |
| `fix_round` | before a follow-up after a failed red check or failed gates, a review fix round, and a final review fix round | `fix_round:<n or final>:<red, gates, or review>:<seq>` | the failure text's last 1,500 characters (the output, or the findings) | that follow-up message, or the round's fresh fixers' prompts |

Failed-try follow-ups (agent errors, guard violations) and clash fixes are
no fix rounds. A follow-up is in its session already, so it gets no run-start
memories. A memory shown at the run's start (or earlier in the same prompt)
isn't repeated. Each section reads `## Memories from past runs...`, then
`- [<vault>] <concept>: <content>` (content cut at 600 characters). Every
search is journaled as `memory_recalled` with its query, each vault's outcome
and count, and the memories with their scores; one that failed in a vault
still journals, with the error, and the run moves on.

**The learner.** Once the run is about to end, it runs before anything else
(always before the last worktrees are removed, so the run branch's worktree
is its read-only folder):

- **with its PR**: once the final review passed or was shipped, before
  `open_pull_request`, so the PR can list the new memories;
- **stopped by the owner**: after a `stop` reply (a stuck final review then
  `stop` too), once the steps in flight settled;
- **every ticket skipped**: before the worktrees go.

Not on a refused run or one with nothing to do (no agent ran, nothing to
learn), not after a billing stop (starting any agent then could bill per
token), and not after a stop for crashes (the run stopped for good). A
learner's turn a crash cut off is taken again by a fresh learner (step
`launch_learner:learner`, under the run's key). The learner is a fresh agent (role `learner`: Read, Grep, Glob; no
shell, writes nothing, no messages) on Opus 5.5 like every role. Its prompt
is a digest of the journal built by pure code (`learnerPrompt`): the
failures (failed red checks and gates with their output's end, clashes), fix
loops, failed tries, review and final review findings, stuck points,
assumptions, run notes, and every memory shown (id, vault, concept,
content), each item capped at 700 characters and the whole at 40,000. It
answers `{ memories: { type, scope, concept, content, summary }[] (at most
10), helped: string[] }`; `scope` is `repo` or `anywhere`, by the user's test
"would this memory be useful in a completely different repo?" (#406).
`type` and `scope` are plain strings, so an unknown type or a missing or
unknown scope is refused alone rather than failing the answer. A failed try gets a fresh learner, up
to `MAX_FIX_ROUNDS` (3) tries or `MAX_ENGINE_FAILURES` (3) engine failures in
a row; then `learning_skipped { reason }` and the run ends as it would have.
A plan cut-off is a limit wait like any agent's, then the learner again. Its
records have `ticket: null` and never count as the final review's.

**Saving** (`save_memories`, routed by pure code):

| Type | Scope | Vault |
| --- | --- | --- |
| `pattern`, `pitfall`, `procedure` | `repo` | the project vault (refused if the config names none) |
| `pattern`, `pitfall`, `procedure` | `anywhere` | `default` |
| `decision` | `repo` or `anywhere` | the project vault (refused if the config names none) |
| anything else | | refused, with the reason |
| | missing or anything else | refused, with the reason |

A type and a scope are read without case or spaces. The stored concept is
`<type>:<concept>`. For each memory the executor searches its vault for the
most similar one (limit 1, threshold 0); a `vector_score` of at least
`SIMILAR_MEMORY_SCORE` (0.85) updates it (`muninn_evolve`), else a new one is
added (`muninn_remember`, tags `luca` and `spec-<n>`, and an `op_id` from the
learner's record so a save repeated after a crash adds it once). Then every
distinct memory shown in the run gets feedback: useful if its id is in
`helped` (ids never shown are ignored). Each write (a save's update or add,
a feedback) is journaled just before it as `memory_write_started` (its key,
vault, and the save's concept, `op_id`, the id it updates, and the similar
memory; or the feedback's memory id) and after it as `memory_write_done`
(the save's or the feedback's outcome), so a crash never saves twice or
sends a feedback twice (see "Crash recovery"). All of it is journaled once as
`memories_saved`: each save's vault, outcome (`added`, `updated`, `refused`,
`failed`), id, the similar memory found (id, score, vector score), and error,
and each feedback's outcome.

**Listing them.** The PR description ends with "New memories" (each added or
updated memory's type, vault, concept, id, and whether it was added or
updated). With no PR (stopped, or every ticket skipped), `report_memories`
comments the same list on the spec issue (──> `memories_reported`), unless
nothing was saved.

**Connecting.** `createMuninnMcpClient` calls `muninn_recall` (`vault`,
`context: [query]`, `limit`, `threshold`), `muninn_remember` (`vault`,
`concept`, `content`, `summary`, `type`, `tags`, `op_id`), `muninn_evolve`
(`vault`, `id`, `new_content`, `reason`), and `muninn_feedback` (`vault`,
`engram_id`, `useful`) on one connection, Streamable HTTP first, then SSE.
Answers are checked with Zod; a bad shape or an error result is an error
value. Where MuninnDB is (`muninnSettings`, pure):

| Setting | From |
| --- | --- |
| URL | `LUCA_MUNINN_URL`, else `mcpServers.muninn.url` in `~/.claude.json` |
| Token | `LUCA_MUNINN_TOKEN` (sent as `Authorization: Bearer <token>`), else that entry's `headers.Authorization` |

The token is never logged or journaled, and is hidden from error text.
`luca-run --spec` turns memory on when it finds MuninnDB (and logs "memory
off" when it doesn't); `runSpec` takes the client as an argument, so its
tests hand in the fake. The demo uses the fake MuninnDB seeded with two
memories and a scripted learner, so the board shows memory with nothing
leaving the machine.

Choices made:

- The design's `save_memories` step also carries each save's `op_id` and
  tags, so the executor stays a plain loop.
- A save whose similarity search fails is `failed`, not added, so a
  MuninnDB that half works doesn't fill a vault with duplicates.
- A save a crash left in doubt is repeated with no new search, as its
  `memory_write_started` says: a new search could find the memory its first
  try just added and update it instead, journaling `updated` for an add.
- The learner's answer is saved once (`memories_saved` is its checkpoint),
  even with nothing to save, so the run's end is clear in the journal.
- The run's start memories go on every fresh agent but the learner, whose
  digest already lists every memory shown.

## Tests

The tests go through the seams spec #359 sets: the decision step (`decide`
given a journal), the engine with the in-memory tracker, the journal file
(append and replay), and the config loader.

`src/core/run-one-ticket.test.ts` is seam 2, the end-to-end test. Through
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
the round cap, and nits and declined findings in the PR.
`src/core/ticket-review.test.ts` runs it end to end with scripted reviewers:
findings fixed and pushed back on, a re-review of the new changes only, the
round cap, and a verdict that disagrees with its findings.
`src/core/decide-final-review.test.ts` tests the final review through the
decision step: it runs before the PR even for one ticket, the five lens
prompts (the whole branch's diff, the rule files), clean → passed → PR, test
findings to a fresh test-writer then code findings to a fresh implementer,
the gates and their fix loop, the fix commit and push, re-reviews of only the
new changes by only the lenses with findings, pushback, the round cap, failed
lens and fixer tries, and a stuck final review ending the run, then `ship`
opening the PR with the open findings at the top. `src/core/final-review.test.ts`
runs it end to end with scripted lenses: a clean one, a code and a test
finding fixed on the whole run branch (the fix commit on origin, the fixers'
and re-reviewers' prompts), one stuck at the cap and then shipped with
`shipFinalReview`, and the rules lens reading a rule file from the practice
repo's config.
`src/core/agent-guards.test.ts` runs the practice ticket with agents that
break their role's rules, fail, crash, or stop, and checks the failed tries
and retries that follow.
`src/core/run-many-tickets.test.ts` runs three tickets through
`src/testing/many-tickets.ts`: #11 and #12 build at the same time (each
test-writer waits until the other has started), #12 finishes and joins first,
#11 clashes on `src/index.ts`, is fixed on top of the run branch, re-reviewed,
and joins, and #13 starts only after both pushed. It checks the order of the
joins, the follow-up and re-review prompts, origin's run branch, and that the
worktrees are gone. A second run with a Jev that always picks another ticket
shows its pick journaled and ignored. `src/core/run-broken-join.test.ts` runs
`BROKEN_JOIN`: #21 adds `double` on top of `helper` in `src/util.ts`, and
#22 renames `helper`, so both pass alone and git sees no clash, but the
types gate fails on the run branch after #22 joins. The join is undone (the
run branch goes back to #21's push, and origin never gets the broken
commits), #22 is fixed on top through the gate fix loop, re-reviewed, and
joins. `src/core/run-limit-many-tickets.test.ts` hits a plan limit while
#11's and #12's test-writers are both in flight: one wait (by a fake clock),
then both launch again with the same prompts and the run builds to its PR.
`src/core/run-rebase-reinstall.test.ts` rebases a ticket across another's
new workspace dependency and checks the moved worktree's frozen install.
`src/core/decide-many-tickets.test.ts` covers the same rules at the decision
step, limits and billing stops with two tickets in flight included.
`src/core/decide-stuck.test.ts` covers stuck work at the decision step: the
comment, other tickets building, the join undone, each reply word, named
tickets when several are stuck, replies from others ignored, retry with and
without ticket edits, skip with dependents and the PR, stop, a test setup
change, and a stuck final review's replies (`ship`, `retry`, `stop`, and
`skip` sent back). `src/core/final-review.test.ts` runs a final review
stuck after its fix rounds, told on the spec, then shipped by the owner's
`ship` reply on the tracker, ending in a PR that starts with the open
findings. `src/core/run-stuck.test.ts` runs it end to end, with a
scripted person replying on the in-memory tracker through a fake clock:
retry keeping the owner's fix, retry after a ticket edit, skip while another
ticket builds and pushes, stop, and a test setup change. The other
end-to-end tests stop at the first `wait_for_reply` (the practice harnesses'
default `stop_before`).

`src/agents/claude-launcher.test.ts` drives the real launcher with a fake
`query` that plays back SDK messages, follow-ups included. It calls
`send_message` through a real MCP client connected to the session's `luca`
server in memory, and runs the delivery hooks as the SDK would.
`src/messages/agent-messages.test.ts` tests the message rules on journals;
`src/messages/agent-messaging.test.ts` runs it on a real journal file, a
resumed engine included. The one-ticket end-to-end test sends a message from
the test-writer to the implementer, and a run note between them;
`src/core/run-many-tickets-messages.test.ts` runs the many-ticket practice
run with messages across #11 and #12 while both build, `all`, a message
that waits for #11's clash follow-up, and a run note reaching #12 and #13.
`src/guards/*.test.ts` table-test the guard rules and the sandbox.

`src/jev/jev-shadow.test.ts` runs the same practice repo with a fake Jev, one
that disagrees with everything, throws, never answers, or has no key, and
checks the run matches a run without Jev. `src/jev/jev-client.test.ts` tests
the TypeSafe client with a fake `fetch`; no test reaches the network.

`src/core/decide-limits.test.ts` hands the decision step scripted
rate-limit readings (allowed, allowed_warning, rejected days away, the Opus
weekly cap, overage, isUsingOverage, a billing error) and usage readings.
`src/core/limit-wait.test.ts` runs the practice ticket with an agent the
plan cuts off, a fake clock, and the in-memory tracker: the wait, its one
comment, a restart mid-wait, and a billing stop that sticks.

`src/core/decide-memory.test.ts` covers memory at the decision step: memory
off changes nothing, each recall point's search and query, tickets searching
at the same time, where the memories go in prompts and follow-ups, no repeats
of run-start memories, a failed try is no fix round, one search for all five
lenses, the learner before the PR, after a `stop`, and with every ticket
skipped, its routing by type and scope (unknown types and missing or
unknown scopes refused), feedback, the PR's "New
memories", the spec comment, a failed learner's tries and `learning_skipped`,
and no learner on a billing stop or a refused run.
`src/core/run-memory.test.ts` runs it end to end with a fake MuninnDB:
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
never breaks the run. `src/cli/run-modes.test.ts` runs the demo, and the
real-run path with the in-memory tracker and a scripted stand-in for the
Claude launcher: it builds to a PR and closes the sessions, passes Jev
through, ends on a launcher stop, resumes a journal, and reports a missing
config. Its `--resume` test crashes a real run after its red commit, lists it
in `unfinishedRuns`, then `resumeRun` finishes it: one PR, each commit once,
no comment twice, and `run_resumed` in the journal. `src/core/decide-crash-recovery.test.ts`
cuts journals anywhere and checks what the decision step does next, and
`src/core/run-crash-recovery.test.ts` crashes practice runs inside a step
(after a comment, a PR, a worktree, a commit, a join) and runs them again.

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
