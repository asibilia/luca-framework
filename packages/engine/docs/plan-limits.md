# @luca/engine: plan limits, billing, and the usage line

## Plan limits and billing

Every agent turn's `agent_session` holds its `rate_limit_event` readings
(`status`, `rateLimitType`, `resetsAt` in Unix seconds, and each window's
`utilization`, a 0-to-1 fraction, under `unifiedWindows`), and
`billing_error` when an assistant message came back with one. The launcher
cuts a turn off (`failure: 'plan'`, the session closed) at the first
reading that isn't fine. The executor journals the session and nothing
else: the turn uses up no try, and its step stays open. The decision step
reads the journal (`decidePlan`, `src/limits/plan-signals.ts`):

| Reading | What the run does |
| --- | --- |
| `allowed`, `allowed_warning` | Goes on. The board colors plan usage. |
| `rejected` | A **limit wait** for the whole run, for the window it names. |
| `isUsingOverage` or `overageInUse` true, or `rateLimitType: "overage"` (any status) | Stops at once, for good. |
| an assistant `billing_error` | Stops at once, for good. |

Billing beats a limit. `overageStatus: "rejected"` alone (overage off) is fine.

```
agent_session with a rejected reading
  decide ──> start_limit_wait     comment on the spec (once per reset) ──> limit_wait_started
  decide ──> wait_for_limit       sleep by the clock until `until`    ──> limit_wait_ended
  decide ──> the step the limit cut off, again, on the same model
agent_session with a billing sign
  decide ──> stop_for_billing                                          ──> run_stopped (billing: true)
  decide ──> record_usage (the run's), then done (stopped), however often the engine starts again
```

- **Until when.** A limit wait ends at `resetsAt` plus
  `LIMIT_WAIT_MARGIN_MS` (1 minute). A reading with no `resetsAt` waits
  `DEFAULT_LIMIT_WAIT_MS` (15 minutes) from the hit. A weekly window can
  reset days out; the engine sleeps in naps of at most 5 minutes and checks
  the clock after each, so a laptop that slept wakes on time.
- **Restarts.** The wait is in the journal, so a restarted engine waits out
  only what is left, and one whose reset already passed goes on at once. The
  spec hears of each new reset once (`announce` is false for a reset it
  already heard of).
- **No model switch.** When Opus's weekly cap (`seven_day_opus`) runs out,
  the whole run waits like any other limit. The launcher always runs Opus.
- **A cut-off follow-up.** The session closed with the limit, so after the
  wait the follow-up fails as `engine` and a fresh agent of that role
  starts, as for any lost session.
