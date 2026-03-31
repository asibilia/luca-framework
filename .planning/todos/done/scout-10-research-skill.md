---
title: "Scout: Create scout-research sub-skill (reuses existing researchers)"
area: scouting
created: 2026-03-28
source: conversation
tags: [scout, skills, phase-2]
---

## Context

Step 3 of the per-article pipeline. Deep research into the techniques and concepts identified in the digest. Reuses existing `lu-ecosystem-researcher` and `lu-implementation-researcher` agents with scout-specific prompts.

## Task

Create `src/skills/general/scout-research.skill.ts`:

1. **Arguments**: Slug, digest path
2. **Process**:
   - Read the digest to understand key concepts and techniques
   - Spawn two existing researchers in **parallel**:
     - `lu-ecosystem-researcher`: Research the ecosystem around the article's techniques — related tools, frameworks, community adoption, state of the art
     - `lu-implementation-researcher`: Research implementation details of the techniques — APIs, code patterns, configuration approaches
   - Wait for both to complete
   - Synthesize their outputs into the digest file:
     - Append "Related Work" section (from ecosystem researcher)
     - Append "Technique Deep-Dive" section (from implementation researcher)
3. **Prompt construction**: Give each researcher the digest content as context, scope their research to the article's specific techniques (not the whole framework)

## Notes

- This is the key reuse point — no new agents needed for this step
- Researchers use existing shared sections (philosophy, tool strategy, source hierarchy)
- Research output is appended to the existing digest file, not written to separate files
- Researchers write intermediate notes; the skill synthesizes into the digest
- Follows the v2 parallel research pattern from phase-research.skill.ts
