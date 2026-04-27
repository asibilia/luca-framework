---
"@alecsibilia/luca-mastracode": minor
---

Subagents now inherit MCP tools from the harness's `mcpManager`.

Previously, mode agents merged MCP tools (firecrawl, muninn, etc.) at request time via `mcpManagerRef` in `create-static-agent.ts`, but subagents (researcher, executor, planner, …) only saw the static `tools` field on their `HarnessSubagent` definition — which was empty. Skills loaded into the subagent prompt referenced tools the subagent couldn't actually call, so e.g. `firecrawl_search` invocations hung indefinitely and `muninn_*` calls silently no-op'd.

Each opted-in subagent now exposes a Proxy on `definition.tools` that forwards `ownKeys` / `getOwnPropertyDescriptor` / `get` / `has` to `mcpManager.getTools()`. The harness materializes tools at subagent execute time via `{ ...definition.tools }`, so the Proxy resolves to whatever MCP servers are connected at that moment — no init-timing race with mastracode's own `tui.init()` MCP wire-up, no startup delay, and mid-session MCP reloads are reflected automatically.

Inheriting subagents: `researcher`, `discussion`, `planner`, `executor`, `verifier`, `reviewer`, `learner`. Filesystem-only subagents (`plan-reviewer`, `shadow-scanner`) keep their narrower toolset.
