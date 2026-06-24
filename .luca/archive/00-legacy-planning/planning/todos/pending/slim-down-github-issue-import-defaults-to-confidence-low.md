---
title: "Slim-down: GitHub issue import defaults to confidence: low"
area: workflow
created: 2026-05-12
priority: medium
source: workflow-slim-down
---

## Task

Slim-down: GitHub issue import defaults to confidence: low

---
confidence: high
externalResearch: false
priority: 3
---

# Context

GitHub issues are external user input — never as detailed as a user-authored
todo. They should be flagged for grooming or inline interrogation.

## Scope

- Update `gh-issue-triage` skill to write `confidence: low` in frontmatter of every imported todo.
- `priority` default = 3 unless GitHub label maps to a priority (e.g., `p0` → 1).
- `externalResearch: false` unconditionally on import.

## Acceptance

- Re-running `gh-issue-triage` produces todos with `confidence: low`.
- Tests verify the import writes frontmatter.

## Depends on

- Frontmatter schema todo.

