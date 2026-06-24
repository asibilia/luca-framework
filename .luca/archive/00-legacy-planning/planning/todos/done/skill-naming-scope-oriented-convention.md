---
title: Rename skills/agents to scope-oriented naming convention
area: workflow
created: 2026-02-11
source: conversation
---

## Context

User noted that current skill names like `lu-discuss-phase`, `lu-execute-phase`, `lu-plan-phase` are hard to remember because they're worded grammatically (verb-noun) and require recalling the exact phrase. This applies to both skills and agents.

## Task

Rename all Luca skills and agents to a scope-oriented `[workflow]:[scope]:[command]` convention so related commands are grouped by scope and easier to discover.

**Proposed pattern:** `lu:phase:discuss`, `lu:phase:execute`, `lu:phase:plan`

**Current names → Proposed names (examples):**

| Current                     | Proposed                |
| --------------------------- | ----------------------- |
| `lu-execute-phase`          | `lu:phase:execute`      |
| `lu-discuss-phase`          | `lu:phase:discuss`      |
| `lu-plan-phase`             | `lu:phase:plan`         |
| `lu-research-phase`         | `lu:phase:research`     |
| `lu-add-phase`              | `lu:phase:add`          |
| `lu-insert-phase`           | `lu:phase:insert`       |
| `lu-remove-phase`           | `lu:phase:remove`       |
| `lu-list-phase-assumptions` | `lu:phase:assumptions`  |
| `lu-new-milestone`          | `lu:milestone:new`      |
| `lu-complete-milestone`     | `lu:milestone:complete` |
| `lu-audit-milestone`        | `lu:milestone:audit`    |
| `lu-plan-milestone-gaps`    | `lu:milestone:gaps`     |
| `lu-add-todo`               | `lu:todo:add`           |
| `lu-check-todos`            | `lu:todo:check`         |
| `lu-verify-work`            | `lu:verify`             |
| `lu-debug`                  | `lu:debug`              |
| `lu-progress`               | `lu:progress`           |
| `lu-pause-work`             | `lu:session:pause`      |
| `lu-resume-work`            | `lu:session:resume`     |
| `lu-set-profile`            | `lu:config:profile`     |
| `lu-settings`               | `lu:config:settings`    |
| `git-commit`                | `git:commit`            |
| `git-feature`               | `git:feature`           |
| `git-pr`                    | `git:pr`                |

**Key investigation needed:**

- Confirm `:` is a valid character in Claude Code skill directory names and Cursor skill names
- If `:` is not supported, evaluate alternatives: `.` (dot), `/` (slash via nested dirs), or `--` (double dash)
- Determine if both platforms (Claude Code + Cursor) can handle the chosen separator

## Notes

- This is a significant rename affecting ~35 skills/agents
- Need to update all cross-references in skill files, rules, and documentation
- Benefits: tab-completion-friendly, groupable, discoverable by scope
- Consider backward compatibility or aliasing during transition
- Agents (subagents in `.claude/agents/`) should follow the same convention
