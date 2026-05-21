---
name: gh-issue-triage
description: Pull open GitHub issues into the MuninnDB todo backlog for pipeline execution.
---

# /gh-issue-triage

Activate the `gh-issue-triage` skill to pull open GitHub issues into the todo backlog. Each issue becomes a `todo:*` memory in the repo vault (via `luca_todo_add` with `source: "gh-issue-#<N>"`), so the finalizing flow can add `Closes #<N>` to the PR. Issues labeled `skip-triage` are filtered out.

Flow: GitHub Issues → gh-issue-triage → todos → `/lu` pipeline → PR.

Run the `gh-issue-triage` skill now. Optional arguments — label filters or explicit issue numbers:

$ARGUMENTS
