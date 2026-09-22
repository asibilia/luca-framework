# What guard tools does Claude Code give each agent?

> Research for [#347](https://github.com/asibilia/luca-framework/issues/347) on the map "Map: Luca v1 on Paseo + Claude Code" (#325). Date: 2026-09-22.
> Versions checked: Claude Code 2.1.280 (`claude --version`), Paseo 0.9.1 (app bundle `CFBundleShortVersionString`, `paseo --version`, and source tag `v0.9.1`), Claude Agent SDK 0.3.246 (the version Paseo 0.9.1 pins in `packages/server/package.json:107`). Codex CLI is not installed on this machine (`codex: command not found`).
> Docs: every `code.claude.com` page cited was fetched live on 2026-09-22 and matched byte for byte the copies in `/tmp/ccg-docs/`.
> **Draft in progress.** Sections still marked "(draft)" are being filled in.

## Answer

(draft, first findings)

- Claude Code has five guard layers per session: permission rules (allow, ask, deny), a permission mode, PreToolUse hooks (plus the SDK's `canUseTool`), an OS sandbox for shell commands, and a set of settings sources that decide which of the user's own rules, hooks, and MCP servers load.
- Deny always wins. A deny rule from any source blocks, and a hook's `deny` or exit code 2 can't be overridden by any allow rule or any other hook.
- Rules on the Edit tool are solid. Rules on Bash are not a security boundary: the docs say so, and `Bash(git push *)` does not stop `git -C . push`. Only the OS sandbox holds for Bash, and it covers Bash only.
- The sandbox does **not** block git writes in a worktree: it deliberately lets a linked worktree write to the main repo's `.git`.
- MCP: `~/.claude.json` user servers load even with `settingSources: []`. Only `--strict-mcp-config` / `strictMcpConfig: true` drops them. Today's Paseo launches every Claude agent with `--setting-sources=user,project,local` and no strict flag, and this very session (launched by the Paseo daemon) has the user's `mcp__muninn__*` tools.
- Paseo 0.9.1 only lets you set `allowedTools`, `disallowedTools`, `additionalDirectories`, `sandbox`, and `settings.permissions`/`settings.sandbox` per agent. It rejects `dontAsk` mode, hard-codes the setting sources, and has no strict-MCP option.

## Findings

### 1. What Claude Code offers per agent

(draft)

### 2. What can be set per agent from Paseo, the Agent SDK, and `claude -p`

(draft)

### 3. MCP isolation

(draft)

### 4. Can an agent get around each guard?

(draft)

### 5. Prior art: old Luca's stage-gate hook

(draft)

## What this means for the engine

(draft)

## Unknowns and experiments to run later

(draft)

## Sources

(draft)
