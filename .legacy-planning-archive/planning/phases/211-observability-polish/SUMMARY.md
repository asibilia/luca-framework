# Phase 211 Summary: Agent Team Prompt Audit Fixes

## Objective

Implement 8 prioritized fixes from the agent team prompt audit to improve sub-agent prompt quality, reduce reviewer overhead, and standardize output formats.

## Results

### Fixes Already Applied (7 of 8)

Upon reading all four target files, 7 of the 8 fixes were already present from a prior effort:

| Fix   | Priority | Status       | Details                                                                                                                                      |
| ----- | -------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Fix 1 | HIGH     | Already done | phase-research.skill.ts already uses XML blocks (`<research_context>`, `<analysis_targets>`, `<output_requirements>`) for all Task() prompts |
| Fix 2 | HIGH     | Already done | All four skill files already have `**Recipient:** <caller> orchestrator (report findings back to this orchestrator)` in every Task() prompt  |
| Fix 3 | HIGH     | Already done | Verification tribunal diagnostic prompts already have explicit `<output_format>` blocks with CATEGORY/CONFIDENCE/EVIDENCE/ACTION             |
| Fix 5 | MEDIUM   | Already done | phase-discuss.skill.ts auto-mode researchers already use XML blocks and parallel spawning                                                    |
| Fix 6 | MEDIUM   | Already done | Step 4.0.1 already documents 5-plan cap with sub-wave splitting                                                                              |
| Fix 7 | MEDIUM   | Already done | lu.skill.ts swarm already uses named agent types (`lu-planner`, `lu-executor`)                                                               |
| Fix 8 | LOW      | Already done | Loop B gap-fix executor prompts already have `<output_format>` with return format and SUMMARY update instructions                            |

### Fix Applied This Session (1 of 8)

| Fix   | Priority | Status  | Details                                                                                    |
| ----- | -------- | ------- | ------------------------------------------------------------------------------------------ |
| Fix 4 | MEDIUM   | Applied | Reduced code review team from 3-6 to 3-4 by folding multi-lens reviewers into base prompts |

## Fix 4 Details

**File modified:** `src/skills/general/phase-execute.skill.ts`

**Changes:**

1. **dx-advocate prompt enhanced**: Folded data-lens focus areas (schema-first parsing, API snake_case, Zod patterns, type inference, data flow, state consistency) into the base dx-advocate prompt
2. **code-architect prompt enhanced**: Folded architecture-lens focus areas (dependency direction, entity isolation, barrel purity, structural invariants) into the base code-architect prompt
3. **Multi-lens gate removed**: Replaced Step 8.0.1 (multi-lens gate check with risk multiplier, signal rate query, and gate evaluation) with a simpler Step 8.0.1 (collect pre-mortem mitigations only)
4. **Multi-lens Task() blocks removed**: Removed the two separate architecture-lens and data-lens reviewer spawns
5. **References cleaned up**: Updated REVIEW.md template and merge findings text to remove multi-lens references

**Rationale:** The multi-lens gate added two extra agent spawns (code-architect as architecture-lens, dx-advocate as data-lens) that duplicated expertise already present in the base reviewers. By folding those focus areas into the base prompts, we maintain the same review coverage with fewer agents, reducing token cost and context overhead.

## Deviations

None. Only prompt text and structure were changed, no logic modifications.

## Files Modified

- `src/skills/general/phase-execute.skill.ts` - Fix 4: folded multi-lens into base reviewers

## Verification

- TypeScript type check passes (`bunx --bun tsc --noEmit`)
- No logic changes, only prompt text modifications