- **A plan cut-off with no sign in its session** (it shouldn't happen) is
  journaled as an ordinary `run_stopped`, and `runEngine` throws.
- **The clock.** `runEngine({ ..., clock })` takes an `EngineClock`
  (`now`, `sleep`); it defaults to `SYSTEM_CLOCK`. Tests fake it, so nothing
  really waits.

**Usage** (`decideUsage`, `src/limits/plan-usage.ts`). Tokens per agent are
each `agent_session`'s `usage`. Once a ticket is pushed or stuck, and once
the run is about to end (its next action is `done`), the engine journals
`usage_recorded`: the agent turns, tokens summed, and each plan window's
`{ from, to, used }` in percent. The launcher stamps each reading with
`arrived_at` (ISO), and readings replay in arrival order; an older journal's
readings, with no `arrived_at`, keep journal order. A ticket's window starts
from the last reading before its first agent. A changed `resetsAt` means the
window reset, so it counts from 0 again; with the same `resetsAt`, only a
rise above the window's highest level since its reset counts, so a level
that wobbles between 62% and 63% uses 1 point (#425). A reading with no
`resetsAt` falls back to a drop meaning a reset. A retried ticket that finishes
again (stuck again, or pushed) with agent sessions newer than its last
record gets a new record over all of its sessions, so a ticket's latest
`usage_recorded` is its whole usage. Readings come in hundredths, so
per-ticket numbers are rough, and other sessions on the same plan count too.
A ticket or run with no agent sessions (scripted agents) records nothing.

**The run budget** (#435, `decideRunBudget`, `src/limits/run-budget.ts`).
Each run may use a budget of tokens, so a runaway run can't quietly use up
the week. A run's tokens are every agent turn's input, output, and
cache-creation tokens per model, subagents included, over every ticket, the
final review, and the learner; cache reads don't count. The default budget,
`DEFAULT_RUN_BUDGET_TOKENS` (9,000,000), is 3 times the largest run total in
the v1 dogfood journals; its comment says how it was worked out. A repo
changes it with `run_budget_tokens` (a positive whole number) in
`.luca/config.json`:

```json
{ "checks": { "test": "bun test" }, "run_budget_tokens": 12000000 }
```

Once the run's tokens reach the budget, the run is **stuck** with the reason
"run budget": nothing new starts, and steps in flight finish first.

```
decide ──> mark_run_stuck (reason run_budget) ──> run_stuck (ticket null)
decide ──> report_run_stuck    stuck comment on the spec ──> stuck_reported (ticket null)
decide ──> wait_for_reply ... ──> comment_read
decide ──> take_reply (retry or stop, ticket null) ──> reply_received
```

The spec owner replies on the spec issue with one word:

- `retry` adds one more full budget (the run may now use 2 budgets, then 3,
  ...), and the run carries on where it stopped.
- `stop` ends the run without a PR, as for any stop.

Only the spec owner counts. While the run is stuck on its budget, only a
bare `retry` or a `stop` is taken; the owner's other replies (such as
`retry #12` for a stuck ticket) wait until the run carries on. The board
shows the run's tokens against its budget, and the run stuck on it under
**Needs you**.

## The usage line

Every Luca run shares one Claude plan with you, so Luca keeps below a
**usage line** on the account's windows (`src/limits/usage-line.ts`,
`src/core/decide-usage-line.ts`). There are two lines, both host-scoped
`luca-board` settings:

| Setting | Default | Window |
| --- | --- | --- |
| `weekly_line` | 80 | the all-models weekly window (`seven_day`) |
| `five_hour_line` | 85 | the 5-hour window (`five_hour`) |

The plugin keeps them in `usage-lines.json` in its state folder
(`$LUCA_BOARD_STATE_DIR`, else `~/.local/state/luca/board`), and the engine
reads that file directly, so runs started from the command line obey them
too. A missing or broken file reads as the defaults. There is no Opus-only
line.

- **Shared readings.** Before each decision, a run shares its readings in
  `plan-readings.json` in Luca's state folder (next to `runs/`): the newest
  reading per window, by `arrived_at`, written atomically (a temp file, then
  a rename). It then reads the file back. The decision step uses whichever
  reading of a window arrived last, the run's own or another run's, so every
  run pauses together.
- **Pausing.** When the next steps include an agent's turn and the newest
  reading of a window is at or over its line, the decision step picks
  `start_usage_line_wait` as the run's only action. Steps that aren't an
  agent's (a red check, gates, a join) go on first, and an agent mid-turn
  finishes, since the wait is a run-level action that runs alone.
- **Carrying on.** The wait lasts until the window's reset plus
  `LIMIT_WAIT_MARGIN_MS` (1 minute). It naps at most 5 minutes at a time, and
  re-reads the lines before each nap: a line raised above the reading ends
  the wait early (`reason: 'line_raised'`). A line raised only to the
  reading isn't above it. After a wait that ended at the reset, readings of
  windows that reset by then are out of date and pause nothing.
- **Telling you.** The spec issue gets a comment when the run pauses (the
  window, the reading, the line, and the reset) and when it carries on. The
  board shows the paused state and names the line.
- **Unchanged.** A rejected reading's plan limit wait, and the stop on any
  overage, come before the usage line, as before.

```
newest reading at or over a line, and an agent's turn next
  decide ──> start_usage_line_wait   comment on the spec ──> usage_line_wait_started
  decide ──> wait_for_usage_line     nap by the clock, re-reading the lines
                                     comment on the spec ──> usage_line_wait_ended (reset | line_raised)
  decide ──> the agent's turn
```

`runEngine({ ..., usage })` takes the lines and the shared file
(`fileUsageLine`); left out, as in tests and the demo, there is no usage
line.
