---
"@alecsibilia/luca": patch
"@alecsibilia/luca-cli": patch
---

feat(repo): add Antigravity CLI support

- `luca init` now natively configures Antigravity CLI alongside Claude Code.
- Adds `~/.gemini/antigravity-cli/skills` and `agents` provisioning.
- Registers the stage-gate hook for Antigravity's `PreToolUse` event in `hooks.json`.
- Automates MuninnDB MCP server registration in Antigravity's `settings.json`.
