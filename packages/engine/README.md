# @luca/engine

The Luca v1 **engine**: plain Bun and TypeScript that drives a **run** of one
**spec** and picks every next step. See `CONTEXT.md` at the repo root for the
domain words, and spec #359 for the plan.

This package covers the start of a run (#360): the engine config, the
**journal**, and **intake**. It also builds each ticket end to end (#361), with
scripted stand-in **agents**, up to the run's one pull request.

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
| `src/core/pull-request-text.ts` | The PR title and body: the tickets it closes and the agents' **assumptions**. |
| `src/core/execute.ts` | Carries out an action (tracker calls, journal appends) and the `runEngine` loop. |
| `src/core/execute-build.ts` | Carries out a build step through the git adapter, the gates, and the agent launcher. |
| `src/agents/agent-launcher.ts` | The agent launcher interface. The real Claude launcher comes in #362. |
| `src/agents/scripted-launcher.ts` | Scripted stand-in agents: write the files a test gives them, return the role's result. |
| `src/agents/role-results.ts` | Each **role**'s result, as Zod schemas. |
| `src/agents/role-prompts.ts` | The prompt each agent starts with (spec, ticket, criterion ids). |
| `src/git/git-adapter.ts` | Every git side effect: worktrees, commits, replaying onto the run branch, pushes. |
| `src/gates/test-runner.ts` | Runs the config's test command with bun's JUnit reporter. |
| `src/gates/red-check.ts` | The **red check**. Pure. |
| `src/gates/gate-runner.ts` | Runs the config's **gates**: tests, types, lint. |
| `src/gates/leftover-scan.ts` | The **leftover scan**. Pure. |
| `src/shell/run-command.ts` | Runs a command with a timeout and collects its output. |
| `src/tracker/tracker.ts` | The tracker interface: an object of async functions. |
| `src/tracker/in-memory-tracker.ts` | A tracker in memory, for tests. It records the PRs it opens. |
| `src/tracker/github-tracker.ts` | The real tracker, through the `gh` CLI. |
| `src/testing/intake-fixtures.ts` | Spec, ticket, and journal builders for tests. |
| `src/testing/build-fixtures.ts` | Journal entry builders for each build step. |
| `src/testing/practice-repo.ts` | The end-to-end practice repo: a throwaway git repo, local `origin`, tracker, and scripted turns. |
| `src/jev/jev-schemas.ts` | Jev's questions, requests, and answers, and the engine's fixed choices, as Zod schemas. |
| `src/jev/jev-client.ts` | The Jev client through TypeSafe's API. Never throws. |
| `src/jev/jev-jobs.ts` | What to ask Jev around each step, with the engine's fixed choice. Pure. |
| `src/jev/jev-shadow.ts` | Asks Jev in **shadow mode** and journals each call and answer. |

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
  commit_ticket red       leftover scan, then commit                     ──> leftover_scan, commit_made
  launch_agent implementer                                               ──> agent_started, agent_finished
  run_gates ticket        tests, types, lint from the config             ──> gates_run
  commit_ticket green     leftover scan, then commit                     ──> leftover_scan, commit_made
  launch_agent ticket-reviewer                                           ──> agent_started, agent_finished
  join_run_branch         git: cherry-pick the ticket's commits          ──> ticket_joined
  run_gates run_branch    the gates again, on the joined run branch      ──> gates_run
  push_run_branch         git: push to origin                            ──> run_branch_pushed
open_pull_request         tracker: one PR from the run branch            ──> pull_request_opened
done (pr_opened)
```

Anything that fails (an agent, the red check, the leftover scan, a gate, the
review, the join) becomes `mark_stuck` ──> `ticket_stuck`, and the run ends
without a PR. Fix loops (#363), real reviews (#364), and many tickets at once
(#365) build on this.

`runEngine` reads the journal before every step, so it can resume a journal
left by a crashed engine. A snapshot cut short by a crash is taken again; replay
keeps the latest snapshot of each ticket.

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
- **A test-writer answering "nothing new to test"** skips the red check and
  the red commit.
- **The ticket reviewer** is a scripted stand-in that approves for now (#364).

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

`src/core/run-one-ticket.test.ts` is seam 2, the end-to-end test. It makes a
throwaway git repo in a temp folder with a local bare repo as its `origin`,
fills the in-memory tracker with a practice spec and ticket, and runs the
engine with scripted agents. The gates, commits, join, push, journal, and PR
step are real. No GitHub, no models, no setup.

`src/jev/jev-shadow.test.ts` runs the same practice repo with a fake Jev, one
that disagrees with everything, throws, never answers, or has no key, and
checks the run matches a run without Jev. `src/jev/jev-client.test.ts` tests
the TypeSafe client with a fake `fetch`; no test reaches the network.

```bash
bun test              # in packages/engine
bun run typecheck
bun run lint
```
