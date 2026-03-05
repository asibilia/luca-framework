---
description: "Hook/Skill boundary: when to use deterministic hooks vs interactive skills"
globs:
  - "*.ts"
  - "*.sh"
  - .claude/settings.json
  - .cursor/hooks.json
alwaysApply: true
---

# Hook/Skill boundary: when to use deterministic hooks vs interactive skills

## rule

# Hook/Skill Boundary

## Core Distinction

- **Hooks** = Deterministic enforcement. Always run. No judgment. Fast. Both Claude Code and Cursor.
- **Skills** = Interactive workflows. Run on demand. Require judgment. Can be slow. Cross-platform.

## Decision Matrix

| Question | Hook | Skill |
|----------|------|-------|
| Must it always run on every relevant action? | Yes | No |
| Does it need LLM judgment or reasoning? | No | Yes |
| Is it triggered by a tool event (Edit, Write, Bash)? | Yes | No |
| Is it triggered by a user command (/skill-name)? | No | Yes |
| Must it complete in < 2 seconds? | Yes | No |
| Does it involve multi-step reasoning? | No | Yes |
| Can Claude choose to skip it? | No (deterministic) | Yes (advisory) |
| Does it work in Cursor IDE? | Yes (both platforms) | Yes (cross-platform) |

## Current Hook/Skill Mapping

| Concern | Hook (automatic) | Skill (interactive) |
|---------|-----------------|-------------------|
| Code formatting | post-edit-format (PostToolUse) | -- |
| Type checking | post-edit-typecheck (PostToolUse, async) | code-typecheck |
| Pre-commit quality | pre-commit-gate (PreToolUse) | git-commit |
| Testing | pre-commit-gate (includes tests) | test-run |
| Linting | post-edit-format (includes lint) | code-lint |
| Context monitoring | context-monitor (Stop) | -- |
| Session persistence | session-persist (SessionEnd) | -- |

## Hook Types

- **Command hooks**: Shell scripts. Fastest. Use for file operations, tool invocation, exit code checks.
- **Prompt hooks**: Single-turn LLM evaluation. Use for judgment-based checks that need reasoning.
- **Agent hooks**: Subagent with tool access. Use for multi-step verification requiring file reads.

## When NOT to Use Hooks

- User-initiated workflows (discovery, planning, execution)
- Complex decision-making that requires context understanding
- Operations that need user confirmation or input
- Long-running processes (> 30 seconds) that would block editing

## Platform Behavior

- **Claude Code**: Hooks via .claude/settings.json. Scripts in .claude/hooks/. Supports async hooks and statusMessage.
- **Cursor IDE**: Hooks via .cursor/hooks.json. Scripts in .cursor/hooks/. Different event names (camelCase) and JSON formats.
- **Both**: Same shell scripts with dual-format stdin/stdout parsing. Rules and skills work on both platforms.