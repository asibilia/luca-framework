# Run control

How a run gets stuck and moves on, survives a crash, reads its config, waits on limits, counts its tokens, and is looked back on.

## Stuck work and replies

Stuck work is told to the spec's owner as a comment, the rest of the run keeps building, and the owner's replies (`retry`, `skip`, `stop`, `ship`) move it on, with the `/luca-unstick` skill to read why.

Reached by: a "Needs you" card and its reply buttons on the board, a reply on the spec issue, or `/luca-unstick`.

Tests:

- `packages/engine/src/core/decide-stuck.test.ts`
- `packages/engine/src/core/decide-stuck-retry.test.ts`
- `packages/engine/src/core/decide-stuck-skip.test.ts`
- `packages/engine/src/core/decide-stuck-setup-file.test.ts`
- `packages/engine/src/core/decide-stuck-final-review.test.ts`
- `packages/engine/src/core/decide-stuck-undo.test.ts`
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
- `packages/engine/src/journal/journal-replay.test.ts`
- `packages/engine/src/core/decide-crash-recovery.test.ts`
- `packages/engine/src/core/run-crash-recovery.test.ts`
- `packages/engine/src/core/run-crash-recovery.e2e.test.ts`
- `packages/engine/src/core/run-crash-recovery-git.e2e.test.ts`
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
