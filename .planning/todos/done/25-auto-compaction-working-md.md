---
title: "Auto-Compaction for WORKING.md"
area: framework/memory
created: 2026-03-01
source: expert-panel-research
tier: quick-win
complexity: MODERATE
moat: N/A
---

## Context

Pi's auto-compaction preserves full history while summarizing in-memory context. Nader emphasizes transparent compaction. Currently WORKING.md grows unbounded until hard stop at "degrading" zone.

## Task

Implement compactWorkingMemory() that:

1. Ranks sections by recency/criticality (session_info + candidate_learnings protected; findings + hypotheses compactable)
2. Applies existing compression strategies (summarize, merge, archive) to WORKING.md sections
3. Writes full pre-compaction content to .planning/working-snapshots/ archive
4. Triggers at "degrading" zone (50-70%) instead of waiting for "stop" (70%+)

Removes hard stop at "degrading" in phase-execute, allows compacted continuation.

**Implementation:**

- Add compactWorkingMemory() to `src/memory/__helpers/working-memory.ts`
- Trigger at degrading zone in `src/memory/__helpers/context-monitor.ts`
- Add CompactionRecordSchema to `src/memory/__schemas/memory.schemas.ts`
- Invoke compaction in `src/hooks/scripts/context-monitor.sh`
- Remove hard stop at degrading in `src/skills/general/phase-execute.skill.ts`

## Notes

- Source agent: Architecture Expert
