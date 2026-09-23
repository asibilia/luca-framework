# @luca/engine

The Luca v1 **engine**: plain Bun and TypeScript that drives a **run** of one
**spec** and picks every next step. See `CONTEXT.md` at the repo root for the
domain words, and spec #359 for the plan.

This package covers the start of a run (#360): the engine config, the
**journal**, and **intake**. It also builds each ticket end to end (#361), with
scripted stand-in **agents**, up to the run's one pull request, with capped
**fix loops** for a failed red check, failed gates, and a bad test (#363), and
runs real Claude agents under the **guard** (#362). A fresh reviewer checks
each ticket, with a capped review fix loop (#364). And it sends its journal to
the Paseo board plugin, and has a command line, `luca-run` (#374). A hit plan
limit is a **limit wait**, any sign of per-token billing stops the run for
good, and usage is journaled per ticket and per run (#368).

## Modules

| Module | What it does |
| --- | --- |
| `src/config/engine-config.ts` | Loads the per-repo engine config (`.luca/config.json`). |
| `src/journal/journal-record.ts` | The journal's record kinds and their content, as Zod schemas. |
| `src/journal/journal.ts` | One append-only JSONL journal per run, outside git. |
| `src/journal/replay.ts` | Rebuilds a run's state from its journal. There is no status file. |
| `src/intake/intake-checks.ts` | Intake's pure checks: refused, nothing to do, or a snapshot. |
| `src/core/decide.ts` | **The decision step.** Pure: journal in, next action out. |
| `src/core/decide-build.ts` | The build half of the decision step: each ticket's spine, then the PR. |
| `src/core/decide-plan.ts` | The plan half of the decision step: limit waits and billing stops. |
| `src/core/decide-usage.ts` | The usage half of the decision step: each finished ticket's usage, then the run's. |
| `src/limits/plan-signals.ts` | Pure: what a rate-limit reading or a session says (fine, a limit, or billing). |
| `src/limits/plan-usage.ts` | Pure: a ticket's or the run's tokens and plan-window movement. |
| `src/limits/limit-wait.ts` | The engine's clock, waiting until a time, and the spec's limit-wait comment. |
| `src/core/fix-loop-text.ts` | The follow-up messages a fix loop sends: a failed red check's or gate's output, or a failed try's error. |
| `src/core/review-text.ts` | The **ticket review**'s texts: the reviewer's diff, gate results, and earlier findings, and what each review fixer is sent. |
| `src/core/pull-request-text.ts` | The PR title and body: the tickets it closes, the agents' **assumptions**, the reviews' nits, and declined findings. |
| `src/core/execute.ts` | Carries out an action (tracker calls, journal appends) and the `runEngine` loop. |
| `src/core/execute-build.ts` | Carries out a build step through the git adapter, the gates, and the agent launcher. |
| `src/agents/agent-launcher.ts` | The agent launcher interface (`launch` a fresh session, or `followUp` in an open one), its failure kinds, and the session summary. |
| `src/agents/claude-launcher.ts` | The real launcher: one Claude Agent SDK session per agent, with every guard on, kept open for follow-ups. |
| `src/agents/claude-options.ts` | Pure: the model, effort, clean environment, and SDK options for one agent. |
| `src/agents/role-instructions.ts` | Each role's instructions, appended to Claude Code's system prompt. |
| `src/agents/scripted-launcher.ts` | Scripted stand-in agents: write files, act, return a result or a failure, and record each launch and follow-up with its session. |
| `src/agents/role-results.ts` | Each **role**'s result, as Zod schemas. |
| `src/agents/role-prompts.ts` | The prompt each agent starts with (spec, ticket, criterion ids). |
| `src/guards/role-rules.ts` | Pure: what each role may write and run, checked per tool call (`checkToolCall`). |
| `src/guards/guard-hook.ts` | The guard as the SDK's `PreToolUse` hook. |
| `src/guards/sandbox-settings.ts` | Pure: each role's OS sandbox, in absolute paths. |
| `src/guards/after-turn-check.ts` | Pure: compares a worktree before and after an agent's turn. |
| `src/guards/worktree-state.ts` | Snapshots a worktree and its git state, and undoes violations. |
| `src/git/git-adapter.ts` | Every git side effect: worktrees, commits, throwing away uncommitted work, replaying onto the run branch, pushes. |
| `src/gates/test-runner.ts` | Runs the config's test command with bun's JUnit reporter. |
| `src/gates/red-check.ts` | The **red check**. Pure. |
| `src/gates/gate-runner.ts` | Runs the config's **gates**: tests, types, lint. First, the install when a manifest changed. |
| `src/gates/lockfile-install.ts` | Whether a manifest changed, and so which install to run. Pure. |
| `src/gates/leftover-scan.ts` | The **leftover scan**. Pure. |
| `src/shell/run-command.ts` | Runs a command with a timeout and collects its output. |
| `src/tracker/tracker.ts` | The tracker interface: an object of async functions. |
| `src/tracker/in-memory-tracker.ts` | A tracker in memory, for tests. It records the PRs it opens. |
| `src/tracker/github-tracker.ts` | The real tracker, through the `gh` CLI. |
| `src/testing/intake-fixtures.ts` | Spec, ticket, and journal builders for tests. |
| `src/testing/build-fixtures.ts` | Journal entry builders for each build step. |
| `src/testing/practice-repo.ts` | The end-to-end practice repo: a throwaway git repo, local `origin`, tracker, and scripted turns (or any launcher). |
| `src/jev/jev-schemas.ts` | Jev's questions, requests, and answers, and the engine's fixed choices, as Zod schemas. |
| `src/jev/jev-client.ts` | The Jev client through TypeSafe's API. Never throws. |
| `src/jev/jev-jobs.ts` | What to ask Jev around each step, with the engine's fixed choice. Pure. |
| `src/jev/jev-shadow.ts` | Asks Jev in **shadow mode** and journals each call and answer. |
| `src/testing/practice-run.ts` | The `--demo` run: `practice-repo.ts`'s repo and turns, plus a second ticket (#12, blocked by #11) and its turns. |
| `src/board/board-sync.ts` | Keeps the board in step with the journal: a cursor, batches, replays. Never throws. |
| `src/board/paseo-board-link.ts` | The board link over Paseo: the plugin's `engine.event` RPC through the daemon. |
| `src/cli/luca-run.ts` | The `luca-run` command line (the package's `bin`). |
| `src/cli/run-args.ts` | Reads `luca-run`'s flags. |
| `src/cli/run-modes.ts` | A real run of a spec, and the practice `--demo`. |

## How a run moves

```
startRun ──> run_started
  decide ──> read_intake          execute: read spec, sub-tickets, outside blockers ──> intake_read
  decide ──> refuse_intake        execute: comment + needs-info on each bad issue   ──> intake_refused
          or finish_nothing_to_do execute:                                          ──> nothing_to_do
          or snapshot_intake      execute: ──> spec_snapshot, ticket_snapshot × n
  decide ──> done (refused, nothing to do) or build:

create_run_branch       git: worktree for the run branch, from the base ──> run_branch_created
for each ticket, one at a time, in snapshot order:
  create_ticket_worktree  git: worktree on a new branch from the run branch ──> ticket_worktree_created
  run_baseline_tests      the config's test command, before any agent    ──> baseline_tests
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
      follow_up_agent implementer (same session) the code findings, if any
      run_gates ticket            (and the gate fix loop)
      commit_ticket fix           leftover scan, then commit             ──> leftover_scan, commit_made
      launch_agent ticket-reviewer  (fresh) only the new changes and the earlier findings
  join_run_branch         git: cherry-pick the ticket's commits          ──> ticket_joined
  run_gates run_branch    the gates again, on the joined run branch      ──> gates_run
  push_run_branch         git: push to origin                            ──> run_branch_pushed
open_pull_request         tracker: one PR from the run branch            ──> pull_request_opened
done (pr_opened)
```

Each agent turn (`launch_agent` or `follow_up_agent`) may also journal
`agent_session` (the launcher's summary), `agent_failed` (a failed turn, with
how it failed), or `run_stopped` (see Guards). Any step may be preceded by a
limit wait or a billing stop, and a finished ticket and the run's end by
`usage_recorded` (see Plan limits and billing).

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
go to the same implementer session, or a fresh implementer if it is gone.
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

Anything else that fails (the leftover scan, the join), a fix loop or failed
tries at their cap, a second bad test, or a test-writer with nothing new to
test becomes `mark_stuck` ──> `ticket_stuck` with its reason, and the run
ends without a PR. Many tickets at once (#365) builds on this.

`runEngine` reads the journal before every step, so it can resume a journal
left by a crashed engine. A snapshot cut short by a crash is taken again; replay
keeps the latest snapshot of each ticket.

## The board

The engine sends its journal records to the board plugin as they are
appended, verbatim: the event *is* the record (`seq`, `time`, `kind`,
`ticket`, `role`, `content`). The plugin keeps and reduces the run's state;
the engine computes nothing for the board. Every kind above maps onto the
board, Jev's included (only counted, since shadow mode decides nothing); see
"The board's vocabulary" in `packages/board/README.md`.

`runEngine` takes an optional `board` (from `createBoardSync`) and syncs it
once before its first step, so a resumed run catches the board up, and after
every step. `createBoardSync` holds a cursor: the next seq the board wants,
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
```

| Flag | What it does |
| --- | --- |
| `--spec <n>` | A real run of spec #n, on the repo's GitHub issues (through `gh`). |
| `--demo` | A practice run instead (below). Give exactly one of `--spec` and `--demo`. |
| `--repo <path>` | The repo to run on. Defaults to the current folder. |
| `--run-id <id>` | The run's id: letters, digits, `-`, `_`. Defaults to a new one. The journal goes in `<runs folder>/<id>/`; a run id that already has a journal resumes it. |
| `--base <branch>` | The branch the run starts from. Defaults to `main`. |
| `--board-plugin <id>` | Send the journal to this Paseo plugin (such as `luca-board`). The per-run token comes from `LUCA_BOARD_TOKEN`. Without the flag, no board. |

The board plugin launches it as a detached Bun process by absolute path:
`bun <abs>/packages/engine/src/cli/luca-run.ts --spec <n> --repo <abs repo> --run-id <id> --board-plugin luca-board`,
with `LUCA_BOARD_TOKEN` set and stdout pointed at a log file. The package's
`bin` also names it `luca-run`, so an installed command can be found.

It logs to stdout, always tells the board how it ended, and exits 0 when the
run finished (PR opened, or nothing to do), 1 when it stopped (refused,
stuck, stopped by the launcher, crashed), and 2 on bad flags.

**A real run** (`--spec`) builds with real Claude agents: `runSpec` gets
`createClaudeLauncher({})` (Claude Opus 5.5 at `high` effort, every guard on,
paid by your Claude plan; see Guards) and closes its open sessions with
`closeAll()` however the run ends. It asks Jev in shadow mode with
`jev: { client: createTypeSafeJev() }`, which reads `TYPESAFE_API_KEY`; with
no key each ask is journaled as `jev_failed` (`missing_key`), nothing is
sent, and the run goes on. A launcher stop (`run_stopped`) ends the process
with "Run stopped: <reason>"; run it again with the same `--run-id` to pick
the step up again. `runSpec` takes the launcher as an argument, so its tests
hand in scripted agents and never call a model.

**The demo** (`--demo`) is safe to try the board with: it makes the practice
repo (`src/testing/practice-repo.ts`, with a local bare `origin`) in a temp
folder, fills an in-memory tracker with the practice spec and two tickets
(#12 blocked by #11), and runs the engine with scripted agents that take
1.5 s per turn. Jev is asked in shadow mode with no key, so its records show
up but nothing leaves the machine. No GitHub, no models. It prints the temp
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
- **Lockfile updates (#373):** agents never run the install; the prompts say
  so, and the guards deny `bun install`, `bun i`, `bun add`, `npm`, and
  `bunx <package>` for every role. The engine runs it itself, between agent
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
- **SDK version:** `@anthropic-ai/claude-agent-sdk` 0.3.273, pinned. Newer
  releases were younger than `bunfig.toml`'s 7-day minimum release age.
- **Reviewers can't run the tests.** They get read-only commands only; the
  engine already ran the gates.
- **A check command with shell syntax** (such as `... > /dev/null`) runs only
  exactly as configured. The test command may take extra arguments.
- **`rm` takes files one by one** (`-f` at most): no folders, wildcards, or
  `~`, so every path is checked against the role's rules.
- **`sed` is `sed -n '<from>,<to>p'` only**, and `git` only `status`, `diff`,
  `log`, `show`, `ls-files`, and `blame` with no options before the
  subcommand, no `--output`, and no `--ext-diff`.
- **Undoing a violation** puts back each offending path's bytes from before
  the turn (tracked paths from HEAD, new paths removed), and moves HEAD and
  the branch back with a mixed reset, which keeps the files. New refs,
  stashes, and `.git` config or hook changes are reported but not undone;
  the sandbox should never let them happen.
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
- **A stop leaves the step open.** `run_stopped` changes no ticket's state, so
  a later `runEngine` on the same journal starts that step again. A billing
  stop (`billing: true`) is the exception: it sticks.
- **Denial counts** come from the result's `permission_denials` only (the
  tracer counted them twice), plus the guard hook's own denials.

## Guards

Every agent runs Claude Opus 5.5 (`claude-opus-5-5`) at `high` effort. The
launcher refuses Fable and non-Claude models. Three layers keep each **role**
to its rules; each one alone should hold.

| Role | Writes | Runs |
| --- | --- | --- |
| test-writer | test files only (`test_file_patterns`), and only with `may_edit_tests` | read-only commands, the config's checks, `rm` of what it may write |
| implementer | anything but `test_setup_files`, and test files only with `may_edit_tests` (a refactor ticket) | the same |
| reviewer | nothing | read-only commands only |
| learner (#370) | nothing | no shell |

No agent writes a test setup file, git, or GitHub, installs packages, reaches
the network or local ports, or gets Paseo or any MCP tool but the engine's own
(`mcp__luca__*`).

1. **Before a call.** `checkToolCall` runs as a `PreToolUse` hook and fails
   closed: unknown tools, paths outside the worktree, and shell commands off
   the list are denied. A shell call is one plain command: no chains, pipes,
   redirects, or subshells. Under `dontAsk`, only the role's pre-approved
   calls (`permissionRules`) run at all.
2. **The sandbox.** Absolute paths only: git's shared folder, the worktree's
   `.git`, and the test setup files are never writable; an implementer that
   may not edit tests can't write test files; reviewers can't write the
   worktree. No network, no local ports, no unsandboxed commands.
   `~/.claude*`, `~/.paseo`, `~/.ssh`, and `~/.config/gh` can't be read.
3. **After the turn.** The engine, not the launcher, compares the worktree
   and its git state with a snapshot from right before the turn (content
   hashes, never mtimes). Any path the agent may not write, or any git change
   (HEAD, the branch, other refs at HEAD, the branch's stash, the index,
   `.git/config`, `.git/hooks`), is undone and fails the turn as `guard`.
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
the window reset, so it counts from 0 again. Readings come in hundredths, so
per-ticket numbers are rough, and other sessions on the same plan count too.
A ticket or run with no agent sessions (scripted agents) records nothing.

## Jev in shadow mode

Jev is TypeSafe's labeling model. `runEngine({ ..., jev })` asks it around
each step in **shadow mode**: every call and answer goes in the journal, and
the engine still acts on its own fixed choices. `decide` never reads Jev's
records, so the run goes exactly as it would without Jev.

| Job | Asked | The engine's fixed choice |
| --- | --- | --- |
| `ticket_order` | Before a ticket's worktree: which ticket next? | The ticket it is starting. |
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
`src/core/decide-review.test.ts` tests the ticket review through the decision
step: the reviewer's prompt, findings to the right fixer in the right order,
the gates and the fix commit, re-reviews of only the new changes, pushback,
the round cap, and nits and declined findings in the PR.
`src/core/ticket-review.test.ts` runs it end to end with scripted reviewers:
findings fixed and pushed back on, a re-review of the new changes only, the
round cap, and a verdict that disagrees with its findings.
`src/core/agent-guards.test.ts` runs the practice ticket with agents that
break their role's rules, fail, crash, or stop, and checks the failed tries
and retries that follow.

`src/agents/claude-launcher.test.ts` drives the real launcher with a fake
`query` that plays back SDK messages, follow-ups included.
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

`src/board/board-sync.test.ts` runs the engine with a board in memory: records
arrive in seq order, a board that restarted gets a replay, and a failing board
never breaks the run. `src/cli/run-modes.test.ts` runs the demo, and the
real-run path with the in-memory tracker and a scripted stand-in for the
Claude launcher: it builds to a PR and closes the sessions, passes Jev
through, ends on a launcher stop, resumes a journal, and reports a missing
config.

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
