# Luca board (Paseo plugin `luca-board`)

The board is the live view of a Luca run inside Paseo. You start a run by typing `/luca-run <spec>` in a Paseo chat. The engine runs as its own background process and sends its journal to this plugin. The plugin shows the run in two places:

- **The side panel** ("Luca board", a workspace tab that also opens in the Explorer). From top to bottom it shows:
  - plan usage, colored green below 60%, yellow from 60% to 85%, and red above 85%
  - a limit-wait banner
  - **Needs you**, pinned on top: stuck work, with the reason, what was tried, and the exact reply to post on the spec issue (tap a reply to copy it)
  - the tickets, as a stack of stages: Blocked → Building → Reviewing → Done → Skipped. Each card has step dots for tests → red check → code → checks → review. A refactor ticket's first two dots are dashed, because it skips them. Done and Skipped start folded. Tap a card for its details.
  - the final review's 5 lenses, as a second stack (Waiting → Reviewing → Fixing → Clean). It stays dimmed until every ticket is done or skipped.
- **Live rows in the chat where you started the run**: a header row that updates in place, one row per meaningful event, stuck rows with the exact reply, and a limit-wait row. The rows never reach the model.

The code reuses the designs of the board prototype (`prototype/paseo-board`: variant B v2 for the panel and variant C for the rows), but none of its code.

## The route

