# Skill Naming Conventions

Canonical reference for how skills are named, grouped into domains, and how new skills should be named to maintain consistency.

## Naming Pattern

All skill names follow this structure:

```
{domain}-{action}
```

- **Domain**: The subject area or resource the skill operates on
- **Action**: The verb describing what the skill does
- Both segments use kebab-case
- Standalone skills (no domain prefix) are allowed for frequently-invoked entry points

### Action-Oriented Naming

Skill names should describe **what the skill does**, not the use case or the artifact it produces.

```
git-commit    (action: commit)
git-branch    (action: branch)
pr-create     (action: create)
jira-import   (action: import)
code-test     (action: test)

phase-plan    (action: plan)
phase-execute (action: execute)
verify-test   (action: test)
```

Avoid naming by use case or artifact:

```
git-feature     -> git-branch     (action, not use case)
jira-issue      -> jira-import    (action, not artifact)
test-run        -> code-test      (domain-first, not action-first)
```

## Skill Domains

### `git-*` -- Git Operations

Direct git repository operations. Two skills only.

| Skill        | Action        | Description                                                     |
| ------------ | ------------- | --------------------------------------------------------------- |
| `git-branch` | Create branch | Create a feature branch linked to a Jira ticket or GitHub issue |
| `git-commit` | Create commit | Stage and commit changes with conventional commit formatting    |

### `pr-*` -- Pull Request Lifecycle

Full PR lifecycle from creation through learning extraction.

| Skill         | Action   | Description                                                    |
| ------------- | -------- | -------------------------------------------------------------- |
| `pr-create`   | Create   | Create a PR with conventional formatting and submit for review |
| `pr-fetch`    | Fetch    | Fetch PR details and review comments                           |
| `pr-address`  | Address  | Address PR review comments with code changes                   |
| `pr-respond`  | Respond  | Respond to PR comments conversationally                        |
| `pr-validate` | Validate | Validate that PR changes satisfy review feedback               |
| `pr-debate`   | Debate   | Debate PR approach between reviewers                           |
| `pr-fix`      | Fix      | Fix issues identified in PR review                             |
| `pr-learn`    | Learn    | Extract learnings from a completed PR                          |

### `phase-*` -- Phase Lifecycle

Roadmap phase operations from research through execution.

| Skill                   | Action           | Description                             |
| ----------------------- | ---------------- | --------------------------------------- |
| `phase-add`             | Add              | Add a new phase to the roadmap          |
| `phase-insert`          | Insert           | Insert a phase at a specific position   |
| `phase-remove`          | Remove           | Remove a phase from the roadmap         |
| `phase-assumptions`     | Assumptions      | Document phase assumptions              |
| `phase-research`        | Research         | Deep-dive research before planning      |
| `phase-research-review` | Review research  | Review research findings                |
| `phase-research-expand` | Expand research  | Expand research into new areas          |
| `phase-discuss`         | Discuss          | Interactive discussion before planning  |
| `phase-plan`            | Plan             | Create execution plan                   |
| `phase-plan-review`     | Review plan      | Review execution plan quality           |
| `phase-execute`         | Execute          | Execute a planned phase                 |
| `phase-execute-waves`   | Execute waves    | Execute phase in wave batches           |
| `phase-execute-review`  | Review execution | Review execution output                 |
| `phase-execute-verify`  | Verify execution | Verify execution correctness            |
| `phase-graduate`        | Graduate         | Graduate research into permanent memory |

### `milestone-*` -- Milestone Lifecycle

Milestone management from creation through archival.

| Skill                   | Action      | Description                          |
| ----------------------- | ----------- | ------------------------------------ |
| `milestone-new`         | Create      | Create a new milestone               |
| `milestone-audit`       | Audit       | Audit milestone completeness         |
| `milestone-gaps`        | Gaps        | Identify gaps in milestone coverage  |
| `milestone-complete`    | Complete    | Mark milestone complete              |
| `milestone-finalize`    | Finalize    | Finalize milestone artifacts         |
| `milestone-learn`       | Learn       | Extract learnings from milestone     |
| `milestone-prune`       | Prune       | Prune stale milestone content        |
| `milestone-shadow-gate` | Shadow gate | Check milestone shadow gate criteria |
| `milestone-archive`     | Archive     | Archive a completed milestone        |

### `verify-*` -- Verification Workflows

Post-execution verification and diagnostics.

| Skill             | Action   | Description                    |
| ----------------- | -------- | ------------------------------ |
| `verify`          | Verify   | Run full verification harness  |
| `verify-test`     | Test     | Run verification test suite    |
| `verify-extract`  | Extract  | Extract verification data      |
| `verify-review`   | Review   | Review verification results    |
| `verify-diagnose` | Diagnose | Diagnose verification failures |

### `code-*` -- Code Quality

Automated code quality checks.

| Skill            | Action    | Description                  |
| ---------------- | --------- | ---------------------------- |
| `code-test`      | Test      | Run the project test suite   |
| `code-lint`      | Lint      | Run linter checks            |
| `code-typecheck` | Typecheck | Run TypeScript type checking |

### `session-*` -- Session Lifecycle

Development session management.

| Skill            | Action | Description                    |
| ---------------- | ------ | ------------------------------ |
| `session-plan`   | Plan   | Plan a development session     |
| `session-pause`  | Pause  | Pause and checkpoint a session |
| `session-resume` | Resume | Resume a paused session        |

### `config-*` -- Configuration

Luca framework configuration.

