# Luca board: restarts and resuming a run

What the plugin does when an engine dies, and how `/luca-run resume` picks a
run back up. Both start the engine the way [The route](the-route.md) does.

## Restarts

If an engine process dies (a crash, a kill, a reboot) before its run ends, the plugin notices and starts it again from its journal (#375).

**When.** When the plugin starts, and every 15 s after that. The first check isn't awaited, because plugin start must return within 30 s. Only one check runs at a time.

**What it checks.** Every run in the registry that hasn't ended (no `ended`) and isn't over (not done, refused, or nothing to do). For those, it lists every process's command line with `ps -axww -o command=`. A run whose command line has `--run-id <id>` or `--resume <id>` (as whole words) still has its engine, and is left alone. If `ps` fails, the plugin does nothing that time: two engines on one run would be far worse than a late restart.

**Which runs can go on.** For the runs whose engine is gone, the plugin asks the engine once, with a 20 s timeout:

```
<bun> --no-env-file --config=<engine_dir>/bunfig.toml <engine_path> --unfinished
```

It prints `{ "runs": [{ run_id, restart, reason, message }] }` (see the engine's README, "Crash recovery"). Then for each run:

- **`restart: true`**: the plugin starts the engine again, detached, with the run's token in `LUCA_BOARD_TOKEN` and its output appended to the same log:

  ```
  <bun> --no-env-file --config=<engine_dir>/bunfig.toml <engine_path> --resume <run id> --repo <repo> --board-plugin luca-board
  ```

  The chat gets a row: "The engine was gone, so Paseo restarted the run from its journal (restart 1 of 3)." The engine resends its journal, and the board skips the records it already has.
- **A launcher stop** (`launcher_stopped`, such as the wrong login or model): not restarted, because it would stop the same way. Fix it, then type `/luca-run resume <run id>`.
- **A billing stop** (`billing_stopped`): never restarted. Start a new run once per-token billing is off.
- **Not listed**: its journal has nothing to pick up again. The engine died before it wrote one, or the run already ended.
- **A demo run**: never restarted, because its journal was in a temp folder that is gone. Start a new one with `/luca-run demo`.
- **The cap**: a run is restarted at most 3 times by the plugin. If it dies a 4th time, it isn't restarted again, so a run that dies at every start can't loop forever.
- **The check failed** (no engine found, `--unfinished` failed, timed out, or printed something else): the plugin can't tell whether the run can go on, so it doesn't restart it, and says how to go on by hand with `/luca-run resume <run id>`.

**How "engine stopped" looks.** A run that isn't restarted gets `ended` with `ok: false` and the reason in words. The header row and the panel then show "The engine stopped: ...", with the log path where it helps, instead of staying on "starting". Where the run can go on, the words end with `/luca-run resume <run id>`. `ended` and `restarts` are kept in the registry, so a run marked this way is never restarted again, even after a plugin restart, until you resume it or it comes back with a live engine (see below).

**When the engine ends itself.** An engine that crashes, or that the launcher stops, tells the board how it ended, so the plugin never checks or restarts it. Its message says how to go on: "The engine crashed: <error>. To go on from its journal, type /luca-run resume <run id> in a Paseo chat."

## Resuming a run

`/luca-run resume <run id>` picks a run the plugin started back up from its journal, with the board attached (#493). Use it after a crash, a launcher stop you fixed, or when the 3 automatic restarts are used up. The run id is in the run's header row and the panel.

It is refused, and nothing starts, when:

- the plugin doesn't know the run (it didn't start it, or the run is older than the 50 the registry keeps). A run started from the command line goes on with `luca-run --resume <run id>`; the board follows it from its journal.
- it is a demo. A demo can't be picked up again.
- the run is over (done, refused, or nothing to do).
- its engine is still running (`ps` shows `--run-id <id>` or `--resume <id>`).
- `ps` fails. Two engines on one run would be far worse than trying again.

Otherwise the plugin:

- gives the run a new token, clears its `ended`, and sets its `restarts` back to 0, so it gets 3 automatic restarts again;
- keeps its chat, workspace, repo, and log;
- starts the engine detached, the same way as an automatic restart:

  ```
  <bun> --no-env-file --config=<engine_dir>/bunfig.toml <engine_path> --resume <run id> --repo <repo> --board-plugin luca-board
  ```

- adds a row to the chat the run started in, "The run was resumed from its journal with /luca-run resume.", and updates its header row.

The engine resends its journal with the new token, so the chat rows and `engine.event` work again. Resumes and the engine checks run one at a time, so they never both start an engine for the same run.

## Following runs on disk, and runs that come back

The board reads every run's journal on disk, its own runs included (#701). Pushes from the engine are the fast path, not the only one. On each `board.read` and each 15 s engine check, a journal that grew (by size or change time) is read again, and only the records past the run's last seq are applied. Pushes and disk reads share that seq, so a record adds its chat rows once, whichever way it comes first. A record read from disk adds its rows at once; a later push of it adds nothing. The plugin's own runs don't count toward the 50 runs it didn't start that it shows.

**`luca-run --resume` in a terminal.** It runs without the run's token, so `engine.event` refuses its pushes. The board still follows it from its journal: its chat gets rows, its header updates, and its reply buttons, "Help me" and restarts work as for any run.

**A run marked ended that comes back.** When the board sets a run's `ended`, the registry also keeps `ended_at_seq`, the newest seq it had then (an entry from before this gets its journal's newest seq when the plugin loads). On each engine check, a run with `ended` whose journal's newest seq is past `ended_at_seq`, and whose command line shows in `ps` (`--run-id <id>` or `--resume <id>`), comes back:

- its `ended` and `ended_at_seq` are cleared, and the panel no longer shows it ended;
- its header row is added again;
- its chat gets the row "Resumed from the command line." (id `<run id>-resumed-cli-<newest seq>`, so each comeback gets its own row);
- its `restarts` count is kept.

With no live engine, or when `ps` fails, it stays ended. Once back, it is like any other live run: if its engine then dies, the plugin may restart it with the registry's token.

## Runs in other checkouts

A run the plugin didn't start shows in every workspace whose folder is in the same git repo as the run's `repo`: the same `git rev-parse --git-common-dir`. So a run started in a second worktree shows in the main checkout's workspace. Each folder's answer is kept while the plugin runs. When git fails for a folder (not a repo, or gone), that folder only matches a run on exactly that folder.
