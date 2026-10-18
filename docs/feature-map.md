# Feature map

This is the map of what Luca does, and which tests prove it (#583). Each section is one feature a user would recognise, with how a user reaches it and the test files that cover it.

Why it exists: an agent that adds a test should know where the feature already has tests, and put the new one beside them. This repo's `.luca/config.json` sets `feature_map` to this file, so:

- The red check refuses a new test file that no section lists.
- The test-writer adds a new test file under the feature it tests, in the same change. It may edit this file, though it may write nothing else outside test files.
- `packages/engine/src/gates/feature-map-docs.test.ts` checks that every `*.test.ts` file under `packages/` is listed here, and that every listed file exists.

To add a feature, add a section: a heading, one sentence, a `Reached by:` line, and a `Tests:` list with each path in backticks. The words come from `GLOSSARY.md`; the engine and board READMEs say how each feature works.

## Starting a run

A run reads the spec, checks it and all its open tickets (intake), starts from `origin/<base>`, and either refuses, finds nothing to do, or goes on to build.

Reached by: `/luca-run <spec>` in a Paseo chat, or `luca-run --spec <n>`.

Tests:

- `packages/engine/src/core/decide.test.ts`
- `packages/engine/src/core/engine.test.ts`
- `packages/engine/src/core/run-from-origin.e2e.test.ts`
- `packages/engine/src/core/run-from-origin.test.ts`
- `packages/engine/src/core/decide-release-labels.test.ts`

## Tickets a run leaves out

A ticket for a person (labeled `ready-for-human`) is left out with the tickets that wait on it, and an already-done ticket counts as done, not stuck.

Reached by: any run whose spec holds such a ticket; the board lists them under "For a person" and on the ticket's card.

Tests:

- `packages/engine/src/core/decide-human-tickets.test.ts`
- `packages/engine/src/core/run-human-tickets.test.ts`
- `packages/board/server/for-a-person-panel.test.ts`
- `packages/engine/src/core/decide-already-done.test.ts`
- `packages/engine/src/core/run-already-done.e2e.test.ts`
- `packages/board/server/already-done-panel.test.ts`

## Building one ticket

A ticket goes through a test-writer, the red check, an implementer, and the gates, with capped fix loops for each, before it joins the run branch.

Reached by: every run; each ticket takes this path.

Tests:

- `packages/engine/src/core/decide-build.test.ts`
- `packages/engine/src/core/run-one-ticket.e2e.test.ts`

## The red check and honest new tests

The red check proves a ticket's new tests fail before any code is written and every old test still passes, and sends back a new test that checks nothing.

Reached by: every ticket that is not a refactor ticket.

Tests:

- `packages/engine/src/gates/red-check.test.ts`
- `packages/engine/src/gates/new-tests.test.ts`

## The feature map

A repo can keep a feature map like this one, and the red check refuses a new test file the map does not list.

Reached by: `feature_map` in a repo's `.luca/config.json`.

Tests:

- `packages/engine/src/gates/feature-map.test.ts`
- `packages/engine/src/gates/feature-map-docs.test.ts`
- `packages/engine/src/core/decide-feature-map.test.ts`
- `packages/engine/src/core/run-feature-map.e2e.test.ts`

## Test commands and the gates

The gates run the repo's test commands, types, and lint in a ticket's worktree, in their own process group with a time limit, and report what failed.

Reached by: `checks` in a repo's `.luca/config.json`; the gates run after every agent turn that changes code.

Tests:

- `packages/engine/src/gates/gate-runner.test.ts`
- `packages/engine/src/gates/test-runner.test.ts`
- `packages/engine/src/shell/run-command.test.ts`
- `packages/engine/src/config/test-commands.test.ts`
- `packages/engine/src/core/decide-test-commands.test.ts`
- `packages/engine/src/core/run-test-commands.e2e.test.ts`

## Slow tests and the speed limit

Slow tests stay out of every ticket's runs except the slow test files the ticket names or changes, and all run at the final review; the fast tests have a per-test time limit.

Reached by: `checks.slow_test` and `test_case_timeout_ms` in a repo's `.luca/config.json`.

Tests:

- `packages/engine/src/config/test-timeout.test.ts`
- `packages/engine/src/gates/test-runner.test.ts`
- `packages/engine/src/core/decide-slow-tests.test.ts`
- `packages/engine/src/core/run-slow-tests.e2e.test.ts`
- `packages/engine/src/core/run-own-slow-tests.e2e.test.ts`
- `packages/engine/src/core/run-fast-limit.e2e.test.ts`

## Prepare commands

A repo's prepare command builds what a worktree needs before its tests run, with a time limit and a cap on how many run at once.

Reached by: `prepare` in a repo's `.luca/config.json`.

Tests:

- `packages/engine/src/config/prepare-command.test.ts`
- `packages/engine/src/gates/gate-runner.test.ts`
- `packages/engine/src/gates/prepare-slots.test.ts`
- `packages/engine/src/core/run-prepare-command.e2e.test.ts`
- `packages/engine/src/core/run-prepare-concurrency.e2e.test.ts`
- `packages/engine/src/core/run-prepare-side-effects.e2e.test.ts`

## The leftover scan and commits

The leftover scan stops files an agent left behind from being committed, and a commit leaves out links that point outside the checkout.

Reached by: every ticket's commit; a repo can allow some files with `leftover_allow` in its `.luca/config.json`.

Tests:

- `packages/engine/src/gates/leftover-scan.test.ts`
- `packages/engine/src/gates/leftover-scan-docs.test.ts`
- `packages/engine/src/core/commit-in.test.ts`
- `packages/engine/src/git/outside-links.test.ts`
- `packages/engine/src/git/path-text.test.ts`

## Many tickets, joins and rebases

Tickets build at the same time, share a baseline test run, join the run branch one at a time, and a clash, a broken join, or a test a joined ticket made wrong is fixed on top of the run branch.

Reached by: any run with more than one ticket.

Tests:

- `packages/engine/src/core/decide-many-tickets.test.ts`
- `packages/engine/src/core/run-many-tickets.e2e.test.ts`
- `packages/engine/src/core/decide-baseline-reuse.test.ts`
- `packages/board/server/baseline-reused-panel.test.ts`
- `packages/engine/src/core/run-broken-join.e2e.test.ts`
- `packages/engine/src/core/undo-join.test.ts`
- `packages/engine/src/git/git-adapter.test.ts`
- `packages/engine/src/core/run-rebase-reinstall.e2e.test.ts`
- `packages/engine/src/core/run-rebase-test-update.e2e.test.ts`
- `packages/engine/src/core/decide-test-update.test.ts`

## The ticket review

A fresh reviewer checks that one ticket's committed diff meets its acceptance criteria, and findings go back to a fixer in a capped loop.

Reached by: every ticket, after its gates pass; the board shows it as "Reviewing".

Tests:

- `packages/engine/src/core/decide-review.test.ts`
- `packages/engine/src/core/ticket-review.e2e.test.ts`
- `packages/board/server/review-fix-loop.test.ts`

## The final review and shipping

Five lenses review the whole run branch before the PR opens, with their own fix rounds, and a stuck final review can be shipped by the owner's `ship` reply.

Reached by: every run, once its tickets are done or skipped; the board shows the five lenses.

Tests:

- `packages/engine/src/core/decide-final-review.test.ts`
- `packages/engine/src/core/final-review.test.ts`
- `packages/engine/src/core/final-review.e2e.test.ts`
- `packages/engine/src/core/run-ship-uncommitted.test.ts`
- `packages/engine/src/core/run-ship-uncommitted.e2e.test.ts`
- `packages/board/server/final-review-panel.test.ts`
- `packages/board/server/final-review-hidden.test.ts`

## The pull request and changesets

A run ends in one PR with a Summary, Merge danger, and Evidence, its open findings, and the run's changeset in a repo that uses changesets.

Reached by: the end of every run that built something; a spec with more than one release label is refused at intake.

Tests:

- `packages/engine/src/core/pull-request-text.test.ts`
- `packages/engine/src/core/evidence-text.test.ts`
- `packages/engine/src/core/run-pull-request.test.ts`
- `packages/engine/src/core/run-pull-request.e2e.test.ts`
- `packages/engine/src/core/decide-changesets.test.ts`
- `packages/engine/src/core/run-changeset.e2e.test.ts`
- `packages/engine/src/core/decide-release-labels.test.ts`

## Stuck work and replies

Stuck work is told to the spec's owner as a comment, the rest of the run keeps building, and the owner's replies (`retry`, `skip`, `stop`, `ship`) move it on, with the `/luca-unstick` skill to read why.

Reached by: a "Needs you" card and its reply buttons on the board, a reply on the spec issue, or `/luca-unstick`.

Tests:

- `packages/engine/src/core/decide-stuck.test.ts`
- `packages/engine/src/core/run-stuck.e2e.test.ts`
- `packages/board/server/reply-actions.test.ts`
- `packages/board/server/reply-post.test.ts`
- `packages/engine/skills/luca-unstick/skill-text.test.ts`
- `packages/engine/skills/luca-unstick/scripts/stuck-summary.test.ts`
- `packages/board/server/board-panel-state.test.ts`

## Looking back at a run

The `/luca-retro` skill reads finished runs' journals and suggests changes to the agents' environment, ranked by how serious the problem was.

Reached by: `/luca-retro [run id ...]` in Claude Code.

Tests:

- `packages/engine/skills/luca-retro/skill-text.test.ts`
- `packages/engine/skills/luca-retro/scripts/retro-summary.test.ts`

## Crash recovery and resume

The journal records every step, so a run that crashed picks each ticket up from its last checkpoint, redoes a half-done step without repeating what it already did, and gives up after three crashes in a row.

Reached by: `luca-run --resume <run id>`, or the board restarting a run whose engine is gone.

Tests:

- `packages/engine/src/journal/journal.test.ts`
- `packages/engine/src/core/decide-crash-recovery.test.ts`
- `packages/engine/src/core/run-crash-recovery.test.ts`
- `packages/engine/src/core/run-crash-recovery.e2e.test.ts`
- `packages/board/server/engine-restart.test.ts`

## The engine config and its reload

The engine reads a repo's `.luca/config.json`, and a resumed run takes the new build fields and keeps the rest as the run started with it.

Reached by: `.luca/config.json` in a repo; a config reload happens on every resume.

Tests:

- `packages/engine/src/config/engine-config.test.ts`
- `packages/engine/src/config/config-reload.test.ts`
- `packages/engine/src/core/decide-config-reload.test.ts`
- `packages/engine/src/cli/run-config-reload.e2e.test.ts`
- `packages/board/server/config-reload-panel.test.ts`

## Plan limits, limit waits and the usage line

A run pauses in a limit wait when the plan's limit is hit or Luca's use reaches the usage line, carries on by itself after, and stops for good on any sign of per-token billing.

Reached by: any run that meets a plan limit; the board shows a limit-wait banner and the usage line setting.

Tests:

- `packages/engine/src/core/decide-limits.test.ts`
- `packages/engine/src/core/decide-plan-readings.test.ts`
- `packages/engine/src/core/limit-wait.e2e.test.ts`
- `packages/engine/src/core/run-limit-many-tickets.e2e.test.ts`
- `packages/engine/src/limits/plan-usage.test.ts`
- `packages/engine/src/core/decide-usage-line.test.ts`
- `packages/engine/src/core/usage-line-engine.test.ts`
- `packages/engine/src/core/usage-line-wait.test.ts`
- `packages/engine/src/limits/usage-line.test.ts`
- `packages/board/server/usage-line-panel.test.ts`
- `packages/board/server/board-panel-state.test.ts`

## Token counts and the run budget

Each ticket's and each run's exact tokens are journaled per model, and a run that uses its whole budget is stuck until the owner says whether to go on.

Reached by: the run card on the board; `run_budget_tokens` in a repo's `.luca/config.json`.

Tests:

- `packages/engine/src/core/decide-exact-tokens.test.ts`
- `packages/engine/src/core/run-exact-tokens.e2e.test.ts`
- `packages/engine/src/limits/plan-usage-tokens.test.ts`
- `packages/board/server/run-tokens-panel.test.ts`
- `packages/engine/src/core/decide-run-budget.test.ts`
- `packages/engine/src/limits/run-budget.test.ts`
- `packages/board/server/run-budget-panel.test.ts`

## Memory and the learner

With memory on, the engine searches MuninnDB at its recall points and hands the results to agents, and a learner at the end of a run proposes memories that plain code routes to a vault and saves.

Reached by: the `muninn` setting in a repo's `.luca/config.json`; the board shows memory on the run.

Tests:

- `packages/engine/src/core/decide-memory.test.ts`
- `packages/engine/src/core/execute-memory.test.ts`
- `packages/engine/src/core/run-memory.e2e.test.ts`
- `packages/engine/src/memory/memory-client.test.ts`
- `packages/engine/src/memory/memory-recall.test.ts`
- `packages/engine/src/memory/memory-routing.test.ts`
- `packages/engine/src/memory/muninn-mcp-client.test.ts`
- `packages/board/server/memory-panel.test.ts`

## The decision model in shadow mode

The engine asks the decision model (Cloudflare's Clef) what it would choose and journals its answer, but acts on a fixed choice, and turns it off for the run without working credentials.

Reached by: credentials in `~/.config/luca/.env`; every run asks, and the board shows it in the chat.

Tests:

- `packages/engine/src/jev/clef-client.test.ts`
- `packages/engine/src/jev/decision-model-credentials.test.ts`
- `packages/engine/src/jev/jev-schemas.test.ts`
- `packages/engine/src/jev/jev-jobs.test.ts`
- `packages/engine/src/jev/jev-jobs-limits.test.ts`
- `packages/engine/src/jev/jev-shadow.test.ts`
- `packages/engine/src/jev/jev-shadow.e2e.test.ts`
- `packages/board/server/decision-model-panel.test.ts`

## Agent messages and run notes

Agents send each other one-way messages, even across tickets that build at the same time, and hand run notes on to later agents.

Reached by: the `send_message` tool in an agent's session.

Tests:

- `packages/engine/src/messages/agent-messages.test.ts`
- `packages/engine/src/messages/agent-messaging.test.ts`
- `packages/engine/src/core/run-many-tickets-messages.e2e.test.ts`

## Guards

The guard blocks an agent's action when its role does not allow it, runs each role in an OS sandbox, and checks the worktree after every turn.

Reached by: every agent turn; the board shows outside changes to the shared `.git`.

Tests:

- `packages/engine/src/guards/role-rules.test.ts`
- `packages/engine/src/guards/sandbox-settings.test.ts`
- `packages/engine/src/guards/worktree-state.test.ts`
- `packages/engine/src/guards/shared-git-filters.test.ts`
- `packages/engine/src/core/agent-guards.e2e.test.ts`
- `packages/board/server/shared-git-panel.test.ts`

## Agents and their launcher

Each role runs as one Claude Agent SDK session with its own instructions and a structured result, and the engine closes the session when its step ends.

Reached by: every agent turn of a real run; scripted stand-in agents run the end-to-end tests.

Tests:

- `packages/engine/src/agents/claude-launcher.test.ts`
- `packages/engine/src/agents/role-instructions.test.ts`
- `packages/engine/src/agents/role-results.test.ts`
- `packages/engine/src/agents/scripted-launcher.test.ts`
- `packages/engine/src/core/run-session-close.e2e.test.ts`

## The GitHub tracker

The tracker reads specs and tickets, adds and removes labels, opens PRs, and posts each engine comment once, even when a step is redone after a crash.

Reached by: every real run, through the `gh` CLI.

Tests:

- `packages/engine/src/tracker/github-tracker.test.ts`
- `packages/engine/src/tracker/in-memory-tracker.test.ts`
- `packages/engine/src/tracker/post-comment-once.test.ts`

## The board: seeing a run

The engine sends its journal to the Paseo board, which shows the run's tickets, stages, current step, and chat rows, and rebuilds each run from its journal after a reload.

Reached by: the "Luca board" tab in Paseo.

Tests:

- `packages/engine/src/board/board-sync.test.ts`
- `packages/engine/src/board/board-sync.e2e.test.ts`
- `packages/engine/src/board/paseo-board-link.test.ts`
- `packages/board/server/board-server.test.ts`
- `packages/board/server/engine-event-protocol.test.ts`
- `packages/board/server/journal-rebuild.test.ts`
- `packages/board/server/two-runs-at-once.test.ts`
- `packages/board/server/board-panel-state.test.ts`
- `packages/board/server/ticket-stages-panel.test.ts`
- `packages/board/server/current-step-panel.test.ts`
- `packages/board/server/current-step-text.test.ts`
- `packages/board/server/run-tabs-fold.test.ts`

## The board: starting a run from Paseo

The board starts the engine as a detached process, and `/luca-run resume <run id>` picks a run back up, with the repo's `.env` and `bunfig.toml` kept out of the engine.

Reached by: `/luca-run <spec>` and `/luca-run resume <run id>` in a Paseo chat.

Tests:

- `packages/board/server/run-start.test.ts`
- `packages/board/server/run-resume.test.ts`
- `packages/board/server/spawn-detached.test.ts`
- `packages/board/server/engine-launch-isolation.test.ts`
- `packages/engine/src/cli/engine-bunfig.test.ts`

## Running from the command line, and Luca's version

`luca-run` runs a spec, resumes a run, lists unfinished runs, or runs the practice demo, and each run records the Luca version it started and resumed on.

Reached by: `luca-run --spec <n>`, `--resume <run id>`, `--unfinished`, and `--demo`.

Tests:

- `packages/engine/src/cli/run-args.test.ts`
- `packages/engine/src/cli/run-modes.test.ts`
- `packages/engine/src/cli/run-modes.e2e.test.ts`
- `packages/engine/src/cli/run-version.e2e.test.ts`
- `packages/engine/src/config/luca-version.test.ts`
- `packages/engine/src/core/decide-luca-version.test.ts`
- `packages/engine/src/agents/client-tag.test.ts`
- `packages/board/server/luca-version-panel.test.ts`
- `packages/board/server/board-version.test.ts`

## The luca command: setup, init, doctor and upgrade

`luca setup` gets a repo ready, `luca init` gets a computer ready, `luca doctor` checks both and fixes what is safe, and `luca upgrade` moves to another version of Luca.

Reached by: `luca setup`, `luca init`, `luca doctor [--fix]`, and `luca upgrade`.

Tests:

- `packages/engine/src/cli/luca-command.test.ts`
- `packages/engine/src/cli/setup.test.ts`
- `packages/engine/src/cli/setup-checks.test.ts`
- `packages/engine/src/cli/init.test.ts`
- `packages/engine/src/cli/doctor.test.ts`
- `packages/engine/src/doctor/v13-manifest.test.ts`
- `packages/engine/src/cli/upgrade.test.ts`
- `packages/engine/src/cli/upgrade-command.test.ts`
- `packages/engine/src/cli/live-runs.test.ts`

## The publish package

`@alecsibilia/luca` holds no source of its own: at pack time it copies in the engine's source and the board's folder, and its manifest points at them.

Reached by: `bun add -g @alecsibilia/luca`.

Tests:

- `packages/luca/pack.test.ts`

## The engine's docs

The engine's README is a short index of topic pages under `packages/engine/docs/`.

Reached by: reading `packages/engine/README.md`.

Tests:

- `packages/engine/src/docs-links.test.ts`

## Repo tooling

The repo's own scripts, outside the packages. The file size limit fails any file of more than 5,000 tokens (bytes / 4), in the pre-commit hook and in `bun run lint`.

Reached by: `bun scripts/check-file-size.ts [--staged]`, the `.githooks/pre-commit` hook, and `bun run lint`.

Tests:

- `scripts/check-file-size.test.ts`
- `scripts/check-file-size.e2e.test.ts`
