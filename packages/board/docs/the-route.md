# Luca board: the route and the journals on disk

How a run starts from a chat, and how the plugin reads the engine's runs
folder. It goes on in [The `engine.event` contract](engine-event.md).

## The route

1. `/luca-run <spec>` (a client slash command) calls the plugin RPC `run.start` with the chat's agent id, its workspace id, its working directory, and the args. Then it opens the panel.
2. `run.start` does the following:
   - It reads the args: `123`, `#123`, `demo`, or `resume <run id>` (see [Resuming a run](restarts-and-resume.md#resuming-a-run)). Anything else is an error that shows the usage.
   - It finds the engine (see [Settings](settings-and-install.md#settings)).
   - It mints a run id (`luca-<yyyymmdd-hhmmss>-<4 random [a-z0-9]>`, UTC) and a random per-run token.
   - It records the run in the run registry and appends the chat's header row ("starting").
   - It spawns the engine **detached**, by absolute paths, and returns at once:

     ```
     <bun> --no-env-file --config=<engine_dir>/bunfig.toml <engine_path> --spec <n> | --demo --repo <cwd> --run-id <id> --board-plugin luca-board
     ```

     The env is the daemon's env plus `LUCA_BOARD_TOKEN=<token>`. Output goes to `/tmp/<run id>.log`.
   - **Why the extra Bun flags.** The engine runs in the target repo's folder, so a plain `bun` would load that repo's `.env` and its `bunfig.toml`, including any `preload` script, into the engine. On someone else's repo, their preload would run inside Luca. So every launch (a new run, `--resume`, and the `--unfinished` check) passes `--no-env-file` and `--config=` pointing at Luca's own `bunfig.toml`, which ships next to the engine's `luca-run.ts` and preloads nothing. Agents don't need this: they already get an allow-listed env.
   - It returns `{ ok, message, run_id }`. The message names the log file. If the engine can't be found, it returns `ok: false` and says what to set.
3. The engine sends its journal records through `engine.event`, described in the next section. The plugin keeps each run's board state and appends the chat rows.
4. The panel polls `board.read` every 2 s. Its answer also carries the chat the selected run started in (`chat_agent_id`, `null` for a run the plugin didn't start) and the replies the board posted for it (`posted`).

## Journals on disk

The plugin also reads the engine's runs folder: `$LUCA_RUNS_DIR`, or `~/.local/state/luca/runs` by default (the engine's own default). Each run's journal is `<runs folder>/<run id>/journal.jsonl`. The plugin only reads it, never writes it, and replays it with the same reducer the `engine.event` records go through, so the journal stays the one source of truth. A line that isn't a record (such as a half-written last line) is skipped and logged.

- **On start and after a reload**, every run in the registry is rebuilt from its journal before the plugin answers any RPC. A finished run shows done, stopped, or stuck again, not "starting".
- **Runs the plugin didn't start** (for example, started with `luca-run` from the command line) are read on each `board.read`, so they show up too, but only in the workspace whose folder is the repo their `run_started` record names. `board.read` gets the workspace's folder as `directory`; a run with no repo, or a read with no folder, shows nowhere, and asking for another repo's run by id opens the workspace's own newest run instead. They are read-only: their state shows in the side panel, but they get no chat rows, `engine.event` refuses them (the plugin doesn't know their token), and they are never restarted. Only the 50 whose journals changed last are shown. A journal is read again only when its size or change time moves, and then only its new records are applied.
