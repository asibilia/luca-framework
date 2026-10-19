# Luca board: settings, install, and develop

The engine and usage-line settings, installing the plugin, its logs and limits,
and working on it.

## Settings

Go to **Settings → Plugins → luca-board → Engine**. These settings are a host settings document (`engine`), so they survive restarts. It holds where the engine lives and the two usage lines.

- **Engine path:** the absolute path to the engine's entry, for example `/Users/you/luca-framework/packages/engine/src/cli/luca-run.ts`. The plugin runs it with Bun, with `--no-env-file` and the `bunfig.toml` in the same folder (`<engine_dir>`, see [The route](the-route.md#the-route)).
- **Bun path:** the absolute path to Bun. If it's empty, the plugin tries `LUCA_BUN`, then `~/.bun/bin/bun`, `/opt/homebrew/bin/bun`, and `/usr/local/bin/bun`. It needs an absolute path, because Paseo swaps a bare `bun` for its own Node.

If the engine path is empty, the plugin uses an installed `luca-run` command from `~/.bun/bin`, `/opt/homebrew/bin`, or `/usr/local/bin`. It follows the command's symlink to the engine's `luca-run.ts` and runs that with Bun and the same flags, `--no-env-file` and the `bunfig.toml` beside it. Only an older install with no `bunfig.toml` there runs directly through its Bun shebang, and so without that protection. The plugin never looks in its own folder: inside the plugin process, `import.meta.url` is undefined and the cwd is `/`.

The **usage lines** keep Luca below a share of your Claude plan, so you always have room for your own work. They count the whole account, not one run:

- **Weekly line** (`weekly_line`, default 80): every run pauses once the account's weekly window (`seven_day`, all models) is 80% full.
- **5-hour line** (`five_hour_line`, default 85): every run pauses once the account's 5-hour window is 85% full.

A paused run carries on by itself when the window resets, or at its next check (every 5 minutes) once you raise the line above the reading. The plugin keeps the two lines in `usage-lines.json` in its state folder (`$LUCA_BOARD_STATE_DIR`, else `~/.local/state/luca/board`), and every engine reads them there, so runs started from the command line obey them too. Settings saved before the usage lines read with the defaults. See "The usage line" in the engine's README.

## Install and try it

```bash
paseo plugin install /absolute/path/to/luca-framework/packages/board --id luca-board
```

(If `paseo` isn't on your PATH, use `/Applications/Paseo.app/Contents/Resources/bin/paseo`.)

1. Set the engine path in **Settings → Plugins → luca-board**.
2. In a chat, run `/reload-skills` so `/luca-run` shows up. A plugin reload alone isn't enough.
3. Type `/luca-run demo` for a safe practice run: a throwaway repo, with no GitHub and no models. Rows stream into the chat, and the panel opens.
4. Type `/luca-run <spec number>` for a real run in the chat's repo.

Once this plugin is installed, remove the prototype: `paseo plugin remove luca-board-prototype`.

## Logs

- The plugin's side: `paseo plugin logs luca-board`, or **Settings → Plugins → Logs**.
- The engine's side: `/tmp/<run id>.log`. The run id is in the header row and the panel footer.

## Limits

- Chat rows live in the Paseo daemon's memory. A daemon restart or a conversation rewind drops them. The panel rebuilds from the journal, but old rows don't come back.
- Each row append counts as agent activity in that chat.
- If appends to a chat keep failing (for example, the chat was deleted), the run stops adding rows after 3 failures in a row. The panel keeps updating.
- The panel shows the runs started in its workspace and the runs the plugin didn't start on its workspace's repo, newest first. Pick another run from the chips at the top. Only the 6 newest runs get a chip; the older ones are folded behind an "n older" chip that opens them. A picked older run keeps its chip.

## Develop

```bash
cd packages/board
bun test                          # the board at its RPC seam (seam 3): events in, state and rows out
bunx --bun tsc --noEmit -p .      # typecheck (no DOM lib); the repo's root check leaves this package out
paseo plugin reload luca-board    # after edits
```

The repo's root `bunx --bun tsc --noEmit` leaves this package out: React Native's globals (such as `AbortSignal`) clash with Bun's in the engine. The engine config's `types` gate runs both checks.

Layout:

- `shared/`: Zod contracts and plain values only.
- `server/`: the Node side. It holds the reducer, the row-maker, the registry, the launcher, the engine watch (restarts), the journal reader (`run-journals.ts`, the runs folder on disk), and the vocabulary (`board-vocabulary.ts`, with its kinds in `board-vocabulary-run.ts`, `board-vocabulary-engine.ts`, and `board-vocabulary-review.ts` and the schema pieces they share in `board-vocabulary-shapes.ts`), with tests next to them.
- `client/`: React Native only (`View`, `Text`, `Pressable`, `ScrollView`), and every color comes from the theme.
