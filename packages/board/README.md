# Luca board (Paseo plugin `luca-board`)

The board is the live view of a Luca run inside Paseo. You start a run by typing `/luca-run <spec>` in a Paseo chat. The engine runs as its own background process and sends its journal to this plugin. The plugin shows the run in two places:

- **The side panel** ("Luca board", a workspace tab that also opens in the Explorer). From top to bottom it shows:
  - plan usage (five-hour and weekly), from the rate-limit readings in the agents' sessions, colored green below 60%, yellow from 60% to 85%, and red above 85%
  - how much of the plan the whole run used, once the engine records it
  - a banner when the run stopped (for example, the wrong credentials, or a billing stop) or its engine stopped
  - a limit-wait banner that names the window that was hit
  - **Needs you**, pinned on top: stuck work, with the reason, what was tried, and the exact reply to post on the spec issue (tap a reply to copy it)
  - the tickets, as a stack of stages: Blocked → Building → Reviewing → Done → Skipped. Each card has step dots for tests → red check → code → checks → review. A refactor ticket's first two dots are dashed, because it skips them. Done and Skipped start folded. A card shows how much of the plan its ticket used, once the engine records it. Tap a card for its details.
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

A record is `{ seq, time, kind, ticket, role, content }`. Unknown kinds are skipped quietly, so the engine can add kinds before the board reads them.

### Kinds the engine journals today

