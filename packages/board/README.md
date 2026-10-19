# Luca board (Paseo plugin `luca-board`)

The board is the live view of a Luca run inside Paseo. You start a run by typing `/luca-run <spec>` in a Paseo chat, and pick one back up with `/luca-run resume <run id>` (see [Resuming a run](docs/restarts-and-resume.md#resuming-a-run)). The engine runs as its own background process and sends its journal to this plugin. The plugin shows the run in two places: a side panel, and live rows in the chat where you started the run.

The code reuses the designs of the board prototype (`prototype/paseo-board`: variant B v2 for the panel and variant C for the rows), but none of its code.

## Docs

Each topic has its own page under `docs/`:

| Page | What it covers |
| --- | --- |
| [The panel and the chat rows](docs/panel-and-rows.md) | What the side panel shows from top to bottom (plan usage, banners, **Needs you**, the tickets' stages, **For a person**, the final review's lenses), and the live rows in the chat. |
| [The route and the journals on disk](docs/the-route.md) | What `/luca-run` does, how the engine is spawned and why with `--no-env-file`, and how the plugin reads the runs folder. |
| [The `engine.event` contract](docs/engine-event.md) | The RPC the engine sends its journal records through: order, gaps, `ended`, rejected sends, and what survives a plugin restart. |
| [Restarts and resuming a run](docs/restarts-and-resume.md) | How the plugin notices a dead engine and starts it again from its journal, and `/luca-run resume`. |
| [The vocabulary](docs/vocabulary.md) | The journal kinds the board reads, the replies and stuck work, and the limit and usage shapes. |
| [The run, its tickets, and their agents](docs/vocabulary-run-kinds.md) | The kinds for starting and resuming, intake, snapshots, worktrees, the baseline, and what each agent does. |
| [Checks, joins, stuck tickets, and the PR](docs/vocabulary-ticket-kinds.md) | The kinds for commits, gates, joins and rebases, stuck tickets, the owner's replies, and the PR. |
| [Stops, limits, the final review, and memory](docs/vocabulary-engine-kinds.md) | The kinds for a stopped run, plan limits and the usage line, the decision model, agent messages, the final review, memory, and the scheduler's steps. |
| [Replying from the board](docs/replying.md) | The reply buttons on stuck work, `reply.post` and its checks, and **Help me**. |
| [Settings, install, and develop](docs/settings-and-install.md) | The engine path and usage lines, installing the plugin, its logs and limits, and working on it. |
