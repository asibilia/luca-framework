# Board liveness: showing that work is going on

Research for the owner's question: *"In certain states (one of which is 'starting'), it doesn't look like anything is happening on the Luca board. What could we do to show that work is going on?"*

Location note: the repo had no research-notes folder (`git ls-files | grep -i research` found nothing), so this file starts `docs/research/`.

Sources: the engine (`packages/engine/src`), the board (`packages/board`), the Paseo plugin SDK types (`packages/board/node_modules/@getpaseo/plugin/dist/client/*.d.ts`, version 0.9.1) and the `paseo-plugin` skill, and 29 run journals. The journals were copied to `/tmp/board-liveness/` before reading, and nothing under `~/.local/state/luca` was written. The scripts are `/tmp/board-liveness/gaps.ts` (quiet gaps, and stretches where a ticket has no open step) and `/tmp/board-liveness/steps-all.ts` (step durations across runs). Journal records are cited as `seq N`, and issues as `#N`.

## Short answer

- **The owner's lead is confirmed.** In run `luca-20261013-211233-umc3`, #554 to #557 got their worktrees and installs by seq 72 (21:12:44). Then they had **no open step and wrote no record for 4m43s**, until #553's `baseline_tests` landed (seq 73, 21:17:27) and all four took it in the same second (`baseline_reused`, seq 80 to seq 83). The engine does this deliberately. `sharedBaselineStep` returns `null` ("it waits") for every ticket on the same `base_sha` except the first one able to move (`packages/engine/src/core/decide-build.ts:1081-1124`). A `null` step means no `step_started` and no other record, so the board has nothing to show. Each card keeps the `activity: 'starting'` that `ticket_worktree_created` gave it (`packages/board/server/reduce-board.ts:942-951`).
- The baseline wait is one of **several waits the engine never journals**: the join queue, the start queue, a prepare slot, and the agent's turn (from inside). There are also **signals the engine has but journals late**: the plan-usage reading and token counts. Measured across 29 runs, these quiet stretches last minutes to tens of minutes (table below).
- **Cheapest fix (board only, no engine change):** every busy card always shows one line with a timer that counts up. That line is either the running step (which already works) or what the card is waiting for, worked out from records the board already has: "waiting for #553's baseline tests (4m 13s)" or "waiting to join after #331 (10m 2s)". The footer's `latest:` gets its age. Runs started from the command line get the same "is the engine process alive?" check the board already runs for its own runs.
- **Proper fix (engine):** a small `ticket_waiting { ticket, for, on_ticket, since }` record, written once when a wait starts, so the board doesn't have to copy the engine's rules. The prepare-slot wait can only come from the engine. Add a live side channel, not the journal, for agent progress: tokens so far, the latest tool, and the first plan reading.

## How the board gets its data, and what ticks

- The engine sends journal records as they are to the board over `BoardLink` (`packages/engine/src/board/board-sync.ts:33-40`). Runs the plugin didn't start are read from their journal files (`readOutside`, `packages/board/server/board-server.ts:428-467`). Every record goes through `applyRecord` (the reducer) and `describeRecord` (the footer's `latest`) (`board-server.ts:316-332`).
- **The only live-ticking signal is `current_step`.** `step_started` sets `{ text, since }` on the ticket, or on the run when the step has no ticket. `step_ended` clears it (`reduce-board.ts:497-547`). The client's `StepLine` re-renders every second through `useNow` (`client/board-look.ts:22-38`, `client/board-panel.tsx:406-422`), which gives "running the baseline tests (4m 13s)". **A card with no open step shows no time at all.**
- `activity` (the pill) changes only on certain records. The step dots move only on agent and gate results. `tokens` and plan usage change only when an `agent_session` arrives, and that comes at the **end** of a turn (`reduce-board.ts:1038-1050`, `:657-690`).
- The footer shows `event_count`, "engine running" whenever `engine_ended` is null, and `latest`, which is the last *described* record, with no age (`board-panel.tsx:1315-1327`). Step records aren't described, so `latest: #557: started.` (from `ticket_worktree_created`, `make-rows.ts:296-297`) stayed on screen for 4m43s.
- Engine-alive check: every `ENGINE_CHECK_MS` = 15 s, the plugin looks for a process whose command line has `--run-id/--resume <id>`, and restarts dead runs (`server/engine-watch.ts:16`, `board-server.ts:1093-1176`). **It only checks runs the plugin started** (`candidates = [...runs.values()]`, `board-server.ts:1097`). Runs started from the command line (`outside`) are never checked, so they show "engine running" and step timers that keep counting after the engine has died.
- Paseo UI primitives: `@getpaseo/plugin/client/react-native` exports `Icon`, `Modal`, `useToast`, `useRevealedText`, `ScrollView`, `FlatList`, `TextInput` and `copyText`, and `/client/ui` exports settings rows and `ExternalLink` (`dist/client/react-native.d.ts`, `dist/client/ui.d.ts`). **Paseo has no spinner, progress bar or timer primitive.** The board already imports core `react-native` (`Pressable`, `Text`, `View`), and the skill says "Paseo supplies host runtime modules", so RN's `ActivityIndicator` and `Animated` should be usable. That is not verified at runtime here. The panel polls `board.read` every `POLL_MS` = 2 s (`shared/board-state.ts:15`).

