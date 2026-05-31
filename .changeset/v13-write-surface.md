---
"@alecsibilia/luca": patch
---

v13 write-surface re-architecture: replace the MCP server with the `luca` CLI.

The 27-tool MCP server is removed. Luca's write surface is now two tracks, both enforced by the stage-gate hook: freeform artifact files (plan, research, audit, …) are written with the agent's native `Write` tool to the canonical `.luca/` path, and structured/operational mutations go through a typed `luca` CLI.

**Breaking changes**

- The `luca mcp serve` command and the luca MCP server are removed.
- `@modelcontextprotocol/sdk` is no longer a `luca-framework` dependency.
- `luca init` no longer registers an MCP server.

**What changed**

- Phase A — the 27 tool handlers + helpers moved out of `src/mcp/` into a runtime-agnostic `src/write-surface/` domain; the SDK-coupled result type was dropped.
- Phase B — new `luca` CLI: 18 commands across 11 noun groups (`luca state`, `luca todo`, `luca roadmap`, …), plus a `luca-write-surface` discovery skill.
- Phase C — the stage-gate hook became a per-step artifact-path gate: a native `Write` to a `.luca/` path is allowed only when the path is exactly the legal artifact for the current `pipelineStep`.
- Phase D — ~24 skill/agent files rewired off the `luca_*` MCP tools.
- Phase E — `src/mcp/`, `luca mcp serve`, the `wire-mcp-server` init wiring, and the `@modelcontextprotocol/sdk` dependency deleted.

`luca doctor` now flags a stale `luca mcp serve` registration left by a pre-v13 `luca init` (fix: `claude mcp remove luca`). The `.luca/` directory contract is unchanged — no artifact migration required.