1. `/luca-run <spec>` (a client slash command) calls the plugin RPC `run.start` with the chat's agent id, its workspace id, its working directory, and the args. Then it opens the panel.
2. `run.start` does the following:
   - It reads the args: `123`, `#123`, or `demo`. Anything else is an error that shows the usage.
   - It finds the engine (see [Settings](#settings)).
   - It mints a run id (`luca-<yyyymmdd-hhmmss>-<4 random [a-z0-9]>`, UTC) and a random per-run token.
   - It records the run in the run registry and appends the chat's header row ("starting").
   - It spawns the engine **detached**, by absolute paths, and returns at once:

     ```
     <bun> <engine_path> --spec <n> | --demo --repo <cwd> --run-id <id> --board-plugin luca-board
     ```

     The env is the daemon's env plus `LUCA_BOARD_TOKEN=<token>`. Output goes to `/tmp/<run id>.log`.
   - It returns `{ ok, message, run_id }`. The message names the log file. If the engine can't be found, it returns `ok: false` and says what to set.
3. The engine sends its journal records through `engine.event`, described in the next section. The plugin keeps each run's board state and appends the chat rows.
4. The panel polls `board.read` every 2 s.

## The `engine.event` contract

The engine calls the plugin RPC `engine.event`, through Paseo's `invokePluginRpc` on plugin `luca-board`. Keys are snake_case.

```ts
// input
{
    run_id: string
    token: string // LUCA_BOARD_TOKEN, as handed to the engine at spawn
    records: Array<{
        seq: number // int >= 1
        time: string
        kind: string
        ticket: number | null
        role: string | null
        content: unknown
    }>
    ended: null | { ok: boolean; message: string }
}

// output
{ ok: boolean; next_seq: number; message: string }
```

- `records` are the engine's journal records, verbatim.
- **Order.** The plugin applies records in seq order, starting at the run's `next_seq` (1 for a new run):
  - A seq below `next_seq` is a duplicate, and is ignored.
  - If the first new seq is above `next_seq`, that's a gap. Nothing past it is applied, and the reply's `next_seq` tells the engine where to resend from.
  - The engine should always resend from the `next_seq` it gets back.
- **`ended`** marks the run's engine as finished, ok or failed, with its message. The header row and the panel show it. It isn't applied while there's a gap.
- **Rejected sends.** An unknown `run_id` or a wrong `token` gets `ok: false, next_seq: 0`, and nothing is applied.
- **Bad records.** A record whose content doesn't fit the board's vocabulary is skipped and logged. A record of an unknown kind is skipped quietly. Either way it still counts as applied, and the plugin never throws on a record.
- **Plugin restart.** The run registry (run id, token, agent, workspace, repo, spec) lives in `$LUCA_BOARD_STATE_DIR/runs.json`, or `~/.local/state/luca/board/runs.json` by default. It is read at startup and written on every change. Board state lives only in memory. After a restart the plugin still knows the run, but its `next_seq` is 1 again, so the engine's next send gets `next_seq: 1` back. The engine then resends the whole journal, and replaying it rebuilds the same board.

## The board's vocabulary

The plugin reads only the fields it needs. It never imports the engine: its loose Zod schemas are in `server/board-vocabulary.ts`, and extra fields are fine.

**Kinds the engine journals today:** `run_started`, `intake_read`, `intake_refused`, `nothing_to_do`, `spec_snapshot`, `ticket_snapshot` (a `refactor` label makes a refactor ticket; `blockers` make it Blocked until they're done), `run_branch_created`, `ticket_worktree_created`, `baseline_tests`, `agent_started`, `agent_finished`, `agent_failed`, `red_check`, `leftover_scan`, `commit_made`, `gates_run`, `ticket_joined`, `run_branch_pushed`, `ticket_stuck`, `pull_request_opened`.

For per-card tokens, `agent_finished` content may carry `usage: { total_tokens }` (or `usage: { input_tokens, output_tokens }`, or a top-level `total_tokens`).

**Kinds later tickets add.** The board already understands these, so journal them with these shapes (#363 fix loops, #364 reviews, #366 limit waits and replies, #367/#368 the final review):

| kind                   | `ticket`     | `content`                                                                   | Board effect                                             |
| ---------------------- | ------------ | --------------------------------------------------------------------------- | -------------------------------------------------------- |
| `usage_reading`        | `null`       | `{ five_hour_percent, weekly_percent, resets_at? }`                         | usage line, colored per level                            |
| `limit_wait_started`   | `null`       | `{ resets_at }`                                                             | limit-wait banner, limit row, run status `limit_wait`    |
| `limit_wait_ended`     | `null`       | `{}`                                                                        | banner gone, limit row "over"                            |
| `fix_round`            | ticket       | `{ loop: 'red_check' \| 'gates' \| 'review', round }`                       | card's fix counter, "tried" line                         |
| `review_finished`      | ticket       | `{ round, findings: { blocker, should_fix, nit } }`                         | card's review counter and findings                       |
| `reply_received`       | ticket/null  | `{ word: 'retry' \| 'skip' \| 'stop' \| 'ship', ticket: number \| null }`   | resolves the stuck item and row                          |
| `ticket_skipped`       | ticket       | `{}`                                                                        | card to Skipped                                          |
| `final_review_started` | `null`       | `{}`                                                                        | run status `final_review`, next round                    |
| `lens_started`         | `null`       | `{ lens }`                                                                  | lens to Reviewing                                        |
| `lens_finished`        | `null`       | `{ lens, findings: { blocker, should_fix, nit } }`                          | lens to Fixing (blocker or should-fix) or Clean          |
| `final_review_fixing`  | `null`       | `{ round }`                                                                 | final review's fix counter                               |
| `final_review_stuck`   | `null`       | `{ reason, detail }`                                                        | Needs you with `retry`, `stop`, `ship`                   |
| `final_review_passed`  | `null`       | `{}`                                                                        | every lens Clean                                         |

`lens` is one of `architecture`, `simplification`, `security`, `integration`, or `rules`.

## Settings

Go to **Settings → Plugins → luca-board → Engine**. These settings are a host settings document (`engine`), so they survive restarts.

- **Engine path:** the absolute path to the engine's entry, for example `/Users/you/luca-framework/packages/engine/src/cli/luca-run.ts`. The plugin runs it with Bun.
- **Bun path:** the absolute path to Bun. If it's empty, the plugin tries `LUCA_BUN`, then `~/.bun/bin/bun`, `/opt/homebrew/bin/bun`, and `/usr/local/bin/bun`. It needs an absolute path, because Paseo swaps a bare `bun` for its own Node.

If the engine path is empty, the plugin uses an installed `luca-run` command from `~/.bun/bin`, `/opt/homebrew/bin`, or `/usr/local/bin`, run directly (it has a Bun shebang). The plugin never looks in its own folder: inside the plugin process, `import.meta.url` is undefined and the cwd is `/`.

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
- The panel shows the runs started in its workspace, newest first. Pick another run from the chips at the top.

## Develop

```bash
cd packages/board
bun test                          # the board at its RPC seam (seam 3): events in, state and rows out
bunx --bun tsc --noEmit -p .      # typecheck (no DOM lib)
paseo plugin reload luca-board    # after edits
```

Layout:

- `shared/`: Zod contracts and plain values only.
- `server/`: the Node side. It holds the reducer, the row-maker, the registry, and the launcher, with tests next to them.
- `client/`: React Native only (`View`, `Text`, `Pressable`, `ScrollView`), and every color comes from the theme.
