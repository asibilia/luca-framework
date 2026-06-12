---
"@alecsibilia/luca": patch
"@alecsibilia/luca-cli": patch
---

feat(init): automate vault creation and MCP registration

- `luca init` now automatically invokes `muninn vault create <name>` for the current workspace.
- Detects the global MuninnDB MCP token from `~/.muninn/mcp.token`.
- Automatically registers the MCP server for Claude Code (`claude mcp add`) and Antigravity CLI.
- Removes legacy `.env` API key generation and manual vault:init steps from the onboarding flow.
