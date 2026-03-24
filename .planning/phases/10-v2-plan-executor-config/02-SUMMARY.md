# Phase 10 Plan 02: Planner and Executor Agent Enhancements

## Summary

Added research_refs guidance to lu-planner and per-task MuninnDB recall protocol to lu-executor. These changes teach the planner how to populate `**Research refs:**` lines in PLAN.md tasks, and teach the executor how to consume injected research context before implementing each task.

## Tasks Completed

### Task 1: Add research_refs line to lu-planner task template

- **Commit:** `1970f925`
- **Files:** `src/agents/luca/lu-planner.agent.ts`
- Added `**Research refs:** research:concept-name-1, research:concept-name-2` after `**Depends on:**` in the PLAN.md task template
- Added explanatory note: include Research refs only when GRADUATION-REPORT.md is provided, omit entirely otherwise

### Task 2: Add research_refs_guidance section to lu-planner

- **Commit:** `2fc603c0`
- **Files:** `src/agents/luca/lu-planner.agent.ts`
- New section at order 4.5 covering:
  1. Only include refs when GRADUATION-REPORT.md exists
  2. Discover available concept names from graduation report
  3. Match refs to task scope (2-4 per task, no dumping all refs)
  4. Pitfall refs placement on most-likely-to-trigger task
  5. Constraint refs placement on first-touch task
  6. Canonical parsing regex

### Task 3: Add per_task_recall section to lu-executor

- **Commit:** `056c4ee9`
- **Files:** `src/agents/luca/lu-executor.agent.ts`
- New section at order 2.5 defining the full recall protocol:
  1. Check for `<research_context>` block in prompt
  2. Match research entries to current task's Research refs
  3. Apply research context by concept prefix type (approach, api, pitfall, config, constraint)
  4. Handle research gaps with MuninnDB logging and graceful degradation
  5. Cap at 5 engrams per task
  6. Skip recall entirely when no Research refs exist (v1 behavior)
  7. SUMMARY.md gap reporting

## Deviations

None. All tasks executed as specified.

## Verification

- TypeScript compilation passes (`bunx --bun tsc --noEmit`) -- 5 pre-existing errors in `research-config.schemas.ts` (from a parallel wave), no new errors introduced
- Both agent files maintain valid AgentConfig structure with properly ordered sections
- Section ordering: planner has 4 -> 4.5 -> 5; executor has 2 -> 2.5 -> 3
