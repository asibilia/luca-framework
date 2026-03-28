---
title: "Scout: Create scout-ingest sub-skill"
area: scouting
created: 2026-03-28
source: conversation
tags: [scout, skills, phase-2]
---

## Context

Sub-skill wrapper for the ingestion step. Called by the orchestrator with progressive disclosure — only sees the ingestion task, nothing about future steps.

## Task

Create `src/skills/general/scout-ingest.skill.ts`:

1. **Arguments**: URL, slug, output path
2. **Process**:
   - Spawn `lu-scout-ingest` agent with the URL
   - Wait for completion
   - Validate that the digest file was created and is non-empty
   - Return success/failure to orchestrator
3. **Output validation**: Check file exists at expected path, has required sections (Summary, Key Concepts, Techniques)
4. **Error handling**: If agent fails or produces invalid output, return structured error for orchestrator to handle

## Notes

- This skill is intentionally thin — a sub-skill wrapper following the decomposition pattern
- The orchestrator handles state transitions; this skill just does the work and reports back
- Follows existing skill patterns in src/skills/general/
