---
"@alecsibilia/luca": patch
"@alecsibilia/luca-cli": patch
---

feat(init): automated MuninnDB MCP registration with correct Antigravity + Claude support

`luca init` now auto-creates the workspace vault and registers the MuninnDB MCP server for both supported harnesses, sourcing the token from `~/.muninn/mcp.token` (no manual API-key/`.env` step).

- **Antigravity CLI:** writes the dedicated `~/.gemini/antigravity-cli/mcp_config.json` with `serverUrl` + `headers` + `enabledTools: ["*"]`. `enabledTools` is required — without it the server connects but every tool call fails with "tool … is not enabled". The token is inlined (Antigravity does not interpolate env vars; the `${MUNINN_DB_API_KEY}` placeholder is never written).
- **Claude Code:** registers MuninnDB globally via a file-merge into `~/.claude.json` `mcpServers` (`{ type: "sse", url, headers }`), replacing the per-project `claude mcp add` shell-out. The write is atomic (temp + rename), `0600`, merge-not-replace, and aborts rather than clobbering a present-but-malformed config.
- **Harness abstraction:** init wiring is driven by a `Harness` descriptor registry (`HARNESSES`), with per-harness `--skip-claude`/`--skip-antigravity` flags and `isInstalled()` gating.
- Both MCP writers share `readMuninnToken()`, idempotency short-circuits, and migrate stale entries to the canonical shape. `isMuninnRegistered` detects registrations in both harnesses' config locations.
- Removes dead `autoCreateApiKey` / legacy `.env` API-key generation from onboarding.
