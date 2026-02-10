/**
 * Hook/Skill boundary: when to use deterministic hooks vs interactive skills
 */
import { BaseRuleImpl } from '../base/base-rule';
import type { RuleConfig } from '../types/rule.types';

const HookSkillBoundaryConfig: RuleConfig = {
  frontmatter: {
    description: 'Hook/Skill boundary: when to use deterministic hooks vs interactive skills',
    globs: ['*.ts', '*.sh', '.claude/settings.json'],
    alwaysApply: true,
  },
  sections: [
    {
      title: 'rule',
      content: `# Hook/Skill Boundary

## Core Distinction

- **Hooks** = Deterministic enforcement. Always run. No judgment. Fast. Claude Code only.
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
| Does it work in Cursor IDE? | No (Claude Code only) | Yes (cross-platform) |

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
- Cursor IDE compatibility is required

## Platform Behavior

- **Claude Code**: Hooks provide deterministic enforcement. Skills remain available for interactive use.
- **Cursor IDE**: No hook equivalent. Skills provide advisory enforcement (AI remembers to check, but can skip).
- **Both**: Rules provide always-loaded instructions. Rules work on both platforms.`,
      order: 1,
    },
  ],
};

export class HookSkillBoundaryRule extends BaseRuleImpl {
  constructor() {
    super(HookSkillBoundaryConfig);
  }
}