| Skill             | Action   | Description                                   |
| ----------------- | -------- | --------------------------------------------- |
| `config-model`    | Model    | Switch the model delegation profile           |
| `config-settings` | Settings | Configure workflow toggles and agent settings |

### `profile-*` -- Memory Profiles

Cross-project memory portability.

| Skill            | Action | Description                                 |
| ---------------- | ------ | ------------------------------------------- |
| `profile-export` | Export | Export learnings to global memory profile   |
| `profile-import` | Import | Import learnings from global memory profile |

### `todo-*` -- Work Items

Todo/backlog management.

| Skill        | Action | Description            |
| ------------ | ------ | ---------------------- |
| `todo-add`   | Add    | Add a work item        |
| `todo-check` | Check  | Check work item status |

### `workflow-*` -- Workflow Templates

Workflow save/restore.

| Skill            | Action | Description                       |
| ---------------- | ------ | --------------------------------- |
| `workflow-start` | Start  | Start a saved workflow            |
| `workflow-save`  | Save   | Save current workflow as template |

### `rule-*` -- Rule Reference

Interactive rule documentation. These are reference skills that explain Luca rules.

| Skill                       | Action               | Description                       |
| --------------------------- | -------------------- | --------------------------------- |
| `rule-file-naming`          | File naming          | Explain file naming conventions   |
| `rule-harness-verification` | Harness verification | Explain harness/hook boundary     |
| `rule-hook-skill-boundary`  | Hook/skill boundary  | Explain hook vs skill distinction |
| `rule-complexity-gating`    | Complexity gating    | Explain complexity gating         |
| `rule-lu-workflow`          | Workflow             | Explain the Luca workflow system  |

### `jira-*` -- Jira Integration

Jira ticket operations (read-only per policy).

| Skill         | Action | Description                            |
| ------------- | ------ | -------------------------------------- |
| `jira-import` | Import | Import a Jira ticket as a GitHub issue |

### `lu-*` / `lu` -- Luca Orchestration

Core Luca routing and orchestration. These live in `src/skills/luca/`.

| Skill           | Action      | Description                            |
| --------------- | ----------- | -------------------------------------- |
| `lu`            | Entry point | Unified entry with intelligent routing |
| `lu-route`      | Route       | Route tasks to appropriate handler     |
| `lu-configure`  | Configure   | Configure Luca internals               |
| `lu-backlog`    | Backlog     | Manage the Luca backlog                |
| `lu-phase-loop` | Phase loop  | Orchestrate multi-phase execution      |

### Standalone Skills

These skills are frequently-invoked entry points that don't need a domain prefix. Their names are short and conventional.

| Skill             | Description                                                |
| ----------------- | ---------------------------------------------------------- |
| `help`            | Show available commands and usage guide                    |
| `quick`           | Execute an ad-hoc task with minimal ceremony               |
| `choose`          | Choose between issue-driven and spec-driven workflow       |
| `note`            | Add a phase to roadmap or queue a developer note           |
| `update`          | Update Luca to latest version                              |
| `progress`        | Check project progress and suggest next action             |
| `outcome`         | Record whether a shipped feature achieved its goal         |
| `debug`           | Systematic debugging with persistent hypothesis state      |
| `project-new`     | Initialize a new Luca project                              |
| `codebase-map`    | Analyze codebase structure with parallel mapper agents     |
| `repo-audit`      | Detect naming violations, orphaned files, convention drift |
| `shadow-cleanup`  | Detect and clean up AI-session debris                      |
| `seed-memory`     | Seed MuninnDB with existing project knowledge              |
| `qa-consolidate`  | Consolidate QA plans from feature PRs onto release PR      |
| `post-init-tour`  | Post-initialization walkthrough                            |
| `context-restore` | Restore context from checkpoint                            |

## Adding a New Skill

When naming a new skill:

1. **Check for an existing domain.** If the skill operates on PRs, phases, milestones, etc., use the established domain prefix.

2. **Use action-oriented naming.** Name what the skill does, not the artifact or use case.

3. **Standalone is OK for entry points.** If the skill is a top-level user command that doesn't belong to a lifecycle family, a standalone name is appropriate.

4. **Avoid prefix collisions.** Don't create a `config-profile` when `profile-*` already means something different. Check all existing domains before choosing a prefix.

5. **Follow kebab-case.** All segments lowercase, separated by hyphens.

### Decision Flowchart

```
Does this skill operate on an existing domain resource?
  Yes -> Use that domain prefix (e.g., pr-*, phase-*, milestone-*)
  No  -> Is it a code quality check?
           Yes -> Use code-* prefix
           No  -> Is it a git operation?
                    Yes -> Use git-* prefix
                    No  -> Is it a frequently-invoked entry point?
                             Yes -> Standalone name is fine
                             No  -> Create a new domain prefix
```

### Naming Validation

Before finalizing a new skill name, verify:

- [ ] No existing skill has the same name
- [ ] The domain prefix matches the established convention
- [ ] The action segment describes what the skill does, not the use case
- [ ] The name doesn't create confusion with other domain prefixes
- [ ] The name follows kebab-case

## Related Documentation

- [Rename Plan](rename-plan.md) -- Active renames to align existing skills with these conventions
- [Skill Description Audit](../skill-description-audit.md) -- Trigger accuracy audit of skill descriptions
- [Hook/Skill Boundary Rule](../../.claude/rules/hook-skill-boundary.md) -- When to use hooks vs skills
- [Domain Architecture](../../.claude/rules/domain-architecture.md) -- Entity domain structure
