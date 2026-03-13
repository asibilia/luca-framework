---
title: Add Compact Instructions section to CLAUDE.md for compaction preservation guidance
area: config
created: 2026-03-13
source: conversation
priority: medium
complexity: TRIVIAL
---

## Context

Claude Code supports a "Compact Instructions" section in CLAUDE.md that tells the compaction process what to preserve when summarizing conversation history. Currently CLAUDE.md has no such section, meaning compaction uses default heuristics that may discard Luca-specific context.

This complements the PreCompact checkpoint hook (which saves to MuninnDB) by also guiding Claude Code's native compaction to preserve the most important information in-context.

## Why

Even with the PreCompact checkpoint hook saving state to MuninnDB, the in-context compaction summary is the LLM's primary working context after compaction. Guiding what gets preserved improves the quality of that summary, reducing the need for restore hook injection.

## Task

Add a `## Compact Instructions` section to `CLAUDE.md`:

```markdown
## Compact Instructions

When compacting, preserve:

- Current phase, task position, and complexity level
- Key decisions made this session with rationale
- The current approach and next planned action
- Any blockers or open questions
- File paths recently modified and why
- The MuninnDB vault name (luca-framework)
```

Also update `docs/memory-system/architecture-review.md` to reflect the new Compact Instructions capability and link to the decisions document.

## Acceptance Criteria

- CLAUDE.md has a `## Compact Instructions` section
- Section lists the 6 critical items to preserve during compaction
- Architecture review docs updated to reference Compact Instructions
- No other CLAUDE.md content is changed

## Dependencies

- None — can be done independently

## References

- `docs/memory-system/decisions.md` — Decision 3: Compact Instructions Enhancement
- `CLAUDE.md` — file to modify
- `docs/memory-system/architecture-review.md` — docs to update
- [Claude Code compaction guide](https://stevekinney.com/courses/ai-development/claude-code-compaction) — Compact Instructions reference

## Notes

This is the simplest todo in the memory system implementation — a few lines added to CLAUDE.md. Should be done early as it provides immediate value even before the hooks are built.
