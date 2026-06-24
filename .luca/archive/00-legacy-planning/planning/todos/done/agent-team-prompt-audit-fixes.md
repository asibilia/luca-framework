---
title: Implement agent team prompt audit fixes (8 action items)
area: skills
created: 2026-03-24
source: conversation
---

## Context

Reviewed all 10+ agent team spawn points in the Luca workflow against best practices from a Claude Code presentation on Agent Team Prompts:

- DO: Own specific files, Define output, Name recipients, 3-5 teammates
- DON'T: Share same file, Vague deliverables, Assume the plan, 10+ teammates

Full audit completed across three parallel agent teams covering: phase-execute, phase-research, codebase-map, project-new, phase-research-review, phase-research-expand, phase-plan-review, phase-discuss, pr-address, and lu orchestrator.

## Task

Implement the 8 prioritized fixes from the audit:

| #   | Fix                                                                                              | Impact | Effort |
| --- | ------------------------------------------------------------------------------------------------ | ------ | ------ |
| 1   | Rewrite **phase-research v2** Task() prompts with XML blocks (model after codebase-map)          | High   | Medium |
| 2   | Add **recipient declarations** to all reviewer/researcher prompts (one-line addition each)       | High   | Low    |
| 3   | Add explicit **output format** to harness tribunal prompts (CATEGORY/CONFIDENCE/EVIDENCE/ACTION) | High   | Low    |
| 4   | **Reduce code review team** to 3-4: drop `ui`, merge multi-lens into base reviewers              | Medium | Medium |
| 5   | Add explicit **Task() prompt** for phase-discuss auto researchers + switch to parallel spawning  | Medium | Low    |
| 6   | Cap **wave executor team size** to 5 with sub-wave splitting                                     | Medium | Low    |
| 7   | Use **named agent types** (`lu-planner`, `lu-executor`) instead of `general-purpose` in lu swarm | Medium | Low    |
| 8   | Add **gap-fix return format** and SUMMARY update instruction                                     | Low    | Low    |

### Key Files

- `src/skills/general/phase-execute.skill.ts` (fixes 2, 3, 4, 6, 8)
- `src/skills/general/phase-research.skill.ts` (fixes 1, 2)
- `src/skills/general/phase-discuss.skill.ts` (fix 5)
- `src/skills/luca/lu.skill.ts` (fix 7)
- `src/skills/general/pr-address.skill.ts` (fix 2, plus add missing reviewer prompts)

### Gold Standard Template (from codebase-map)

All team prompts should adopt the XML-block structure:

```
<mapping_context> ... </mapping_context>
<analysis_targets> ... </analysis_targets>
<output_requirements> ... </output_requirements>
```

## Notes

- File ownership is already clean across all spawn points -- no fixes needed there
- codebase-map, lu roadmap swarm, and phase-plan-review are the strongest patterns to emulate
- The `ui` reviewer in phase-execute code review is irrelevant for this tooling monorepo
- phase-discuss auto mode spawns researchers serially but they should be parallel
- lu parallel swarm uses `general-purpose` instead of named agent types, losing system prompts
