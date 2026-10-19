# The board and the command line

How a user sees and starts runs, the `luca` commands, the publish package, the engine's docs, and the repo's own tooling.

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
- `packages/board/server/board-panel-state-usage.test.ts`
- `packages/board/server/board-panel-state-waits-and-stops.test.ts`
- `packages/board/server/board-panel-state-fix-loops.test.ts`
- `packages/board/server/board-panel-state-final-review.test.ts`
- `packages/board/server/board-panel-state-run-branch.test.ts`
- `packages/board/server/board-panel-state-agent-messages.test.ts`
- `packages/board/server/ticket-stages-panel.test.ts`
- `packages/board/server/ticket-stages-panel-reviewing-and-joining.test.ts`
- `packages/board/server/ticket-stages-panel-stuck.test.ts`
- `packages/board/server/ticket-stages-panel-final-review.test.ts`
- `packages/board/server/ticket-stages-panel-old-journals.test.ts`
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
- `packages/engine/src/cli/run-modes-spec.e2e.test.ts`
- `packages/engine/src/cli/run-modes-clef.e2e.test.ts`
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
