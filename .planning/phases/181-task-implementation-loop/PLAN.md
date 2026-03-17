---
phase: 181
plan: 1
type: improvement
autonomous: true
wave: 1
depends_on: []
---

# Phase 181 Plan 1: Add task_implementation_loop Section to Executor Agents

## Objective

Add a `task_implementation_loop` section to both lu-executor and lu-executor-capable agents, introducing a self-review cycle after each task implementation and before committing. The execute_tasks step in lu-executor already references this section (line 253: "Enter the task implementation loop"), so this plan provides the section body it points to.

## Context

@src/agents/luca/lu-executor.agent.ts
@src/agents/general/lu-executor-capable.agent.ts
@.planning/phases/181-task-implementation-loop/181-CONTEXT.md

## Tasks

### 1. Add task_implementation_loop section to lu-executor.agent.ts
**Type:** auto
**TDD:** false
**Depends on:** none

Add a new section object to the `sections` array in `lu-executor.agent.ts` with:
- `title: "task_implementation_loop"`
- `order: 4` (slots into the existing gap between order 3 execution_flow and order 5 deviation_rules)
- `content`: The full task implementation loop specification (3-step cycle, stall detection, evaluation guidelines, scope guards)

Insert the new section object after the `execution_flow` section (index 2) and before the `deviation_rules` section (index 3) in the array for readability, though array position does not affect behavior -- only `order` matters.

**Section content** (verbatim from todo specification):

The content covers:
- Step 1: Implement (complete the task)
- Step 2: Self-Review (re-read code, evaluate against criteria, produce assessment)
- Step 3: Decision (exit if satisfied, iterate if gaps found)
- Stall Detection (same gaps repeated = stalled, exit with deviation note)
- What to evaluate during self-review (5 checkpoints)
- What NOT to do during iteration (4 guardrails)

**Files to create/edit:**
- `src/agents/luca/lu-executor.agent.ts`

**Verification:**
- File contains a section with `title: "task_implementation_loop"` and `order: 4`
- Section content includes "Step 1: Implement", "Step 2: Self-Review", "Step 3: Decision", "Stall Detection"
- `bunx --bun tsc --noEmit` passes
- No other sections were modified

### 2. Add task_implementation_loop section to lu-executor-capable.agent.ts
**Type:** auto
**TDD:** false
**Depends on:** none

Add a new section object to the `sections` array in `lu-executor-capable.agent.ts` with:
- `title: "task_implementation_loop"`
- `order: 2` (after role at order 1; this agent has only 1 section today)
- `content`: Identical content to Task 1

Insert the section after the existing `role` section in the array.

**Files to create/edit:**
- `src/agents/general/lu-executor-capable.agent.ts`

**Verification:**
- File contains a section with `title: "task_implementation_loop"` and `order: 2`
- Section content is identical to the lu-executor version
- `bunx --bun tsc --noEmit` passes
- The role section (order 1) was not modified

## Verification

1. Run `bunx --bun tsc --noEmit` -- must pass with no errors
2. Confirm both files parse correctly (no syntax errors in template literals)
3. Verify the section order values: lu-executor gets order 4, lu-executor-capable gets order 2
4. Verify no other sections in either file were modified

## Success Criteria

- Both executor agents contain a `task_implementation_loop` section with the full 3-step self-review cycle
- The section content matches the specification from the todo (Implement, Self-Review, Decision, Stall Detection, evaluation guidelines, scope guards)
- TypeScript compilation passes without errors
- No regressions to existing agent sections

## Output Specification

- Modified: `src/agents/luca/lu-executor.agent.ts` (1 new section added)
- Modified: `src/agents/general/lu-executor-capable.agent.ts` (1 new section added)
