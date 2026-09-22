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

TODO

## Findings: GitHub Copilot CLI (fallback)

TODO

## Findings: cc-openai-bridge

TODO

## What this means for the engine

TODO

## Unknowns and experiments to run later

TODO

## Sources

TODO
