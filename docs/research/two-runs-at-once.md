# Two runs at once, in two repos

Question (#422, map #418): if two `/luca-run`s go at the same time in two different repos, what breaks or gets mixed up today?

Sources: the code on `main` at `6e32f7c4c`, the `@getpaseo/client` 0.9.1 package the engine uses, and the Paseo 0.9.2 daemon inside `/Applications/Paseo.app`. No real runs were started. The only thing run was `luca-run --unfinished`, which just reads.

## Short answer

Nothing breaks a run. Each run has its own id, journal folder, worktrees, run branch, log file, board token, and board queue. The auto-restart only restarts the run whose engine is gone.

Four things are confusing or loose:

1. **"This run used" is wrong while two runs share the plan.** A run works out its plan use from the plan's window readings. Those readings include the other run's use, so each run's number counts both runs.
2. **Runs don't tell each other about a limit.** Run B learns about a limit that run A hit only when one of B's own agents is turned away. That wastes little, because the plan turns B's agents away anyway. But nothing shares the weekly Opus cap between runs, so one run can use it all up.
3. **Both engines log in to the Paseo daemon with the same client id** (`luca-engine`). So the daemon puts both in one session, and each engine also gets the other's replies. It drops them, because each reply has a request id, so this does no harm today.
4. **Two learners can update the same `default` memory** at the end of their runs. The last write wins.

A run started from the command line, not from `/luca-run`, shows in **every** workspace's panel. It can even be the run a workspace's panel opens on.

## Problems

| # | Problem | What breaks | How bad | Fix size |
| --- | --- | --- | --- | --- |
| 1 | Plan use per ticket and per run counts the other run's use | "This run used" and the per-ticket "+N%" show too much | Confusing display | Small (label it "the plan moved N% while this ran"), medium to split it for real |
| 2 | No shared limit wait, no shared Opus budget | Each run finds a limit by itself. Nothing splits the weekly cap between runs | Harmless today. A design question for the map (the cap is shared by decision) | Medium (a shared limit file under `~/.local/state/luca/`), large for a real budget |
| 3 | Command-line runs show in every workspace, and may be the one it opens on | A workspace can open on another repo's run | Confusing display | Small |
| 4 | Both engines use the Paseo client id `luca-engine` | The daemon joins both engines into one session. Each gets the other's replies and drops them | Harmless today | Small (one client id per run) |
| 5 | Two learners updating the same `default` memory | The lesson written first is lost, or two near-copies are added | Harmless, rarely happens | Small to accept. Medium to fix (read before update) |
| 6 | Registry written by one in-memory copy | Safe while one plugin process runs. A second copy alive at the same time (such as during a reload) could overwrite the other's changes | Harmless, edge case | Small (read the file again before each write) |

## Details

### Journal paths: per run, no collision

- Each run's journal is `<runs_dir>/<run_id>/journal.jsonl` (`packages/engine/src/journal/journal.ts:98-105`). The runs folder is `$LUCA_RUNS_DIR` or `~/.local/state/luca/runs` (`journal.ts:94-96`). The board reads the same path (`packages/board/server/run-journals.ts:19-34`).
- The plugin makes each run id: `luca-<utc second>-<4 random letters or digits>` (`packages/board/server/engine-launch.ts:54-64`). It picks a new one if the id is already known in memory (`packages/board/server/board-server.ts:489-492`). A clash would need the same second and the same 4 characters (1 in 1.7 million). A command-line run with no `--run-id` gets a timestamp plus 8 characters of a UUID (`journal.ts:108-115`).
- One engine process owns each journal and appends with `appendFileSync` (`journal.ts:74-85`). No other process writes it.
- Worktrees live in the run's folder: `<run_dir>/run-branch` and `<run_dir>/tickets/<n>` (`packages/engine/src/core/execute-build.ts:873`, `:889`). The run branch is `luca/spec-<n>-<run_id>` (`execute-build.ts:72-79`). Reports go to `<run_dir>/reports` (`execute-build.ts:118`).

### Board run registry: one writer, atomic writes, no lock

- The registry is `$LUCA_BOARD_STATE_DIR/runs.json` or `~/.local/state/luca/board/runs.json` (`packages/board/server/run-registry.ts:49-59`).
- It is read once, when the plugin starts (`run-registry.ts:105`). Then every change edits the copy in memory and writes the whole file (`run-registry.ts:122-153`). The write goes to `runs.json.<pid>.tmp`, then a rename (`run-registry.ts:107-120`), so the file is never half written.
- JavaScript runs one thing at a time, and every write is synchronous. So two runs in one plugin process can't mix their changes: the read-change-write never overlaps.
- There is no file lock and no second read before a write. If two copies of the plugin ever run at once (for example while a plugin reload is still shutting down the old one), each would write its own list over the other's (problem 6). The old copy does finish its queued work on the way out (`packages/board/index.server.ts:101-104`).
- The file keeps the last 50 runs (`run-registry.ts:43`, `:124-127`). A run dropped from it loses its token, so the board would stop taking its events. That would take 50 newer runs while it is still going.

### Engine watch and auto-restart: only the dead run is touched

- Every 15 s (`packages/board/server/engine-watch.ts:16`, `index.server.ts:95-99`) the plugin checks the runs it started that still need an engine (`board-server.ts:715-717`, `:828-830`).
- It reads every process's command line with `ps -axww` (`packages/board/server/list-processes.ts:16-35`). A run is alive when some command line has `--run-id <id>` or `--resume <id>` as whole words (`engine-watch.ts:81-99`). Only runs with no live engine go on (`board-server.ts:843-847`). If `ps` fails, nothing is restarted (`board-server.ts:836-841`).
- Only a dead run is restarted, with its own repo, token, and log (`board-server.ts:766-822`, `engine-watch.ts:109-122`). The other run's engine is never touched. Each run's work goes through its own queue (`board-server.ts:213-226`, `:900-907`), and only one check runs at a time (`board-server.ts:911-934`).
- A run in a limit wait or a reply wait is still alive: its engine sleeps in the same process (`packages/engine/src/limits/limit-wait.ts:29-40`, `packages/engine/src/core/execute-stuck.ts:23`, `:79`). So it is never taken for dead.
- Nothing in the engine or the board kills processes by name. The engine only kills its own command after a timeout (`packages/engine/src/shell/run-command.ts:45`).
- `luca-run --unfinished` reads every journal in the runs folder (`packages/engine/src/cli/run-modes.ts:312-329`, `:399-407`), and the plugin gives it 20 s (`engine-watch.ts:19`). Today there are 6 journals (17 MB), and it took 0.45 s. It grows with how many runs have ever happened, not with how many run at once. If it ever takes over 20 s, a dead run is marked stopped, not restarted (`board-server.ts:866-873`).

### Panel: filters by workspace, except command-line runs

- `board.read` lists the plugin's runs whose `workspace_id` is the panel's workspace (`board-server.ts:684-687`). A `/luca-run` in repo A never shows in repo B's panel.
- Runs the plugin didn't start (command-line runs, or runs dropped from the registry) are added to **every** workspace's list (`board-server.ts:688`, `:384-420`, doc at `:151-153`), up to 50 (`board-server.ts:142`).
- With no run picked, the panel opens on the newest run in that list (`board-server.ts:691-699`). So a newer command-line run from another repo can be what a workspace's panel opens on (problem 3). A fix: keep only the outside runs whose `run_started.repo` matches the workspace's folder. `board.read` would then need that folder.
- Chat rows go to the chat each run was started from (`board-server.ts:238`), so they can't mix.
- No test starts two runs in two workspaces. The rebuild tests use one workspace (`packages/board/server/journal-rebuild.test.ts:475`, `:494`).

### Logs: one file per run

- Each run logs to `/tmp/<run_id>.log` (`index.server.ts:76`, `board-server.ts:494`). A restart appends to the same file (`board-server.ts:773`, `:781`). The engine's stdout and stderr go there (`packages/board/server/spawn-detached.ts:30-37`).
- The plugin's own lines go to the daemon's log, each with its `[run_id]` in front (`index.server.ts:27`, for example `board-server.ts:242-244`).

### Limit waits: each run finds out by itself

- A run's plan state comes only from its own journal. A limit is set when one of its own agent sessions has a rejected reading (`packages/engine/src/journal/replay.ts:601-619`, `packages/engine/src/limits/plan-signals.ts:63-95`). Nothing reads another run's journal or any shared file.
- So run B learns about the limit when one of its own agents is turned away. Then B starts its own limit wait, posts its own comment on its own spec (`packages/engine/src/core/execute.ts:196-224`), and waits until the same reset time plus 60 s (`packages/engine/src/core/decide-plan.ts:66-84`).
- Waste is small. Once the plan is used up, it turns B's agents away at once. Any agent cut off mid-turn would have been cut off anyway. A step cut off by a wait is taken again after it (`packages/engine/src/core/decide.ts:45-48`).
- Billing signs work the same way, per run (`plan-signals.ts:68-85`, `decide-plan.ts:56-65`). Each run stops for billing when it sees overage itself.
- Nothing splits the weekly Opus cap. Two runs use it twice as fast, and neither knows how much the other has left (problem 2).
- Plan use is worked out from how far each plan window moved between readings (`packages/engine/src/limits/plan-usage.ts:92-146`). The window is the whole plan, so it also moves with the other run's work. The panel shows this as "This run used" and as each ticket's "+N%" (`packages/board/client/board-panel.tsx:729-733`, `:1151-1156`). With two runs, both numbers count both runs (problem 1). The token counts next to them are right: they come from the run's own sessions (`plan-usage.ts:104-118`).

### Paseo daemon link: one connection per engine, same client id

- Each engine opens its own websocket to the daemon, on its first send, and keeps it for the run (`packages/engine/src/board/paseo-board-link.ts:34-46`, `:83-89`). It finds the daemon through `PASEO_HOST` or `~/.paseo/paseo.pid` (`paseo-board-link.ts:20-32`).
- Every engine sends the same `clientId: 'luca-engine'` (`paseo-board-link.ts:38`). The client puts it in its `hello` (`@getpaseo/client` `dist/daemon-client.js:4113`).
- The daemon keys sessions by user and client id. A second `hello` with a known key joins the same session (`resumeSession`, which adds the new socket to `existing.sockets`, in the Paseo 0.9.2 daemon in `app.asar`). The daemon log shows these as `"clientId":"luca-engine"` with `"resumed":...` in `~/.paseo/daemon.log`.
- The daemon sends a plugin RPC reply to the whole session (`this.emit({ type: "plugin.rpc.invoke.response", ... })`, which goes to every socket). So each engine also gets the other's replies. The client only takes a reply whose request id matches (`daemon-client.js:919`), and request ids are random UUIDs (`daemon-client.js:4080-4082`). So nothing mixes today (problem 4).
- When one engine closes, the session stays for the other ("Client socket disconnected; session remains attached" in the daemon). A client id per run, such as `luca-engine-<run_id>`, would remove the shared session.
- Each event carries the run id and that run's token, checked with a timing-safe compare (`board-server.ts:619-633`). One run can't write another run's board.

### Memory: per-run vault, shared `default`

- Each engine opens its own MCP connection to MuninnDB (`packages/engine/src/memory/muninn-mcp-client.ts:131`, `:168`). The address comes from `LUCA_MUNINN_URL` or `~/.claude.json` (`muninn-mcp-client.ts:53-100`).
- The project vault is read from each repo's `.luca/config.json` and kept in the run's `run_started` (`run-modes.ts:201-212`). Searches cover that vault and `default` (`packages/engine/src/memory/memory-recall.ts:21-27`). So run A searches only A's project vault plus `default`, and run B the same for B.
- Runs share `default` on purpose. Run B can recall a lesson run A saved minutes before.
- Saving: the learner searches the vault for a close memory. It updates that one (`muninn_evolve`, new content in place of the old) or adds a new one (`packages/engine/src/core/execute-memory.ts:213-240`, `:145-161`). If two runs end together and both pick the same `default` memory, the second update replaces the first (problem 5). If both search before either saves, both add, and there are two near-copies. Adds are safe to repeat thanks to `op_id` (`execute-memory.ts:128-131`).

### Global things

- **Temp files and folders** have random names: `luca-engine-exclude-<uuid>` (`packages/engine/src/guards/worktree-state.ts:241`), `mkdtemp` for `luca-rebase-` and `luca-demo-` (`packages/engine/src/git/git-adapter.ts:416`, `run-modes.ts:546`). A demo keeps its journal inside its temp folder (`run-modes.ts:549-551`).
- **Ports**: none. The message tool and the guard hooks run inside the engine (`createSdkMcpServer`, `packages/engine/src/agents/message-tool.ts:43-48`).
- **Lock files**: none of Luca's own. Git locks live in each repo's own `.git`, and the repos are different.
- **Agents** load nothing from the machine: `settingSources: []` (`packages/engine/src/agents/claude-options.ts:207`).
- **Env**: the board token is set per spawn (`board-server.ts:451-462`). Other env vars (`LUCA_RUNS_DIR`, `PASEO_HOST`, `LUCA_MUNINN_URL`, `TYPESAFE_API_KEY`) are read-only and the same for both runs.
- **Singletons**: the plugin has one board server, one registry, and one Paseo handle for all runs (`index.server.ts:41-44`, `:53`). Each run has its own entry, token, queue, and chat inside it.
- **Settings**: the engine path and Bun path are host-wide (`board-server.ts:465-473`). Changing them mid-run changes what a restart uses, for both runs.

## Checked and fine

- Journal folders, worktrees, run branches, and report files are per run.
- Registry writes are atomic, and one process can't interleave them.
- Auto-restart finds dead engines one run at a time and never touches a live one. A run waiting (limit or reply) stays alive.
- Board events need the run's own token, and each run's work has its own queue.
- The panel keeps `/luca-run` runs to their own workspace, and chat rows go to each run's own chat.
- Log files are per run.
- MuninnDB connections are per engine, and the project vault comes from each repo's own config.
- No fixed temp names, ports, or Luca lock files.

## Outside the engine (not checked in code)

- **Machine load.** Each run already builds several tickets at once. Two runs double the agents, installs, and test suites on one Mac. Slower tests can hit gate timeouts and start fix loops.
- **The repos' own tests.** If two repos' test suites use the same fixed port or local database, they can clash. Tickets inside one run already share these, so this is a per-repo setup question.
- **Two runs in the same repo** is not what #422 asks about, and nothing stops it. Branches and worktrees would still be separate, but both runs would work the same issues, and they would share one `.git`.
