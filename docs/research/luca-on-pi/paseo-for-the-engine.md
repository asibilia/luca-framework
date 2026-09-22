# What can Paseo give the engine?

> Research for the wayfinder ticket "What can Paseo give the engine?" on "Map: Luca v1 on Pi". Date: 2026-09-22.

## Answer

- Paseo runs Pi as an external subprocess over `pi --mode rpc`, using whatever `pi` binary is already installed — no bundling or version pin. Claude Code, by contrast, runs in-process via the Claude Agent SDK.
- Almost none of Pi's own extension UI reaches the user: Pi exposes zero modes/features to Paseo (unlike Claude's five), consistent with RPC mode dropping `setStatus`/`setWidget`/`custom`/`setFooter`. Users see Paseo's own timeline and chrome, not Pi's TUI.
- Workspaces can be real git worktrees, created/archived by plain code (CLI or MCP) with setup/teardown hooks — the per-ticket isolation the engine needs.
- `send_agent_prompt` is documented as non-interrupting, but empirical evidence (and this session's own operating rules) says a prompt to a busy Claude-Code-backed agent **does** abort its turn and kill its background subagents — an unresolved discrepancy the engine must design around.
- Attention is a real API (`requiresAttention`/`attentionReason`/`attentionTimestamp`, backed by a daemon `agent_attention_required` event), but push delivery has several open reliability bugs.
- A plugin can host the engine's board (workspace panel or timeline overlay, prior art already installed locally), but its server API is request/response only — a panel board polls; only timeline items stream live.

## Capability table

| Need | What Paseo offers | Notes |
|---|---|---|
| Run Pi | Native provider, subprocess via `pi --mode rpc --no-session`, JSON over stdio; user's own binary, not bundled | Claude Code instead runs in-process via the Claude Agent SDK |
| Reach user with UI | Paseo's own timeline, permission prompts, notifications | Pi's status/widget/custom/footer calls largely don't surface (RPC mode) |
| Per-ticket isolation | `create_workspace`/`paseo workspace create --isolation worktree`, real git worktree, setup/teardown hooks | Archived once its last workspace reference is gone |
| Agent↔agent messaging | `send_agent_prompt({agentId, prompt})`, `background`/`notifyOnFinish` flags | Docs say non-interrupting; empirical evidence says it interrupts a busy turn and kills subagents |
| Detect "stuck" | `requiresAttention`/`attentionReason`/`attentionTimestamp` per agent; daemon emits `agent_attention_required` | Push/banner delivery has open bugs; `list_pending_permissions` is a fallback |
| Periodic/background work | `create_schedule` (fresh agent per tick) vs `create_heartbeat` (prompt into one existing agent) | CLI or MCP, one cron engine, separate lifecycles |
| Host a live board | Plugin `addWorkspacePanel`, `addSurface`, `addTimelineTransformer`/`addTimelineRenderer`, server-side `timeline.append` | Panels poll (`useRpc`); only timeline items stream live |

## Findings

**Pi run mode.** Live `list_providers` shows Pi as `{"id":"pi","enabled":true,"modes":[]}` versus Claude's five modes; `inspect_provider({provider:"pi"})` likewise returns `modes: [], features: []`. A web search over `github.com/getpaseo/paseo` explains why: "Pi is a process-backed provider... Paseo requires the user to have the pi binary installed and talks to it through `pi --mode rpc`; the server package does not embed Pi's SDK/runtime packages," launched as `["pi", "--mode", "rpc", "--no-session"]` over stdin/stdout JSON — matching this repo's stocktake (§6): "Pi's RPC mode drops some UI: setStatus/setWidget are fire-and-forget, custom() and setFooter do nothing." By contrast, a 2026-09-10 transcript (`get_agent_activity` on `f093553c…`) caught a daemon-log leak: "Paseo runs Claude Code via the Claude Agent SDK, in-process" — a different model per provider. Paseo injects a system prompt into Pi sessions via "its generated Pi integration extension," skipping `--append-system-prompt` so Pi's own `APPEND_SYSTEM.md` discovery still composes (same search). No evidence Paseo pins a minimum Pi version the way plugins declare `requirements.paseo`.

**Workspaces as worktrees.** The `paseo` skill documents `create_workspace({isolation: "worktree", mode, branchName, baseBranch, worktreeSlug})` and `archive_workspace`, noting Paseo "removes an owned worktree only after its final active workspace reference is archived." `docs/worktrees.md` adds the lifecycle: a setup hook runs once after creation, teardown "runs during archive, before the directory is removed." Live confirmation: this session's `list_workspaces` call returned 10 workspaces, one `"isolation":"worktree"` (in another local project) — already in real use.

**Messaging and the interrupt question.** The `paseo` skill documents `send_agent_prompt`'s `background`/`notifyOnFinish` defaults but not interrupt behavior. `docs/orchestration-workflows.md` states a prompt "does not interrupt the receiving agent's current turn." That conflicts with MuninnDB pitfall `pitfall:paseo-message-kills-background-subagents` (vault `default`, `01M2NDN4N74HNDVGMT9SD399XA`, 2026-09-16): "a prompt delivered mid-turn... interrupts the turn... stops every running background subagent... `meta.json` gets `stoppedByUser: true`." This session's own system context agrees: sending it a prompt "would interrupt it and kill running agents." GitHub issues: #4231 (attentionReason stuck after an error→resume via `send_agent_prompt`), #4384 (blocking `send_agent_prompt` drops the finish notification after a 30s wait), #3875 (`notifyOnFinish` unsubscribes on first child idle). `paseo-handoff` sidesteps this by design — fresh agent, full briefing, "Do not wait or poll for the agent to finish."

**Attention and notifications.** This session's own `list_agents` call returned, live, `"requiresAttention":true,"attentionReason":"finished","attentionTimestamp":"2026-09-22T16:10:07.977Z"` on a sibling agent — proof of the schema. Issue #4841 confirms the daemon "does emit `agent_attention_required`," though desktop banners can be suppressed by stale presence state. `lucaslosi/paseo-streamdeck` ("running / needs attention / done") independently corroborates the model. Two MuninnDB pitfalls describe stall traps to design around: `pitfall:paseo-auto-mode-agent-stalls-on-permission-prompt` (`01M3079628NZ5JD4DQH60MXKYA`) and `pitfall:paseo-agent-resumes-silently-after-waiting` (`01M33QVRZQYCKDS9RZ1CE7CWEG`).

**Schedules, heartbeats, plugins.** `docs/schedules.md`: schedules start "a new agent... on a cron cadence"; heartbeats send "a recurring prompt back into one existing agent." This session's `list_schedules` call returned none configured. The `paseo-plugin` skill and both agent transcripts show a plugin can add a workspace panel, a sidebar surface, or a timeline transformer/renderer, and can push server-owned rows into any agent's timeline — but one transcript found, in the installed SDK types: "the server API is request/response only... No server→client push. So the panel polls via `useRpc`." Prior art already installed locally: `ABorakati/paseo-workspace-activity` — "renders a hierarchical tree of agents and subagents," RPCs `subagents.list`, `subagents.timeline`, `agent.cancel` — a plausible fork base for our board.

## Unverified / open

- Whether Pi-backed (not just Claude-Code-backed) agents also have their turn aborted by `send_agent_prompt`, and the exact mechanism behind the docs-vs-pitfall contradiction (soft queue vs. hard abort) — confirm against Paseo source before the engine depends on it.
- Whether GitHub's open notification-delivery bugs (#4231, #3875, #4384, #4841) are fixed in whatever version we run, and whether newer Paseo added a server→client push primitive for plugin panels beyond the `useRpc` polling seen in one SDK read.
- Whether Paseo enforces any minimum Pi version (no evidence either way).

## Sources

- `luca-framework/CONTEXT.md`, `luca-framework/docs/research/luca-on-pi/stocktake.md` (§6 "Pi")
- `~/.claude/skills/{paseo,paseo-advisor,paseo-committee,paseo-handoff,paseo-help,paseo-plugin}/SKILL.md`
- MCP: `list_providers`, `inspect_provider("pi")`, `list_models("pi")`, `list_workspaces`, `list_agents`, `list_schedules`, `list_profiles`, `get_agent_activity` on agents `f093553c…`, `83c2fac9…`
- MuninnDB (`default`): `pitfall:paseo-message-kills-background-subagents` (01M2NDN4N74HNDVGMT9SD399XA), `pitfall:paseo-auto-mode-agent-stalls-on-permission-prompt` (01M3079628NZ5JD4DQH60MXKYA), `pitfall:paseo-agent-resumes-silently-after-waiting` (01M33QVRZQYCKDS9RZ1CE7CWEG)
- paseo.sh: `/llms.txt`, `/docs/worktrees.md`, `/docs/orchestration-workflows.md`, `/docs/schedules.md`, `/docs/providers.md`, `/pi`, `/docs/mcp.md`, `/docs/orchestration.md`
- github.com/getpaseo/paseo: `public-docs/providers.md`, issues #4979, #4231, #3875, #4384, #4841
- github.com/lucaslosi/paseo-streamdeck, github.com/ABorakati/paseo-workspace-activity