## States that look idle, measured

"Quiet" means the work is happening but the card shows no step line, or a misleading one. Durations come from the 29 journals in `~/.local/state/luca/runs` (copied). Step durations leave out any step cut off by an engine restart.

| # | State | What the engine is doing | What the board shows | Journal evidence | Measured |
|---|---|---|---|---|---|
| 1 | **Waiting for another ticket's baseline** (the screenshot) | `sharedBaselineStep` returns `null` for every ticket on the same `base_sha` except the runner (`decide-build.ts:1081-1124`). No record. | "starting" pill, 5 empty dots, **no step line, no time** | umc3: #554 to #557, seq 46/57/70/72 to seq 76-79, **4m43s**. p9dr: #330/#331 seq 483/491 to seq 496/497, 4m41s. h8ot: #508/#509 3m22s. | 34 cases in 14 runs, **1m52s to 28m34s** (za85 #271, seq 173 to seq 178). Often ~10 min: don8 #247 to #254 10m18s-10m34s, 69hp #136 to #139 ~10m15s, 1ahe ~10m. |
| 2 | **Waiting in the join queue** (approved, behind the ticket that is joining: its join, the gates on the run branch, its push) | `joiner = queue[0]`; the others get `null` from `nextTicketStep` (`decide-build.ts:1458-1478`, `:1228`) | pill "approved", no step line | p9dr #329: approved seq 1066 (00:02:26), joined seq 1074 (00:13:05) after #331's gates (seq 1052 to seq 1069) | 22 cases, **1m05s to 47m34s** (don8 #260, seq 1722 to seq 1838). za85 10-14 min, don8 8-38 min. |
| 3 | **Waiting to start** (no worktree while any ticket waits to join) | `create_ticket_worktree` only when `queue.length === 0` and all blockers are finished (`decide-build.ts:1510-1524`) | pill "queued". It sits in Building, not Blocked, since it has no blocker. | No record until `step_started create_ticket_worktree` | Not separable with the script. As long as the join-queue waits above. |
| 4 | **Waiting for a prepare slot** (`prepare_concurrency`, default 1, `config/engine-config.ts:130`) | Inside `run_gates`/`run_red_check`/`run_baseline_tests`, `PREPARE_SLOTS.run` blocks (`gates/gate-runner.ts:80-101`, `gates/prepare-slots.ts:25-62`). No record, and gate checks have no durations (#518). | "running the checks (14m)", which looks like slow tests | p9dr (prepare configured): three red checks open together for 9m+ (seq 878 to seq 923). Gates median 16m30s, max 40m39s in that run. | Can't be told apart from the build or the tests without #518. Across runs: `run_gates` p90 21m54s, max 72m37s; `run_red_check` p90 23m02s, max 77m38s. |
| 5 | **Baseline tests** (the runner itself) | `run_baseline_tests` open | "running the baseline tests (4m 13s)" with a timer: **fine**. The pill still says "starting". | umc3 seq 37 to seq 73, 4m46s | n=66: median 3m23s, p90 13m45s, max 28m38s |
| 6 | **A long agent turn** | The engine reads every SDK message (`pumpMessages`, `agents/claude-launcher.ts:420`) and runs a hook on every tool call (`agents/claude-options.ts:230-235`), but journals only `agent_session`/`agent_finished` at the end | "waiting for the test-writer (7m)" with a timer, but **0 tokens**, no sign of progress, and agent messages are the only records in between | umc3: five test-writers since seq 113-121 (21:17:28). Only seq 122 and seq 123 (`agent_message`) in the next 7 min. | `launch_agent:implementer` n=236, median 5m01s, p90 15m03s, max 27m37s. `launch_agent:test-writer` n=198, p90 11m50s, max 31m01s. `launch_final_fixer:implementer` max 14m32s. |
| 7 | **"plan usage: no reading yet"** | The SDK's `rate_limit_event` reaches the engine about 2 s into the first turn, but is journaled only inside that turn's `agent_session` | "no reading yet" | p9dr: first reading `arrived_at` 05:04:28, 2 s after `agent_started` seq 41, but journaled at seq 44 (05:15:07), **10m39s later** | Run start to first reading, 21 runs: **3.1 to 38.3 min** (median ~10 min). |
| 8 | **The engine died** (crash, sleep, kill) | Nothing is running | Plugin-started runs: noticed within 15 s. **Command-line runs: "engine running", and the last step's timer keeps counting.** | Gaps before `engine_resumed`: 69hp seq 82 to seq 83 **96 min**; don8 seq 921 to seq 922 **102 min** (the last record was `agent_started`, so the card read "waiting for the implementer (1h 42m)"); za85 107 min and **607 min**. #549 counted 2,127 min of "engine down" shown as Reviewing. | 4 resumes in 4 runs |
| 9 | **The footer's `latest`** | n/a | `latest: #557: started.` with no age, even though the record was 4m43s old | umc3 seq 66 | n/a |
| 10 | Limit wait / usage-line wait | `limit_wait_started` / `usage_line_wait_started` are journaled | A banner with the reset time: **fine**. The cards aren't marked paused (`reduce-board.ts:1331-1346` doesn't touch tickets). | ovty seq 31 to seq 32, 30 min; d5ix seq 89 to seq 91, 10 min | 2 cases |
| 11 | Intake, run-branch creation, installs, memory recall, Clef asks, final review start | Each is a step with `step_started`/`step_ended` | A step line with a timer, or too short to notice | umc3 `read_intake` 2 s, `create_run_branch` 1 s, `install_dependencies` ≤2 s, `recall_memories` 0 s; Clef latency median 0 s, max 6 s (p9dr). The final review start is covered by steps (h8ot seq 370 to seq 387 in the same second). | **Not an idle problem.** The final review's `run_final_gates` (max 18m43s) shows as "Now: running the checks" at run level, which is fine apart from the prepare-slot caveat (row 4). |

