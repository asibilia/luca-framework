# Which Claude plans can run Luca's all-Opus agents?

> Research for wayfinder ticket [#444](https://github.com/asibilia/luca-framework/issues/444) on the map "Luca v14 on npm" (#438).
> Date: 2026-09-26. Checked: Claude Code 2.1.280. Plan facts come from Anthropic's own pages only, fetched live on this date. Luca facts come from this repo's code and this machine's run journals.
> Builds on [plan-billing research (#345)](https://github.com/asibilia/luca-framework/blob/research/plan-billing/docs/research/luca-on-claude-code/plan-billing.md).

## Answer

- **These plans can run Luca:** Pro, Max 5x, Max 20x, Team (Standard and Premium seats), and Enterprise. Each one includes Claude Code with a claude.ai login. Opus 5.5 is the default model in Claude Code on all of them, from Claude Code 2.1.280.
- **Free can't.** Free has no Claude Code and no Opus.
- **Education:** not confirmed.
- **Claude Code 2.1.280 or later is required.** Opus 5.5 needs that version. This machine is on 2.1.280, the lowest version that has it.
- **The usage line does not work the same on each plan.**
  - **Pro and Max** have a 5-hour window and a weekly window. The status line docs cover both windows for these plans. This is the best fit for Luca.
  - **Team** has the same two windows for each member. But the status line docs say the window data is only for Pro and Max. No doc confirms that Luca can read the windows on Team.
  - **Enterprise (the current, usage-based kind)** has no 5-hour or weekly window. Every token is billed at API rates. The only stop is a monthly spend limit that an admin sets. So there is no window share for the usage line to measure.
  - **Legacy seat-based Enterprise** (Standard and Premium seats) has windows like Team. It is being moved to the usage-based kind at each renewal.
- **Anthropic publishes no hard numbers.** There are no hours, messages, or tokens for any plan. Plans are only given as multiples of Pro's "per-session" allowance.
- **No plan page names a separate weekly Opus cap today.** But Claude Code still has a "You've hit your Opus limit" message, and the SDK types still list `seven_day_opus`.

| Plan | Claude Code? | Opus 5.5? | 5-hour window | Weekly window | Separate weekly Opus cap | Price (US) | Usage data Luca can read |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Free | No | No | n/a | n/a | n/a | $0 | n/a |
| Pro | Yes | Yes (default) | Yes. The base size (1x). | Yes, across all models | None published | $20/mo monthly, or $17/mo on the annual plan ($200 up front) | Status line `five_hour` and `seven_day`, `/usage`, SDK `rate_limit_event` (the docs don't say which plans get it) |
| Max 5x | Yes | Yes (default) | Yes. 5x Pro "per-session". | Yes, across all models. Size not published. | None published | $100/mo, monthly only | Same as Pro |
| Max 20x | Yes | Yes (default) | Yes. 20x Pro "per-session". | Yes, across all models. Size not published. | None published | $200/mo, monthly only | Same as Pro |
| Team, Standard seat | Yes | Yes (default) | Yes, for each member. 1.25x Pro "per-session". | Yes, across all models | None published | $25/seat/mo monthly, or $20 annual. 2 to 150 members. | `/usage` and claude.ai Settings > Usage. The status line `rate_limits` is documented for Pro and Max only. SDK: not stated. |
| Team, Premium seat | Yes | Yes (default) | Yes, for each member. 6.25x Pro "per-session" (5x a Standard seat). | Yes, across all models | None published | $125/seat/mo monthly, or $100 annual | Same as a Standard seat |
| Enterprise, current (usage-based, one seat type) | Yes, on every seat | Yes (default), unless an admin restricts it or sets another default | None | None | n/a | US$20/seat/mo, billed annually, plus all usage at API rates. At least 20 seats self-serve, or 50 through sales. | No windows. Monthly spend limits only. The status line `spend_limit` shows only behind a Claude apps gateway. |
| Enterprise, legacy seat-based (Standard or Premium seats) | Premium seats only | Yes | Yes (size not published) | Yes (size not published) | None published | Not published | Probably like Team. Not confirmed. |
| Education | Not confirmed | Not confirmed | Not confirmed | Not confirmed | Not confirmed | Talk to sales | Not confirmed |

**What the user docs should say** (from the findings below and "How Luca reads plan usage today"):

- **You need Claude Pro or Max, and Max is what Luca is built for.** Every role runs Opus, and Pro's 1x allowance will make runs spend a lot of time in limit waits. On Max, the 5-hour window runs out first, not the weekly one.
- **You need Claude Code 2.1.280 or later as `claude` on your `PATH`.** Luca runs your own `claude`, and Opus 5.5 needs that version. Nothing in the engine checks it today, so `luca doctor` is the natural place for that check.
- **Team probably works, but the usage line is not confirmed there.** If the window data doesn't come through, runs still stop and wait at the plan's own limit. They just can't stop early at the line.
- **Usage-based Enterprise is per-token billing.** It has no 5-hour or weekly window. It doesn't fit v14's "not an API key, not per-token" setup, even though the launcher's plan check lets `enterprise` through today.
- **Usage credits should be off.** With credits on, work past a limit is billed at API rates. Luca stops for good at any sign of overage, but the docs don't promise the SDK asks first.

## Findings

### 1. Which plans include Claude Code with Opus 5.5

**Free has no Claude Code and no Opus.** The plan table on [claude.com/pricing](https://claude.com/pricing) says Claude Code is "No" on Free and "Yes" on Pro, Max 5x, and Max 20x. It says Opus is "No" on Free and "Yes" on the other three. The Claude Code [authentication](https://code.claude.com/docs/en/authentication) page lists only "Claude Pro or Max subscription" for people signing in on their own, and "Claude for Teams or Enterprise" for organizations.

**Pro and Max include Claude Code.** One subscription covers both: "With Pro and Max plans, you now have access to both Claude on the web, desktop, and mobile apps and Claude Code in your terminal with one unified subscription" ([11145838](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan)). The Pro page lists "Claude Code access" ([8325606](https://support.claude.com/en/articles/8325606-what-is-the-pro-plan)). The Max page lists "Access to Claude Code" ([11049741](https://support.claude.com/en/articles/11049741-what-is-the-max-plan)).

**Team includes Claude Code on every seat.** For Enterprise, it depends on the seat: "Claude Code is included with every Team plan seat. ... For Enterprise plans, Claude Code is included with the single Enterprise seat on new and self-serve plans. On older Enterprise plans, Claude Code is available on Chat + Claude Code seats (usage-based billing) and Premium seats (seat-based billing)" ([11845131](https://support.claude.com/en/articles/11845131-use-claude-code-with-your-team-or-enterprise-plan)). The Team page also says "Access to all available models" ([9266767](https://support.claude.com/en/articles/9266767-what-is-the-team-plan)). The pricing page marks Opus "Yes" for Team and both kinds of Enterprise ([claude.com/pricing](https://claude.com/pricing)).

**Opus 5.5 is the default model on every paid plan, from 2.1.280.** The [model config](https://code.claude.com/docs/en/model-config#default-model-setting) docs say: "**Pro, Max, Team, Enterprise, and Anthropic API**: defaults to Opus 5.5". Before 2.1.280, the default was "Sonnet 5 on Pro and Team Standard, and ... Opus 5 on Max, Team Premium, Enterprise". The same page says "Opus 5.5 requires Claude Code v2.1.280 or later."

**The `opus` alias points to Opus 5.5 today.** The alias table lists "Anthropic API | Opus 5.5". The page adds: "Before v2.1.280, `opus` resolved to Opus 5" ([model-config](https://code.claude.com/docs/en/model-config#model-aliases)). To pin the version, use the full name, "for example `claude-opus-5-5`" (same page).

**Opus 5.5 exists, and its id is `claude-opus-5-5`.** The [models overview](https://platform.claude.com/docs/en/about-claude/models/overview) lists "Claude API ID | ... | claude-opus-5-5". It gives a 1M-token context window and 128K max output. The help center's Claude Code list starts with "Opus 5.5, `claude-opus-5-5`" ([11940350](https://support.claude.com/en/articles/11940350-claude-code-model-configuration)). The launch post is dated September 22, 2026 ([anthropic.com/claude-opus-5-5](https://www.anthropic.com/claude-opus-5-5)).

**1M context comes with Opus 5.5 on every plan.** "On the Anthropic API, Fable 5.1, Fable 5, Sonnet 5, and Opus 4.7 and later run with the 1M window on every plan, including Pro. You don't select a `[1m]` variant or turn on usage credits for the 1M window on these models" ([model-config, extended context](https://code.claude.com/docs/en/model-config#extended-context)). The help center gives Opus 5.5 "1M tokens" in Claude Code ([8606394](https://support.claude.com/en/articles/8606394-how-large-is-the-context-window-on-paid-claude-plans)).

**Things that can take Opus 5.5 away:**
- **Enterprise admins** can turn models off. They can also set an organization default model ([model-config, organization model restrictions](https://code.claude.com/docs/en/model-config#organization-model-restrictions)). Other organizations limit models with `availableModels` in managed settings (same page).
- **Safety fallback.** A flagged request can move from Opus 5.5 to Opus 5, or to Opus 4.8 for cyber. The flags cover cyber, biology, and "Frontier LLM development (Opus 5.5 only)". This switch "is active by default" and works the same in Claude Code ([16049681](https://support.claude.com/en/articles/16049681-why-claude-switched-models-in-your-conversation-with-opus-5-or-opus-5-5)).
- **An `ANTHROPIC_API_KEY` in the environment.** Claude Code will then "use this API key for authentication instead of your Claude subscription" ([11145838](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan)).

### 2. Weekly and 5-hour limits per plan

**Pro:** "Your session-based usage limit will reset every five hours. Pro plans also have a weekly usage limit that applies across all models. Weekly limits reset at a fixed time each week that is assigned to your account" ([8325606](https://support.claude.com/en/articles/8325606-what-is-the-pro-plan)). The number of messages "will vary based on message length, including the length of files you attach, the length of your current conversation, and the model or feature you use" (same page).

**Max:** "**Max 5x** includes five times the Pro plan's per-session usage allowance. ... **Max 20x** includes 20 times the Pro plan's per-session usage allowance. Your session-based usage limit will reset every five hours. Max plans also have a weekly usage limit that applies across all models. The weekly limit resets at a fixed time each week that is assigned to your account" ([11049741](https://support.claude.com/en/articles/11049741-what-is-the-max-plan)). The pricing page says "Choose 5x or 20x more usage than Pro" ([claude.com/pricing](https://claude.com/pricing)).

**Team:** "Team plan Standard seats include 1.25x the Pro plan's per-session usage allowance and have a weekly usage limit that applies across all models. ... Team plan Premium seats include 6.25x the Pro plan's per-session usage allowance". Also: "Usage limits on Team plans are per-member, rather than applied to the team as a whole" ([9266767](https://support.claude.com/en/articles/9266767-what-is-the-team-plan)). The pricing page calls a Premium seat "5x more usage than standard seats" ([claude.com/pricing](https://claude.com/pricing)). The costs doc says each member's usage "resets on a rolling five-hour window and a weekly window" ([costs](https://code.claude.com/docs/en/costs#claude-for-teams-and-enterprise)).

**Enterprise (current, usage-based):** "Usage-based Enterprise plans—including the single Enterprise seat described above—have **no plan or seat-level usage limits**" ([9797531](https://support.claude.com/en/articles/9797531-what-is-the-enterprise-plan)). Also: "Enterprise seats don't come with an individual token allowance" ([11526368](https://support.claude.com/en/articles/11526368-how-am-i-billed-for-my-enterprise-plan)). Admins set spend limits for the org and for each user. The consumption guide says those limits "reset at 00:00 UTC on the 1st of the month" ([14782391](https://support.claude.com/en/articles/14782391-claude-enterprise-consumption-guide)).

**Enterprise (legacy seat-based):** "Some Enterprise organizations are on older seat-based plans that use **Standard** and **Premium** seats with per-seat usage limits" ([9797531](https://support.claude.com/en/articles/9797531-what-is-the-enterprise-plan)). These plans move to the usage-based model at the next renewal (same page). No multiples are published for these seats.

**No hard numbers anywhere.** None of the plan pages gives hours of Opus, messages, prompts, or tokens. The only sizes are the multiples above, and each one is stated for the "per-session" allowance. No page says the weekly limit grows by the same multiple.

**Limits went up twice this year. Neither time came with numbers.**
- May 6, 2026: "we're **doubling Claude Code's five-hour rate limits** for Pro, Max, Team, and seat-based Enterprise plans" and "**removing the peak hours limit reduction on Claude Code** for Pro and Max accounts" ([higher-limits-spacex](https://www.anthropic.com/news/higher-limits-spacex)).
- September 22, 2026, with Opus 5.5: "we're increasing five-hour usage limits on Pro, Max, Team, and seat-based Enterprise plans. We're also providing subscription users a rate limit reset" ([claude-opus-5-5](https://www.anthropic.com/claude-opus-5-5)).

**Opus caps and model families:**
- Claude Code still lists `You've hit your Opus limit · resets 3:45pm` and `You've hit your Sonnet limit`. The docs say "The Opus and Sonnet limits each apply only to requests to that model family" ([errors](https://code.claude.com/docs/en/errors#youve-hit-your-session-limit)).
- No plan page says which plans have such a cap. The claude.ai usage page shows weekly limits "for all models, and for Fable (if included in your plan)" ([9797557](https://support.claude.com/en/articles/9797557-usage-limit-best-practices)). Opus is not named there.
- Fable is the only model with a published per-model share: "You can use up to 50% of your weekly usage limits on Fable models at no extra cost" on Max, Team Premium, and legacy Enterprise Premium seats ([15424964](https://support.claude.com/en/articles/15424964-claude-fable-models-on-your-plan)).
- Opus burns quota faster. It "uses meaningfully more of your quota" ([14552983](https://support.claude.com/en/articles/14552983-models-usage-and-limits-in-claude-code)).

**Both windows fill at once.** "Usage counts against the session and weekly allowances at the same time. A single burst of heavy activity, such as a large workflow fanout, can exhaust the weekly allowance before the session window resets" ([errors](https://code.claude.com/docs/en/errors#youve-hit-your-session-limit)). All surfaces share one limit: "your usage of all different Claude product surfaces (claude.ai, Claude Code, Claude Desktop) counts towards the same usage limit" ([11647753](https://support.claude.com/en/articles/11647753-how-do-usage-and-length-limits-work)).

**Other caps can come at any time.** "We may limit your usage in other ways, such as weekly and monthly caps or model and feature usage, at our discretion" (Pro and Max pages).

**Luca's agents use the plan windows.** Paseo runs Claude Code through the Agent SDK, and that usage still counts against the plan. Anthropic's June 15 update says: "For now, nothing has changed: Claude Agent SDK, `claude -p`, and third-party app usage still draw from your subscription's usage limits" ([15036540](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)). The same page shows a plan to move SDK usage to a separate monthly credit. That plan is paused, and the page keeps it only "for reference".

**Limit resets.** Anthropic sometimes gives a free "limit reset". It fills the five-hour or weekly limit back to full. The reset button "isn't currently available ... in Claude Code in your terminal or IDE" ([17007452](https://support.claude.com/en/articles/17007452)).

### 3. What each plan reports about its windows

**Status line (`rate_limits`): documented for Pro and Max only.** "`rate_limits`: appears only for claude.ai Pro and Max subscribers, or behind a Claude apps gateway that sets a spend limit for you, and only after the first API response in the session. Each window (`five_hour`, `seven_day`, `spend_limit`) may be independently absent" ([statusline](https://code.claude.com/docs/en/statusline#rate-limit-usage)). Each window has `used_percentage` (0 to 100) and `resets_at` (Unix epoch seconds). There is no Opus-only or Fable-only field. Team and Enterprise are not named.

**`/usage`: covers every paid plan, in different ways.**
- The commands page: "Show session cost, plan usage limits, and activity stats. On a Pro, Max, Team, or Enterprise plan, includes a breakdown of what counts against your plan limits" ([commands](https://code.claude.com/docs/en/commands)).
- The costs page: "Claude Max and Pro subscribers have usage included in their subscription ... Subscribers see plan usage bars" ([costs](https://code.claude.com/docs/en/costs#using-the-%2Fusage-command)).
- The breakdown part is "computed from local session history on this machine" (same page).
- When the usage endpoint is rate limited, `/usage` shows the "last-known usage" from the past 60 minutes (same page).
- No doc says whether Team users see the same plan bars.

**claude.ai Settings > Usage: Pro, Max, Team, and seat-based Enterprise.** "If you're using a Pro, Max, Team, or seat-based Enterprise plan, you can navigate to Settings > Usage to view progress bars showing how much of your five-hour session and weekly usage limits you've consumed." On usage-based Enterprise, "you won't have specific usage limits, but will be charged based on consumption" ([9797557](https://support.claude.com/en/articles/9797557-usage-limit-best-practices)).

**Agent SDK `rate_limit_event`: no plan is named.**
- **TypeScript.** The type is `rate_limit_info: { status: "allowed" | "allowed_warning" | "rejected"; resetsAt?: number; utilization?: number; errorCode?: "credits_required"; canUserPurchaseCredits?: boolean; hasChargeableSavedPaymentMethod?: boolean }`. It is "Emitted when the session encounters a rate limit." The TypeScript type does **not** list `rateLimitType`. `credits_required` means "a claude.ai subscription whose included usage is exhausted", and it needs v2.1.181 or later ([agent-sdk/typescript](https://code.claude.com/docs/en/agent-sdk/typescript#sdkratelimitevent)).
- **Python.** The Python type lists `rate_limit_type` as one of `"five_hour", "seven_day", "seven_day_opus", "seven_day_sonnet", "overage"`. It also has `utilization` ("Fraction of the rate limit consumed (0.0 to 1.0)"), `overage_status`, and a `raw` dict. It is "Emitted when rate limit status changes (for example, from `"allowed"` to `"allowed_warning"`)" ([agent-sdk/python](https://code.claude.com/docs/en/agent-sdk/python#ratelimitinfo)).
- Neither page says which plans send the event, or how often it comes.

**Warnings and waiting.**
- Claude Code can warn before a window runs out: "`You've used 85% of your session limit · resets 3:45pm`" ([errors](https://code.claude.com/docs/en/errors#youve-hit-your-session-limit)).
- Claude Code's own auto-wait only works "in interactive sessions signed in with a claude.ai subscription" ([interactive-mode](https://code.claude.com/docs/en/interactive-mode#wait-for-a-usage-limit-to-reset)).

**Enterprise (usage-based) reports spend, not windows.** The stop messages include `You've hit your individual spend limit`, `You've hit your org's monthly spend limit`, and `You've hit your team's shared budget`. "On organizations with usage-based billing, the message says `usage limit` in place of `spend limit`" ([errors](https://code.claude.com/docs/en/errors#youve-hit-your-monthly-spend-limit)). The status line's `spend_limit` window shows only "Behind a Claude apps gateway" and needs v2.1.251 or later ([statusline](https://code.claude.com/docs/en/statusline)).

**Two pages don't match the Enterprise plan pages.** The costs page says "On Claude for Teams and Enterprise plans, each member's Claude Code usage draws from a per-seat allowance that resets on a rolling five-hour window and a weekly window" ([costs](https://code.claude.com/docs/en/costs#claude-for-teams-and-enterprise)). Help article [14552983](https://support.claude.com/en/articles/14552983-models-usage-and-limits-in-claude-code) says an Enterprise seat gets "A pool of usage included in your organization's plan, reset on a rolling window." Both clash with the Enterprise plan and billing pages, which say usage-based Enterprise has no per-seat limits. Those pages were updated Sep 1 and Sep 25, 2026. This note trusts the plan and billing pages, and reads the costs text as true for Team and legacy seat-based Enterprise only.

### 4. Usage credits and spill-over per plan

- **Free:** no usage credits ([claude.com/pricing](https://claude.com/pricing): "Usage credits | No").
- **Pro and Max:**
  - Credits keep you working past the limit "at standard API rates". "Usage credits apply to both Claude conversations and Claude Code terminal usage" ([12429409](https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans)).
  - You turn them on at Settings > Usage. You can set a monthly spend limit or "Set to unlimited", prepay funds, and turn on auto-reload. "There is a daily redemption limit of $2000" (same page).
  - Discount bundles are available (10% to 30% off, up to $2000 a month) ([14246112](https://support.claude.com/en/articles/14246112-buy-usage-bundles)).
  - In Claude Code, `/usage-credits` opens Settings > Usage ([costs](https://code.claude.com/docs/en/costs#add-usage-credits-to-your-subscription)).
- **Team:**
  - An Owner turns credits on for the org or for certain users, with org and user spend limits ([12005970](https://support.claude.com/en/articles/12005970-manage-usage-credits-for-team-and-seat-based-enterprise-plans)).
  - A member without billing access runs `/usage-credits` to ask an admin. In `-p` mode "the command sends no request" ([costs](https://code.claude.com/docs/en/costs#add-usage-credits-to-your-subscription)).
  - Bundles are available up to $3000 a month ([14246112](https://support.claude.com/en/articles/14246112-buy-usage-bundles)).
- **Legacy seat-based Enterprise:** credits exist, "billed at the end of each month based on your actual usage" ([12005970](https://support.claude.com/en/articles/12005970-manage-usage-credits-for-team-and-seat-based-enterprise-plans)).
- **Usage-based Enterprise:** "Usage credits don't apply to current usage-based Enterprise plans ... all usage is billed at API rates from the first token" ([12005970](https://support.claude.com/en/articles/12005970-manage-usage-credits-for-team-and-seat-based-enterprise-plans)). On self-serve, the org shares one prepaid credit pool. "When the balance hits zero, usage stops for the whole organization until an Owner purchases more" ([11526368](https://support.claude.com/en/articles/11526368-how-am-i-billed-for-my-enterprise-plan)).

**What this means for Luca:**
- **Credits off.** When the plan runs out, an SDK session gets `errorCode: "credits_required"`. "The session cannot continue until the user buys usage credits" ([agent-sdk/typescript](https://code.claude.com/docs/en/agent-sdk/typescript#sdkratelimitevent)).
- **Credits on.** No doc says whether an SDK or `-p` session starts spending credits on its own when a window runs out. The docs only say this for Fable: "In non-interactive mode with the `-p` flag and through the Agent SDK, Claude Code never shows the consent prompt. When a Fable request there would bill to usage credits, Claude Code bills it without asking" ([model-config](https://code.claude.com/docs/en/model-config#fable-and-usage-credits)). This matters only if a role ever runs on `fable` or `best`.
- **Cost of spill-over.** Prompt cache life "is an hour on a subscription and drops to five minutes once you're drawing on usage credits" ([costs](https://code.claude.com/docs/en/costs#why-usage-climbs-in-a-long-session)).

### 5. Terms that matter for a published tool

- **Which terms apply.** Consumer Terms cover "Free, Pro, and Max users". Commercial Terms cover "Team, Enterprise, and Claude API users" ([legal-and-compliance](https://code.claude.com/docs/en/legal-and-compliance)).
- **Ordinary, individual use.** "Advertised usage limits for Pro and Max plans assume ordinary, individual usage of Claude Code and the Agent SDK" ([legal-and-compliance](https://code.claude.com/docs/en/legal-and-compliance#acceptable-use)). No page defines "ordinary".
- **OAuth is for plan buyers.** It "is intended exclusively for purchasers of Claude Free, Pro, Max, Team, and Enterprise subscription plans and is designed to support ordinary use of Claude Code and other native Anthropic applications" (same page).
- **Tools built on Claude.** "Developers building products or services that interact with Claude's capabilities, including those using the Agent SDK, should use API key authentication ... Anthropic does not permit third-party developers to offer Claude.ai login into their own applications, or to route requests through Free, Pro, or Max plan credentials on behalf of their users. Moreover, developers may not collect, store, or intermediate Claude.ai credentials or session tokens" (same page).
- **What stays allowed.** "Nor does it prevent an end user from signing in to the unmodified Claude Code binary with their own Claude subscription" (same page). Hosted products must not modify the binary. They also "may not pay for, resell, or intermediate Claude usage on their end users' behalf" (same page).
- **Scripts and bots.** The Consumer Terms forbid access "through automated or non-human means, whether through a bot, script, or otherwise", "Except when you are accessing our Services via an Anthropic API Key or where we otherwise explicitly permit it" ([consumer-terms](https://www.anthropic.com/legal/consumer-terms)). Anthropic's own Agent SDK help page does count "third-party app usage" against plan limits ([15036540](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)).

This note only quotes the terms. It does not judge whether Luca's many parallel Opus agents count as "ordinary, individual usage".

## How Luca reads plan usage today

Checked at `main` 3ba954ac2 (`packages/engine`), against Agent SDK 0.3.273 (the engine's pin) and the journals of the 7 runs on this machine (`~/.local/state/luca/runs`, a Max account).

**The plan check lets four plans through.** Before each launch, `accountProblem` (`src/agents/claude-launcher.ts:62`, `:146-161`) reads `accountInfo()`. It passes a `subscriptionType` that contains `pro`, `max`, `team`, or `enterprise`. It refuses an API key or a provider other than `firstParty`. So Team and Enterprise already get through, and the check can't tell usage-based Enterprise from seat-based. On this machine the value is `"Claude Max"` (139 sessions). It doesn't say 5x or 20x.

**Every role runs `claude-opus-5-5` at `high` effort** (`src/agents/claude-options.ts:24-27`). After a limit, the same model runs again. There is no fallback model (`src/core/decide-plan.ts:45`).

**Luca runs the user's own `claude`, not the SDK's copy.** `realClaudePath()` takes `claude` from `PATH` (`claude-launcher.ts:225-229`), and it's passed as `pathToClaudeCodeExecutable`. So the "2.1.280 or later" rule for Opus 5.5 is about the user's installed Claude Code. The engine records `claude_code_version` from each init message, but nothing checks it. Every session here ran 2.1.280.

**Where the readings come from.** Each agent turn journals the SDK's `rate_limit_event` infos. The usage line reads each window's fill level (`utilization`, 0 to 1) and reset (`resetsAt`, Unix seconds) from a field called `unifiedWindows`. If that's missing, it falls back to the top-level `rateLimitType` and `utilization` (`windowSamples`, `src/limits/plan-usage.ts`). `unifiedWindows` is **not** in the SDK's public type (`SDKRateLimitInfo`, `sdk.d.ts:5268-5290` in 0.3.273; not in 0.3.280 either), and no doc names it. Luca relies on it because real readings carry it.

**What real readings look like on Max.** All 220 readings on this machine have the same shape:

```json
{"status":"allowed","resetsAt":1790376000,"rateLimitType":"five_hour","overageStatus":"rejected",
 "overageDisabledReason":"org_level_disabled","isUsingOverage":false,
 "unifiedWindows":{"five_hour":{"utilization":0.01,"resetsAt":1790376000},
                   "seven_day":{"utilization":0.66,"resetsAt":1790420400}}}
```

- Only `five_hour` and `seven_day` ever show up. No `seven_day_opus`, `seven_day_sonnet`, or `model_scoped` window ever came.
- A top-level `utilization` shows up only on `allowed_warning`, with `surpassedThreshold: 0.9`.
- Every reading has `rateLimitType: "five_hour"`, even when it lists both windows.
- One run hit the 5-hour window for real: `utilization` 0.98, 0.99, then `rejected` at 1.0 (reset 2026-09-24 15:50 UTC). The weekly window was at 58% then. So for all-Opus runs on Max, the 5-hour window runs out first.
- The weekly window kept one reset time (Sat 2026-09-26 11:00 UTC). The 5-hour reset moved with each new window. This matches "a fixed time each week" on the plan pages.
- `overageDisabledReason: "org_level_disabled"` on 216 readings means usage credits are off on this account.

**What the usage line guards.** Two lines, and only two windows: `weekly_line` (default 80) on `seven_day`, and `five_hour_line` (default 85) on `five_hour` (`src/limits/usage-line.ts:24-27`; `UsageLineWindowSchema`, `src/journal/journal-record.ts:359`). There is no Opus-only line (engine README, "The usage line"). Any other window, such as `seven_day_opus`, still causes a **limit wait**, but only once it is `rejected` (`src/limits/plan-signals.ts`).

**What stops a run for good.** `isUsingOverage`, `overageInUse`, `rateLimitType: "overage"`, or an assistant `billing_error` (`plan-signals.ts`). Runs share their newest readings in `~/.local/state/luca/plan-readings.json`, so every run pauses together.

**What the engine assumes, and where each plan breaks it:**

| Assumption | Pro and Max | Team | Enterprise, usage-based | Enterprise, seat-based |
| --- | --- | --- | --- | --- |
| The account has a 5-hour and a weekly window | Yes (plan pages) | Yes, per member (Team page) | **No.** No windows at all | Yes (Enterprise page) |
| The SDK sends each window's fill level and reset in `unifiedWindows` | Yes on Max (journals here). Pro not tested, but the status line doc treats Pro and Max the same | Not confirmed | No windows to send | Not confirmed |
| Opus has no separate weekly cap to guard | Holds on Max (no `seven_day_opus` reading here) | Not confirmed | n/a | Not confirmed |
| Running past the plan shows up as overage | Yes, if credits are on | Yes, if an Owner turns credits on | **No.** Every token is billed at API rates from the first one. No doc says the SDK marks that as overage | Yes, if credits are on |

**What this means:**

- **Pro and Max:** the usage line works as designed. Pro is 1x, and Opus "uses meaningfully more of your quota", so an all-Opus run on Pro will spend much of its time in limit waits. It still works; it's just slow.
- **Team:** Luca lets it through. If the SDK sends no `unifiedWindows` there, the usage line never pauses anything. Runs would still stop at the plan's own limit and wait, because a `rejected` reading still starts a limit wait. So Team fails safe, but without the line's protection. That needs one real Team session to confirm.
- **Usage-based Enterprise:** Luca lets it through today, but it is per-token billing under another name. That goes against Luca's rule that big models run on plans, not per-token billing. Luca may not even notice: nothing says the SDK flags that spend as overage, so the billing stop might never fire. And the usage line has no window to measure.


## Not confirmed from a primary source

1. **Window sizes.** No page gives the size of any window, in hours, messages, prompts, or tokens, for any plan.
2. **Weekly multiples.** Max 5x, Max 20x, Team Standard (1.25x), and Team Premium (6.25x) are stated only against Pro's "per-session" allowance. No page says the weekly limit grows by the same multiple.
3. **A separate weekly Opus cap.** No plan page says any plan has one today. The "You've hit your Opus limit" message and the SDK's `seven_day_opus` and `seven_day_sonnet` types still exist, but no page says which plans they apply to.
4. **Window data on Team.** No page confirms that Team users (or legacy seat-based Enterprise users) get the status line's `rate_limits`, or an SDK `rate_limit_event` with `utilization` and `rate_limit_type`. The status line doc names only Pro and Max.
5. **When the SDK event is sent.** No page says which plans send `rate_limit_event`. Nor does any page say whether it carries `utilization` on every response or only when the status changes. Python says "when rate limit status changes". The TypeScript type does not list `rateLimitType`.
6. **Spill-over in SDK sessions.** No page says whether an SDK or `-p` session starts spending usage credits on its own when a plan window runs out and credits are on. This is documented for Fable only.
7. **Education plans.** No page confirms Claude Code, Opus 5.5, or window rules for Education plans.
8. **Legacy seat-based Enterprise.** No page gives these seats' multiples or prices.
9. **Peak hours on Team.** The peak-hours cut was removed for "Pro and Max accounts" on May 6. No page says whether Team still has one.
10. **Size of the September increase.** No page says how much bigger the five-hour limits got on September 22.
11. **The paused SDK billing change.** No page says if or when it comes back.
12. **Enterprise windows.** Two pages (the costs page and help article 14552983) describe Enterprise as having rolling windows. The Enterprise plan and billing pages say usage-based Enterprise has none. This note trusts the plan and billing pages.
13. **`unifiedWindows`.** Luca's usage line reads this field, but it is not in the SDK's types or docs. It could change or vanish in any Claude Code release. It is confirmed only by this machine's Max journals.
14. **Pro readings.** No Pro session has been run through Luca. That Pro sends the same `unifiedWindows` shape as Max is likely, but not tested.
15. **Usage-based Enterprise in the SDK.** No page says what `rate_limit_event` looks like there, or whether per-token spend sets `isUsingOverage`.
16. **An older `claude` asked for `claude-opus-5-5`.** No page says whether Claude Code before 2.1.280 refuses the model, falls back, or errors.

## Sources

Fetched live on 2026-09-26. Help-center dates are the `dateModified` value in each page's HTML. The Claude Code docs, claude.com/pricing, and the Consumer Terms show no date.

- https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan (updated 2026-08-19). Re-checked. The shared-limit wording is unchanged.
- https://support.claude.com/en/articles/11049741-what-is-the-max-plan (updated 2026-09-22). Re-checked. "five times the Pro plan's per-session usage allowance", "20 times", "applies across all models", and "at a fixed time each week that is assigned to your account" are all unchanged. New since the last note: a line about limit resets.
- https://support.claude.com/en/articles/8325606-what-is-the-pro-plan (updated 2026-09-22)
- https://support.claude.com/en/articles/11647753-how-do-usage-and-length-limits-work (updated 2026-09-16)
- https://support.claude.com/en/articles/15424964-claude-fable-models-on-your-plan (updated 2026-09-02). Re-checked. The 50% Fable share on Max still holds. It now also covers Team Premium and legacy Enterprise Premium seats. On Pro and Team Standard, Fable now runs on usage credits only, since a promotion ended July 19, 2026.
- https://support.claude.com/en/articles/16049681-why-claude-switched-models-in-your-conversation-with-opus-5-or-opus-5-5 (updated 2026-09-24)
- https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans (updated 2026-09-24)
- https://support.claude.com/en/articles/11845131-use-claude-code-with-your-team-or-enterprise-plan (updated 2026-09-22)
- https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan (updated 2026-06-16)
- https://support.claude.com/en/articles/14552983-models-usage-and-limits-in-claude-code (updated 2026-09-22)
- https://support.claude.com/en/articles/11940350-claude-code-model-configuration (updated 2026-09-22)
- https://support.claude.com/en/articles/9266767-what-is-the-team-plan (updated 2026-09-22)
- https://support.claude.com/en/articles/12004354-purchase-and-manage-seats-on-team-plans (updated 2026-09-02)
- https://support.claude.com/en/articles/12005970-manage-usage-credits-for-team-and-seat-based-enterprise-plans (updated 2026-09-04)
- https://support.claude.com/en/articles/9797531-what-is-the-enterprise-plan (updated 2026-09-01)
- https://support.claude.com/en/articles/11526368-how-am-i-billed-for-my-enterprise-plan (updated 2026-09-25)
- https://support.claude.com/en/articles/14782391-claude-enterprise-consumption-guide (updated 2026-09-24)
- https://support.claude.com/en/articles/17007452-what-is-a-limit-reset (updated 2026-09-22)
- https://support.claude.com/en/articles/8606394-how-large-is-the-context-window-on-paid-claude-plans (updated 2026-09-22)
- https://support.claude.com/en/articles/9797557-usage-limit-best-practices (updated 2026-09-22)
- https://support.claude.com/en/articles/14246112-buy-usage-bundles (updated 2026-05-18)
- https://support.claude.com/en/articles/11139144-use-claude-for-education-at-your-university (updated 2026-09-09). It does not mention Claude Code.
- https://claude.com/pricing (no date shown)
- https://claude.com/solutions/education (no date shown)
- https://www.anthropic.com/claude-opus-5-5 (dated 2026-09-22)
- https://www.anthropic.com/news/higher-limits-spacex (dated 2026-05-06)
- https://www.anthropic.com/legal/consumer-terms (no date shown in the page body)
- https://platform.claude.com/docs/en/about-claude/models/overview (no date shown)
- https://code.claude.com/docs/en/errors (no date shown). Re-checked. "You've hit your Opus limit" and the per-family wording are unchanged.
- https://code.claude.com/docs/en/statusline (no date shown). Re-checked. It still says Pro and Max only, and now also adds "or behind a Claude apps gateway" with a `spend_limit` window (v2.1.251 or later).
- https://code.claude.com/docs/en/model-config (no date shown). New since the last note: Opus 5.5 is the default on all paid plans, and `opus` points to Opus 5.5, both from v2.1.280.
- https://code.claude.com/docs/en/costs (no date shown)
- https://code.claude.com/docs/en/authentication (no date shown)
- https://code.claude.com/docs/en/legal-and-compliance (no date shown)
- https://code.claude.com/docs/en/agent-sdk/typescript (no date shown). Re-checked. `SDKRateLimitEvent` has `status`, `resetsAt`, and `utilization`, plus the `credits_required` fields. It has no `rateLimitType`.
- https://code.claude.com/docs/en/agent-sdk/python (no date shown)
- https://code.claude.com/docs/en/commands (no date shown)
- https://code.claude.com/docs/en/desktop (no date shown)
- https://code.claude.com/docs/en/interactive-mode (no date shown)

Spot-checked again by hand on 2026-09-26: the model-config default and version lines, the Team seat multiples, the usage-based Enterprise "no plan or seat-level usage limits" line, and the status line's "only present for claude.ai Pro and Max subscribers" line.

Local code and data (for "How Luca reads plan usage today"):

- This repo at `main` 3ba954ac2: `packages/engine/src/agents/claude-launcher.ts`, `claude-options.ts`; `src/limits/usage-line.ts`, `plan-usage.ts`, `plan-signals.ts`, `limit-wait.ts`; `src/core/decide-usage-line.ts`, `decide-plan.ts`; `src/journal/journal-record.ts`; `packages/engine/README.md` ("Plan limits and billing", "The usage line")
- `@anthropic-ai/claude-agent-sdk` 0.3.273 and 0.3.280 from the Bun cache: `sdk.d.ts` (`SDKRateLimitInfo`; the `usage_EXPERIMENTAL...` `rate_limits` type)
- Run journals in `~/.local/state/luca/runs/*/journal.jsonl` (7 runs, 2026-09-24 to 2026-09-25, `subscription_type: "Claude Max"`, `claude_code_version: "2.1.280"`)
