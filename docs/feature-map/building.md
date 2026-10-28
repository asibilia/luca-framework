# Building

How a run starts, and how each ticket is built, checked, and joined.

## Starting a run

A run reads the spec, checks it and all its open tickets (intake), starts from `origin/<base>`, and either refuses, finds nothing to do, or goes on to build.

Reached by: `/luca-run <spec>` in a Paseo chat, or `luca-run --spec <n>`.

Tests:

- `packages/engine/src/core/decide.test.ts`
- `packages/engine/src/core/decide-intake-criteria.test.ts`
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
- `packages/engine/src/core/decide-build-empty-tests.test.ts`
- `packages/engine/src/core/decide-build-failures.test.ts`
- `packages/engine/src/core/decide-build-fix-loops.test.ts`
- `packages/engine/src/core/decide-build-run-notes.test.ts`
- `packages/engine/src/core/run-one-ticket.e2e.test.ts`
- `packages/engine/src/core/run-one-ticket-fix-loops.e2e.test.ts`
- `packages/engine/src/core/run-one-ticket-install.e2e.test.ts`
- `packages/engine/src/core/run-one-ticket-messages.e2e.test.ts`
- `packages/engine/src/core/run-refactor-test-update.e2e.test.ts`

## Environment failures

A test-writer or implementer can answer `environment`, with evidence, when a failed red check or failed gates are not its ticket's fault; the engine reruns the check once without using a fix round, and a rerun that fails the same way, or a third such answer, is stuck as `environment_failed`. The final review's fixer can do the same for the final gates.

Reached by: a writer's `environment` outcome; the spec issue's stuck comment shows its evidence.

Tests:

- `packages/engine/src/agents/environment-answer.test.ts`
- `packages/engine/src/core/decide-environment.test.ts`
- `packages/engine/src/core/decide-final-environment.test.ts`

## The red check and honest new tests

The red check proves a ticket's new tests fail before any code is written and every old test still passes, and sends back a new test that checks nothing. A test the ticket only moved to another test file is an old test, so a test-writer can split a too-big test file.

Reached by: every ticket that is not a refactor ticket.

Tests:

- `packages/engine/src/gates/red-check.test.ts`
- `packages/engine/src/gates/new-tests.test.ts`
- `packages/engine/src/gates/red-check-moved-tests.test.ts`
- `packages/engine/src/gates/red-check-swift.test.ts`
- `packages/engine/src/core/run-moved-tests.e2e.test.ts`

## The feature map

A repo can keep a feature map like this one, as one file or a folder of pages, and the red check refuses a new test file the map does not list.

Reached by: `feature_map` in a repo's `.luca/config.json`.

Tests:

- `packages/engine/src/gates/feature-map.test.ts`
- `packages/engine/src/gates/feature-map-folder.test.ts`
- `packages/engine/src/gates/feature-map-docs.test.ts`
- `packages/engine/src/guards/role-rules-feature-map.test.ts`
- `packages/engine/src/core/decide-feature-map.test.ts`
- `packages/engine/src/core/run-feature-map.e2e.test.ts`

## Test helpers

A repo can name non-test files the test-writer may also write, such as shared fakes and fixtures: the guard lets it, the red check and the feature map leave them alone, and the leftover scan lets them through.

Reached by: `test_helper_patterns` in a repo's `.luca/config.json`.

Tests:

- `packages/engine/src/guards/role-rules-test-helpers.test.ts`
- `packages/engine/src/config/test-helper-patterns.test.ts`
- `packages/engine/src/core/commit-in-test-helpers.test.ts`
- `packages/engine/src/core/run-test-helpers.e2e.test.ts`

## Test commands and the gates

The gates run the repo's test commands, types, and lint in a ticket's worktree, in their own process group with a time limit, and report what failed.

Reached by: `checks` in a repo's `.luca/config.json`; the gates run after every agent turn that changes code.

Tests:

- `packages/engine/src/gates/gate-runner.test.ts`
- `packages/engine/src/gates/gate-runner-slow-tests.test.ts`
- `packages/engine/src/gates/gate-runner-own-slow-tests.test.ts`
- `packages/engine/src/gates/gate-runner-speed-limit.test.ts`
- `packages/engine/src/gates/test-runner.test.ts`
- `packages/engine/src/gates/junit-runner.test.ts`
- `packages/engine/src/gates/gate-runner-junit.test.ts`
- `packages/engine/src/shell/run-command.test.ts`
- `packages/engine/src/config/test-commands.test.ts`
- `packages/engine/src/core/decide-test-commands.test.ts`
- `packages/engine/src/core/read-intake-junit.test.ts`
- `packages/engine/src/core/run-test-commands.e2e.test.ts`
- `packages/engine/src/core/run-junit-tests.e2e.test.ts`