| kind | Panel | Chat row |
| --- | --- | --- |
| `run_started` | run status `intake`, the spec number | "The run started on spec #n." |
| `intake_read` | the spec's title | none |
| `intake_refused` | run status `refused`, one line per problem | the problems (danger) |
| `nothing_to_do` | run status `nothing to do` | one line |
| `spec_snapshot` | run status `building` | "Intake passed" with the ticket count |
| `ticket_snapshot` | a card; a `refactor` label makes a refactor ticket; `blockers` keep it Blocked until they're done | none |
| `run_branch_created` | the run branch | one line |
| `ticket_worktree_created` | card to Building, started | "#n: started." |
| `dependencies_installed` | a failed install in a ticket worktree adds a "tried" line; a pass, or no `package.json` (`check: null`), changes nothing | only a failed install (danger), naming its command; the run branch's has no ticket |
| `baseline_tests` | card's test counts | none |
| `agent_started` | card's role, step, and activity. With `follow_up_of` after a failed red check or failed checks, it's a **fix round**: the card's fix counter goes up and a "tried" line is added. The same follow-up sent again (it never ended, as after a crash) isn't counted twice. After a failed turn it's a **retry** ("coding again"). A reviewer's launch counts a review round, but a reviewer's retry doesn't. After a review asked for changes, a fixer's start is a **review fix round** r (r is the review's round, at most 3): a fresh test-writer (`follow_up_of: null`) for test findings, then the implementer (a follow-up in its build session, or fresh if that session was lost) for code findings. The card stays in Reviewing, its activity is "fixing the review's findings (r/3)", and the round's first fixer adds a "tried" line with the blocker and should-fix counts. Failed checks inside the round run the usual checks' fix loop. A reviewer's launch after a review fix round is a **re-review** ("re-reviewing"). | "started", "fix round n/3: the implementer got the failure back." (warning), "tries again." (warning), "review fix round r/3: the implementer got the findings back." or "...: a fresh test-writer fixes the test findings." (warning), or "re-review n of the new changes.". A resent follow-up adds no row. |
| `agent_finished` | card's step and activity; clears a failed turn. A reviewer's `findings` set the card's counts by severity (the latest review's). `changes_requested` opens the review, so the next fixer starts a review fix round; `approve` closes it. A fixer's `finding_responses` add a "tried" line for each `wont_fix` ("Won't fix R1-2: reason"). A re-reviewer's `rulings` on those add "Declined R1-2 accepted: reason" (`accepted`: the finding goes in the PR, not fixed) or "R1-2 still stands: reason" (`rejected`). | tests written / code written / bad test / "approved it (2 nits)" / "asked for changes: 1 blocker, 1 should-fix, 2 nits" (warning). A fixer in a review fix round: "answered the findings: n fixed, n won't fix." |
| `agent_failed` | a "tried" line with how it failed: `agent` (failed), `result` (no usable result), `guard` (broke its role's rules, undone), `engine` (could not run; a fresh agent starts) | the same (danger; `engine` is a warning) |
| `agent_session` | the card's tokens, in all and per role: input, output, cache reads, and cache writes. Its `rate_limit_events` set **plan usage**: the latest `five_hour` reading sets the five-hour percent and when it resets, the latest `seven_day*` reading sets the weekly percent. A reading names its window in one of two ways: a top-level `rateLimitType` with `utilization`, or `unifiedWindows`, a map of window name to `{ utilization, resetsAt }` (real runs send this one, with no top-level `utilization`). When one reading has several `seven_day*` windows, the highest one sets the weekly percent, since the tightest weekly cap is the one that binds. `utilization` is 0 to 1, shown as a whole percent: green below 60, yellow from 60 to 85, red above 85. `resetsAt` is in seconds since the epoch. A window with no reading shows "–". | none |
| `red_check` | card's step and test counts. A failure opens the red-check fix loop; a pass closes it and resets the fix counter. | passed (with how many new tests fail) or failed |
| `leftover_scan` | a "tried" line if it found files. `stage` is `red`, `green`, or `fix` (a review fix round). | only if it found files (warning) |
| `commit_made` | card's activity. `stage` is `red`, `green`, or `fix` (a review fix round; its `files` may be empty). | tests / code / review fixes committed |
| `worktree_reset` | card back to the tests step, fix counter reset, "Started over from the tests after a bad test" | one line (warning) |
| `gates_run` | card's step. A failure (any check: `install`, `test`, `types`, `lint`) opens the checks' fix loop and adds a "tried" line; a pass closes it and resets the fix counter. On the run branch (`target: run_branch`) it's "after joining". | passed or failed, naming the failed checks |
| `ticket_joined` | card to Done, or a "tried" line | joined, or why not |
| `run_branch_pushed` | card's activity | none |
| `ticket_stuck` | card to Stuck, and **Needs you** with the reason in words (every `StuckReason` has one), the detail, what was tried, and the replies | a stuck row |
| `pull_request_opened` | run status `done`, the PR link | the PR |
| `run_stopped` | run status `stopped` and a banner with the reason (wrong credentials or plan, a rejected rate limit, overage, ...), the card's role cleared. Any later real step (the run was started again with the same run id) clears it. With `billing: true` (default false) it's a **billing stop**: the session would bill per token, so the run won't go on, and the banner says to start a new run once per-token billing is off. | the reason, and how to pick the run up again, or for a billing stop, that the run won't go on (danger) |
| `limit_wait_started` | run status `limit_wait` and a banner: "Plan limit hit (five-hour window). The run waits until 17:00 and then carries on by itself." The time is `resets_at`, or `until` when the reset time isn't known. | a limit row with the same words |
| `limit_wait_ended` | the banner is gone | the limit row turns to "over" |
| `usage_recorded` | with scope `ticket`, the card's plan used ("plan: five-hour +1%, weekly +1%"); with scope `run`, a line under plan usage ("This run used: five-hour 3%, weekly 1%"). Each window's `used`, rounded to a whole percent, in the order five-hour, weekly, the other weekly windows, then the rest. | none |
| `jev_asked`, `jev_answered`, `jev_failed` | **Jev in shadow mode**: only counted (asked, answered, without an answer), in a dim footer line. The engine never acts on Jev's answers, so they change no ticket, status, or "latest" line. | none |

### Kinds not journaled yet

The board already understands these, so the tickets that add them should journal these shapes. Until then nothing sends them.

| kind | ticket that adds it | `ticket` | `content` | Board effect |
| --- | --- | --- | --- | --- |
| `reply_received` | #366 | ticket/null | `{ word: 'retry' \| 'skip' \| 'stop' \| 'ship', ticket: number \| null }` | resolves the stuck item and row |
| `ticket_skipped` | #366 | ticket | `{}` | card to Skipped |
| `final_review_started` | #367 | `null` | `{}` | run status `final_review`, next round |
| `lens_started` | #367 | `null` | `{ lens }` | lens to Reviewing |
| `lens_finished` | #367 | `null` | `{ lens, findings: { blocker, should_fix, nit } }` | lens to Fixing (blocker or should-fix) or Clean |
| `final_review_fixing` | #367 | `null` | `{ round }` | final review's fix counter |
| `final_review_stuck` | #367 | `null` | `{ reason, detail }` | Needs you with `retry`, `stop`, `ship` |
| `final_review_passed` | #367 | `null` | `{}` | every lens Clean |

The replies a stuck item offers (`retry #n`, `skip #n`, `stop`; `retry`, `stop`, `ship` for the final review) are what #366 will read. Until it lands, the engine ends the run when a ticket is stuck.

`lens` is one of `architecture`, `simplification`, `security`, `integration`, or `rules`.

### The limit and usage shapes

The engine journals these with `ticket` and `role` set to `null`, except `usage_recorded` with scope `ticket`, whose `ticket` is that ticket.

```ts
// limit_wait_started
{
    resets_at: string | null // when the limit resets; null if not known
    until: string // when the engine wakes; always set
    rate_limit_type: string | null // 'five_hour', 'seven_day', 'seven_day_opus', ...
    hit_ticket: number | null
    hit_role: string | null
}

// limit_wait_ended
{ until: string }

// usage_recorded
{
    scope: 'ticket' | 'run'
    ticket: number | null
    agent_turns: number
    tokens: { input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens }
    windows: Record<string, { from: number; to: number; used: number }> // percents, 0 to 100
}
```

Windows in words: `five_hour` is "five-hour", `seven_day` is "weekly", `seven_day_opus` is "weekly Opus", and `seven_day_sonnet` is "weekly Sonnet". Any other window shows its raw name.

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
bunx --bun tsc --noEmit -p .      # typecheck (no DOM lib); the repo's root check leaves this package out
paseo plugin reload luca-board    # after edits
```

The repo's root `bunx --bun tsc --noEmit` leaves this package out: React Native's globals (such as `AbortSignal`) clash with Bun's in the engine. The engine config's `types` gate runs both checks.

Layout:

- `shared/`: Zod contracts and plain values only.
- `server/`: the Node side. It holds the reducer, the row-maker, the registry, and the launcher, with tests next to them.
- `client/`: React Native only (`View`, `Text`, `Pressable`, `ScrollView`), and every color comes from the theme.
