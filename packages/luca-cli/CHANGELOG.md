# @alecsibilia/luca-cli

## 13.1.0-alpha.0

### Minor Changes

- 3c22c7b: feat: deterministic agentic development — replace the 7 pipeline tables with one XState statechart (DAD P0–P2)

  Replaces Luca's 7 hand-rolled pipeline `Record` tables with a single, visualizable XState v5 statechart used statelessly. Deterministic phase/step transitions, a now-live fix-loop iteration budget, and a persistent-runner POC. Backward-compatible — no state schema break, the cold-process enforcement path is preserved. Targets the **v13.2.0** milestone.

  - **DAD-P0** hygiene: excised the dead `src/iteration/*` toolkit, repaired the `iterationPlan` prose, reconciled the `architect` double-definition.
  - **DAD-P1a**: XState v5 machine + `machineVerdict` adapter + a 169-pair golden parity harness (0 mismatches); `xstate@5.32.2` added to `luca-core`.
  - **DAD-P1b**: `luca state advance` is machine-driven via `decideAdvance` → `machineVerdict` (structured reason codes added); the pipeline-guard hook stays a cold process on `checkPipelineGuard`.
  - **DAD-P1c**: the fix-loop budget is live as `assign` actions + a `fixloop.counted` telemetry kind, advisory-first (parity-safe).
  - **DAD-P1t**: `PIPELINE_STEP_TO_COARSE_PHASE` deleted → coarse phase derived from the machine via `snapshot.getMeta()`; four tables demoted to referenced data.
  - **DAD-P1d**: a `luca graph` verb emits a Mermaid `stateDiagram-v2` + machine-definition JSON.
  - **DAD-P2**: a persistent-runner POC (`luca start`/`stop`/`status`) — decision **GO**, all 5 acceptance tests pass; purely additive (cold path untouched).

- 3c22c7b: feat(cli): `luca statusline install` + a `Claude statusline` doctor check

  Versions ≤13.0.1 shipped the bundled statusline script in the tarball but the published init never registered it in `~/.claude/settings.json`, so the footer silently never appeared on fresh machines. Two additions close that gap:

  - **`luca statusline install`** — manually installs the bundled script into `~/.claude/` (or `--home <dir>`) and registers the `statusLine` entry, reusing the same idempotent installer as `luca init` (user-authored statuslines and `statusLine: null` opt-outs are preserved; exits non-zero on any skip so the reason is visible).
  - **`luca doctor`** now includes a global-scope `Claude statusline` check that distinguishes registered / not-registered / script-missing / user-custom / user-disabled / unparsable-settings states, with `luca doctor --fix` support.

### Patch Changes

- Updated dependencies [3c22c7b]
  - @alecsibilia/luca-core@13.1.0-alpha.0
  - @alecsibilia/luca-tools@13.1.0-alpha.0

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
