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

- `shared/`: Zod contracts and plain values only. The board's state, `board-state.ts`, holds the plugin's constants and the whole `BoardState`, and re-exports its pieces from modules by responsibility:
  - `board-state-ticket.ts`: a ticket's card, its steps and stage, its findings, and the step the engine is in.
  - `board-state-run.ts`: the run (status, phase, stop, budget), the stuck work that needs a reply, the tickets left out for a person, and the run list's summaries.
  - `board-state-review.ts`: the final review and its lenses.
  - `board-state-usage.ts`: plan usage, its windows, and their color levels.
  - `board-state-counts.ts`: what the board only counts (the decision model's questions, agent messages, memory).
- `server/`: the Node side. It holds the reducer, the row-maker, the registry, the launcher, the engine watch (restarts), the journal reader (`run-journals.ts`, the runs folder on disk), and the vocabulary (`board-vocabulary.ts`, with its kinds in `board-vocabulary-run.ts`, `board-vocabulary-engine.ts`, and `board-vocabulary-review.ts` and the schema pieces they share in `board-vocabulary-shapes.ts`), with tests next to them.
  - The reducer, `reduce-board.ts`, applies a record and passes it on by kind. Its handlers are in modules by responsibility, and each module exports the record kinds it handles (`*_KINDS`):
    - `reduce-board-run.ts`: the run's own records (start, intake, snapshot, run branch, pull request, stop).
    - `reduce-board-ticket-start.ts`: a ticket's snapshot, worktree, install, baseline tests, and start over.
    - `reduce-board-ticket-checks.ts`: a ticket's red check, commits, leftover scan, and checks.
    - `reduce-board-ticket-join.ts`: a ticket joining the run branch, sent back to fix on top of it, pushed, or already done.
    - `reduce-board-agent-start.ts`: what an agent's start is (fresh, retry, fix round, review fix round) and the card it gives the ticket.
    - `reduce-board-agents.ts`: an agent's turn on a ticket or the final review: start, finish, failure.
    - `reduce-board-steps.ts`: the steps in flight, for a ticket or for the run.
    - `reduce-board-needs-you.ts`: stuck tickets and runs, skips, retries, and the replies that resolve them.
    - `reduce-board-final-review.ts`: the final review's rounds, lenses, fix rounds, and end.
    - `reduce-board-usage.ts`: tokens, plan usage, and the waits for a limit to reset.
    - `reduce-board-counters.ts`: the run-wide counters (Jev, agent messages, the shared git folder, memory).
    - `reduce-board-settle.ts`: what depends on the whole board (blocked tickets, the final review being active, the run's status).
    - `reduce-board-text.ts`: words for ids, counts, and record fields.
    - `reduce-board-reasons.ts`: stuck reasons in words.
    - `reduce-board-update.ts`: the small state updates every handler uses.
    - `reduce-board-create.ts`: the starting shapes of a new board and a new ticket card.
  - The server, `board-server.ts`, wires `createBoardServer` from modules by responsibility (each module is a factory that takes the config and the pieces before it):
    - `board-server-types.ts`: the server's types, and `BoardServerConfig` (what it is given, every side effect injected).
    - `board-server-util.ts`: the run phases that need no engine, and the error text.
    - `board-server-store.ts`: the runs this plugin started, kept in memory and rebuilt from their journals, with the queue that keeps a run's work in order and the rows added to the chat.
    - `board-server-engine.ts`: running the engine: its environment, finding it from the settings, the one-at-a-time lock on engine work, and spawning it with `--resume`.
    - `board-server-start.ts`: `run.start`.
    - `board-server-resume.ts`: `/luca-run resume <run id>`.
    - `board-server-events.ts`: `engine.event`.
    - `board-server-read.ts`: `board.read` and `reply.post`, and the runs the plugin didn't start, read from their journals.
    - `board-server-check.ts`: the engine check: restarting a run whose engine is gone, or marking it stopped.
- `client/`: React Native only (`View`, `Text`, `Pressable`, `ScrollView`), and every color comes from the theme. The side panel, `board-panel.tsx`, polls `board.read`, keeps what a person has opened, folded and picked, and puts the sections together. Each section is in its own module:
  - `run-header.tsx`: the top: title and status, the run's title and pull request, what the engine is doing now, the run's tokens, and the banners. It uses `run-picker.tsx` (the run tabs) and `usage-line.tsx` (the plan usage line).
  - `needs-you-section.tsx`: the stuck work waiting for a reply, and what came of replies already posted.
  - `ticket-stack.tsx`: the tickets as a stack of stages, then the tickets left out for a person.
  - `ticket-card-view.tsx`: one ticket's card. It opens into `ticket-detail.tsx` and shows the step dots from `step-dots.tsx`.
  - `final-review-stack.tsx`: the final review and its lenses.
  - `run-footer.tsx`: the run id, the latest thing that happened, and the counters.
  - `board-panel-styles.ts`: the styles made from the theme, and the `Look` every piece takes.
  - `board-panel-stages.ts`: the stages tickets and lenses are stacked in, and the keys of opened and folded cards.
  - `board-panel-parts.tsx`: the small pieces the sections share (counter, running step, stage header, banner, section).
