# What usage numbers the SDK gives us, per run

Research for [#421](https://github.com/asibilia/luca-framework/issues/421), on the map "Luca v2 on other repos" (#418). It feeds the budgets ticket.

Checked on 2026-09-25 against `@anthropic-ai/claude-agent-sdk` 0.3.273 (bundled Claude Code 2.1.273), the engine at `6e32f7c4c`, and the 6 run journals in `~/.local/state/luca/runs/`.

## Short answer

- **The SDK tells us how full the plan's windows are, account-wide.** Every `rate_limit_event` carries `unifiedWindows` with the 5-hour and the all-models weekly (`seven_day`) window: a fraction used (0 to 1, in whole percents) and a reset time. Events come when a window moves by a whole percent, when the status changes, and at the start of each agent session. They are not sent on every response.
- **There is no Opus-only weekly number in these events.** The headers the CLI reads cover `five_hour`, `seven_day`, `seven_day_overage_included`, and `overage`. `seven_day_opus` shows up only as the name of the window that is currently closest to its limit. An experimental SDK call (`usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET`) returns `seven_day_opus` and `seven_day_sonnet` from the claude.ai usage endpoint, but it is marked unstable. The Max plan help page names only one weekly limit, across all models. Since every Luca agent runs Opus, the "Opus weekly cap" is, in practice, the `seven_day` window.
- **One run's share of the weekly cap can only be estimated, not measured.** The window is shared by every Claude session on the account (other runs, Alec's own Claude Code, claude.ai). It moves in 1% steps, and a run moves it by about 0 to 1 point. What we can measure per run is tokens (and the SDK's list-price dollar estimate). Turning those into "percent of the week" means dividing by an estimate of the plan's weekly size, which Anthropic doesn't publish.
- **The engine records every event as sent, plus tokens.** But it takes tokens from the result's `usage`, which leaves out subagents. It drops `modelUsage`, the event arrival time, and the result's `duration_api_ms`. Its window math for a run is also wrong when agents run in parallel. One real run shows `seven_day` "used" = 190 points when the window only went from 62% to 63%.

## a. What the SDK exposes

### The event type

`sdk.d.ts` (SDK 0.3.273), lines 5252-5285:

- `SDKRateLimitEvent`: "Rate limit event emitted when rate limit info changes." Fields: `type: 'rate_limit_event'`, `rate_limit_info`, `uuid`, `session_id`. **No timestamp.**
- `SDKRateLimitInfo`:
  - `status: 'allowed' | 'allowed_warning' | 'rejected'`
  - `resetsAt?: number` (seconds since the epoch)
  - `rateLimitType?: 'five_hour' | 'seven_day' | 'seven_day_opus' | 'seven_day_sonnet' | 'seven_day_overage_included' | 'overage'`
  - `utilization?: number`
  - `overageStatus?`, `overageResetsAt?`, `overageDisabledReason?` (a long enum), `isUsingOverage?`, `overageInUse?`, `surpassedThreshold?`, `limitScope?`, `errorCode?`, `canUserPurchaseCredits?`, `hasChargeableSavedPaymentMethod?`
- `unifiedWindows` is **not in the public type**. The CLI still sends it (see below), and the engine already reads it (`packages/engine/src/limits/plan-signals.ts:19-28`).

### How the CLI fills it (bundled binary, CLI 2.1.273)

This comes from reading minified code in the binary (`strings` on `claude-agent-sdk-darwin-arm64@0.3.273/claude`). The function names are minified, so the names below are what the code does, not the real names.

- **Headers read.** Per window, it reads `anthropic-ratelimit-unified-{5h,7d,7d_oi,overage}-utilization`, `-reset`, and `-surpassed-threshold`. The window list is `[["five_hour","5h"],["seven_day","7d"],["seven_day_overage_included","7d_oi"],["overage","overage"]]`. It also reads `anthropic-ratelimit-unified-status`, `-reset`, `-representative-claim` (which becomes `rateLimitType`), `-overage-status`, `-overage-reset`, `-overage-disabled-reason`, `-overage-in-use`, and others. **There is no Opus or Sonnet window header in that list.**
- **`unifiedWindows`** is built from the stored window readings for `five_hour`, `seven_day`, and `seven_day_overage_included` only. A reading goes in only if its reset is in the future and less than a year away. Each entry is `{ utilization, resetsAt }`.
- **Top-level `utilization`** is set only when the CLI decides the status is `allowed_warning`. That happens when the server sends a `surpassed-threshold`, or, locally, at 5h ≥ 90% with ≤ 72% of the window gone, or at 7d ≥ 75/50/25% with ≤ 60/35/15% of the window gone. Otherwise the top level has only `status`, `resetsAt`, and `rateLimitType`.
- **When an event is sent.** After each API response, the CLI works out the limits again. It sends an event (1) if the status, type, reset, or overage changed, or (2) if any window's `Math.round(utilization*100) + "@" + resets_at` changed. So it is sent on **every whole-percent move or reset change, not on every response.** A separate listener re-sends on quota rejection, throttled to once every 30 s. Each agent session is its own CLI process that starts with blank state, so its first response always sends one event. That matches the journals: almost every session has at least 1 event. The per-process part is inferred from the code, not tested.

### The result message

`sdk.d.ts` lines 5292-5400 (`SDKResultSuccess` / `SDKResultError`) and the doc page [Track cost and usage](https://code.claude.com/docs/en/agent-sdk/cost-tracking):

- `usage`: "MAIN AGENT LOOP ONLY — excludes Task subagent, sidechain, and auxiliary model calls, and is per-turn in streaming-input sessions. Prefer modelUsage for token/cost accounting."
- `modelUsage: Record<string, ModelUsage>`: per model, covers subagents and compaction, and is a **running total** across turns in streaming-input sessions. `ModelUsage` (line 1322) has `inputTokens`, `outputTokens`, `thinkingTokens?`, `cacheReadInputTokens`, `cacheCreationInputTokens`, `webSearchRequests`, `costUSD`, `contextWindow`, `maxOutputTokens`, `canonicalModel?`, `provider?`, and `costBasis?`.
- `total_cost_usd`: a running total across turns in streaming-input sessions. The docs say: "client-side estimates, not authoritative billing data." On a plan, it is list-price dollars, not what the plan counts.
- `duration_ms`, `duration_api_ms`, `num_turns`.

### The experimental `/usage` call

`sdk.d.ts` lines 2795-2813 and 3937-4050: `Query.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors })` returns `rate_limits` with `five_hour`, `seven_day`, `seven_day_oauth_apps`, `seven_day_opus`, `seven_day_sonnet`, `model_scoped[]`, and `extra_usage`. Each has `utilization` (0-100 here, not 0-1) and `resets_at` (ISO). It also returns the session's own `model_usage` and cost. It comes from the claude.ai usage endpoint, not from headers. It is marked "do not rely on it yet". **Unverified:** whether this account gets a non-null `seven_day_opus`. The call was not tried.

### Plan docs

- [What is the Max plan?](https://support.claude.com/en/articles/11049741-what-is-the-max-plan): "Max plans also have a weekly usage limit that applies across all models." It also says "Your session-based usage limit will reset every five hours" and that the weekly reset time is fixed per account. It names no Opus-only weekly limit.
- [How do usage and length limits work?](https://support.claude.com/en/articles/11647753-how-do-usage-and-length-limits-work): "your usage of all different Claude product surfaces (claude.ai, Claude Code, Claude Desktop) counts towards the same usage limit."
- The Agent SDK TypeScript reference page did not show a section on `rate_limit_event` in the part that could be fetched. **Not found in the docs.** The type file is the source used here.

## b. Can one run's share be measured?

No, only estimated.

1. **Account-wide.** `utilization` is the whole account's fill level, from response headers (see above; and the help page on shared limits). Two Luca runs at once, or Alec using Claude Code by hand, move the same number. A run can't tell its own movement apart from anyone else's.
2. **Too coarse.** Readings come in whole percents (for example `0.62`, `0.63`), and events are only sent when the rounded value changes. In the journals, every whole run moved `seven_day` by 0 or 1 point. With a precision of ±1 point, the per-ticket number is mostly noise.
3. **No timestamps.** The event has no time on it, and the engine journals a session's events only when the session ends. So readings from parallel sessions can't be put back in true order.
4. **What is exact per run:** tokens per model (`modelUsage`, which includes subagents) and the SDK's dollar estimate. An estimated share would be `run tokens / estimated weekly token budget`, where the budget is calibrated from history: tokens spent per point of `seven_day` movement over many runs, ideally at times when nothing else was using the account. The plan's weekly size is not published, and the estimate would shift if Anthropic changes how tokens are weighted.
5. **A usable middle ground:** read the account-wide `seven_day` before and after a run. It is an upper bound on the run's share when other work was going on at the same time, and it's close to exact when the run was alone. It still has a ±1 point error.

## c. What the engine records today, and what it drops

### Records

- **Every `rate_limit_event`'s `rate_limit_info`, as sent**, per agent session. See `agents/claude-launcher.ts:80-83` (schema) and `:297-299` (push), and `agents/agent-launcher.ts:46-47`.
- **From the result:** `num_turns`, `usage` (4 token counts), `total_cost_usd`, and permission denials (`claude-launcher.ts:90-117` and `:321-326`). Also `duration_ms`, which the engine measures itself with a wall clock, not the SDK's (`claude-launcher.ts:518`, `:599`, `:623`).
- **From init and `accountInfo()`:** model, CLI version, `apiKeySource`, and `subscription_type`.
- **The summary is reset each turn** (`claude-launcher.ts:461-471`). One `agent_session` record is written per turn.
- **`usage_recorded` records** (`limits/plan-usage.ts`, `core/decide-usage.ts`), per finished ticket and once for the run: the number of agent turns, summed tokens, and a `windows` map of `{from, to, used}` in percent. It uses `unifiedWindows`, then the top-level window (`plan-usage.ts:65-78`).
- **Enforcement:** `planSignal` turns a `rejected` reading into a limit wait, and any overage into a billing stop (`limits/plan-signals.ts:63-95`). Nothing enforces a per-run or per-ticket cap.

### Drops, or gets wrong

1. **`modelUsage` is not read** (`ResultSchema` has no field for it). The token counts come from `usage`, which **leaves out subagent and compaction calls**. The engine runs in streaming-input mode (`claude-launcher.ts:593`, `prompt: input.iterable`), where `usage` is also per turn only. So the per-turn sums are right for the main loop, but they undercount anything the agent does through subagents.
2. **`total_cost_usd` is stored per turn, but it's a running total** for the session in streaming-input mode. Adding it across a session's follow-up turns would count the same spend twice. The engine doesn't add it up today, but anyone who uses it later has to take each session's last value, not the sum.
3. **No arrival time for events**, and events are journaled at the end of each session. So readings from parallel sessions come in out of order.
4. **Reset detection by "lower than before" breaks with parallel sessions.** `plan-usage.ts:128-129` treats any drop as a window reset and counts the new value from 0. In run `luca-20260924-230826-8aoj`, parallel sessions at seq 339-355 journaled `seven_day` readings of 0.62 → 0.63 → 0.62 → 0.63 → .... Each "drop" added about 62 points, so the run record says `seven_day: {from: 62, to: 63, used: 190}`. For the same reason, `five_hour` says `used: 53` for a 3 → 9 move. The fix is to detect a reset from a change in `resetsAt` (every window reading has one), not from a drop in value.
5. **`duration_api_ms`, `modelUsage[*].costUSD`, and `webSearchRequests`** are not kept.
6. **The experimental `/usage` call is not used**, so no Opus or Sonnet weekly number is ever seen, unless one of them becomes the binding `rateLimitType`.

## What the real journals show

A tally over all 6 runs in `~/.local/state/luca/runs/` (5 with agent sessions; 83 sessions; 116 events):

| Field | What appeared |
| --- | --- |
| `status` | `allowed` 111, `allowed_warning` 4, `rejected` 1 |
| `rateLimitType` | `five_hour` in all 116 events. Never `seven_day`, `seven_day_opus`, `seven_day_sonnet`, or `overage` |
| top-level `utilization` | only on the 4 `allowed_warning` events (0.98, 0.99, 0.99, all with `surpassedThreshold: 0.9`); missing on the other 112 |
| `unifiedWindows` | on all 116, always both `five_hour` and `seven_day`; never `seven_day_overage_included` |
| overage | `overageStatus: "rejected"`, `overageDisabledReason: "org_level_disabled"`, `isUsingOverage: false` on every `allowed` event |
| `resetsAt` | seconds since the epoch; for example, 5h reset `1790301000`, 7d reset `1790420400` (the same 7d reset across all runs in the week) |
| `subscription_type` | `Claude Max` on all 83 sessions |
| model | `claude-opus-5-5` only |

The one `rejected` event: `{"status":"rejected","resetsAt":1790265000,"rateLimitType":"five_hour","overageStatus":"rejected","overageDisabledReason":"org_level_disabled","isUsingOverage":false,"unifiedWindows":{"five_hour":{"utilization":1,...},"seven_day":{"utilization":0.58,...}}}`.

Events per session: 0 to 4, mostly 1 or 2. 5 of 83 sessions had none.

Per run:

| Run | Sessions | Events | `seven_day` first → last | Output tokens | Cache-read tokens | SDK $ estimate (sum per turn, see c.2) |
| --- | --- | --- | --- | --- | --- | --- |
| luca-20260924-150639-ovty | 9 | 11 | 57% → 58% | 48,388 | 4.0M | 6.02 |
| luca-20260924-202016-5hp1 | 16 | 19 | 61% → 61% | 93,528 | 5.8M | 10.37 |
| luca-20260924-230826-8aoj | 26 | 38 | 62% → 63% | 261,123 | 28.6M | 29.24 |
| 20260925t013006z-ebe29030 | 13 | 20 | 63% → 64% | 256,795 | 34.4M | 20.35 |
| luca-20260925-142205-y36h | 19 | 28 | 64% → 65% | 141,640 | 10.7M | 10.80 |

So a run costs roughly 0 to 1 point of the weekly window, which is about the same size as the reading's rounding.

## Unverified

- Whether the experimental `/usage` call returns a non-null `seven_day_opus` for this account.
- Whether Luca's agents use subagents (the Task tool) enough for the `usage` undercount to matter.
- The "each session sends an event on its first response" behavior comes from reading the code, not from a test.
- The CLI details come from minified code in one version (2.1.273). They could change in any release.
