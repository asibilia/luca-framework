---
title: "Slim-down: todo YAML frontmatter schema (confidence/externalResearch/priority) + manageTodos parser"
area: workflow
created: 2026-05-12
priority: high
source: workflow-slim-down
---

## Task

Slim-down: todo YAML frontmatter schema (confidence/externalResearch/priority) + manageTodos parser

---
confidence: high
externalResearch: false
priority: 1
---

# Context

Frontmatter is the canonical signal that downstream tooling (plan-mode triage,
grooming skill, GitHub import) reads to decide depth of research. Must land
before any consumer.

## Schema

```yaml
---
confidence: high | medium | low
externalResearch: false | true
priority: 1 | 2 | 3 | 4 | 5  # 1 = highest
---
```

- Defaults if missing: `confidence: medium`, `externalResearch: false`, `priority: 3`.
- GitHub-imported todos default to `confidence: low` (separate todo handles import).

## Scope

- Zod schema for frontmatter.
- `manageTodos(action: "read")` parses + returns frontmatter object alongside body.
- `manageTodos(action: "add")` accepts frontmatter fields and writes them.
- New action: `manageTodos(action: "set-frontmatter", identifier, patch)` — partial update.
- Backward compat: todos without frontmatter parse with all defaults; no warning.

## Acceptance

- All existing todos continue to read cleanly (defaults applied).
- New `set-frontmatter` action preserves body verbatim.
- Tests cover parse / write / partial-update / no-frontmatter / malformed-frontmatter.

## Ships first in Wave 2

All other Wave 2 todos depend on this.

