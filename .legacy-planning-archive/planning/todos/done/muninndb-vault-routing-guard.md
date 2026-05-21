---
title: "MuninnDB vault routing guard: global rule + prompt hook to prevent repo-scoped memories in default vault"
area: hooks
created: 2026-03-17
source: conversation
---

## Context

User hit a bug in a different repo where Claude Code was saving repo-specific memories (session:_, brain:project-_) to the default MuninnDB vault instead of the repo-specific vault. The vault-routing rule exists but agents don't always follow it since it's advisory.

## Task

Add two safeguards (combination of Options #1 and #3 from discussion):

1. **Global rule** (`~/.claude/rules/vault-guard.md`) — Reinforces vault routing before MuninnDB writes. Advisory but always loaded. Reminds the LLM to resolve the repo vault from `.planning/config.json` before any muninn_remember call.

2. **PreToolUse prompt hook** — Intercepts `mcp__muninn__muninn_remember` and `mcp__muninn__muninn_remember_batch` tool calls. Uses LLM judgment to evaluate whether the vault parameter matches the concept prefix routing:
   - Repo-scoped prefixes (`session:*`, `brain:project-*`, `metric:*`, `version:*`, `milestone:*`) MUST target the repo vault (from config.json), NOT "default"
   - Cross-cutting prefixes (`pattern:*`, `pitfall:*`, `preference:*`, `brain:user-*`, `procedure:*`, `process:*`) MAY target "default"
   - Block with error message if misrouted

3. **Deploy via**: `~/.claude/rules/` for global rule, `luca init` for per-project hook in generated settings.json

## Notes

- Prompt hook (Option #3) was chosen over command hook (Option #2) because it can handle ambiguous cases and new concept prefixes without code changes
- The hook needs access to `.planning/config.json` to resolve the expected repo vault name
- This is a cross-cutting concern — applies to all repos using Luca, not just this one
- The existing `vault-routing.md` rule in `.claude/rules/` documents the routing tables but doesn't enforce them
