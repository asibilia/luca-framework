---
title: "Slim-down: /backlog-groom skill — interactive interrogation of under-specified todos"
area: workflow
created: 2026-05-12
priority: high
source: workflow-slim-down
---

## Task

Slim-down: /backlog-groom skill — interactive interrogation of under-specified todos

---
confidence: high
externalResearch: false
priority: 2
---

# Context

Pre-flight grooming optimization. User can batch-prep todos before kicking off
pipeline runs. Not required (plan-mode triage will also interrogate inline) —
purely batching.

## Scope

- New skill `skills/backlog-groom/SKILL.md` + `commands/backlog-groom.md`.
- Walks pending todos in priority order.
- For each todo:
  - Skip if `confidence: high` already.
  - Display title + body.
  - Ask up to 3 `ask_user` questions to clarify implementation details, constraints, and which files are likely affected.
  - After 3 questions, ask "Complete? (yes / more questions / skip)".
  - On complete: update todo body with appended `## Grooming notes` section + bump frontmatter `confidence: high`.
- Batch-mode summary at end: "groomed N, skipped M, deferred K".

## Acceptance

- Skill runs interactively, terminates cleanly on user abort.
- Each groomed todo has the appended section + updated frontmatter.
- Skipped todos remain unchanged.
- Tests verify the per-todo loop with stubbed `ask_user`.

## Depends on

- Frontmatter schema todo.