Notes on the measurements:
- Rows 1 and 2 come from "ticket stretches ≥ 60 s with no open step" in `gaps.ts`, leaving out stretches that end in `retry_ticket`/`skip_ticket` (those are stuck tickets, which the board shows under Needs you). don8 #254's 127m34s join wait (seq 868 to seq 948) spans the engine restart at seq 922, so it isn't counted as a join wait.
- For the screenshot, footer "72 events" is seq 72 (21:12:44), and "4m 13s" puts the screenshot at about 21:16:54, inside the 4m43s gap.

## Options

Cheapest first. "Existing records" means the board can do it alone.

| Option | What it shows | Data needed | Rough size | Risks |
|---|---|---|---|---|
| **A. Every busy card has a timer; `latest` gets an age** | A started, unfinished card with no open step shows "waiting for the engine's next step (4m 43s)", counted from the ticket's last record. The footer reads "latest (4m 43s ago): #557: started." | Existing: record times. Track `last_time` per card. | Small: one field in `TicketCardSchema` (defaulted), one line in `TicketCardView`, footer text. ~40 lines and tests. | Generic wording ("waiting" for what?). It must not show on done, stuck or skipped cards. |
| **B. Say what a quiet ticket is waiting for (derived in the board)** | "waiting for #553's baseline tests (4m 13s)"; "waiting to join after #331 (10m 2s)"; "starts once #331 has joined" (the start queue). Falls back to A when nothing matches. | Existing: `ticket_worktree_created.base_sha` (`board-vocabulary.ts:191`), the other card's open `run_baseline_tests` step, approval (`activity 'approved'`, `reduce-board.ts:1734`), the joiner's open `join_run_branch`/`run_gates`/`push_run_branch` steps. | Medium: one `waiting_for` derivation in the reducer, mirroring `sharedBaselineStep` and the join queue. ~120 lines and fixture tests from umc3/p9dr. | **Copies engine rules into the board**, so they can drift when `decide-build.ts` changes (#519 already changed the queue order once). Keep the conditions narrow and fall back to A. |
| **C. Engine `ticket_waiting` record** | Same text as B, plus the one wait the board can't see: "waiting for a prepare slot (1 of 1 in use, 6m)". | New optional record `ticket_waiting { ticket, for: 'baseline' \| 'join_queue' \| 'start_queue' \| 'prepare_slot', on_ticket: number \| null, since }`, written once when a wait starts and ended by the ticket's next `step_started`. Prepare: written around `PREPARE_SLOTS.run` in `prepareCheck` when the slot isn't free at once, ideally with #518's `wait_ms`. | Medium. `decide` is pure, so "already announced" has to live in replayed state. The prepare one is a side effect inside a gate step. Board: new vocabulary entry, and the old journals still parse. | A few more records (one per wait, not per tick). Must stay optional for old journals. Engine and board ship together (fixed group), so version skew is small. |
| **D. Live agent progress, outside the journal** | On an agent's card: "test-writer · 41k tokens · last: Edit `reduce-board.ts` (12 s ago)". Plan usage fills in about 2 s into the first turn instead of 3 to 38 min. | The engine already has every SDK message (`claude-launcher.ts:339-400`) and every tool call (the guard hook). Add a throttled, ephemeral push (a `BoardLink` side message, or a run-folder `live.json` that is overwritten). Journal the `rate_limit_event` readings as they arrive (only 3 to 5 a session) so plan usage is early *and* replayable. | Medium to large: a new channel and schema, throttling (for example ≤1 update per 5 s per agent), and the board merges ephemeral state that it drops when the step ends. | **Never put per-tool events in the journal**: it only grows and is the source of truth, and p9dr is already 33 MB. Tool text can leak paths and secrets into the UI, so show only the tool name and file basename. Flicker if updates are too frequent. |
| **E. Engine alive / heartbeat for every run** | Footer: "engine alive · last heard 5 s ago", or "engine not running (last record 1h 42m ago)". Timers stop when the engine is gone. | Board only: run the existing `liveRunIds` process check over `outside` runs too, as a read-only status with no restart. Optional engine heartbeat, the mtime of D's `live.json`, for "alive but hung". | Small for the process check (it reuses `engine-watch.ts`). Trivial once D exists. | Listing processes every 15 s is already paid for. Must never restart command-line runs; it only labels them. |
| F. Spinner or pulse on busy cards | Motion on cards with an open step or a wait | RN `ActivityIndicator`/`Animated` (host runtime, unverified) | Small | Adds little: the 1 s timer already moves. With 8+ busy cards it is visual noise and battery cost on mobile. Only worth a tiny static "●" busy dot. |

## Recommendation

1. **Do A + B + E-board now, in the board only.** Every busy card always says *what* it is doing or *what it is waiting for*, with a timer that counts up. The footer's `latest` gets an age, and command-line runs get the "engine not running" check. That covers the screenshot's state (row 1) and rows 2, 3, 8 and 9 with no engine change.
2. **Then C + D in the engine.** `ticket_waiting` makes B's text engine-owned, so the board stops copying `decide-build.ts`, and adds the prepare-slot wait. Pair it with #518's `wait_ms`/`duration_ms`. D's live channel gives tokens so far, the latest tool, and an early plan reading. Journal only the plan readings; keep everything per-tool out of the journal.
3. **Skip spinners (F).** The ticking timer already shows movement. A wait line with a reason is what tells the owner nothing is broken.

## Fit with #557 and the related issues

- #557 (the child of spec #552, being built in the screenshot's run) changes the ticket's **stage**: building, reviewing, testing, fixing, joining. It works from records the board already reads. It doesn't add a "waiting" stage or anything for a card with no open step. This work is the **next layer** on the same reducer (`reduce-board.ts`): a stage tells you *which column*, and a wait line tells you *why it is quiet*. It builds on #557 rather than against it. The wait line should read correctly under every #557 stage, for example "joining · waiting to join after #331". #557 has no "waiting" stage, so a queued-to-join card sits in whichever stage #557 gives it.
- **Make it its own issue, sequenced after #557.** Both touch `reduce-board.ts` and the card view, so building them in parallel would conflict. #549 asked to "show how long the card has been in its current step"; #557 covers the stage, and this covers the time and the reason. Link to #518 (wait and run timings; it covers C's prepare part) and #550 (two runs on one repo; option E's process check could also say "another run on this repo is running").
- The engine half (C + D) is better as a second issue, so the board-only fix can ship in one small run.

## Proposed issue (not created)

**Title:** The board says what a quiet ticket is waiting for, and how long

**Body:**

```markdown
## Problem

Run `luca-20261013-211233-umc3` (spec #552): #554–#557 showed "starting", empty step dots, no step line and 0 tokens for 4m43s (seq 72 → seq 73), while #553 ran the baseline tests they all share. The engine makes them wait on purpose (`sharedBaselineStep`, `packages/engine/src/core/decide-build.ts:1081-1124`), but a wait writes no record, so the board shows nothing and the run looks stalled.

Across 29 journals, cards sat quiet like this for:
- waiting for another ticket's baseline: 34 times, 1m52s–28m34s;
- approved and waiting in the join queue: 22 times, 1m05s–47m34s;
- runs started from the command line whose engine died: still "engine running", with a step timer counting up (96–607 min before a resume).

The footer's `latest:` has no age, so a 5-minute-old "#557: started." reads as news.

Research: `docs/research/board-liveness.md` (branch `research/board-liveness`).

## What to build (board only)

- A started, unfinished ticket card always shows one line with a timer that counts up: its running step (as today), or what it is waiting for:
  - "waiting for #553's baseline tests" (same `base_sha`, no baseline yet, the other ticket's `run_baseline_tests` step is open);
  - "waiting to join after #331" (approved, another ticket is joining or running its gates on the run branch);
  - "starts once #331 has joined" (not started, no blockers, a ticket is in the join queue);
  - otherwise "waiting for the engine's next step", timed from the ticket's last record.
- The footer reads "latest (4m 43s ago): …".
- Runs the plugin didn't start get the same engine process check as the plugin's own runs, as a label only, never a restart: "engine not running (last record 1h 42m ago)". Step timers stop counting when the engine is gone.
- Builds on #557's stages and doesn't change them. Old journals and stored board state still load.

## Acceptance criteria

- [ ] Fed umc3's records up to seq 72, #554–#557 each show "waiting for #553's baseline tests" with a time, and #553 shows "running the baseline tests".
- [ ] Fed p9dr's records up to seq 1070, #329 shows "waiting to join after #331".
- [ ] A card that is done, stuck, skipped or blocked never shows a wait line.
- [ ] When no rule matches, the card shows the generic wait line, never a wrong reason.
- [ ] The footer's latest line shows its age, and the age ticks.
- [ ] A command-line run whose engine process is gone shows "engine not running", and the board never restarts it.
- [ ] Old fixture journals and stored board state still load. Tested through the board's state and panel tests.

## Out of scope (follow-up issue)

An engine-owned `ticket_waiting { ticket, for, on_ticket, since }` record, which also covers waiting for a prepare slot (with #518), and a live side channel (not the journal) for an agent's tokens so far, its latest tool, and the first plan-usage reading, which today arrives 3–38 minutes into a run.

Refs #549, #557, #518, #550.
```
