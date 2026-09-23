# Which ways of running Claude Code and Codex use the plan, not per-token billing?

> Research for wayfinder ticket [#345](https://github.com/asibilia/luca-framework/issues/345) on the map "Luca v1 on Paseo + Claude Code" (#325).
> Date: 2026-09-22. Checked: Claude Code 2.1.280 (`claude --version`), Paseo v0.9.1 (bundles `@anthropic-ai/claude-agent-sdk` 0.3.246, per `packages/server/package.json` at tag `v0.9.1`), Pi 0.87.0 (`@earendil-works/pi-coding-agent`). Codex CLI is not installed on this machine (`codex: command not found`), so Codex facts come from OpenAI's docs and source.
> Local account state (from `claude auth status`, key names and non-secret values only): `authMethod: claude.ai`, `apiProvider: firstParty`, `subscriptionType: max`.
>
> **DRAFT, work in progress.** Codex, Copilot, and cc-openai-bridge sections are still TODO.

## Answer

TODO (short answer first, after the Codex sections land).

## Findings: Claude Code

### 1. Which launch paths draw from the plan

Every way of running the official Claude Code binary with your own plan login draws from the plan today. The table is the short form. The notes after it hold the traps.

| Launch path | Bills to (today) | Source |
|---|---|---|
| Interactive `claude` | Plan limits | [Pro/Max help article](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan): limits "shared across Claude and Claude Code" |
| Headless `claude -p` | Plan limits | [Agent SDK help article](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan), "Update June 15" |
| Agent SDK (TypeScript), plan login | Plan limits | same article, same update |
| Dynamic workflows (Claude Code's scripted workflows) | Plan limits | [workflows doc](https://code.claude.com/docs/en/workflows#cost): "Runs count toward your plan's usage and rate limits" |
| Background sessions (agent view) | Plan limits | [agent-view doc](https://code.claude.com/docs/en/agent-view#limitations): "background sessions consume your subscription usage the same as interactive sessions" |
| GitHub Actions / CI with `CLAUDE_CODE_OAUTH_TOKEN` | Plan limits | [GitHub Actions doc](https://code.claude.com/docs/en/github-actions): "If you authenticate with an OAuth token, runs use your Claude subscription instead of API billing" |
| Cloud routines | Plan limits, plus a daily run cap | [routines doc](https://code.claude.com/docs/en/routines): "Routines draw down subscription usage the same way interactive sessions do" |
| Another app that runs the unmodified binary through the Agent SDK (Paseo) | Plan limits | Agent SDK help article ("third-party app usage still draw from your subscription's usage limits") and [legal page](https://code.claude.com/docs/en/legal-and-compliance) |
| A third-party harness with its own Claude login (Pi, OpenClaw) | Anthropic may bill it to usage credits (per token) | [Log in to your Claude account](https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account) |
| Any path with `ANTHROPIC_API_KEY` set, or `--bare` | API key, per token | [authentication doc](https://code.claude.com/docs/en/authentication#authentication-precedence), [headless doc](https://code.claude.com/docs/en/headless#start-faster-with-bare-mode) |

**The June 15 change is paused.** On May 13, 2026 Anthropic announced that `claude -p` and the Agent SDK would stop counting against plan limits on June 15 and would draw from a separate monthly "Agent SDK credit" instead ($20 Pro, $100 Max 5x, $200 Max 20x). The announcement date is from press coverage ([VentureBeat](https://venturebeat.com/technology/anthropic-reinstates-openclaw-and-third-party-agent-usage-on-claude-subscriptions-with-a-catch), secondary). The help article kept the plan text but now opens with: "**Update June 15:** We're pausing the changes to Claude Agent SDK usage described below. For now, nothing has changed: Claude Agent SDK, `claude -p`, and third-party app usage still draw from your subscription's usage limits. [...] We're working to update the plan to better support how users build with Claude subscriptions. When we have an update, we'll share it before anything takes effect." ([support.claude.com/…/15036540](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan), last updated 2026-06-16.) The paused plan listed exactly what would have moved: "Claude Agent SDK usage in your own projects", "The `claude -p` command", "The Claude Code GitHub Actions integration", and "Third-party apps that authenticate with your Claude subscription through the Agent SDK". It said interactive Claude Code in the terminal or IDE would keep using plan limits. So the headless paths are the ones most likely to change next.

**Trap 1: an API key wins, silently, in `-p`.** Claude Code picks credentials in a fixed order. `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_API_KEY` rank above the plan login, and "In non-interactive mode (`-p`), the key is always used when present" ([authentication doc](https://code.claude.com/docs/en/authentication#authentication-precedence)). `apiKeyHelper` and `CLAUDE_CODE_OAUTH_TOKEN` also rank above `/login`. The Pro/Max help article warns the same: with `ANTHROPIC_API_KEY` set, Claude Code uses it "resulting in API usage charges rather than using your subscription's included usage." These variables are unset in this session's environment today.

**Trap 2: `--bare` never uses the plan.** `claude --help` (2.1.280): "Anthropic auth is strictly ANTHROPIC_API_KEY or apiKeyHelper via --settings (OAuth and keychain are never read)." The headless doc adds: "`--bare` is the recommended mode for scripted and SDK calls, and will become the default for `-p` in a future release" ([headless doc](https://code.claude.com/docs/en/headless#start-faster-with-bare-mode)). The Paseo-launched session running this research was started without `--bare` (seen in `ps`: `claude --output-format stream-json --verbose --input-format stream-json … --permission-prompt-tool stdio`).

**Trap 3: Fable models bill per token without asking in `-p` and the SDK.** "In non-interactive mode with the `-p` flag and through the Agent SDK, Claude Code never shows the consent prompt. When a Fable request there would bill to usage credits, Claude Code bills it without asking" ([model-config doc](https://code.claude.com/docs/en/model-config#fable-and-usage-credits)). On Pro, Fable models run on usage credits from the start. On Max, Fable may use up to 50% of the weekly limit, then bills usage credits ([Fable help article](https://support.claude.com/en/articles/15424964-claude-fable-models-on-your-plan)).

**Trap 4: some 1M-context variants need usage credits.** On Pro, the `[1m]` variants of Opus 4.6 and Sonnet 4.6 require usage credits; on Max, Sonnet 4.6 `[1m]` does ([model-config doc](https://code.claude.com/docs/en/model-config#extended-context)). Sonnet 5, Opus 4.7 and later, and the Fable models run with 1M on every plan without that entitlement check.

**"Extra usage" is now called "usage credits".** "'Extra usage' is renamed to 'usage credits' across the CLI, and `/extra-usage` is now `/usage-credits`" ([what's new, week 21](https://code.claude.com/docs/en/whats-new/2026-w21)). Usage credits are "billed at standard API rates" ([usage credits article](https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans)). So "extra usage" in Pi's warning means per-token billing.

#### Paseo: Claude Code, not a third-party harness

Paseo v0.9.1 runs Claude Code through the Agent SDK's `query()`. It resolves the user's own `claude` binary from `PATH` (`resolveClaudeBinary`, `defaultBinary: "claude"`) and passes it as `pathToClaudeCodeExecutable`, with `systemPrompt: { type: "preset", preset: "claude_code", append }` (`packages/server/src/server/agent/providers/claude/agent.ts:1696` and `:3283`, tag `v0.9.1`). It never runs its own Claude sign-in; it only reads `claude auth status` for display (`agent.ts:1735`). This session proves the shape: its parent is the `Paseo Daemon` process, it runs `/Users/alecsibilia/.local/bin/claude` with stream-json flags, and `CLAUDE_CODE_ENTRYPOINT=sdk-cli`.

That fits the carve-out on Anthropic's legal page: the restrictions do not "prevent an end user from signing in to the unmodified Claude Code binary with their own Claude subscription, including where a platform hosts Claude Code" ([legal and compliance](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use)). And the June 15 update puts "third-party app usage" on the plan, alongside the SDK and `claude -p`. So a run through Paseo draws from the plan today.

One Paseo caveat, outside billing: Paseo's usage meter reads the Claude Code OAuth token from the macOS keychain (service `Claude Code-credentials`) and calls `https://api.anthropic.com/api/oauth/usage` (`packages/server/src/services/quota-fetcher/providers/claude.ts:306-473`). That endpoint is undocumented. It makes no model call, so it costs nothing, but it sits awkwardly with the legal page's "developers may not collect, store, or intermediate Claude.ai credentials or session tokens". The engine should not copy it. Paseo does the same for Codex (`chatgpt.com/backend-api/wham/usage`, `codex.ts:203`).

#### What "third-party harness" means

The Pi warning is Pi's own text, not a message from Anthropic's servers. Pi 0.87.0 hard-codes it: "Anthropic subscription auth is active. Third-party harness usage draws from extra usage and is billed per token, not your Claude plan limits." (`pi-coding-agent/dist/modes/interactive/interactive-mode.js:140`). Pi shows it whenever its Anthropic login is OAuth (`:4248-4269`), whatever Anthropic actually bills. Pi added it in 0.66.0 on 2026-04-08 (`CHANGELOG.md:2309`). Press coverage dates Anthropic's change to April 4, 2026, announced by email to subscribers ([TechCrunch](https://techcrunch.com/2026/04/04/anthropic-says-claude-code-subscribers-will-need-to-pay-extra-for-openclaw-support/), secondary; I found no public Anthropic page for the email).

The Anthropic rule behind it is on the help-center page "Log in to your Claude account", section "Authenticating to subscription plans" ([13189465](https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account), updated 2026-05-19):

> "the usage included in these plans is designed to support ordinary use of native Anthropic applications, including the Claude web, desktop, and mobile applications and Claude Code.
>
> The preferred way to access Anthropic services using third-party software, tools, or services ("third-party tools"), including open-source projects, is through API key authentication through Claude Console or a supported cloud provider. Anthropic may at its discretion allow paid subscribers who have enabled usage credits to use certain third-party tools to access Anthropic services included in paid subscription plans, but reserves the right to draw use of such third-party tools from usage credits rather than subscription limits. [...] Use of third-party tools that misrepresent their identity to Anthropic's servers, attempt to route third-party traffic against subscription limits, or otherwise violate applicable terms or policies is prohibited and such use may be enforced against."

So a "third-party harness" is software other than Anthropic's native apps that talks to Anthropic with your plan login. Pi fits: it runs its own sign-in at `claude.ai/oauth/authorize` with Claude Code's public OAuth client ID, stores the tokens in `~/.pi/agent/auth.json`, and calls the API directly with `user-agent: claude-cli/<version>`, `x-app: cli`, and the system line "You are Claude Code, Anthropic's official CLI for Claude." (`pi-ai/dist/auth/oauth/anthropic.js:13-14`, `pi-ai/dist/api/anthropic-messages.js:725-822`). Paseo does none of this: the official binary makes every model call and owns the login.

### 2. The plan's limits under heavy automated use

- **Two windows, counted at once.** A five-hour session limit, and a weekly limit "that applies across all models", reset "at a fixed time each week that is assigned to your account" ([Max plan](https://support.claude.com/en/articles/11049741-what-is-the-max-plan), [Pro plan](https://support.claude.com/en/articles/8325606-what-is-the-pro-plan), both updated 2026-09-22). "Usage counts against the session and weekly allowances at the same time. A single burst of heavy activity, such as a large workflow fanout, can exhaust the weekly allowance before the session window resets" ([errors doc](https://code.claude.com/docs/en/errors#youve-hit-your-session-limit)).
- **Per-model caps exist.** Claude Code's limit messages include `You've hit your Opus limit` and `You've hit your Sonnet limit`; "The Opus and Sonnet limits each apply only to requests to that model family, so switching to a model outside the family with `/model` keeps you working" (errors doc). Fable models may use at most 50% of the weekly limit on Max (Fable help article). Anthropic "may limit your usage in other ways, such as weekly and monthly caps or model and feature usage, at our discretion" (Max and Pro articles).
- **No published token numbers.** Max 5x gives "five times the Pro plan's per-session usage allowance", Max 20x "20 times" (Max article). Anthropic publishes no absolute size for any window.
- **No documented cap on parallel sessions.** Parallel sessions just share one pool: "running ten agents in parallel uses quota roughly ten times as fast as running one" (agent-view doc). Dynamic workflows cap themselves at 16 concurrent agents by default and 1,000 agents per run, to bound local resources (workflows doc).
- **Routines have their own daily cap** on runs started per account, on top of plan limits (routines doc).
- **Everything shares the one pool.** "your usage of all different Claude product surfaces (claude.ai, Claude Code, Claude Desktop) counts towards the same usage limit" ([usage limits article](https://support.claude.com/en/articles/11647753-how-do-usage-and-length-limits-work)). Chat on claude.ai during a run eats the run's budget.

**What happens at a limit:**

- **Requests stop until the reset.** "Claude Code blocks further requests until the reset time shown in the message" (errors doc).
- **No automatic model fallback for usage limits.** Fallback chains (`--fallback-model`) cover overload and unavailable models only. "Authentication, billing, rate-limit, request-size, and transport errors [...] never trigger a switch" ([model-config doc](https://code.claude.com/docs/en/model-config#fallback-model-chains)). The Opus 5.5 to Opus 5 "fallback" is a safety classifier switch, not a usage one ([support article 16049681](https://support.claude.com/en/articles/16049681-why-claude-switched-models-in-your-conversation-with-opus-5-or-opus-5-5)).
- **With usage credits on, work continues at API rates.** Interactive Claude Code asks first: "All transitions to API credit usage require explicit user consent" (Pro/Max article). The spend-limit error implies credits pay automatically once a window runs out: "Your plan's included usage can't cover this request, and the usage credits that would otherwise pay for it have reached a spend limit" ([errors doc](https://code.claude.com/docs/en/errors#youve-hit-your-monthly-spend-limit)). The docs don't say whether `-p` and the SDK ask before that switch; for Fable they say it bills "without asking". With usage credits off, the SDK reports a rejection with `errorCode: "credits_required"`, and "the session cannot continue until the user buys usage credits" ([SDK reference](https://code.claude.com/docs/en/agent-sdk/typescript#sdkratelimitevent)).
- **Only interactive sessions wait by default.** Interactive Claude Code (v2.1.234+) waits and continues after the reset; dynamic workflows pause their agents (v2.1.271+). Neither happens in "Background sessions and `-p` runs" ([interactive-mode doc](https://code.claude.com/docs/en/interactive-mode#wait-for-a-usage-limit-to-reset)) or with "`claude -p` or the Agent SDK" (workflows doc).
- **One opt-in exception for unattended runs: `CLAUDE_CODE_RETRY_WATCHDOG=1`.** It is meant "for unattended sessions such as eval harnesses, CI jobs, or remote workers". It "backs off up to 5 minutes between attempts, or until the limit resets when the response carries a rate-limit reset time, so a session that hits a usage limit waits out the remaining window". It still "fails at once when a standard-speed request gets a `429` that reports a spend limit or exhausted usage credits" ([env-vars doc](https://code.claude.com/docs/en/env-vars), v2.1.186+). So an agent can sit inside its own turn through a limit wait, but the engine still has to see that wait and show it.
- **A server throttle is not a plan limit.** `API Error: Server is temporarily limiting requests (not your usage limit)` is a short throttle that Claude Code retries by itself (errors doc).

### 3. How each launch path reports a limit and its reset time

| Launch path | Signal | Reset time? |
|---|---|---|
| Agent SDK | `rate_limit_event` message: `rate_limit_info.status` is `"allowed"`, `"allowed_warning"`, or `"rejected"`, with `resetsAt`, `utilization`, and `errorCode: "credits_required"` when plan usage is used up (SDK reference, `SDKRateLimitEvent`) | Yes, `resetsAt` (a number; the docs don't name the unit, and the status line uses Unix epoch seconds) |
| Agent SDK | An assistant message with `error: "rate_limit"` ("a 429 against your quota"), distinct from `"overloaded"` (a 529) (SDK reference, `SDKAssistantMessage`) | No |
| `claude -p` | Non-zero exit code; "When a failure happens inside the run, such as missing authentication, Claude Code prints the failure as the result on stdout" ([headless doc](https://code.claude.com/docs/en/headless#basic-usage)) | Only inside the human text, e.g. `You've hit your session limit · resets 3:45pm` (errors doc) |
| `claude -p --output-format stream-json` | `system/api_retry` events with `error: "rate_limit"`, `error_status`, and `retry_delay_ms` (headless doc). The SDK reads this same stream, so `rate_limit_event` lines should appear here too; not confirmed | Via `rate_limit_event`, if present |
| Interactive session | Status line JSON: `rate_limits.five_hour` and `rate_limits.seven_day`, each with `used_percentage` (0 to 100) and `resets_at` (Unix epoch seconds); "only present for claude.ai Pro and Max subscribers [...] and only after the first API response" ([status line doc](https://code.claude.com/docs/en/statusline#rate-limit-usage)) | Yes |
| Any session | `StopFailure` hook with matcher `rate_limit`; input has `error`, `error_details` (e.g. `"429 Too Many Requests"`), and the error text ([hooks doc](https://code.claude.com/docs/en/hooks#stopfailure)) | No |
| Interactive session | `/usage` shows plan windows and reset times ([commands doc](https://code.claude.com/docs/en/commands)) | Yes, for people |
| Before a run | SDK init message `apiKeySource` (`"none"` means no API key is in use, e.g. a claude.ai login) and `accountInfo()` with `subscriptionType` and `tokenSource` (SDK reference) | n/a; proves the plan is in use |

Claude Code can also warn before a window runs out: `You've used 85% of your session limit · resets 3:45pm` (errors doc). Under `CLAUDE_CODE_RETRY_WATCHDOG=1`, each wait should surface as a `system/api_retry` event whose `retry_delay_ms` reaches to the reset; the docs imply this but don't show it, so it is an experiment below.

### 4. What the terms say about scripted, unattended, many-agent use

- **Consumer Terms, section 3** (effective October 8, 2025): you may not, "Except when you are accessing our Services via an Anthropic API Key or where we otherwise explicitly permit it, [...] access the Services through automated or non-human means, whether through a bot, script, or otherwise" ([consumer terms](https://www.anthropic.com/legal/consumer-terms)). The Claude Code legal page says Free, Pro, and Max users fall under these terms.
- **Anthropic explicitly permits scripted Claude Code on a plan.** Its docs describe `claude -p`, the Agent SDK "in your own projects" (help article 15036540), `claude setup-token` "For CI pipelines, scripts, or other environments where interactive browser login isn't available" with a token that "authenticates with your Claude subscription" (authentication doc), GitHub Actions on a subscription token, routines, background sessions, and workflows of "Dozens to hundreds of agents per run".
- **But limits assume one person's ordinary use.** Legal page, "Acceptable use": "Advertised usage limits for Pro and Max plans assume ordinary, individual usage of Claude Code and the Agent SDK." And: "**OAuth authentication** is intended exclusively for purchasers of Claude Free, Pro, Max, Team, and Enterprise subscription plans and is designed to support ordinary use of Claude Code and other native Anthropic applications."
- **Products for other people must use API keys.** Legal page: "Developers building products or services that interact with Claude's capabilities, including those using the Agent SDK, should use API key authentication [...]. Anthropic does not permit third-party developers to offer Claude.ai login into their own applications, or to route requests through Free, Pro, or Max plan credentials on behalf of their users. Moreover, developers may not collect, store, or intermediate Claude.ai credentials or session tokens — sign-in to a Claude account must complete through Anthropic's own flow." The SDK overview repeats: "Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK" ([SDK overview](https://code.claude.com/docs/en/agent-sdk/overview)).
- **No account sharing, no account farms.** "You may not share your Account login information [...] You also may not make your Account available to anyone else" (Consumer Terms, section 2). The Usage Policy bans coordinating activity "across multiple accounts to avoid detection or circumvent product guardrails" ([usage policy](https://www.anthropic.com/legal/aup)).
- **Enforcement is Anthropic's call.** "Anthropic reserves the right to take measures to enforce these restrictions and may do so without prior notice" (legal page).

**Verdict for Luca.** One person running their own engine, on their own repos, through the unmodified `claude` binary signed in with their own plan, is inside the terms. It stops being inside them if Luca handles Claude tokens itself, or if Luca ships to other people who then run it on the author's login. How much parallel, round-the-clock use still counts as "ordinary, individual usage" is not defined anywhere.

## Findings: Codex on a ChatGPT plan

Checked against the Codex docs (now served from `learn.chatgpt.com/docs`), OpenAI's help center, and the `openai/codex` source at tag `rust-v0.156.0` (the latest release today, 2026-09-22).

### 5a. Which launch paths draw from the plan

| Launch path | Bills to | Source |
|---|---|---|
| Interactive `codex`, signed in with ChatGPT | ChatGPT plan limits, then credits | [Codex auth](https://learn.chatgpt.com/docs/auth): "Sign in with ChatGPT for subscription access" |
| `codex exec` | Same: "`codex exec` reuses saved CLI authentication by default" | [Non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode#authenticate-in-automation) |
| `codex app-server` (how Paseo drives Codex) | Same saved login | [App server](https://learn.chatgpt.com/docs/app-server#authentication-modes): "ChatGPT managed (`chatgpt`) - Codex owns the ChatGPT OAuth flow, persists tokens, and refreshes them automatically" |
| Any of these with `CODEX_API_KEY`, or after `codex login --with-api-key` | API key, per token: "Codex uses standard API pricing instead of included ChatGPT plan credits" | Codex auth doc |

- **Paseo uses your own Codex login.** Paseo v0.9.1 spawns the user's own `codex` binary with the `app-server` argument (`packages/server/src/server/agent/providers/codex-app-server-agent.ts:535-545` and `:7093-7094`). It never calls `account/login`, so the run uses whatever `codex login` saved. App-server is "the interface Codex uses to power rich clients (for example, the Codex VS Code extension)" (app-server doc).
- **`OPENAI_API_KEY` does not switch Codex to the API.** In Codex 0.156.0, only `CODEX_API_KEY` overrides the saved login: "API key via env var takes precedence over any other auth method", and only where the caller enables it (`codex-rs/login/src/auth/manager.rs:1473-1490`). The docs list those callers: "`codex exec`, `codex review`, the TypeScript SDK, and `codex exec-server --remote`". `OPENAI_API_KEY` only pre-fills the API-key box in the sign-in screen (`codex-rs/tui/src/onboarding/auth.rs:842`). This matters here: `~/.zshrc` exports `OPENAI_API_KEY`.
- **Codex is not installed on this machine**, and `~/.codex` holds only a `skills` folder, with no `auth.json`. The ChatGPT plan tier is unknown from here.

### 5b. Limits and what happens at a limit

- **Five-hour windows, plus weekly.** Pricing gives estimated "local messages per five-hour period" per model and plan (for example GPT-6 Sol: Plus 15-150, Pro 5x 70-700, Pro 20x 300-3,000), and notes "Weekly limits may also apply" ([Codex pricing](https://learn.chatgpt.com/docs/pricing#what-are-the-usage-limits-for-my-plan)). "These estimates are not fixed message limits."
- **Plans.** Plus is $20 a month. Pro is "From $100" with "5x or 20x more Codex usage than Plus" (pricing). OpenAI's help center banner today: "New sign-ups and upgrades to the ChatGPT Pro $200 plan are temporarily paused" ([help article 11369540](https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan)).
- **One shared pool.** Codex, ChatGPT Work, ChatGPT for Excel, and Workspace Agents "use a shared allowance and credit pool" (help article 11369540).
- **Per-model buckets exist.** App-server reports several buckets keyed by `limitId`, for example `codex` and `codex_other` (app-server doc, "Rate limits (ChatGPT)"). The usage-limit error can name a model: "You've hit your usage limit for {limit_name}. Switch to another model now" (`codex-rs/protocol/src/error.rs:680`).
- **No documented cap on parallel sessions.** I found none in the docs.
- **At a limit, the current turn can finish.** "If you reach your usage limits during an active turn, the agent will be able to continue working on that turn, subject to fair use limits" (pricing).
- **Then credits are spent without a new prompt.** "Your plan's included usage is used first. After you hit plan limits, usage draws from your credit balance." Automatic reload can also buy more credits ([credits article 12642688](https://help.openai.com/articles/12642688)). So a positive credit balance, or auto-reload, turns a limit hit into metered spend.

### 5c. How Codex reports a limit and its reset

| Launch path | Signal | Reset time? |
|---|---|---|
| `codex app-server` | `error` notification with `codexErrorInfo: UsageLimitExceeded` (and `httpStatusCode` when known), then the turn ends `failed` (app-server doc, "Errors") | Via the next row |
| `codex app-server` | `account/rateLimits/read` and the `account/rateLimits/updated` notification: `usedPercent`, `windowDurationMins`, `resetsAt` ("a Unix timestamp (seconds) for the next reset"), and `rateLimitReachedType` (app-server doc) | Yes |
| `codex exec --json` | `turn.failed` with `error.message` only (`codex-rs/exec/src/exec_events.rs:55-95`). The message reads "You've hit your usage limit. [...] Try again at <local time>." (`codex-rs/protocol/src/error.rs:657-790`) | Only inside the text |
| Interactive `codex` | `/status` shows "the chat ID, context usage, and rate limits" ([CLI commands](https://learn.chatgpt.com/docs/developer-commands)) | Yes, for people |

### 5d. What the terms say

- **OpenAI documents Codex automation on a ChatGPT login, but prefers API keys for it.** "API keys are still the recommended default for automation" ([Codex auth](https://learn.chatgpt.com/docs/auth#login-on-headless-devices)). "The right way to authenticate automation is with an API key. Use this guide only if you specifically need to run the workflow as your Codex account" ([CI/CD auth guide](https://learn.chatgpt.com/docs/auth/ci-cd-auth)). The guide is for "enterprise and other trusted private automation", and says "Do not use this workflow for public or open-source repositories". The non-interactive doc names our exact case: "users who need ChatGPT/Codex rate limits instead of API key usage".
- **Terms of Use** (US, effective January 1, 2026) apply when you sign in to Codex with a ChatGPT account (help article 11369540). They say: "You may not share your account credentials or make your account available to anyone else". Among the things you may not do: "Automatically or programmatically extract data or Output", and "Interfere with or disrupt our Services, including circumvent any rate limits or restrictions or bypass any protective measures or safety mitigations we put on our Services" ([OpenAI Terms of Use](https://openai.com/policies/terms-of-use/)). The "programmatically extract" line reads as aimed at scraping; OpenAI's own Codex docs document `codex exec` and app-server on a ChatGPT login.
- **OpenAI is openly relaxed about other harnesses.** Its Codex for Open Source page, which gives maintainers ChatGPT Pro, says: "Developers should code in the tools they prefer, whether that's Codex, OpenCode, Cline, pi, OpenClaw, or something else, and this program supports that work" ([Codex for Open Source](https://developers.openai.com/community/codex-for-oss)). That is a program page, not a terms clause.

**Verdict.** Codex through Paseo (app-server), `codex exec`, and interactive `codex` all bill the ChatGPT plan when signed in with ChatGPT. Scripted, private, single-user use fits the docs. OpenAI would rather you used an API key for automation, but its docs cover this case.

## Findings: GitHub Copilot CLI (fallback)

- **Copilot is now metered per token, even inside the plan.** Since June 1, 2026, individual plans include a monthly allowance of "GitHub AI Credits" (1 credit = $0.01), and each interaction costs tokens priced by model ([usage-based billing for individuals](https://docs.github.com/en/copilot/concepts/billing/billing-for-individuals)). Allowances: Copilot Pro $10 for 1,500 credits, Pro+ $39 for 7,000, Max $100 for 20,000. Copilot CLI is billed in these credits. Past the allowance you can set a budget for "additional usage", or wait for the reset "at 00:00:00 UTC on the first day of each calendar month".
- **The old premium-request model survives only on legacy annual plans.** There, "Each prompt to Copilot CLI uses one premium request with the default model", with 300 a month on Pro and 1,500 on Pro+, and extras at $0.04 ([requests (legacy)](https://docs.github.com/en/copilot/concepts/billing/copilot-requests)).
- **GPT prices on Copilot**, per million tokens: GPT-6 Sol $2.00 in and $10.00 out; GPT-6 Astra $10.00 and $50.00 ([models and pricing](https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing)). So Pro+ buys about $70 of tokens a month, and Max about $200.
- **Scripted use is documented.** Passing a prompt with `copilot -p` "allows you to use the CLI programmatically in scripts, CI/CD pipelines, and automation workflows" ([run the CLI programmatically](https://docs.github.com/en/copilot/how-tos/copilot-cli/automate-copilot-cli/run-cli-programmatically)). Tokens: `COPILOT_GITHUB_TOKEN`, then `GH_TOKEN`, then `GITHUB_TOKEN`, and "An environment variable silently overrides a stored OAuth token" ([authenticate the CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/authenticate-copilot-cli)).
- **Terms.** Individual Copilot use falls under Section J of the GitHub Terms of Service ([additional product terms](https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features)). The Acceptable Use Policies ban "using our servers for any form of excessive automated bulk activity, to place undue burden on our servers through automated means" ([GitHub AUP](https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies)).

**Verdict.** Allowed, and the included allowance costs nothing extra. But the allowance is a small monthly token budget at list-like prices, so Copilot behaves like prepaid per-token billing. It is a fallback for a few reviews, not a plan to lean on.

## Findings: cc-openai-bridge

- **What it is: the user's own code.** `cc-openai-bridge` is the earlier name of `packages/luca-code` in this repo, which old Luca shipped as `luca code --openai` (added 2026-07-24 in `45fed9ab3`; last copy at tag `old-luca-final`). The README calls it "A local Bun/TypeScript proxy that runs **Claude Code on a ChatGPT subscription**". It "ports the device-flow, endpoint dialect, and gateway architecture of the upstream macaz client" ([macaz-dev/macaz-cli](https://github.com/macaz-dev/macaz-cli)). The source code keeps the old name on purpose: "the literal `cc-openai-bridge` value is intentionally preserved even though the package was renamed to `luca-code`" (`old-luca-final:packages/luca-code/src/config.ts:30-40`). It is not an installed package: no `cc-openai-bridge` binary is on `PATH`, and no separate repo exists under `~/Github` or the `asibilia` GitHub account.
- **How it runs Claude Code.** It starts a gateway on `127.0.0.1` that speaks the Anthropic Messages API, then launches `claude` "with `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN`" pointing at that gateway, from an isolated profile (README, "How the bridge works"). So Claude Code sends no model calls to Anthropic, and no Claude plan usage.
- **It signs in with a ChatGPT account, not an API key.** `luca-code login` "runs the OAuth 2.0 device authorization grant against `auth.openai.com`, tuned for the codex backend", using the Codex CLI's public OAuth client ID (README, "OAuth login flow"). The README gives the credential's shape: `{type:"openai_account_oauth", method:"chatgpt_headless", access, refresh, expires_at (ms epoch), account_id, id_token}`. The user's `~/.config/cc-openai-bridge/cc-openai-bridge-cred.json` has exactly those key names: `type`, `method`, `access`, `refresh`, `expires_at`, `account_id`, `id_token`. The profile at `~/.claude/cc-openai-bridge/profile/` holds a `provider.json` (keys `provider`, `createdAt`) and a Claude Code `settings.json`. (Key names only; no values read.)
- **It calls an undocumented endpoint.** "All generation goes through `https://chatgpt.com/backend-api/codex/responses`, which is not a public, documented API. It can change shape, add new anti-abuse checks, or reject the client at any time without notice" (README, "Known risks"). It sends `originator: cc-openai-bridge` and pins a Codex client version, and it can switch to the Codex CLI's `codex_cli_rs/<version>` User-Agent "if it is ever blocked" (README).
- **Billing.** It should draw from the ChatGPT plan's Codex limits, since it uses a ChatGPT login against the backend Codex uses. Not verified; see experiments.
- **Terms.** No OpenAI term names this case. OpenAI's CI/CD guide scopes out "generic OAuth clients outside Codex", and the sanctioned way for a host app to bring ChatGPT auth is app-server's experimental `chatgptAuthTokens` mode, "intended for host apps that already own the user's ChatGPT auth lifecycle" (app-server doc). The Codex-for-OSS page is relaxed about other harnesses. But falling back to Codex's User-Agent to dodge a block reads like the Terms' "bypass any protective measures". Treat it as a gray zone: probably tolerated, not supported, and able to break without notice. #346 covers how the engine would launch agents through it.

## What this means for the engine

TODO

## Unknowns and experiments to run later

TODO

## Sources

TODO
