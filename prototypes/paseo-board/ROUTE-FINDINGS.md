# Route findings (#353, PROTOTYPE, throwaway)

## Verdict

**The route works.** A plain Bun process fed the board plugin with a real run, and both views got it.

The path: `/luca-run` → plugin RPC `run.start` (Node) → a detached Bun process → `@getpaseo/client`'s `invokePluginRpc("luca-board-prototype", "engine.event", …)` → the plugin keeps the snapshot for the side panel (B) and appends rows into the chat (C).

The replay: the tracer bullet's final Opus run (`run-20260923-123042-l47v`: spec #351, ticket #352, PR #354). 296 journal lines became 37 board events, sent over 90 s.

## The checks

**Does `/luca-run` start Bun from the plugin (Node) without hitting the 30 s limit?** Yes.
- `run.start` answered in 14 ms, and the spawn took 2 ms. The plugin never waits for the child.
- The child uses `detached: true`, output goes to `/tmp/luca-run-*.log`, and `unref()` lets the plugin forget it.
- Bun is found by absolute path (`~/.bun/bin/bun`, then `/opt/homebrew/bin/bun` and `/usr/local/bin/bun`, then `zsh -lc 'command -v bun'`).

**Does `@getpaseo/client` work under Bun?** Yes, on the first try.
- Import `DaemonClient` from `@getpaseo/client/internal/daemon-client`. Bun's global `WebSocket` is enough, so you don't need `ws` or a `webSocketFactory`.
- **Connecting:** read `listen` from `~/.paseo/paseo.pid` (here `127.0.0.1:6767`) and connect to `ws://<listen>/ws` with `clientType: "cli"`.
- **Auth:** this daemon has no password, so none was needed. If one is set, pass it as `password` (the CLI reads `PASEO_PASSWORD`). Nothing prints it.

**Does `invokePluginRpc` from a plain process reach the plugin, and do both views update?** Yes.
- All 37 `engine.event` calls returned `ok`, and the plugin logs show each event with its full snapshot.
- **B:** afterwards, `board.read` returned the replay (`source: replay · run-…l47v · event 37/37`, #352 done at step 5, 5 agents, usage 4%/18%).
- **C:** the throwaway Haiku chat got 38 plugin rows: 1 header, updated in place to "ended", and 37 event rows. I read them back with `fetchAgentTimeline`.
- Paseo's curated `get_agent_activity` view doesn't show plugin rows. That fits the earlier finding that plugin rows never reach the model.

## What broke, and the workarounds

1. **The plugin can't find its own folder.** Inside the plugin process, `import.meta.url` is `undefined` (the code is bundled and evaluated) and `cwd` is `/`. **Workaround:** read `plugins["luca-board-prototype"].path` from `~/.paseo/config.json`, read only. A real plugin should ship the engine path another way: a plugin setting, or an installed `luca` binary on a known path.
2. **Row ids clash when a chat replays twice.** The journal's run id is the same every time, so a second replay into the same chat would overwrite the first one's rows. **Fix:** the plugin makes a fresh replay id for each `/luca-run` and passes it to the engine.
3. **I couldn't type the slash command myself.** Slash commands run in the app's composer, and no API types into it. I called `run.start` directly instead, which is the same RPC the command's `onSubmit` calls. A person still has to check the typing step (see below).
4. **The side panel shows one run for the whole daemon.** `board.read` has no workspace or run filter. It shows the latest replay while it runs and for 10 minutes after, then goes back to the fake loop.

Nothing else broke: no timeouts, no rejected calls, no plugin errors.

## What the real engine and plugin should do

- **Engine:** push the full board state with each event, as done here: one `engine.event` carrying the event and the whole snapshot. It's simple, a missed event can't leave the board wrong, and the log shows exactly what arrived. Keep one daemon connection open for the whole run.
- **Plugin:** stay thin. Validate with Zod, store the latest snapshot per run, and draw rows. It never computes run state.
- **Plugin → engine:** launch it detached with an absolute Bun path and return at once. Pass the plugin id, the chat's agent id, and a run id.
- **Scope the panel:** key snapshots by run and workspace, so two runs don't overwrite each other.
- **Plan for restarts:** rows and the snapshot live only in memory. After a daemon or plugin restart, the engine should resend the current state (it already sends full snapshots, so the next event fixes it).
- **Security:** `engine.event` is open to any local client of the daemon. A real plugin should check a per-run token that it hands to the engine on spawn.

## How to see it

1. In Paseo, open a scratch chat in any workspace.
2. Type `/luca-run` and send it.
3. Watch the rows stream into that chat for about 90 s. The header card at the top updates in place.
4. While it runs, press ⌘K → **Luca board (prototype)**. The panel's footer says `replay · run-20260923-123042-l47v · event n/37`, and ticket #352 moves through the stages.

Logs: `paseo plugin logs luca-board-prototype` and `/tmp/luca-run-*.log`. For an offline check: `bun engine-replay/replay.ts --agent-id x --dry-run`.

## Verified by the user (2026-09-23)

- The user typed `/luca-run` in a real chat. Rows streamed into it, and the side panel showed the replay. **Verdict: pass.**
- Gotcha: after a plugin's slash commands change, Paseo's chat menu only picks them up after you run `/reload-skills`. `paseo plugin reload` alone and a window reload weren't enough.
