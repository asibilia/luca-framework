# @alecsibilia/luca-cli

## 13.0.1

### Patch Changes

- @alecsibilia/luca-core@13.0.1
- @alecsibilia/luca-tools@13.0.1

## 13.0.0

### Patch Changes

- 47ed287: feat(repo): add Antigravity CLI support

  - `luca init` now natively configures Antigravity CLI alongside Claude Code.
  - Adds `~/.gemini/antigravity-cli/skills` and `agents` provisioning.
  - Registers the stage-gate hook for Antigravity's `PreToolUse` event in `hooks.json`.
  - Automates MuninnDB MCP server registration in Antigravity's `settings.json`.

- e5d893b: feat(init): automated MuninnDB MCP registration with correct Antigravity + Claude support

  `luca init` now auto-creates the workspace vault and registers the MuninnDB MCP server for both supported harnesses, sourcing the token from `~/.muninn/mcp.token` (no manual API-key/`.env` step).

  - **Antigravity CLI:** writes the dedicated `~/.gemini/antigravity-cli/mcp_config.json` with `serverUrl` + `headers` + `enabledTools: ["*"]`. `enabledTools` is required — without it the server connects but every tool call fails with "tool … is not enabled". The token is inlined (Antigravity does not interpolate env vars; the `${MUNINN_DB_API_KEY}` placeholder is never written).
  - **Claude Code:** registers MuninnDB globally via a file-merge into `~/.claude.json` `mcpServers` (`{ type: "sse", url, headers }`), replacing the per-project `claude mcp add` shell-out. The write is atomic (temp + rename), `0600`, merge-not-replace, and aborts rather than clobbering a present-but-malformed config.
  - **Harness abstraction:** init wiring is driven by a `Harness` descriptor registry (`HARNESSES`), with per-harness `--skip-claude`/`--skip-antigravity` flags and `isInstalled()` gating.
  - Both MCP writers share `readMuninnToken()`, idempotency short-circuits, and migrate stale entries to the canonical shape. `isMuninnRegistered` detects registrations in both harnesses' config locations.
  - Removes dead `autoCreateApiKey` / legacy `.env` API-key generation from onboarding.
  - @alecsibilia/luca-core@13.0.0
  - @alecsibilia/luca-tools@13.0.0

## 13.0.0-alpha.17

### Patch Changes

- @alecsibilia/luca-core@13.0.0-alpha.17
- @alecsibilia/luca-tools@13.0.0-alpha.17

## 13.0.0-alpha.16

### Patch Changes

- @alecsibilia/luca-core@13.0.0-alpha.16
- @alecsibilia/luca-tools@13.0.0-alpha.16

## 13.0.0-alpha.15

### Patch Changes

- @alecsibilia/luca-core@13.0.0-alpha.15
- @alecsibilia/luca-tools@13.0.0-alpha.15

## 13.0.0-alpha.14

### Patch Changes

- @alecsibilia/luca-core@13.0.0-alpha.14
- @alecsibilia/luca-tools@13.0.0-alpha.14

## 13.0.0-alpha.13

### Patch Changes

- @alecsibilia/luca-core@13.0.0-alpha.13
- @alecsibilia/luca-tools@13.0.0-alpha.13

## 13.0.0-alpha.12

### Patch Changes

- e5d893b: feat(init): automated MuninnDB MCP registration with correct Antigravity + Claude support

  `luca init` now auto-creates the workspace vault and registers the MuninnDB MCP server for both supported harnesses, sourcing the token from `~/.muninn/mcp.token` (no manual API-key/`.env` step).
  - **Antigravity CLI:** writes the dedicated `~/.gemini/antigravity-cli/mcp_config.json` with `serverUrl` + `headers` + `enabledTools: ["*"]`. `enabledTools` is required — without it the server connects but every tool call fails with "tool … is not enabled". The token is inlined (Antigravity does not interpolate env vars; the `${MUNINN_DB_API_KEY}` placeholder is never written).
  - **Claude Code:** registers MuninnDB globally via a file-merge into `~/.claude.json` `mcpServers` (`{ type: "sse", url, headers }`), replacing the per-project `claude mcp add` shell-out. The write is atomic (temp + rename), `0600`, merge-not-replace, and aborts rather than clobbering a present-but-malformed config.
  - **Harness abstraction:** init wiring is driven by a `Harness` descriptor registry (`HARNESSES`), with per-harness `--skip-claude`/`--skip-antigravity` flags and `isInstalled()` gating.
  - Both MCP writers share `readMuninnToken()`, idempotency short-circuits, and migrate stale entries to the canonical shape. `isMuninnRegistered` detects registrations in both harnesses' config locations.
  - Removes dead `autoCreateApiKey` / legacy `.env` API-key generation from onboarding.
  - @alecsibilia/luca-core@13.0.0-alpha.12
  - @alecsibilia/luca-tools@13.0.0-alpha.12

## 13.0.0-alpha.11

### Patch Changes

- 47ed287: feat(repo): add Antigravity CLI support
  - `luca init` now natively configures Antigravity CLI alongside Claude Code.
  - Adds `~/.gemini/antigravity-cli/skills` and `agents` provisioning.
  - Registers the stage-gate hook for Antigravity's `PreToolUse` event in `hooks.json`.
  - Automates MuninnDB MCP server registration in Antigravity's `settings.json`.
  - @alecsibilia/luca-core@13.0.0-alpha.11
  - @alecsibilia/luca-tools@13.0.0-alpha.11

## 13.0.0-alpha.10

### Patch Changes

- @alecsibilia/luca-core@13.0.0-alpha.10
- @alecsibilia/luca-tools@13.0.0-alpha.10

## 13.0.0-alpha.9

### Patch Changes

- @alecsibilia/luca-core@13.0.0-alpha.9
- @alecsibilia/luca-tools@13.0.0-alpha.9

## 13.0.0-alpha.8

### Patch Changes

- @alecsibilia/luca-core@13.0.0-alpha.8
- @alecsibilia/luca-tools@13.0.0-alpha.8

## 13.0.0-alpha.7

### Patch Changes

- @alecsibilia/luca-core@13.0.0-alpha.7
- @alecsibilia/luca-tools@13.0.0-alpha.7

## 13.0.0-alpha.6

### Patch Changes

- @alecsibilia/luca-core@13.0.0-alpha.6
- @alecsibilia/luca-tools@13.0.0-alpha.6

## 13.0.0-alpha.5

### Patch Changes

- @alecsibilia/luca-core@13.0.0-alpha.5
- @alecsibilia/luca-tools@13.0.0-alpha.5

## 13.0.0-alpha.4

### Patch Changes

- @alecsibilia/luca-core@13.0.0-alpha.4
- @alecsibilia/luca-tools@13.0.0-alpha.4

## 13.0.0-alpha.3

### Patch Changes

- @alecsibilia/luca-core@13.0.0-alpha.3
- @alecsibilia/luca-tools@13.0.0-alpha.3

## 13.0.0-alpha.2

### Patch Changes

- @alecsibilia/luca-core@13.0.0-alpha.2
- @alecsibilia/luca-tools@13.0.0-alpha.2

## 13.0.0-alpha.1

### Patch Changes

- @alecsibilia/luca-core@13.0.0-alpha.1
- @alecsibilia/luca-tools@13.0.0-alpha.1
