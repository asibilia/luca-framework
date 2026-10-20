# @luca/engine: the board and the command line

## The board

The engine sends its journal records to the board plugin as they are
appended, verbatim: the event *is* the record (`seq`, `time`, `kind`,
`ticket`, `role`, `content`). The plugin keeps and reduces the run's state;
the engine computes nothing for the board. Every kind above maps onto the
board, the decision model's included (only counted, since shadow mode
decides nothing); see
"The board's vocabulary" in `packages/board/docs/vocabulary.md`.

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

## The live file

While a run goes, the engine keeps its **live file**, `live.json`, in the
run folder beside the journal (`runLiveFilePath`, `src/core/live-file.ts`),
for the board to show what is happening between journal records (#628). It
is never journaled and never replayed, so a run's journal is the same with
it or without it. `runSpec` gives `runEngine` its path; without `live_file`
(the demo, most tests) there is none.

```ts
{
  written_at: string,            // ISO; set on every write
  plan_usage: object | null,     // the run's first rate_limit_event reading, with arrived_at
  agents: [{
    ticket: number, role: string, model: string | null,
    tokens: number,              // the turn's tokens so far, cache reads included
    action: { tool, target, at } | null,              // the latest action
    open_call: { tool, target, started_at } | null,   // a tool call still running
    activity: number[],          // 30 counts, one per second, oldest first (#631)
  }],
  waits: [{                      // a ticket's check waiting for a slot (#632)
    ticket: number, for: 'prepare_slot' | 'test_slot',
    in_use: number, slots: number, since: string,
  }],
}
```

A `target` is a path relative to the worktree, or the first words of a
command; the file never holds a prompt, a file's contents or a command's
output. Each write replaces the whole file (written aside, then renamed),
at most once a second while something changed and at least every 5
seconds while the engine runs, so its `written_at` tells a quiet agent from
a dead engine. When the run ends, it is written one last time with no
agents.

What goes in comes from the launcher: `launch` and `followUp` take an
optional `on_progress`, which the Claude launcher calls each time the turn
changes (`src/agents/turn-progress.ts`): the tokens of each SDK message so
far, the latest tool call it saw, the call the guard hook let through until
its result comes back, and the turn's plan-usage readings, the first of
them within seconds. `runEngine` wraps its launcher so each turn's progress
lands in the file while the turn runs.

An agent's `activity` feeds the board's heartbeat (#631): each progress
heard is one tick in the second it came, and each second a tool call is
open adds one low tick, so a long command shows a steady ripple. The
launcher turns on the SDK's partial messages (`includePartialMessages`), so
each streamed chunk is heard too and a thinking model still moves the
heartbeat. Nothing of a chunk is kept: the tokens come from the whole
messages, and the journal is the same with partial messages on.

A wait inside a step goes in too (#632): `runEngine` runs each ticket's
step with the live file listening for slot waits (`hearSlotWaits`,
`src/gates/slot-waits.ts`). A prepare check or a test run that must wait
for a slot (`PREPARE_SLOTS`, `TEST_SLOTS`) adds a `waits` entry as it
starts waiting, with the slots in use, and takes it out once it has the
slot. The journal gets nothing new: the wait's length is already the
check's `wait_ms`.

## The command line: `luca-run`

```bash
bun packages/engine/src/cli/luca-run.ts --spec <n> [--repo <path>] [--run-id <id>] [--base <branch>] [--alongside] [--board-plugin <id>]
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
| `--alongside` | Skip the repo wait (below): start now, even while an earlier run on the repo is going. Journaled as `repo_wait_skipped`. Only with `--spec`. |
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
`createClaudeLauncher({})` (agents on `opus` at `high` effort, every guard on,
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

**The repo wait** (#615). One run per repo at a time: a run started while
an earlier run on the same repo is going waits for it, before intake reads
the tickets and before any worktree exists. The engine lists the going
runs with `goingRuns` (`src/cli/going-runs.ts`: the runs folder's journals
and the board's registry, checked with `ps`) and keeps those on the same
repo that started earlier, by their `run_started` time, then by run id
(`earlierRuns` in `src/core/decide-repo-wait.ts`). That order is the
tie-break: two runs started together never wait for each other. The run
journals `repo_wait_started { runs: [{ run_id, spec }] }` and tells its
spec issue once which runs it waits for (`postCommentOnce`). Then it naps a
minute and looks again, and journals `repo_wait_ended` once none is going,
then goes on to intake. Like the other waits it has no step records: an
engine killed mid-wait waits again on resume, and the spec issue still
hears of it once. After 24 hours the run is stuck (`run_stuck`, reason
`repo_busy`): a bare `retry` waits 24 hours more, and `stop` ends the run.
`luca-run --alongside` journals `repo_wait_skipped` and goes straight on.
Without `going_runs` (tests, the demo), there is no repo wait.

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
