---
name: gh-issue-triage
description: >
  Pull open GitHub issues into the local todo backlog for pipeline execution. Filters out
  issues labeled `skip-triage`, deduplicates against existing todos, and links each todo
  back to its originating issue so the PR can close it on merge. Use when user says
  "triage issues", "pull in issues", "import issues", "sync issues to todos",
  or invokes /gh-issue-triage.
---

# GH Issue Triage

Pull open GitHub issues into the local `.planning/todos/` backlog so the Luca pipeline
can pick them up. Each issue becomes a todo; when the pipeline ships a PR it closes the
originating issue automatically via `Closes #N`.

## Process

### 1. Fetch Open Issues

```bash
gh issue list --state open --json number,title,body,labels,assignees,createdAt --limit 100
```

If no GitHub remote is detected, stop and tell the user.

### 2. Filter

Remove issues that should not become todos:

- **`skip-triage`** label — explicitly excluded from automatic triage
- **Pull requests** — `gh issue list` may include PRs on some repos; filter by `pull_request` field if present
- **Already triaged** — check existing todos for a matching `source: "gh-issue-#<N>"` to avoid duplicates

If `$ARGUMENTS` contains filter terms (e.g., a label name, milestone, or assignee), apply them:

```bash
gh issue list --state open --label "<label>" ...
```

### 3. Present Candidates

Show the filtered list to the user:

```
## Issues Ready for Triage

1. #42 — Add webhook support [enhancement] (2 days ago)
2. #38 — Login fails on Safari [bug] (5 days ago)
3. #35 — Refactor auth module [refactor] (1 week ago)

Skipped: 2 issues (skip-triage), 1 already in backlog

Import all, or select by number?
```

Wait for the user to confirm which issues to import. Accept "all" or a comma-separated list of numbers.

### 4. Create Todos

For each approved issue, create a todo via `manageTodos(action: "add")`:

- **title**: Issue title
- **priority**: Inferred from labels (`critical`/`bug` → high, `enhancement` → medium, unlabeled → medium)
- **area**: Inferred from labels if recognizable (e.g., `ui`, `api`, `infra`)
- **source**: `gh-issue-#<N>` — this is the link back to the originating issue
- **body**: Include the issue body (trimmed to essentials) plus a reference line:

```markdown
> GitHub Issue: #<N> — <url>

<issue body, trimmed>
```

### 5. Dedup Check

Before creating each todo, search existing todos for:
- Same `source` field (`gh-issue-#<N>`)
- Very similar title (fuzzy match)

If a match is found, skip and note it in the report.

### 6. Report

Print a summary of what was imported:

```
## Triage Complete

Created 3 todos from GitHub issues:
  - #42 → todo: add-webhook-support (pending)
  - #38 → todo: login-fails-on-safari (pending, priority: high)
  - #35 → todo: refactor-auth-module (pending)

Skipped: 1 duplicate (#31 already exists as todo)

Next: run /lu to start working through the backlog.
```

## Closing the Loop

When the Luca pipeline ships a PR for a todo whose `source` is `gh-issue-#<N>`, finalize
mode should include `Closes #<N>` in the PR body. The source field carries the issue
number through the entire pipeline.
