# How can plain code drive Claude Code and Codex agents?

> Research for wayfinder ticket [#346](https://github.com/asibilia/luca-framework/issues/346) on the map [#325](https://github.com/asibilia/luca-framework/issues/325), "Luca v1 on Paseo + Claude Code". Date: 2026-09-22.
>
> Versions checked: Claude Code `2.1.280` (`claude --version`). Paseo `0.9.1` (app CLI `--version`; source at tag `v0.9.1` of `getpaseo/paseo`, which pins `@anthropic-ai/claude-agent-sdk` `0.3.246` in `packages/server/package.json`). Bun `1.3.11`. **Codex is not installed** (`codex --version`: command not found), and `paseo provider ls` shows Codex as unavailable.
>
> Docs: every `code.claude.com` page cited was fetched live today and matched the copies saved earlier byte for byte. The `paseo.sh` pages cited match `public-docs/` at `v0.9.1`. Codex docs were fetched live from `learn.chatgpt.com` and `openai/codex` `main`.
>
> No model session was started. Every claim comes from docs, source code, `--help` output, or installed files. Config files were read for key names only.
>
> Guard rules per role are [#347](https://github.com/asibilia/luca-framework/issues/347)'s topic, in [claude-code-guards.md](https://github.com/asibilia/luca-framework/blob/research/claude-code-guards/docs/research/luca-on-claude-code/claude-code-guards.md). Billing is [#345](https://github.com/asibilia/luca-framework/issues/345)'s. This doc points there instead of repeating them.

## Answer

- **The Claude Agent SDK gives the engine every knob it needs, in one place.** A worktree `cwd`, an appended system prompt, a model, schema-checked JSON with retries, a live typed stream with token use and rate-limit events, interrupt, resume, queued follow-ups, and strict MCP with no global servers. `claude -p` is the same program over stdio with fewer controls.
- **Paseo runs Claude through that same SDK, but its stock Claude provider hides the knobs that matter.** It always loads user, project, and local settings, has no strict-MCP switch, and silently drops `outputSchema` for Claude. So the user's MuninnDB server reaches every Paseo-launched Claude agent today (#347 saw it live), and Claude results through Paseo aren't schema-checked.
- **Paseo's `send` interrupts a busy agent by default.** `activeTurnBehavior: "steer"` queues into the running turn instead, but only the internal client exposes it. The MCP tool and the CLI always interrupt. This feeds [#341](https://github.com/asibilia/luca-framework/issues/341).
- **Plain code can't raise a Paseo attention item for the run through the SDK, CLI, or MCP.** Attention comes only from an agent that finishes, fails, or asks permission. Two real routes exist: a provider plugin that shows the run as its own agent, or a process in a Paseo terminal that reports "needs input".
- **Rows in an agent's chat need a plugin session.** The daemon rejects `timeline.append` from plain SDK clients. The engine has to call its board plugin, and the plugin appends the row.
- **Codex runs through Paseo the same way, over `codex app-server`, with real structured output.** Paseo passes the schema to Codex natively. But Codex isn't installed here, so Paseo can't run it yet.
- **cc-openai-bridge works per launch only through its own `claude` subcommand.** It has no standalone gateway. Its Claude profile also carries the `muninn` MCP server.
- **Claude Code workflows are not a launch path for the engine.** One only runs inside a parent Claude Code session, and the script can't run gates, git, or any I/O.
- **Recommendation:** launch agents with the Agent SDK from the engine. Fallback: the same SDK calls wrapped in a Luca provider plugin inside Paseo. The final pick also depends on #345's billing answer.

| Need | Agent SDK | `claude -p` | Paseo, stock provider | Workflows |
|---|---|---|---|---|
| 1. Start in a worktree with prompt, extra system prompt, model | Yes | Yes | Yes (client SDK only) | Partly: no per-agent system prompt or `cwd` |
| 2. JSON that matches a schema | Yes, validated, 5 tries | Yes, validated, 5 tries | Codex yes; **Claude ignored** | Yes, validated, 5 tries |
| 3. Live progress and tokens | Every message, typed; rate-limit events | Every message as NDJSON | Timeline events and usage; no rate-limit events | Only in the `/workflows` view and transcript files |
| 4. Cancel, resume, follow-up | `interrupt()`, `resume`, `streamInput()` | SIGINT, `--resume`, stdin NDJSON | Internal `cancelAgent`, `ref(id).run()`, `send` (interrupts) | Stop and relaunch inside the parent session |
| 5. Own MCP and skills, nothing global | `strictMcpConfig`, `settingSources`, `plugins`, `skills` | `--strict-mcp-config`, `--setting-sources`, `--plugin-dir` | Adds servers, can't remove the user's | Agents see all session MCP tools |
| 6. Paseo attention for the run itself | n/a | n/a | No API; plugin or terminal workaround | n/a |

## Findings

### How each path runs Claude Code

- **Agent SDK.** `query()` spawns a `claude` subprocess and talks to it over stdio. One session is one subprocess ([hosting](https://code.claude.com/docs/en/agent-sdk/hosting.md)). The SDK bundles a native `claude` binary, or uses `pathToClaudeCodeExecutable` ([TypeScript reference](https://code.claude.com/docs/en/agent-sdk/typescript.md)). The reference has a section on `bun build --compile`, so Bun is an expected runtime (same page).
- **`claude -p`.** The same CLI in print mode. `--output-format stream-json` prints the message stream the SDK reads ([headless](https://code.claude.com/docs/en/headless.md)).
- **Paseo.** The daemon calls the Agent SDK `0.3.246` in-process, but points it at the user's installed `claude` binary through `pathToClaudeCodeExecutable` (`packages/server/src/server/agent/providers/claude/agent.ts:3283`, `resolveClaudeBinary` at `:1696`). So Paseo agents run Claude Code `2.1.280` here. Code drives Paseo through the client SDK `@getpaseo/client` over the daemon's WebSocket, the `paseo` CLI (at `/Applications/Paseo.app/Contents/Resources/bin/paseo`, not on `PATH`), or Paseo's MCP tools ([SDK overview](https://paseo.sh/docs/sdk), [MCP reference](https://paseo.sh/docs/mcp)).
- **Workflows.** A workflow is a JavaScript script run by Claude Code's workflow runtime inside a session. It starts through the `Workflow` tool, which the model calls, or as `/<name>` for a saved one; its result comes back to that session ([workflows](https://code.claude.com/docs/en/workflows.md), [`Workflow` tool input and output](https://code.claude.com/docs/en/agent-sdk/typescript.md)). Workflows work in `claude -p` and the SDK too ([turn workflows off](https://code.claude.com/docs/en/workflows.md)). So the engine would still need a parent `claude -p` or SDK session to run one.

### 1. Start an agent in a worktree, with a prompt, an extra system prompt, and a model

- **Agent SDK: yes.** `cwd`, `model`, and `systemPrompt: { type: "preset", preset: "claude_code", append }` keep Claude Code's prompt and add the role's text. A plain string replaces it ([Options](https://code.claude.com/docs/en/agent-sdk/typescript.md)). `projectConfigRoot` (v2.1.275+) reads project settings from the main checkout when `cwd` is a worktree (same table).
- **`claude -p`: yes.** Spawn it with the worktree as the process `cwd`. Use `--append-system-prompt` or `--append-system-prompt-file`, and `--model` ([headless](https://code.claude.com/docs/en/headless.md), [CLI reference](https://code.claude.com/docs/en/cli-reference.md)).
- **Paseo client SDK: yes.** `client.agents.create({ cwd, prompt, config: { provider: "claude/<model>", systemPrompt } })` ([SDK reference](https://paseo.sh/docs/sdk/reference)). For Claude, Paseo appends `systemPrompt` to the `claude_code` preset, together with any daemon-wide prompt from Paseo's config (`agent.ts:3230-3234`, `:3286-3290`). `workspaces.open(dir)` reuses or creates a workspace for a directory the engine already made ([workspaces](https://paseo.sh/docs/sdk/workspaces)).
- **Paseo CLI: partly.** `paseo run` has `--cwd`, `--provider`, `--model`, `--mode`, `--thinking`, `--env`, and `--output-schema`, but no system-prompt flag (`paseo run --help`).
- **Paseo MCP: partly.** `create_agent` takes a title, `provider/model`, settings, labels, an initial prompt, and a workspace. It has no system prompt, MCP servers, env, or schema (`packages/server/src/server/agent/tools/paseo-tools.ts:980-1100`).
- **Workflows: partly.** `agent(prompt, { model, effort, isolation: "worktree", agentType, schema })` spawns a subagent. There's no per-agent `cwd` (only a fresh Claude-made worktree) and no per-agent system prompt, except through a custom `agentType` (Claude Code 2.1.280 bundled `workflow-authoring` skill text).

### 2. JSON that matches a schema

- **Agent SDK: yes.** `outputFormat: { type: "json_schema", schema }` puts the validated object in `result.structured_output`. The SDK "validates the output against it, re-prompting on mismatch." When retries run out, the result has subtype `error_max_structured_output_retries` ([structured outputs](https://code.claude.com/docs/en/agent-sdk/structured-outputs.md)). The cap is `MAX_STRUCTURED_OUTPUT_RETRIES`, default 5 attempts ([env vars](https://code.claude.com/docs/en/env-vars.md)). A `success` result with no `structured_output` also counts as a failure ([error handling](https://code.claude.com/docs/en/agent-sdk/structured-outputs.md)). Schemas are checked as draft-07; an invalid schema fails the run at startup (same page).
- **`claude -p`: yes, the same.** `--output-format json --json-schema '<schema>'` returns `structured_output` ([headless](https://code.claude.com/docs/en/headless.md)). The same retry cap applies ([env vars](https://code.claude.com/docs/en/env-vars.md)).
- **Paseo, Codex: yes.** Paseo passes `outputSchema` on `turn/start` (`codex-app-server-agent.ts:4105-4106`). It first rewrites the schema into OpenAI's strict shape: every object gets `additionalProperties: false` and every property becomes required (`:372-421`). What Codex does on a mismatch isn't documented; see Unknowns.
- **Paseo, Claude: no.** The client SDK accepts `outputSchema` ([SDK agents](https://paseo.sh/docs/sdk/agents)), and the daemon forwards it as a run option (`agent/create-agent/create.ts:275-278`). But the Claude provider's `startTurn` never reads it (`providers/claude/agent.ts:2210-2289`). No file under `providers/claude/` mentions `outputSchema` or `outputFormat`, and only the Codex provider has tests for it. The docs only say: "Validate the parsed value in your application" ([SDK agents](https://paseo.sh/docs/sdk/agents)).
- **Paseo CLI: a client-side loop.** `paseo run --output-schema` appends the schema to the prompt, parses the reply, validates it with Ajv, and re-prompts with the errors, up to 2 retries. Then it fails with `OUTPUT_SCHEMA_FAILED` (`packages/cli/src/commands/agent/run.ts:234-265`, `agent-response-loop.ts:307-345`). That loop is prompt-based, not native.
- **Workflows: yes.** With `schema`, the subagent must call a StructuredOutput tool. After five failed attempts the `agent()` call fails with the last validation error ([workflows](https://code.claude.com/docs/en/workflows.md)).

### 3. Follow progress live and read token use

- **Agent SDK.** The `query()` generator yields every message: assistant and user messages, tool results, `system/init`, `api_retry`, task progress for subagents, and the final `result` ([message types](https://code.claude.com/docs/en/agent-sdk/typescript.md)). `includePartialMessages` adds token-level stream events ([streaming output](https://code.claude.com/docs/en/agent-sdk/streaming-output.md)).
  - **Tokens.** Each assistant message carries `message.usage`; dedupe by `message.id`. Per-step input and cache counts are accurate, but per-step `output_tokens` is a placeholder, so read output totals from the result. The result has `usage`, per-model `modelUsage`, and `total_cost_usd`, which is an estimate. In streaming-input mode, each turn emits its own result, and `modelUsage` is a running total ([cost tracking](https://code.claude.com/docs/en/agent-sdk/cost-tracking.md)).
  - **Limit hits.** `SDKRateLimitEvent` (`type: "rate_limit_event"`) carries `status` (`allowed`, `allowed_warning`, `rejected`) and `resetsAt`. An assistant message can carry `error: "rate_limit"`, and the result carries `api_error_status` ([TypeScript reference](https://code.claude.com/docs/en/agent-sdk/typescript.md)). This is what the engine's limit wait needs.
  - **No automatic wait.** Claude Code's own wait-and-continue at a usage limit is off for `-p` runs and background sessions ([interactive mode](https://code.claude.com/docs/en/interactive-mode.md)). The engine has to wait itself, as #342 decided. The limit message reads like `You've hit your session limit · resets 3:45pm` ([errors](https://code.claude.com/docs/en/errors.md)).
- **`claude -p`.** `--output-format stream-json --verbose [--include-partial-messages]` prints the same messages as NDJSON, ending with the `result` line ([headless](https://code.claude.com/docs/en/headless.md)). The SDK reads this very stream ([hosting](https://code.claude.com/docs/en/agent-sdk/hosting.md)).
- **Paseo.** `agent.timeline.subscribe()` streams Paseo's timeline events: assistant text, reasoning, tool calls, `turn_completed`, `turn_failed`, `turn_canceled`, `usage_updated`, and permission events ([SDK events](https://paseo.sh/docs/sdk/events); event union at `agent/agent-sdk-types.ts:419-472`). `lastUsage` holds input, cached input, and output tokens, cost, and context use (`agent-sdk-types.ts:230-237`; [SDK reference](https://paseo.sh/docs/sdk/reference)).
  - **Delivery is live only.** After a reconnect, missed events must be fetched with `timeline.refetch()` (same reference). These are Paseo's projections, not the raw SDK messages.
  - **No rate-limit events.** Paseo's Claude provider has no handler for `rate_limit_event` (no match in `providers/claude/`). A result with subtype `success` becomes `turn_completed`, and error results become `turn_failed` with the joined error text (`agent.ts:4442-4478`). So a limit hit arrives as text.
  - **Plan usage is readable.** `client.providers.listUsage()` returns "normalized subscription windows" ([SDK reference](https://paseo.sh/docs/sdk/reference)). For Claude it calls `https://api.anthropic.com/api/oauth/usage` with the stored login (`services/quota-fetcher/providers/claude.ts:469`); for Codex, `https://chatgpt.com/backend-api/wham/usage` (`providers/codex.ts:203`). Neither endpoint appears in the Claude Code or Codex docs checked here.
- **Workflows.** Progress shows in the `/workflows` view and the task panel. Each run writes transcripts under `~/.claude/projects/` ([workflows](https://code.claude.com/docs/en/workflows.md)); the `Workflow` tool returns a `transcriptDir` ([tool output](https://code.claude.com/docs/en/agent-sdk/typescript.md)). There's no plain-code API for it.

### 4. Cancel, resume, or send a follow-up

- **Agent SDK.**
  - Cancel: `interrupt()` ends the turn, in streaming-input mode only. `abortController` and `close()` end the whole query ([Query object](https://code.claude.com/docs/en/agent-sdk/typescript.md)).
  - Resume: `resume: <sessionId>` continues a saved session; `forkSession` copies it; `sessionId` sets the ID up front ([sessions](https://code.claude.com/docs/en/agent-sdk/sessions.md)).
  - Follow-up: in streaming-input mode, `streamInput()` or the input iterable adds turns. Messages sent during a turn queue and run in order ([streaming input](https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode.md)); `queued_turn_count` on the result says how many still wait ([result fields](https://code.claude.com/docs/en/agent-sdk/typescript.md)). Single-message mode has no interrupt and no queueing (same page).
- **`claude -p`.**
  - Cancel: SIGINT ends the turn. SIGTERM exits with code 143 and leaves the turn unfinished; a later `--resume` continues it ([headless](https://code.claude.com/docs/en/headless.md)).
  - Resume: `--resume <session_id>`, found from any directory on the machine (same page).
  - Follow-up: a new `claude -p --resume` process, or one long process with `--input-format stream-json` reading turns from stdin ([CLI reference](https://code.claude.com/docs/en/cli-reference.md)). The stdin control messages the SDK uses for interrupt aren't documented for direct use.
- **Paseo.**
  - Cancel: the public agent handle has no cancel method ([SDK reference](https://paseo.sh/docs/sdk/reference)). The internal client has `cancelAgent()` (`packages/client/src/daemon-client.ts:3418`), the CLI has `paseo stop <id>`, and MCP has `cancel_agent`. The public `archive()` "closes its runtime", which also ends the agent.
  - Resume: agents outlive the client. `client.agents.ref(id).run("…")` continues one later ([SDK quickstart](https://paseo.sh/docs/sdk/quickstart)). After a daemon restart, Paseo resumes the Claude session by its session ID (`agent.ts:3266-3271`).
  - Follow-up: `send()` or `run()`. On a busy agent this **interrupts the running turn** by default; see the #341 section below.
  - Per-agent `env` from `create()` is not re-applied on resume, refresh, or import (`agent/agent-manager.ts:1353-1363` and `:1509-1516` pass `undefined`). Env that must survive belongs in a provider profile or a plugin `agent.session_open` hook ([plugin reference](https://paseo.sh/docs/plugins/reference)).
- **Workflows.** A stopped run can be relaunched with the same script. Completed agents return cached results, but only within the same session. There's no mid-run user input ([workflows](https://code.claude.com/docs/en/workflows.md)).

### 5. Give an agent its own MCP servers and skills, with nothing global leaking in

Why it matters: the user's MuninnDB server `muninn` is set at user scope in `~/.claude.json`, and again at local scope for `~/Github/luca-framework` (key names read, values not printed). Only the engine may talk to MuninnDB.

- **Agent SDK: full control.**
  - `mcpServers` takes stdio, HTTP, SSE, and in-process servers (`createSdkMcpServer`), so the engine can serve tools from its own process ([MCP config types](https://code.claude.com/docs/en/agent-sdk/typescript.md)).
  - `strictMcpConfig: true` uses only those servers, ignoring "project `.mcp.json`, user settings, plugin-provided MCP servers, and claude.ai connectors" ([Options](https://code.claude.com/docs/en/agent-sdk/typescript.md)).
  - `settingSources` picks user, project, and local; `[]` loads none. `~/.claude.json` and auto memory load regardless, so also set `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` ([what settingSources does not control](https://code.claude.com/docs/en/agent-sdk/claude-code-features.md)).
  - `plugins` loads local plugin folders; `skipMcpDiscovery` keeps a plugin's MCP servers out. `skills` names the allowed skills ([Options](https://code.claude.com/docs/en/agent-sdk/typescript.md), [skills](https://code.claude.com/docs/en/agent-sdk/skills.md)).
  - `env` replaces the child's whole environment (same table).
- **`claude -p`: the same, as flags.** `--mcp-config` with `--strict-mcp-config` ("ignoring all other MCP configurations"), `--setting-sources`, `--settings`, `--plugin-dir`, and `--disable-slash-commands` (`claude --help`; [CLI reference](https://code.claude.com/docs/en/cli-reference.md)). Avoid `--bare`: it never reads the subscription login ([headless](https://code.claude.com/docs/en/headless.md); billing is #345's).
- **Paseo stock provider: can add, can't remove.**
  - Per-agent `config.mcpServers` is added on top ([SDK reference](https://paseo.sh/docs/sdk/reference); `agent.ts:3312-3314`).
  - `settingSources` is fixed to `["user", "project", "local"]` (`agent.ts:145-149`, `:3291`). There's no `strictMcpConfig`, and per-agent `options` accept only tool lists, extra directories, sandbox, and permission rules (`providers/claude/options.ts:46-89`). So user-scope servers, plugin servers, user skills, and claude.ai connectors all load.
  - Paseo also injects its own `paseo` MCP server into every agent unless a provider profile sets `paseoTools.enabled: false` ([MCP reference](https://paseo.sh/docs/mcp); `runtime-mcp-config.ts:29-60`). #347 shows why that matters for guards.
  - Workarounds, all untested: a custom provider profile whose `env` moves `CLAUDE_CONFIG_DIR` to an engine-owned folder (then `~/.claude.json` and `~/.claude` aren't read); or a provider `command` prefix such as `["claude", "--strict-mcp-config"]`, which #347 found goes before the SDK's own flags ([custom providers](https://paseo.sh/docs/custom-providers); `providers/claude/query.ts:32-55`). A moved `CLAUDE_CONFIG_DIR` also moves the macOS Keychain entry, so it needs its own login or `CLAUDE_CODE_OAUTH_TOKEN` ([authentication](https://code.claude.com/docs/en/authentication.md)).
- **Workflows: no per-agent control.** "Workflow agents can reach all session-connected MCP tools via ToolSearch" (bundled `workflow-authoring` skill, Claude Code 2.1.280).

### 6. Raise a Paseo "needs attention" item for the run itself

- **No direct API.** An agent's attention reason is one of `finished`, `error`, or `permission` (`packages/protocol/src/messages.ts:766-770`). The daemon sets it only when an agent goes from running to idle, enters an error, or gets a permission request (`agent-manager.ts:4770-4795`, and `:4530`). The protocol has requests to clear attention, but none to raise it, apart from the badge below.
- **`workspace.mark_unread` is only a badge.** It re-marks the newest finished root agent in a workspace as `finished` (`session.ts:7499-7530`, `agent-manager.ts:2096-2133`). It sends no push notification, and it's only on the internal client (`daemon-client.ts:1976`).
- **Route 1: a provider plugin.** A plugin can register a whole agent provider ([provider plugins](https://paseo.sh/docs/plugins/providers)). A "Luca run" provider could show each run as one Paseo agent. When the run is stuck, it emits `session.permission` with a question (`packages/plugin/src/server/provider.ts:569`). Paseo then treats it like any agent asking permission: "needs you", and a notification. The user's answer (`retry`, `skip`, `stop`, `ship`) comes back to the plugin as a permission response.
- **Route 2: a Paseo terminal.** A process started in a Paseo terminal gets `PASEO_TERMINAL_ID`, `PASEO_ACTIVITY_TOKEN`, and `PASEO_TERMINAL_ACTIVITY_URL` (`terminal/terminal-manager.ts:333-341`). A POST of `{ terminalId, token, state: "needs-input" }` to that URL, from loopback, marks the terminal as needing attention (`bootstrap.ts:275-331`). `paseo hooks claude Notification` with an `idle_prompt` payload does the same POST (`packages/cli/src/commands/hooks.ts`, `terminal/agent-hooks/claude/claude.ts:30-31`). The daemon then raises "Terminal needs input", with the terminal's name as the body (`terminal/activity/terminal-activity-tracker.ts:34`, `websocket-server.ts:174-190`, `:2624-2660`). This hook is meant for agent CLIs, so it's a borrowed use.
- **Watch out: finished agents notify.** Every top-level agent the engine starts through Paseo raises a `finished` notification when a turn ends. Agents with a parent label are skipped (`agent-manager.ts:4895-4908`, `protocol/src/agent-labels.ts:23`). So engine agents started through Paseo should be children of one run agent.
- **Client toasts are in-app only.** A plugin's `useToast()` shows a message while its surface is open; it's not a notification ([plugin reference](https://paseo.sh/docs/plugins/reference)).

### Codex through Paseo

Yes, it works the same way through the client SDK: `config.provider: "codex/<model>"`. What differs:

- **Launch.** Paseo spawns the user's `codex` CLI as `codex app-server` and talks JSON-RPC over stdio (`codex-app-server-agent.ts:7089-7117`; [Codex in Paseo](https://paseo.sh/docs/codex)). Login comes from `codex login`, with ChatGPT or an API key (same page). Installing the ChatGPT desktop app doesn't provide `codex` (same page). Here, `codex` is missing and Paseo lists Codex as unavailable.
- **System prompt.** Paseo sends the agent's `systemPrompt` as `developerInstructions` on `thread/start` and `turn/start` (`codex-app-server-agent.ts:5192-5203`, `:4108-4114`). The protocol also has `baseInstructions` (`ThreadStartParams.ts`, `openai/codex` `main`).
- **Schema.** Native, through `turn/start`'s `outputSchema`, which "applies only to the current turn" ([app-server](https://learn.chatgpt.com/docs/app-server.md)). Paseo forces the strict shape first (see §2).
- **MCP servers.** Paseo puts per-agent servers into a `config.mcp_servers` override (`codex-app-server-agent.ts:5215-5227`). Whether servers from the user's own Codex config still load is not documented; none are configured here, since `~/.codex` holds only Paseo's skills.
- **Options.** Codex takes `approval_policy`, `sandbox_mode`, `sandbox_workspace_write`, `web_search`, and `features` ([provider options](https://paseo.sh/docs/sdk/provider-options)).
- **Steer and interrupt.** Paseo uses the documented `turn/steer` and `turn/interrupt` (`codex-app-server-agent.ts:4342`, `:4885`; [app-server](https://learn.chatgpt.com/docs/app-server.md)).
- **Limits.** The app-server offers `account/rateLimits/read` and an `account/rateLimits/updated` notification with `resetsAt` ([app-server](https://learn.chatgpt.com/docs/app-server.md)). Paseo's Codex provider doesn't forward them (no match in its source); `listUsage()` covers Codex instead.
- **Session persistence.** Paseo notes that `persistSession: false` is a no-op for Codex (`codex-app-server-agent.ts:7119-7130`).
- **Without Paseo.** OpenAI points automation at the Codex SDK ([app-server](https://learn.chatgpt.com/docs/app-server.md)). Its TypeScript library has `outputSchema` per run, `runStreamed()` with usage events, `resumeThread()`, `workingDirectory`, `env`, and `--config` overrides ([Codex SDK](https://learn.chatgpt.com/docs/codex-sdk.md); `sdk/typescript/README.md` on `openai/codex` `main`).

### cc-openai-bridge per launch

What's on disk (names only): `~/.config/cc-openai-bridge/` holds `cc-openai-bridge-cred.json` and a debug log. `~/.claude/cc-openai-bridge/profile/` is a full Claude config folder, with `.claude.json`, `settings.json`, `provider.json`, and symlinks to `~/.claude`'s `CLAUDE.md`, `agents`, `commands`, `plugins`, and `skills`. Its `.claude.json` lists user MCP servers `aidesigner`, `blender`, `muninn`, and `openai-image`.

The code is old Luca's `packages/luca-code`, which is named luca-code at the tag `old-luca-final`. The build on this machine still carries the cc-openai-bridge name: `packages/luca-code/dist/cc-openai-bridge.js` in the main checkout (built 2026-07-23, not tracked). Line numbers below are from that build.

- **How it launches.** `cc-openai-bridge claude [args…]` starts a loopback gateway, then spawns `claude` with the args passed through (help text at `:16632-16651`). The child gets `ANTHROPIC_BASE_URL` (the gateway), `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_API_KEY` (a per-launch gateway token), model pins such as `ANTHROPIC_MODEL`, and `CLAUDE_CONFIG_DIR` set to the profile (`buildClaudeEnv`, `:16420-16455`; same code at `old-luca-final:packages/luca-code/src/launcher/claude.ts:269-309`). It adds its own `--managed-settings` and rejects that flag and `--fallback-model` from callers (`:16334`, `:16395`). Its settings come from `CCOB_*` env vars (`:13587-13614`).
- **No standalone gateway.** The commands are `login`, `claude`, `status`, `logout`, `help`, and `version` (help text). The gateway lives only as long as the `claude` it launched. So setting `ANTHROPIC_BASE_URL` alone won't work; each launch must go through the bridge.
- **`claude -p`: yes, in principle.** Run `cc-openai-bridge claude -p … --output-format stream-json`; the bridge passes the flags through. It rewrites a `--model` value it doesn't know to its selected model (`resolveModelValue`, `:16363`).
- **Agent SDK: probably.** Point `pathToClaudeCodeExecutable` at a wrapper that runs `cc-openai-bridge claude "$@"`, or use `spawnClaudeCodeProcess` ([Options](https://code.claude.com/docs/en/agent-sdk/typescript.md)). The bridge spawns `claude` with inherited stdin and stdout (`:16570-16571`), so the SDK's pipes should pass through. Untested.
- **Paseo: probably, with one trap.** A custom provider with `extends: "claude"` and `command: [<bun>, <bridge.js>, "claude"]`. But if the first word is literally `bun` or `node`, Paseo swaps in its own Node binary (`providers/claude/query.ts:71-86`), and the bridge needs Bun. Use an absolute path to Bun. Untested.
- **Leak.** The profile's `.claude.json` has `muninn`, so add strict MCP on every path.
- Billing and terms for GPT through this bridge are #345's question.

### Mid-turn messages (`activeTurnBehavior`), for #341

What the Paseo `v0.9.1` source says:

- **The option.** `send_agent_message_request` has an optional `activeTurnBehavior: "interrupt" | "steer"` (`packages/protocol/src/messages.ts:1195-1206`, `:1349-1358`). The WebSocket handler defaults it to `"interrupt"` (`session.ts:8070`).
- **"interrupt".** `sendPromptToAgent` always passes `replaceRunning: true` (`agent/agent-prompt.ts:334`). With a run in flight, `replaceAgentRun` cancels it and starts the new prompt as a new turn (`agent-manager.ts:2635-2660`). So a plain `send()` to a busy agent ends its turn.
- **"steer".** `steerOrReplaceActiveTurn` asks the provider to add the message to the active turn (`agent-manager.ts:2695-2745`).
  - Claude pushes the message into the live SDK input stream, marked `priority: "next"` (`providers/claude/agent.ts:2292-2320`). The public SDK reference doesn't document a `priority` field on `SDKUserMessage`.
  - Codex calls `turn/steer` (`codex-app-server-agent.ts:4321-4342`).
  - If the provider can't steer (for example, mid-compaction), Paseo falls back to replacing the turn (`agent-manager.ts:2722-2745`).
- **Who can steer.** Only the internal client's `sendAgentMessage(…, { activeTurnBehavior })` sets it (`daemon-client.ts:360-365`, `:3342-3359`). The public `PaseoAgentSendOptions` type omits it (`packages/client/src/index.ts:279-283`). The MCP `send_agent_prompt` tool and `paseo send` never set it, so they always interrupt (`paseo-tools.ts:1868-1900`; `paseo send --help`). Paseo's own heartbeats, which prompt an existing agent, pass `"steer"` after checking that no run is in flight (`schedule/service.ts:855-860`).
- **Docs.** #330 quoted a line saying a prompt "does not interrupt the receiving agent's current turn". That line isn't in the `v0.9.1` docs, the bundled skills, or the live site today.
- **The Agent SDK queues instead.** Without Paseo, a message sent while a turn runs waits in the queue until the turn ends ([streaming input](https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode.md)).

### Timeline rows in an agent's chat, for the board

- **The API.** A plugin's server handler calls `paseo.agents.ref(agentId).timeline.append({ type: "plugin", id, kind, version, data })`. Reusing an `id` replaces the row. `data` is capped at 64 KiB ([plugin reference](https://paseo.sh/docs/plugins/reference)). The board prototype does exactly this (`luca-framework-board-prototype/prototypes/paseo-board/server/feed.ts`).
- **Plugin sessions only.** The public client has `timeline.append()` too (`packages/client/src/index.ts:325`). But the daemon rejects it unless the caller is a plugin session: "Only plugin sessions can append plugin timeline items" (`session.ts:7716-7728`). A plain client can't claim a `plugin:` client ID either; the daemon closes the socket (`websocket-server.ts:1573-1583`).
- **The engine's route.** Plain code can invoke any plugin's RPC through the internal client's `invokePluginRpc(pluginId, method, input)` (`daemon-client.ts:5425`). The daemon doesn't check who calls (`session.ts:2433-2444`). So the engine can ask its board plugin to append a row, and the plugin appends it.
- **A provider plugin can also emit rows** for its own sessions, as `timeline.item` events with `type: "plugin"` ([provider plugins](https://paseo.sh/docs/plugins/providers)).
- **Plugins run on Node.** The daemon starts plugin backends with Node's `fork()` (`plugins/runtime.ts:223-226`). Code running inside a plugin can't use Bun APIs.

## What this means for the engine

- **[#334](https://github.com/asibilia/luca-framework/issues/334) Tracer bullet.** Build the one ticket on the Agent SDK. Per agent: `query()` in streaming-input mode, `cwd` set to the engine's worktree, `systemPrompt` preset plus the role's `append`, the role's `model`, `outputFormat` for its result, `strictMcpConfig: true`, the setting sources #347 picks, and `env` with `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` and `ENABLE_CLAUDEAI_MCP_SERVERS=false`. Journal every message the generator yields. Treat `rate_limit_event` with `status: "rejected"` as the start of a limit wait.
- **[#335](https://github.com/asibilia/luca-framework/issues/335) Where the engine runs.** Run it as its own Bun process, outside Paseo. Plugin backends run on Node, and their lifecycle hooks time out after 30 s ([plugin reference](https://paseo.sh/docs/plugins/reference)). The engine can still reach Paseo through `@getpaseo/client` for the board and notifications. The docs ask for Node 22+ ([SDK quickstart](https://paseo.sh/docs/sdk/quickstart)), but the client only needs a global `WebSocket` (`packages/client/src/daemon-client-websocket-transport.ts:14-26`), which Bun has. Untested under Bun.
- **[#338](https://github.com/asibilia/luca-framework/issues/338) Agents talking to each other.** On the SDK path, the engine relays: it journals the message, then adds it with `streamInput()`, where it queues behind the current turn. An in-process MCP tool can let an agent hand a message back to the engine. On the Paseo path, a plain `send()` would cut the receiver's turn short.
- **[#341](https://github.com/asibilia/luca-framework/issues/341) Does a Paseo message interrupt?** The source says yes by default, and `steer` exists but isn't public. The live test should compare a public `send()`, the internal `steer`, and the MCP tool, and check whether background subagents die.
- **[#342](https://github.com/asibilia/luca-framework/issues/342) How a stuck run reaches you.** "A Paseo attention item if it can" means a plugin: either a run-provider plugin that asks a question, or a terminal that reports "needs input". The comment on the spec issue stays the main channel.
- **[#343](https://github.com/asibilia/luca-framework/issues/343) The board.** The engine feeds the board through its plugin's RPC; the plugin appends the rows and serves the panel. The rows can go into the chat the run was started from, whichever path launches agents.
- **[#345](https://github.com/asibilia/luca-framework/issues/345) Billing.** All three Claude paths run the same `claude` binary with the same login. Paseo says its Claude use "counts against your normal Claude plan limits" ([Claude Code in Paseo](https://paseo.sh/docs/claude-code)). The SDK overview says Anthropic doesn't allow third-party developers to offer claude.ai login for their products without approval ([overview](https://code.claude.com/docs/en/agent-sdk/overview.md)). `--bare` can't use the plan. How these apply to Luca is #345's call, and so is the bridge.
- **[#347](https://github.com/asibilia/luca-framework/issues/347) Guards.** Everything #347 recommends is settable on the SDK path. The stock Paseo provider can't give `dontAsk`, strict MCP, clean setting sources, or hook callbacks, and it injects tools that let an agent loosen its own guards ([#347's doc](https://github.com/asibilia/luca-framework/blob/research/claude-code-guards/docs/research/luca-on-claude-code/claude-code-guards.md)).

**Recommendation.**

- **Use the Claude Agent SDK, called from the engine's Bun process, to launch every Claude Code agent.** Why:
  - It's the only path where the engine sets every option #347 needs, strict MCP included.
  - It has native schema output with a retry cap, for every role's result.
  - It streams typed rate-limit events with a reset time, for limit waits.
  - It yields every raw message, for the journal.
  - It queues follow-ups instead of cutting a turn short.
  - It needs no daemon, and it matches what #347 recommends.
  - `claude -p` is the same engine over stdio. Keep it for debugging and for reproducing a run by hand, not as a second launcher.
- **Fallback: wrap the same SDK calls in a Luca provider plugin inside Paseo.** Take it if having each agent live in Paseo matters more than a simpler setup. The plugin gets the full launch config, native `outputSchema` and steering hooks ([provider plugins](https://paseo.sh/docs/plugins/providers); `packages/plugin/src/server/provider.ts:6-24`, `:80-110`), and native attention. But it runs on Node, and Paseo's plugin API is young.
- **Don't launch engine agents through Paseo's stock Claude provider**, because of the leaks and gaps above.
- **GPT reviewers** need either Codex, which isn't installed yet (through its own SDK, or Paseo's Codex provider), or Claude Code behind cc-openai-bridge on the SDK path. That choice waits on #345.
- **The final pick also depends on #345's billing answer.**

## Unknowns and experiments to run later

Each needs a model session, so none was run here.

1. **Limit hits, per path.** Hit a plan limit through the SDK, `claude -p`, and Paseo. Record whether `rate_limit_event` arrives with `status: "rejected"` and `resetsAt`, and what the result looks like. In Paseo, check whether it shows as `turn_completed` or `turn_failed`, and whether `listUsage()` shows the reset.
2. **Strict MCP really drops `muninn`.** Start an SDK session with `strictMcpConfig: true` and `mcpServers: {}`. Check `system/init.mcp_servers` for `muninn`, the other user servers, plugin servers, and connectors.
3. **Paseo drops Claude's `outputSchema`.** Create a Claude agent with `outputSchema` through `@getpaseo/client` and confirm the reply is free text.
4. **Both SDKs under Bun.** Run one Agent SDK `query()` from a Bun process, in streaming-input mode, with `interrupt()` and `streamInput()`. Separately, connect `@getpaseo/client` from Bun and call a plugin RPC.
5. **cc-openai-bridge through the SDK and Paseo.** Test the wrapper as `pathToClaudeCodeExecutable`, and as a Paseo custom provider with an absolute Bun path. Check which model IDs work and that strict MCP applies.
6. **`CLAUDE_CONFIG_DIR` isolation.** Confirm a moved config dir needs its own login or `CLAUDE_CODE_OAUTH_TOKEN`, and that nothing from `~/.claude` loads.
7. **#341's live test.** Public `send()` versus internal `steer` versus MCP `send_agent_prompt`, on a busy Claude agent and a busy Codex agent. Check whether background subagents survive `steer`.
8. **Codex on a schema mismatch,** and whether a user's own Codex MCP servers load next to Paseo's `config.mcp_servers`.
9. **Run-level attention.** Build a minimal provider plugin that emits `session.permission`, and check it raises a push notification. Separately, try the terminal-activity route from a plain process.
10. **Post-run inspection.** Check whether `paseo import <session-id> --provider claude` can open an SDK-run session in Paseo after the run, without disturbing the engine.
11. **Stdin control for `claude -p`.** Whether an interrupt can be sent over `--input-format stream-json` without the SDK. It isn't documented.

## Sources

Claude Code docs (all fetched 2026-09-22; `.md` URLs):

- https://code.claude.com/docs/en/headless.md
- https://code.claude.com/docs/en/cli-reference.md
- https://code.claude.com/docs/en/env-vars.md
- https://code.claude.com/docs/en/workflows.md
- https://code.claude.com/docs/en/interactive-mode.md
- https://code.claude.com/docs/en/errors.md
- https://code.claude.com/docs/en/authentication.md
- https://code.claude.com/docs/en/mcp.md
- https://code.claude.com/docs/en/agent-sdk/overview.md
- https://code.claude.com/docs/en/agent-sdk/typescript.md
- https://code.claude.com/docs/en/agent-sdk/structured-outputs.md
- https://code.claude.com/docs/en/agent-sdk/sessions.md
- https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode.md
- https://code.claude.com/docs/en/agent-sdk/streaming-output.md
- https://code.claude.com/docs/en/agent-sdk/cost-tracking.md
- https://code.claude.com/docs/en/agent-sdk/claude-code-features.md
- https://code.claude.com/docs/en/agent-sdk/skills.md
- https://code.claude.com/docs/en/agent-sdk/hosting.md
- Claude Code 2.1.280: `claude --help`, and the bundled `workflow-authoring` skill text

Paseo (`getpaseo/paseo` at tag `v0.9.1`, and the installed app `0.9.1`):

- Docs: https://paseo.sh/docs/sdk, /docs/sdk/quickstart, /docs/sdk/agents, /docs/sdk/reference, /docs/sdk/events, /docs/sdk/provider-options, /docs/sdk/workspaces, /docs/claude-code, /docs/codex, /docs/custom-providers, /docs/mcp, /docs/plugins/reference, /docs/plugins/providers (same text as `public-docs/` at `v0.9.1`)
- `packages/server/src/server/agent/providers/claude/agent.ts`, `query.ts`, `options.ts`
- `packages/server/src/server/agent/providers/codex-app-server-agent.ts`
- `packages/server/src/server/agent/agent-manager.ts`, `agent-prompt.ts`, `agent-response-loop.ts`, `agent-sdk-types.ts`, `create-agent/create.ts`, `runtime-mcp-config.ts`, `tools/paseo-tools.ts`
- `packages/server/src/server/session.ts`, `websocket-server.ts`, `bootstrap.ts`, `plugins/runtime.ts`, `plugins/plugin-session-identity.ts`, `schedule/service.ts`
- `packages/server/src/services/quota-fetcher/providers/claude.ts`, `codex.ts`
- `packages/server/src/terminal/terminal-manager.ts`, `terminal/agent-hooks/claude/claude.ts`
- `packages/protocol/src/messages.ts`, `agent-labels.ts`, `messages.active-turn-behavior.test.ts`
- `packages/client/src/index.ts`, `daemon-client.ts`
- `packages/cli/src/commands/agent/run.ts`, `commands/hooks.ts`
- `packages/plugin/src/server/provider.ts`
- `packages/server/package.json` (Agent SDK `0.3.246`)
- Installed CLI: `paseo --help`, `run --help`, `send --help`, `logs --help`, `stop --help`, `wait --help`, `import --help`, `hooks --help`, `provider ls`, `plugin ls`

Codex (fetched 2026-09-22):

- https://learn.chatgpt.com/docs/app-server.md
- https://learn.chatgpt.com/docs/codex-sdk.md
- `openai/codex` `main`: `codex-rs/app-server-protocol/schema/typescript/v2/ThreadStartParams.ts`, `sdk/typescript/README.md`

cc-openai-bridge and local config (key names only):

- `old-luca-final:packages/luca-code/README.md`, `src/launcher/claude.ts`, `src/constants.ts`, `package.json`
- `~/Github/luca-framework/packages/luca-code/dist/cc-openai-bridge.js` (untracked build)
- `~/.config/cc-openai-bridge/`, `~/.claude/cc-openai-bridge/profile/` (file and key names)
- `~/.claude.json` (MCP server names), `~/.claude/settings.json` (key names), `~/.paseo/config.json` (key names), `~/.codex/` (file names)

Related research:

- #330 "What can Paseo give the engine?": `research/paseo-for-the-engine:docs/research/luca-on-pi/paseo-for-the-engine.md`
- #347 "What guard tools does Claude Code give each agent?": `research/claude-code-guards:docs/research/luca-on-claude-code/claude-code-guards.md`
- Board prototype: `~/Github/luca-framework-board-prototype/prototypes/paseo-board/` (README, `index.server.ts`, `server/feed.ts`)
