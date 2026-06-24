---
title: Reorganize skill names to consistent domain-action convention
area: workflow
created: 2026-04-02
source: conversation
---

## Context

Current skill names use 5+ inconsistent naming patterns (`git-pr` vs `pr-address`, `phase-*` overloaded with 13 skills, flat names like `quick`/`debug` with no domain hint). The old colon-based proposal (`lu:phase:discuss`) is invalid — Claude Code only allows lowercase letters, numbers, and hyphens (max 64 chars).

## Task

Rename all skills to a consistent `{domain}-{action}` convention where every skill starts with its domain noun prefix. This enables tab-completion discovery by domain.

### Specific Renames

| Current                 | Proposed            | Rationale                                                    |
| ----------------------- | ------------------- | ------------------------------------------------------------ |
| `git-pr`                | `pr-create`         | Groups with `pr-address`; `git-*` reserved for local git ops |
| `context-restore`       | `session-restore`   | Groups with `session-pause`, `session-resume`                |
| `codebase-map`          | `repo-map`          | Groups with `repo-audit`                                     |
| `shadow-cleanup`        | `repo-cleanup`      | Groups with `repo-audit`, `repo-map`                         |
| `phase-research-review` | `research-review`   | Separates research sub-pipeline from phase lifecycle         |
| `phase-research-expand` | `research-expand`   | Same — research is its own domain                            |
| `phase-graduate`        | `research-graduate` | Graduates research findings, not phases                      |
| `phase-plan-review`     | `plan-review`       | Plan review is distinct from phase lifecycle                 |
| `qa-consolidate`        | `pr-qa-consolidate` | Operates on PRs                                              |
| `post-init-tour`        | `help-tour`         | Groups with `help`                                           |
| `workflow-start`        | `jira-start`        | Specifically starts from a Jira ticket                       |

### Domain Groups (post-rename)

| Domain       | Skills                                                                               |
| ------------ | ------------------------------------------------------------------------------------ |
| `phase-`     | plan, execute, discuss, research, add, insert, remove, assumptions                   |
| `milestone-` | new, audit, complete, gaps                                                           |
| `pr-`        | create, address, qa-consolidate                                                      |
| `git-`       | commit, feature                                                                      |
| `todo-`      | add, check                                                                           |
| `scout-`     | (7 skills, already consistent)                                                       |
| `code-`      | lint, typecheck                                                                      |
| `config-`    | profile, settings                                                                    |
| `session-`   | pause, resume, plan, restore                                                         |
| `research-`  | review, expand, graduate                                                             |
| `repo-`      | audit, map, cleanup                                                                  |
| `profile-`   | import, export                                                                       |
| `rule-`      | (5 reference skills, keep as-is)                                                     |
| (flat)       | lu, quick, debug, verify, help, progress, update, note, choose, outcome, seed-memory |

### Implementation Notes

- Update skill directory names in `src/skills/general/`
- Update all cross-references in skill SKILL.md files, agent prompts, and lu.skill.ts orchestrator
- Update `src/hooks/scripts/` pre-step hooks that match on skill names
- Rebuild via `bun run build:all`
- Consider backward-compatible aliases during transition (old names redirect to new)
- Supersedes the old colon-based proposal in `todos/done/skill-naming-scope-oriented-convention.md`

## Notes

- ~11 renames affecting skill directories, cross-references, hook matchers, and documentation
- The `phase-research` skill itself stays as `phase-research` (it initiates research FOR a phase)
- Flat top-level names (`lu`, `quick`, `debug`, etc.) are intentionally ungrouped — they're entry points