## Slow tests and the speed limit

Slow tests stay out of every ticket's runs except the slow test files the ticket names or changes (through a slow entry's `run_files` for the files its `file_patterns` own), and all run at the final review; the fast tests have a per-test time limit.

Reached by: `checks.slow_test` and `test_case_timeout_ms` in a repo's `.luca/config.json`.

Tests:

- `packages/engine/src/config/test-timeout.test.ts`
- `packages/engine/src/gates/test-runner.test.ts`
- `packages/engine/src/core/decide-slow-tests.test.ts`
- `packages/engine/src/core/run-slow-tests.e2e.test.ts`
- `packages/engine/src/core/run-own-slow-tests.e2e.test.ts`
- `packages/engine/src/core/run-own-slow-run-files.e2e.test.ts`
- `packages/engine/src/core/run-junit-own-files.e2e.test.ts`
- `packages/engine/src/core/run-fast-limit.e2e.test.ts`

## Test slots

A repo can cap how many test runs go at once across a run, so tests that share ports, files, or a database don't collide; waiting for a slot is journaled as `wait_ms` and never counts toward a time limit.

Reached by: `test_concurrency` in a repo's `.luca/config.json`.

Tests:

- `packages/engine/src/gates/test-slots.test.ts`
- `packages/engine/src/config/test-concurrency.test.ts`

## Shared failures and lone reruns

When the same old test fails in two tickets within 10 minutes, the engine reruns the second ticket's failed red check or gates alone, holding every test slot, before any fix round; a check gets one lone rerun per ticket. Ticket and join gates journal their failed test cases for this.

Reached by: any run with tickets whose tests collide on a shared port, file, or lock.

Tests:

- `packages/engine/src/core/decide-shared-failures.test.ts`
- `packages/engine/src/gates/lone-rerun-slots.test.ts`
- `packages/engine/src/core/run-shared-failures.e2e.test.ts`

## Prepare commands

A repo's prepare command builds what a worktree needs before its tests run, with a time limit and a cap on how many run at once.

Reached by: `prepare` in a repo's `.luca/config.json`.

Tests:

- `packages/engine/src/config/prepare-command.test.ts`
- `packages/engine/src/gates/gate-runner.test.ts`
- `packages/engine/src/gates/gate-runner-slow-tests.test.ts`
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

## File modes and generators

The engine does two owner chores for a writer: it makes the files the writer names executable (or not) before the commit, and runs the generators the repo names, before the gates, as a `generate` check whose output is committed with the ticket.

Reached by: `file_modes` and `run_generators` in a writer's result; `generators` in a repo's `.luca/config.json`.

Tests:

- `packages/engine/src/core/run-engine-chores.e2e.test.ts`
- `packages/engine/src/config/generators-config.test.ts`
- `packages/engine/src/agents/writer-chores-instructions.test.ts`

## Many tickets, joins and rebases

Tickets build at the same time, share a baseline test run, join the run branch one at a time, and a clash, a broken join, or a test a joined ticket made wrong is fixed on top of the run branch. A ticket that waits between steps (for a shared baseline, the join queue, or the start queue) is journaled as `ticket_waiting`.

Reached by: any run with more than one ticket.

Tests:

- `packages/engine/src/core/decide-many-tickets.test.ts`
- `packages/engine/src/core/run-many-tickets.e2e.test.ts`
- `packages/engine/src/core/run-ticket-waits.e2e.test.ts`
- `packages/engine/src/core/decide-baseline-reuse.test.ts`
- `packages/board/server/baseline-reused-panel.test.ts`
- `packages/engine/src/core/run-broken-join.e2e.test.ts`
- `packages/engine/src/core/undo-join.test.ts`
- `packages/engine/src/git/git-adapter.test.ts`
- `packages/engine/src/core/run-rebase-reinstall.e2e.test.ts`
- `packages/engine/src/core/run-rebase-test-update.e2e.test.ts`
- `packages/engine/src/core/decide-test-update.test.ts`
