# @luca/engine: the board and the command line

## The board

The engine sends its journal records to the board plugin as they are
appended, verbatim: the event *is* the record (`seq`, `time`, `kind`,
`ticket`, `role`, `content`). The plugin keeps and reduces the run's state;
the engine computes nothing for the board. Every kind above maps onto the
board, the decision model's included (only counted, since shadow mode
decides nothing); see
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
run finished (PR opened, or nothing to do, such as every ticket already
done), 1 when it stopped (refused,
stuck, stopped by the launcher, crashed, or `--resume` of a run with no
journal to go on from), and 2 on bad flags. `--unfinished` exits 0 once it
printed the list.

**A real run** (`--spec`) builds with real Claude agents: `runSpec` gets
`createClaudeLauncher({})` (Claude Opus 5.5 at `high` effort, every guard on,
paid by your Claude plan; see Guards) and closes its open sessions with
`closeAll()` however the run ends. It asks the decision model, Clef, in
shadow mode, with the credentials from Luca's own env file (see "The
decision model in shadow mode"); with none, the decision model is off for
the run: one line and one `decision_model_off` record, no asks, and the run
goes on. A launcher stop (`run_stopped`) ends the process
with "Run stopped: <reason>"; run it again with `--resume <run-id>` (or the
same `--spec` and `--run-id`) to pick the step up again. A crash ends it with
"The engine crashed: <error>". Both messages end with how to go on
(`resumeCommand`): `/luca-run resume <run-id>` in a Paseo chat when the board
started the run, so the board stays attached, else `luca-run --resume
<run-id>`. `runSpec` takes the launcher as an argument, so its tests
hand in scripted agents and never call a model.

**The demo** (`--demo`) is safe to try the board with: it makes the practice
repo (`src/testing/practice-repo.ts`, with a local bare `origin`) in a temp
folder, fills an in-memory tracker with the practice spec and two tickets
(#12 blocked by #11), and runs the engine with scripted agents that take
1.5 s per turn. The decision model is off (the demo never reads its
credentials or asks it), and memory is a fake
MuninnDB with two seeded memories and a scripted learner, so their records
show up but nothing leaves the machine. No GitHub, no models. It prints the temp
paths and the PR it opened in memory, then removes the temp folder (which
also holds its journal).
