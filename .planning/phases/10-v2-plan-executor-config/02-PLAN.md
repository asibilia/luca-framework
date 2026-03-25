---
phase: 10
plan: 2
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 10 Plan 2: Planner and Executor Agent Enhancements

## Objective

Add research_refs guidance to lu-planner and per-task MuninnDB recall protocol to lu-executor. These agent definition changes teach the planner how to populate `**Research refs:**` lines in PLAN.md tasks, and teach the executor how to consume injected research context before implementing each task.

## Context

@src/agents/luca/lu-planner.agent.ts
@src/agents/luca/lu-executor.agent.ts
@.planning/phases/10-v2-plan-executor-config/CONTEXT.md (Decisions 1, 3)
@.planning/phases/10-v2-plan-executor-config/10-RESEARCH.md (Components 1, 2)
@docs/workflow-system/v2/03-muninndb-integration/per-task-recall.md

## Tasks

### 1. Add research_refs line to lu-planner task template

**Type:** auto
**Depends on:** none

Edit `src/agents/luca/lu-planner.agent.ts`, section `plan_structure` (order 4).

In the PLAN.md task template (inside the markdown code block), add `**Research refs:**` after the `**Depends on:**` line:

Current template:

```
### 1. [Task Name]
**Type:** auto | checkpoint:human-verify | checkpoint:decision | checkpoint:human-action
**TDD:** true | false # Whether to use test-driven development
**Depends on:** [task numbers if any]
```

Updated template:

```
### 1. [Task Name]
**Type:** auto | checkpoint:human-verify | checkpoint:decision | checkpoint:human-action
**TDD:** true | false # Whether to use test-driven development
**Depends on:** [task numbers if any]
**Research refs:** research:concept-name-1, research:concept-name-2
```

Add a comment after the template explaining: "Include `**Research refs:**` only when a GRADUATION-REPORT.md is provided in the planning context. Omit the line entirely if no graduated research exists."

**Files to create/edit:**

- `src/agents/luca/lu-planner.agent.ts` (EDIT)

**Verification:**

- Task template in `plan_structure` section includes `**Research refs:**` line
- The line appears after `**Depends on:**` and before the description block
- `bunx --bun tsc --noEmit` passes

### 2. Add research_refs_guidance section to lu-planner

**Type:** auto
**Depends on:** 1

Add a new section to `lu-planner.agent.ts` at order 4.5 (between `plan_structure` at 4 and `context_integration` at 5) titled `research_refs_guidance`.

Section content should cover (from 10-RESEARCH.md Component 1):

1. Only include refs if `GRADUATION-REPORT.md` is present in the phase directory context
2. Read the report to discover available `research:*` concept names
3. Match refs to task scope -- assign 2-4 refs per task based on relevance, never dump all refs on every task
4. Pitfall refs (`research:pitfall-*`) should always accompany the task most likely to trigger the pitfall
5. If no graduated research exists, omit the `**Research refs:**` line entirely (graceful degradation)
6. The canonical regex for parsing (from CONTEXT.md Decision 1): `line.match(/\*\*Research refs:\*\*\s*(.+)/)?.[1].split(',').map(s => s.trim())`

**Files to create/edit:**

- `src/agents/luca/lu-planner.agent.ts` (EDIT)

**Verification:**

- New section `research_refs_guidance` exists at order 4.5
- Content explains when to include refs and how to match them to tasks
- Includes the canonical regex for downstream reference
- `bunx --bun tsc --noEmit` passes

### 3. Add per_task_recall section to lu-executor

**Type:** auto
**Depends on:** none

Add a new section to `lu-executor.agent.ts` at order 2.5 (between `working_memory` at 2 and `execution_flow` at 3) titled `per_task_recall`.

Section content defines the per-task recall protocol (from CONTEXT.md Decision 3 and per-task-recall.md):

```
## Per-Task Research Recall

Before implementing each task, check for research context:

1. **Check for research_context block**: If your prompt includes a `<research_context>` block,
   it contains pre-recalled research engrams relevant to this plan's tasks.

2. **Match research to current task**: Each research entry is tagged with concept names
   (e.g., `research:approach-ws-reconnect`). Match these to the current task's
   `**Research refs:**` line to identify which research is relevant.

3. **Apply research context**: Use matched research findings to inform your implementation:
   - Follow recommended approaches from `research:approach-*` entries
   - Apply API patterns from `research:api-*` entries
   - Watch for issues flagged in `research:pitfall-*` entries
   - Respect configuration details from `research:config-*` entries

4. **Handle research gaps**: If a task references a `research:*` concept but no matching
   content exists in your `<research_context>` block, log the gap:
```

mcp**muninn**muninn_remember(vault: REPO_VAULT, concept: "session:findings",
content: "<timestamp> [RESEARCH-GAP] Task '{task_name}' references {ref} but no research context was provided")

```
Continue implementation without that context (graceful degradation).

5. **Cap**: Maximum 5 engrams per task (from config perTaskRecall.maxEngramsPerTask).

6. **No research_refs**: If the current task has no `**Research refs:**` line,
skip research recall entirely and use v1 behavior.

7. **Include in SUMMARY.md**: Add a "Research gaps encountered" section listing any
refs that had no matching context.
```

**Files to create/edit:**

- `src/agents/luca/lu-executor.agent.ts` (EDIT)

**Verification:**

- New section `per_task_recall` exists at order 2.5
- Protocol covers: check, match, apply, gap handling, cap, fallback, summary inclusion
- Includes the canonical regex reference
- References REPO_VAULT for any recall operations
- `bunx --bun tsc --noEmit` passes

## Verification

- `bunx --bun tsc --noEmit` passes across the entire project
- lu-planner agent has 9 sections (was 8, added `research_refs_guidance`)
- lu-executor agent has 8 sections (was 7, added `per_task_recall`)
- Task template in lu-planner includes `**Research refs:**` line
- Per-task recall protocol in lu-executor matches CONTEXT.md Decision 3

## Success Criteria

- lu-planner will output PLAN.md tasks with `**Research refs:**` lines when given a GRADUATION-REPORT.md
- lu-executor understands how to consume `<research_context>` blocks and match to task refs
- Both agents gracefully degrade when research is absent (v1 behavior preserved)

## Output Specification

- `src/agents/luca/lu-planner.agent.ts` (EDITED -- 2 changes: task template + new section)
- `src/agents/luca/lu-executor.agent.ts` (EDITED -- 1 new section)
