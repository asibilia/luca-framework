---
name: Luca Framework Cleanup
overview: Rename "Percent Origin" to "Luca" and "pt-og" to "lu" throughout the project, standardize rules and skills for generic use, and clean up old plan files.
todos:
  - id: rename-dirs
    content: Rename pt-og directories to lu (skills, docs)
    status: completed
  - id: rename-files
    content: Rename pt-og agent and rule files to lu
    status: completed
  - id: update-content
    content: Replace Percent Origin/pt-og with Luca/lu in all files
    status: completed
  - id: handle-rules
    content: Remove 5 app-specific rules, generalize 6 rules, merge 1 into code-simplifier agent
    status: completed
  - id: remove-plans
    content: Delete stale percent-ui plan files (14 files)
    status: completed
  - id: handle-skills
    content: Remove 2 skills (dev-portal, join-discord), generalize 5 workflow skills
    status: completed
  - id: verify
    content: Verify no remaining pt-og or Percent Origin references
    status: completed
isProject: false
---

# Luca Framework Cleanup

This plan renames the framework from "Percent Origin" to "Luca" and standardizes app-specific artifacts for generic use.

## 1. Directory Renames

Rename directories containing `pt-og` to `lu`:

| Old Path                               | New Path                     |
| -------------------------------------- | ---------------------------- |
| `.cursor/skills/pt-og/`                | `.cursor/skills/lu/`         |
| `.cursor/skills/pt-og-*/` (30 dirs)    | `.cursor/skills/lu-*/`       |
| `docs/agent-framework/percent-origin/` | `docs/agent-framework/luca/` |

## 2. File Renames

### Agent Files (15 files)

Rename `.cursor/agents/pt-og-*.md` to `.cursor/agents/lu-*.md`

### Rule File

Rename `.cursor/rules/pt-og-workflow.mdc` to `.cursor/rules/lu-workflow.mdc`

## 3. Content Updates

### String Replacements (in all affected files)

- `Percent Origin` → `Luca`
- `percent-origin` → `luca`
- `/pt-og` → `/lu`
- `pt-og-` → `lu-`
- `pt-og` → `lu` (standalone references)

### Files requiring content updates (~70 files)

- All `.cursor/agents/lu-*.md` files
- All `.cursor/skills/lu-*/SKILL.md` files
- All `.cursor/luca/workflows/*.md` files
- All `.cursor/luca/templates/*.md` files
- All `.cursor/luca/references/*.md` files
- `.cursor/rules/lu-workflow.mdc`
- `docs/agent-framework/luca/*.md`
- `docs/agent-framework/README.md`
- `AGENTS.md`

## 4. Handle Rules

### 4a. REMOVE (5 files) - App-specific, not reusable

```
__next-components.mdc      # percent-ui component patterns
ag-grid-wrapper.mdc        # AG Grid integration
ag-grid-use-built-in.mdc   # AG Grid specific
mui-deprecation.mdc        # MUI migration
percent-ui.mdc             # App coding standards
```

### 4b. GENERALIZE (6 files) - Keep as rules, generalize content

| Rule                          | Changes                                                              |
| ----------------------------- | -------------------------------------------------------------------- |
| `import-standards.mdc`        | Remove `@packages-ui`, `@cadence-group` → use `@internal/*` patterns |
| `mandatory-documentation.mdc` | Remove `docs-ui`, `packages-ui` paths → use generic `src/`, `docs/`  |
| `schema-first-parsing.mdc`    | Remove AG Grid examples → use generic component examples             |
| `functional-api-reuse.mdc`    | Remove `@ui--templates` refs → use generic package names             |
| `lodash-preference.mdc`       | Remove footer ref to `percent-ui.mdc` → self-contained               |
| `atlassian-mcp.mdc`           | Remove `mypercent.atlassian.net`, `PT-####` → use env vars           |

### 4c. MERGE INTO AGENT (1 file)

- `post-task-consolidation.mdc` → Merge functional architecture patterns into existing `.cursor/agents/code-simplifier.md`
- The `code-simplifier` agent already exists; enhance it with the consolidation patterns (no classes, pure functions, Result pattern)
- Then delete the rule file

### Rules to Keep (unchanged, generic/reusable)

- `file-naming.mdc` - kebab-case conventions
- `no-classes.mdc` - functional patterns
- `api-snake-case.mdc` - API conventions
- `cursor_rules.mdc` - rule writing guide
- `self_improve.mdc` - rule improvement
- `bun-preference.mdc` - runtime preference
- `posthog-integration.mdc` - analytics patterns
- `lu-workflow.mdc` - Luca workflow (renamed)
- `taskmaster.mdc` and `taskmaster/` - task management

## 5. Cleanup Old Plans

Remove stale plan files from `.cursor/plans/` (all are percent-ui specific):

```
fix_banner_empty_states_b15c34c1.plan.md
fix_bulk_selection_clear_0b998392.plan.md
fix_markets_empty_states_1fae8fa1.plan.md
fix_pre-commit_build_checks_36c8416f.plan.md
fix_secondary_market_buttons_180b8967.plan.md
fix_template_audit_security_e88ff77d.plan.md
formik_issubmitting_bug_fixes_416631cc.plan.md
market-aware_onboarding_2dba360b.plan.md
markets_empty_state_fix_5feeedff.plan.md
percent_origin_framework_updates_8cdc21a5.plan.md
pt-12730_notifications_empty_state_d0f41877.plan.md
qa_consolidation_skill_9f804c7f.plan.md
resolve_merge_conflicts_6a408934.plan.md
secure_html-to-react_styling_2cf8dd7a.plan.md
```

## 6. Handle Skills

### 6a. REMOVE (2 directories)

```
.cursor/skills/dev-portal/         # percent-ui portals - not applicable
.cursor/skills/pt-og-join-discord/ # references old Vulcan Discord URL
```

### 6b. GENERALIZE (5 skills) - Keep and standardize

| Skill            | Changes                                                                          |
| ---------------- | -------------------------------------------------------------------------------- |
| `qa-consolidate` | Replace `cadence-group/percent-ui` → `$GITHUB_REPO`, `ENG/PT` → generic patterns |
| `workflow-start` | Replace `/pt-og` → `/lu`, `mypercent.atlassian.net` → `$JIRA_BASE_URL`           |
| `jira-issue`     | Replace hardcoded URLs → env vars, `PT-1234` → `[TICKET-ID]`                     |
| `git-feature`    | Replace `PT-####` → `$TICKET_PREFIX-####` or `[TICKET-ID]`                       |
| `git-pr`         | Replace `PT branches target ENG` → generic release branch workflow               |

## 7. Update AGENTS.md

Update `subagent_type` references in system prompt after rename:

- `pt-og-*` → `lu-*` for all agent types

## Execution Order

1. Rename directories (git mv for history)
2. Rename files (git mv for history)
3. Update content (find/replace for Luca/lu renaming)
4. Handle rules (remove 5, generalize 6, merge 1 into agent)
5. Delete stale plans
6. Handle skills (remove 2, generalize 5)
7. Verify no remaining pt-og/Percent Origin references
