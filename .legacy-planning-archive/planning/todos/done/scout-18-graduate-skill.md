---
title: "Scout: Create scout-graduate sub-skill (reuses research-graduator pattern)"
area: scouting
created: 2026-03-28
source: conversation
tags: [scout, skills, phase-3]
---

## Context

Step 8 of the pipeline. Captures high-value scouting findings as MuninnDB engrams for long-term recall. Follows the existing `lu-research-graduator` pattern.

## Task

Create `src/skills/general/scout-graduate.skill.ts`:

1. **Arguments**: List of integrated scout slugs, digest and impact paths
2. **Process**:
   - For each integrated scout:
     - Read digest and impact documents
     - Extract key findings worth preserving as long-term memory
     - Store as MuninnDB engrams with `scout:*` concept prefixes
   - Concept prefix mapping:
     - `scout:technique-{slug}` — Novel techniques discovered
     - `scout:pattern-{slug}` — Patterns applicable to framework
     - `scout:decision-{slug}` — Integration decisions made (including deferrals with reasoning)
   - Use graduation scoring: `confidence * 0.40 + actionability * 0.35 + uniqueness * 0.25`
   - Only graduate findings above 0.55 threshold
3. **Vault routing**: `scout:*` engrams go to repo vault (project-scoped, not cross-cutting)
4. **Deferred items also get engrams**: Store deferred decisions so future milestone planning can recall them

## Notes

- Reuses the graduation scoring formula from `lu-research-graduator`
- Can potentially reuse the graduator agent directly with scout-specific prompts
- Deferred items are especially important to capture — they represent "valid but not now" decisions
- Link related engrams (e.g., link `scout:technique-X` to `scout:decision-X`)
