---
title: "Scout: Create deterministic INDEX.md auto-update logic"
area: scouting
created: 2026-03-28
source: conversation
tags: [scout, foundation, phase-1]
---

## Context

INDEX.md is the human-readable catalog of all scouted articles. It's updated deterministically (no LLM judgment) by reading state files and artifact locations.

## Task

Create a helper function (in `src/skills/__helpers/scout-index.ts` or similar) that:

1. Scans all `.scout-state/*.json` files
2. Reads current state and artifact paths from each
3. Generates `docs/scouting/INDEX.md` with a table:

```markdown
# Scouting Index

| Date       | Article                          | Status     | Digest                | Impact               | Todos                                            |
| ---------- | -------------------------------- | ---------- | --------------------- | -------------------- | ------------------------------------------------ |
| 2026-03-28 | [Claude Sub-Agents](https://...) | integrated | [digest](digests/...) | [impact](impact/...) | [todos](../../.planning/todos/pending/scout-...) |
| 2026-03-29 | [Some Article](https://...)      | deferred   | [digest](digests/...) | [impact](impact/...) | [reason](deferred/...)                           |
```

4. Groups by status: Active → Integrated → Deferred → Manual Review
5. Includes count summary at top

## Notes

- This is pure file manipulation — no LLM agent needed
- Runs as Step 9 (final step) in the orchestrator
- Also runs on `/scout --deferred` to show deferred items
- Links should be relative within docs/scouting/
