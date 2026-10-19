# Agents

How agents run, what guards them, how they talk to each other, what they remember, and the services they reach.

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
- `packages/engine/src/jev/jev-shadow-findings.e2e.test.ts`
- `packages/board/server/decision-model-panel.test.ts`

## Model routing and its score

Each routed role has a model floor, and `luca models` reads this repo's run journals and scores each routed role per model from the ticket review's findings, beside fix rounds, stuck tickets and tokens, against the tickets where the decision model picked that model in shadow mode.

Reached by: `models.floors` in a repo's `.luca/config.json`; `luca models` in a repo.

Tests:

- `packages/engine/src/models/model-score.test.ts`
- `packages/engine/src/models/model-score-verdicts.test.ts`
- `packages/engine/src/cli/luca-command.test.ts`

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
- `packages/engine/src/agents/claude-launcher-follow-ups.test.ts`
- `packages/engine/src/agents/claude-launcher-messages.test.ts`
- `packages/engine/src/agents/claude-launcher-result.test.ts`
- `packages/engine/src/agents/claude-launcher-stops.test.ts`
- `packages/engine/src/agents/role-instructions.test.ts`
- `packages/engine/src/agents/role-results.test.ts`
- `packages/engine/src/agents/scripted-launcher.test.ts`
- `packages/engine/src/core/run-session-close.e2e.test.ts`
- `packages/engine/src/core/run-session-close-interruptions.e2e.test.ts`
- `packages/engine/src/core/run-session-close-ticket-ends.e2e.test.ts`

## The GitHub tracker

The tracker reads specs and tickets, adds and removes labels, opens PRs, and posts each engine comment once, even when a step is redone after a crash.

Reached by: every real run, through the `gh` CLI.

Tests:

- `packages/engine/src/tracker/github-tracker.test.ts`
- `packages/engine/src/tracker/in-memory-tracker.test.ts`
- `packages/engine/src/tracker/post-comment-once.test.ts`
