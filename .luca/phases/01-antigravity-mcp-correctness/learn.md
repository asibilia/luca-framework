# Learnings — Phase 01: antigravity-mcp-correctness

Source: commits `1678dcbd4` (main fix) + `d41c13982` (review fixes). Verification PASS.
Files: `packages/luca-cli/src/init/helpers/wire-claude-hooks.ts`, `packages/luca-cli/src/utils/muninn-mcp-registration.ts`.

---

## reference: Antigravity CLI/IDE MCP config location and remote-server shape

- **TYPE:** reference (pattern)
- **CONCEPT:** reference:antigravity-mcp-config-shape
- **CONTENT:** The Antigravity CLI (and the Antigravity IDE — they share one file) reads MCP servers from a dedicated `~/.gemini/antigravity-cli/mcp_config.json`, NOT from `settings.json`'s `mcpServers` (that is legacy Gemini-CLI style and is ignored by Antigravity). Remote/HTTP MCP servers are declared with the key `serverUrl` — NOT `url` (which is what Cursor / VS Code use). Canonical entry shape: `{ mcpServers: { <name>: { serverUrl: "http://...", headers: { Authorization: "Bearer <token>" }, enabledTools: ["*"] } } }`. Verified in `wire-claude-hooks.ts:13,69,158,324` and `muninn-mcp-registration.ts:53`.
- **CONTEXT:** Any time you register an MCP server for Antigravity CLI/IDE from tooling. Sources: antigravity.google/docs/mcp; Medium "Configuring MCP Servers and Skills for Antigravity CLI and IDE".
- **CONFIDENCE:** HIGH

---

## pitfall: Antigravity MCP entries require enabledTools or every tool call fails

- **TYPE:** pitfall
- **CONCEPT:** pitfall:antigravity-mcp-enabledtools-required
- **CONTENT:** An Antigravity `mcp_config.json` server entry MUST include `enabledTools` (use `["*"]` to allow all). Without it the server CONNECTS successfully but every tool invocation fails with `tool <name> is not enabled for server <server>` (e.g. `tool muninn_recall is not enabled for server muninn`). This is a silent-success-then-fail trap: connection looks healthy, calls die. Proven from `~/.gemini/antigravity-cli/log/*.log`. Load-bearing comment at `wire-claude-hooks.ts:320`.
- **CONTEXT:** Registering or debugging an Antigravity MCP server whose tools "aren't found" despite a connected server.
- **CONFIDENCE:** HIGH

---

## pitfall: Antigravity does not interpolate env vars in mcp_config.json

- **TYPE:** pitfall
- **CONCEPT:** pitfall:antigravity-mcp-no-env-interpolation
- **CONTENT:** Antigravity CLI/IDE does NOT interpolate environment-variable placeholders in `mcp_config.json`. A value like `"Bearer ${MUNINN_DB_API_KEY}"` is written and read literally and never resolves, so auth silently fails. The real token must be inlined into the config at write time. The original buggy diff kept a `${MUNINN_DB_API_KEY}` fallback; the fix removed it and gates the write on a present token (skip+log guidance when absent). Comment at `wire-claude-hooks.ts:293`.
- **CONTEXT:** Writing any secret/credential into an Antigravity MCP config — inline the resolved value, never a `${...}` placeholder.
- **CONFIDENCE:** HIGH

---

## pitfall: producer/consumer path drift between config writer and its registration detector

- **TYPE:** pitfall
- **CONCEPT:** pitfall:config-writer-detector-path-drift
- **CONTENT:** When you change WHERE a config is written (here: `settings.json` → `mcp_config.json`), every reader that asks "is it registered?" must change in lockstep, or it silently returns false negatives. In this phase `isMuninnRegistered` still probed `settings.json` after the writer moved to `mcp_config.json`, so a correctly-registered server read as unregistered. Prevention: share the path constant between writer and detector (single source of truth) rather than duplicating the literal path in each. Fixed at `muninn-mcp-registration.ts:53`.
- **CONTEXT:** Any change to a config file's location/target when a separate code path detects presence/registration of that config.
- **CONFIDENCE:** HIGH

---

## decision: token-bearing config files written by luca init get chmod 0600

- **TYPE:** decision
- **CONCEPT:** decision:luca-init-token-config-chmod-0600
- **CONTENT:** Any config file `luca init` writes that embeds a plaintext credential (here a `Bearer <token>` header in `mcp_config.json`) must be `chmodSync(path, 0o600)` immediately after a successful write — `writeFile` defaults to ~0644 (world-readable), letting any local user read the credential. This follows the SEC-002 precedent from `vault-setup.ts` `writeApiKeyToEnv`. Applied only on the success path (the no-token skip-return never writes). Implemented at `wire-claude-hooks.ts:1,206`.
- **CONTEXT:** Project-scoped (luca-monorepo). Apply to every new token/secret-bearing file written during init.
- **CONFIDENCE:** HIGH

---

## process: subagents cannot git-commit during execute (stage-gate blocks bash-commit)

- **TYPE:** process
- **CONCEPT:** process:execute-stage-gate-blocks-subagent-commit
- **CONTENT:** During `pipelineStep=execute` the stage-gate hook blocks `bash-commit` (`stage-gate BLOCK: Bash (category=bash-commit) is not allowed in phase=EXECUTING`). A subagent must NOT mutate pipeline state to bypass it. The executor edits + verifies files, leaves them modified (unstaged) in the working tree, and returns suggested commit message(s) and the exact files to stage; the ORCHESTRATOR performs the commit. Also note: stage ONLY the phase's files — the working tree here had ~10 pre-existing dirty files belonging to later phases.
- **CONTEXT:** Cross-cutting Luca pipeline behavior; relevant to any executor/test-writer subagent that finishes a code change mid-pipeline.
- **CONFIDENCE:** HIGH

---

## reference: harden config parse so corrupt files don't abort luca init

- **TYPE:** reference (pattern)
- **CONCEPT:** pattern:luca-init-config-parse-fallback
- **CONTENT:** Existing-config reads in `luca init` should wrap `JSON.parse` in try/catch that falls back to `{}` on parse error, so a corrupt or hand-edited config cannot abort init mid-run. Pair with an `existsSync` guard so missing-file `?? {}` behavior is preserved. Applied to the Antigravity mcp_config read path at `wire-claude-hooks.ts:162`.
- **CONTEXT:** Any init/setup code that reads a user-editable JSON config it will then merge into and rewrite.
- **CONFIDENCE:** MEDIUM
