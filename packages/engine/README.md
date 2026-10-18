# @luca/engine

The Luca v1 **engine**: plain Bun and TypeScript that drives a **run** of one
**spec** and picks every next step. See `GLOSSARY.md` at the repo root for the
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
`stop`) move it on (#366). The `/luca-unstick` skill reads why for the
owner and posts the reply once they say yes (#504). After a run,
`/luca-retro` reads its journal and suggests what to change so the next one
goes better (#514).
With **memory** on, the engine searches MuninnDB at four **recall points** and
hands the memories to agents, and at the end of every run a learner proposes
new memories that plain code routes to a vault by type and scope and saves
(#370, #406).
A run survives crashes: the journal marks where each step starts and ends,
a restarted engine takes a cut-off step again (an agent's turn in a fresh
session) without posting a comment, opening a PR, or committing twice, a
step that keeps crashing gets stuck, and `luca-run --resume <run-id>` goes
on with a run from its journal (#369).

## Docs

Each topic has its own page under `docs/`:

| Page | What it covers |
| --- | --- |
| [Modules in `src/core/`](docs/modules-core.md) | The decision step and the code that carries out its actions, with the modules split out of `decide-build.ts` and `stuck-text.ts`. |
| [Modules in `src/journal/`](docs/modules-journal.md) | The journal, its record kinds, and replay, with the modules split out of `replay.ts` and `journal-record.ts`. |
| [Modules in `src/agents/`](docs/modules-agents.md) | Launching agents, their instructions, prompts, and results, with the modules split out of `role-instructions.ts`. |
| [Modules in `src/guards/`](docs/modules-guards.md) | The guard, with the modules split out of `role-rules.ts`. |
| [Modules in `src/gates/`](docs/modules-gates.md) | The red check, the gates, installs, and the leftover scan. |
| [Modules in `src/cli/`](docs/modules-cli.md) | The `luca-run` and `luca` command lines, and their adapters. |
| [Modules in the other folders](docs/modules-other.md) | `src/config/`, `intake/`, `limits/`, `messages/`, `git/`, `shell/`, `tracker/`, `testing/`, `jev/`, `memory/`, `board/`, and `skills/`. |
| [How a run moves](docs/how-a-run-moves.md) | Each step of a run, many tickets at once, a shared baseline, plan limits with many tickets, a clash on the run branch, a test the run branch made wrong, and installs after a rebase. |
| [Prepare, tests, and commits](docs/prepare-and-tests.md) | The prepare command and its limits, the test time limit, slow tests, the fast test speed limit, files prepare makes, what never gets committed, the leftover scan's allowlists, and changesets. |
| [A ticket's tries, fix loops, and review](docs/ticket-steps.md) | Cleaning up, already-done tickets, tickets for a person, fix loops, bad and unmapped tests, tests that check nothing, the feature map, failed tries, and the ticket review. |
| [Crash recovery](docs/crash-recovery.md) | Step records, redoing a cut-off step, `--resume`, the config a resume re-reads, Luca's version, and restarts from Paseo. |
| [The final review](docs/final-review.md) | The five lenses, their fix loop, slow tests, re-reviews, and a stuck final review's replies. |
| [Stuck work](docs/stuck-work.md) | The stuck comment and the owner's replies, opening the PR, `/luca-unstick`, and `/luca-retro`. |
| [The board and the command line](docs/board-and-command-line.md) | How the journal reaches the board, and `luca-run`'s flags, real runs, and the demo. |
| [Publishing and setting up](docs/setup.md) | Publishing Luca, `luca upgrade`, `luca setup`, and `luca doctor`. |
| [Choices made](docs/choices-made.md) | The config, the runs folder, intake, the run branch, test commands, installs, guards' details, sessions, and stops. |
| [Agent messages and guards](docs/agent-messages-and-guards.md) | One-way messages between agents, and the three layers that keep each role to its rules. |
| [Plan limits, billing, and the usage line](docs/plan-limits.md) | Limit waits, billing stops, usage, the run budget, and the usage line. |
| [The decision model](docs/decision-model.md) | Clef in shadow mode: its jobs, credentials, and model. |
| [Memory](docs/memory.md) | Recall points, the learner, saving and listing memories, and connecting to MuninnDB. |
| [Tests](docs/tests.md) | What the tests cover, and the manual smoke run. |
