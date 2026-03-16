---
title: "Add task-level implementation loop to lu-executor (Ralph Wiggum pattern)"
area: agents
created: 2025-07-24
source: conversation
---

## Context

Discussion about the Ralph Wiggum agentic workflow pattern (https://awesomeclaude.ai/ralph-wiggum) — a simple while loop that repeatedly feeds an AI agent a prompt until completion. Luca already has phase-level iteration loops (Loop A: harness fix, Loop B: verify fix) but lacks a task-level self-review loop within lu-executor. The goal is higher quality output per task, not just mechanical correctness.

## Task

Add a `task_implementation_loop` section to lu-executor that introduces a self-review cycle after each task implementation, before committing.

### The Loop

```
implement task → self-review against task criteria → satisfied? → commit
                                                   → gaps found? → iterate → self-review again
                                                   → same gaps as last review? → stalled → commit + deviation note
```

### Design Details

**New section** in `src/agents/luca/lu-executor.agent.ts` at order 4 (between `execute_tasks` and `deviation_rules`). One line change in `execute_tasks` to reference it (replace "Run the verification / Confirm done criteria met" with "Enter the task implementation loop").

**NOTE:** The `execute_tasks` step has already been partially updated — "Enter the task implementation loop" reference was added. The existing "Run the verification / Confirm done criteria met" lines were removed. The new section itself still needs to be created and orders 4-6 need to be bumped to 5-7.

### Section Content

```markdown
## task_implementation_loop

After implementing each task, enter a self-review cycle before committing.

### Step 1: Implement

Complete the task as described in the plan.

### Step 2: Self-Review

Re-read the code you just wrote. Evaluate it against:

- **Task verification criteria** — the specific checks listed for this task
- **Plan success criteria** — where applicable to this task
- **Implementation quality** — Is this clear, correct, complete?
  Would you be confident handing this to a reviewer?

Produce a brief internal assessment:

- What the implementation does well
- What gaps remain (if any)
- What could be improved

### Step 3: Decision

**If satisfied** (no meaningful gaps, criteria met, quality is good):
→ Exit loop, proceed to commit.

**If gaps identified:**
→ Address the specific gaps you identified. Then return to Step 2.

### Stall Detection

If your self-review identifies the **same gaps** as the previous
iteration — you've made changes but the assessment hasn't improved —
you are stalled. Exit the loop and proceed to commit. Document
remaining gaps as a deviation: `[Implementation Loop — Stalled] {gaps}`.

### What to evaluate during self-review

- Does the code actually do what the task asks, or did I implement
  something adjacent?
- Are edge cases handled, or did I only cover the happy path?
- Is the API surface what the plan specified (function signatures,
  return types, exports)?
- Would the verification criteria pass if someone checked right now?
- Is there dead code, unnecessary complexity, or leftover scaffolding?

### What NOT to do during iteration

- Do NOT expand scope beyond the task's criteria
- Do NOT refactor surrounding code that isn't part of this task
- Do NOT rewrite your approach from scratch — improve what you have
- Do NOT iterate on style/cosmetics — focus on correctness and completeness
```

### Key Design Decisions

1. **No budget cap** — loop terminates on agent's own satisfaction or stall detection, not an arbitrary counter
2. **Self-review is the signal** — agent evaluates against the task's own criteria, not an external check like typecheck
3. **Stall = same gaps twice** — simple heuristic, no new infrastructure needed
4. **Quality, not just correctness** — "would you be confident handing this to a reviewer?" pushes beyond "does it compile"
5. **Scoped iteration** — improve what you have, don't rewrite or expand scope
6. **No new TypeScript modules** — purely a behavioral instruction in the agent definition

### What This Doesn't Replace

- Loop A (harness) still catches mechanical failures at phase end
- Loop B (verifier) still catches semantic gaps across all plans
- Deviation rules still handle unexpected work during implementation

### Open Questions

1. Should lu-executor-capable get the same section?
2. Should self-review be logged to MuninnDB session context?
3. Should the "what to evaluate" list be customizable per-plan via frontmatter?

## Notes

- Inspired by Ralph Wiggum pattern's philosophy: iteration > perfection, agent self-assesses against explicit criteria
- Ralph Wiggum uses exact string matching for completion ("DONE"); our approach uses self-review judgment which is richer
- The partial edit to execute_tasks (reference to task_implementation_loop) is already in the working tree on branch 79--v5-global-npm-package
