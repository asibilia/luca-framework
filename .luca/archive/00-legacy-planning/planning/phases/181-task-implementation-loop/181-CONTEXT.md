# Phase 181 — Task Implementation Loop: Context

## Decisions

### 1. lu-executor-capable gets the same section [researched]

Both lu-executor.agent.ts and lu-executor-capable.agent.ts will receive the task_implementation_loop section. The capable variant currently says "follow the same execution protocol as lu-executor" but that's vague — an explicit section ensures consistent self-review behavior regardless of model tier. Source: architect specialist recommendation + QA alignment.

### 2. No section renumbering needed [researched]

Current lu-executor section orders: 1 (role), 2 (working_memory), 3 (execution_flow), 5 (deviation_rules), 6 (tdd_execution_flow), 6 (tdd_retry_loop). Order 4 is already an open gap. The task_implementation_loop section slots in at order 4 with zero renumbering. The todo expected renumbering (4-6 to 5-7) but the codebase already has the gap. Source: codebase inspection.

### 3. execute_tasks reference already exists

Line 253 of lu-executor.agent.ts already says "Enter the task implementation loop (see task_implementation_loop section)". No change needed to execute_tasks. Source: codebase inspection.

### 4. Section content from todo specification

The task_implementation_loop section content is fully specified in the todo file (.planning/todos/pending/task-implementation-loop.md). Implement verbatim: 3-step cycle (Implement → Self-Review → Decision), stall detection (same gaps twice), scoped iteration guidelines.

### 5. lu-executor-capable section placement

Add as order 2 in lu-executor-capable (after role at order 1). The capable variant has only 1 section today; adding as order 2 keeps it clean.

## Scope Boundaries

- IN: Add task_implementation_loop section to both executor agents
- IN: Match section content to todo specification
- OUT: No new TypeScript modules, no new imports, no schema changes
- OUT: No changes to deviation_rules, TDD flow, or other sections
- DEFERRED: MuninnDB logging of self-review results (open question from todo)
