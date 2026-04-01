# Research: Tasks Must Fit One Context Window

> **Learning:** GSD2 Learning 2 — If a task cannot complete in one context window, it becomes two tasks. This is an enforced constraint, not a guideline.
> **Date:** 2026-03-31
> **Status:** Research complete
> **Cross-references:** [01-fresh-context-per-unit.md](./01-fresh-context-per-unit.md), [03-per-phase-reassessment.md](./03-per-phase-reassessment.md)

## Summary

GSD2 treats context window overflow as a hard constraint. Any task that cannot complete within a single context window must be split into smaller tasks before execution begins. This is enforced at plan time, not discovered at execution time. Luca's planner (`lu-planner`) currently has no explicit task-sizing validation. Tasks are scoped by the planner's judgment, and oversized tasks are discovered only when an Agent() call degrades in quality or fails to complete. This learning calls for explicit sizing constraints at the planning step (7f-7g) and validation at the plan review step (7g-v2).

---

## 1. What Specifically Needs to Change in the Proposed Pipeline

### Step 7g (Planning) Must Include Task Size Estimation

The `EXECUTE_WAVES_PROMPT` (line 454 of agent-prompts.ts) instructs lu-executor to "read PLAN.md files, parse frontmatter, execute tasks in wave order." But the PLAN.md tasks have no size metadata. The planner creates tasks based on functional decomposition ("implement X", "refactor Y") without estimating whether each task fits in a single Agent() context.

**Change:** The planner prompt should require each task to include:

- **File count estimate** — how many files need to be read or modified
- **Scope classification** — SMALL (1-2 files, <5K tokens of context), MEDIUM (3-5 files, 5-20K), LARGE (5-10 files, 20-50K)
- **Split marker** — if scope is LARGE, the planner must either split the task or justify why it can't be split

### Step 7g-v2 (Plan Review) Must Validate Task Sizing

The `PLAN_REVIEW_PROMPT` (line 1012 of agent-prompts.ts) runs "standard plan verification (all 6 dimensions + 10 steps)" but none of those dimensions explicitly check task sizing. The reviewer checks for goal alignment, dependency correctness, and coverage — not whether individual tasks are executable in a single context window.

**Change:** Add task sizing as a 7th verification dimension in the plan review prompt. The reviewer should flag any task that:

- Touches more than 8 files (hard limit)
- Has a description longer than 500 words (proxy for complexity)
- Contains multiple independent concerns (e.g., "refactor auth AND add logging")
- References more than 3 packages in a monorepo

### Step 7h (Execution) Should Detect Overflow at Runtime

Even with plan-time validation, some tasks may overflow in practice. The executor agent should recognize when it's running out of effective context and signal back to the orchestrator rather than producing degraded output.

**Change:** The `EXECUTE_WAVES_PROMPT` should include an instruction: "If you are on task N and have already consumed significant context on prior tasks, output OVERFLOW: task-N and stop. The orchestrator will spawn a fresh Agent() for the remaining tasks."

---

## 2. What "Fits in One Context Window" Means for Agent() Calls

### Agent() Context Window Is Not the Same as a Session

In Claude Code, the user's session has a large context window (potentially 1M tokens with Opus). But an `Agent()` call within that session gets its own context window. The prompt passed to Agent() plus all the agent's tool calls and their outputs must fit within that agent's context.

The practical context budget for an Agent() call:

| Component                      | Token Estimate | Notes                                                   |
| ------------------------------ | -------------- | ------------------------------------------------------- |
| System prompt + Agent() prompt | 2K-10K         | Depends on how much context is inlined (see Learning 1) |
| Memory protocol recall results | 1K-5K          | MuninnDB responses                                      |
| File reads during execution    | 5K-50K         | The main variable — reading source files                |
| Tool call overhead             | 1K-5K          | Bash, Edit, Write tool interactions                     |
| Agent's reasoning              | 5K-20K         | Internal chain-of-thought                               |
| Output generation              | 1K-5K          | The structured output contract                          |
| **Total usable budget**        | **~80K-100K**  | Rough upper bound for quality work                      |

The quality degradation curve from GSD2's model applies here:

| Context usage | Quality   | What happens                                |
| ------------- | --------- | ------------------------------------------- |
| 0-30% (~25K)  | PEAK      | Agent is thorough, considers edge cases     |
| 30-50% (~40K) | GOOD      | Solid work, may miss minor concerns         |
| 50-70% (~55K) | DEGRADING | Shortcuts begin, less thorough              |
| 70%+ (~70K)   | POOR      | Rushed, minimal, likely to introduce issues |

### Sizing Heuristic for Tasks

A task "fits in one context window" if:

```
prompt_tokens + (files_to_read * avg_file_tokens) + reasoning_overhead < 50K
```

Where:

- `prompt_tokens` = template size + inlined context (from Learning 1)
- `files_to_read` = number of files the agent needs to read (typically 200-800 tokens per file)
- `avg_file_tokens` = average token count per source file in this codebase
- `reasoning_overhead` = ~15K fixed budget for agent thinking + tool interactions

For this codebase, a rough heuristic: **a task should touch at most 6-8 files** to stay within the quality zone. Tasks touching 10+ files should be split unless the files are small (types, configs, re-exports).

### Wave Grouping vs Task Sizing

Luca groups tasks into waves for dependency ordering. A wave may contain multiple independent tasks. But each task within a wave is executed by a single Agent() call (or sometimes all tasks in a wave are given to one Agent() call — see `EXECUTE_WAVES_PROMPT`).

**Critical distinction:** The current executor prompt tells the agent to "execute tasks in wave order" — meaning ALL tasks in the plan may go to a single Agent() call. This is the primary overflow vector. If a plan has 3 waves with 4 tasks each, the executor tries to do all 12 tasks in one Agent() call.

**Change:** The orchestrator should spawn one Agent() call PER WAVE (not per plan). Each wave's tasks must fit in one context window. The planner's wave grouping becomes the sizing unit.

---

## 3. Concrete Implementation Approach

### 3a. Task Size Metadata in PLAN.md

Add size metadata to the PLAN.md frontmatter format:

```yaml
---
wave: 1
depends_on: []
---

## Task 1.1: Implement auth middleware

- **Files:** src/middleware/auth.ts, src/types/auth.d.ts
- **File count:** 2
- **Scope:** SMALL
- **Estimated context:** ~8K tokens

## Task 1.2: Add route guards to API endpoints

- **Files:** src/routes/users.ts, src/routes/admin.ts, src/routes/api.ts
- **File count:** 3
- **Scope:** MEDIUM
- **Estimated context:** ~15K tokens
```

### 3b. Planner Prompt Changes

Add to the planning prompt template (currently not shown in agent-prompts.ts but referenced at Step 7g):

```
<sizing_constraint>
IRON RULE: Every task must fit in one Agent() context window.

For each task, estimate:
- File count: how many files must be read or modified
- Scope: SMALL (1-2 files), MEDIUM (3-5 files), LARGE (5-8 files)
- If a task would touch 8+ files: SPLIT IT into smaller tasks

For each wave, verify:
- Total file count across all tasks in the wave < 10
- No single task touches more than 8 files
- Tasks within a wave are independent (no task depends on another task in the same wave)

If you cannot size a task because the scope is unclear, add a NEEDS_RESEARCH marker
and the orchestrator will run a scoping agent before execution.
</sizing_constraint>
```

### 3c. Plan Review Sizing Dimension

Add to the `PLAN_REVIEW_PROMPT` template a 7th verification dimension:

```
7. TASK SIZING: For each task, verify:
   - File count is specified and <= 8
   - Scope classification matches file count
   - Wave total file count < 10
   - No task contains multiple independent concerns (split these)
   - Tasks marked NEEDS_RESEARCH have been resolved

   Flag as BLOCKER if any task touches 10+ files without justification.
   Flag as WARNING if any task has no file count estimate.
```

### 3d. Per-Wave Execution Pattern

Change the orchestrator's Step 7h from "spawn one Agent() for the whole plan" to "spawn one Agent() per wave":

```
FOR each wave in PLAN.md (ordered by wave number):
  IF wave has dependencies: verify all dependencies complete
  Read wave tasks from PLAN.md
  Assemble context payload (Learning 1) scoped to this wave's files
  Agent(name: "execute-{NN}-w{WW}", prompt: EXECUTE_WAVE_PROMPT({wave tasks, context}))
  IF agent outputs OVERFLOW: split remaining tasks, spawn new Agent()
```

This requires splitting `EXECUTE_WAVES_PROMPT` into `EXECUTE_WAVE_PROMPT` (singular) that handles one wave at a time.

### 3e. Runtime Overflow Detection

Add to the executor prompt:

```
<overflow_protocol>
If you have completed some tasks but recognize that the remaining tasks
will exceed your effective context (you're reading many files, the scope
is growing), output:

OVERFLOW: {task-id}
COMPLETED: {list of completed task IDs}
REMAINING: {list of remaining task IDs}

The orchestrator will spawn a fresh Agent() for the remaining tasks.
Do NOT attempt to power through — degraded output is worse than stopping.
</overflow_protocol>
```

---

## 4. Risks and Tradeoffs

### Risks of Adopting

1. **Planner overhead increases.** Requiring size estimates for every task adds work to the planning step. However, this is bounded — the planner already describes tasks and lists files; adding a count and scope classification is marginal.

2. **More Agent() calls per phase.** Per-wave execution means more Agent() calls (1 per wave instead of 1 per plan). Each Agent() call has startup overhead (prompt parsing, memory protocol recall). For a 3-wave plan, this is 3 executor calls instead of 1. The tradeoff is quality vs latency.

3. **Splitting may introduce coordination bugs.** When a task is split, the two resulting tasks may have implicit dependencies that the planner doesn't capture. Mitigation: splits should be reviewed (the plan review step catches this).

4. **Sizing estimates may be wrong.** The planner estimates file count and scope at plan time, but execution may discover that a "2-file task" actually requires touching 6 files. The overflow detection (3e) is the backstop for this.

### Risks of NOT Adopting

1. **Silent quality degradation.** Without sizing constraints, oversized tasks produce subtly degraded output — the agent "completes" the task but with shortcuts, missed edge cases, or incorrect implementations. This is the hardest failure mode to detect because it looks like success.

2. **Wasted harness/verify iterations.** An oversized task that produces poor output will fail verification, triggering the harness fix loop (Step 7i) and gap closure (Step 7p). Each fix iteration is another Agent() call that could have been avoided by proper task sizing.

3. **Unpredictable execution times.** Without sizing, some phases take 2 minutes and others take 20 minutes. Per-wave execution with sized tasks gives more predictable throughput.

### Tradeoff Summary

| Dimension               | Adopt                               | Don't Adopt                     |
| ----------------------- | ----------------------------------- | ------------------------------- |
| Output quality          | Higher (tasks stay in quality zone) | Variable (depends on task size) |
| Planning overhead       | Moderate increase                   | No change                       |
| Agent() calls per phase | More (per-wave)                     | Fewer (per-plan)                |
| Predictability          | Higher (bounded scope)              | Lower (variable scope)          |
| Failure detection       | Plan-time (early)                   | Execution-time (late)           |

---

## 5. Interaction with Other Learnings

### With Learning 1 (Fresh Context Per Unit)

Task sizing and context assembly are two sides of the same coin. Learning 1 says "inline the right context into each agent's prompt." Learning 2 says "make sure the task + its inlined context fits in one context window." Together they define the constraint:

```
inlined_context_tokens + task_scope_tokens < quality_zone_threshold
```

If we inline more context (Learning 1), we need smaller tasks (Learning 2) — and vice versa. The context tier system from Learning 1 (Full/Scoped/Minimal) directly affects how much room is left for task scope.

**Practical implication:** The "Full" context tier (phase goal + plan tasks + patterns + research) may consume 10-20K tokens. This means a task in the Full tier has a smaller file budget than a task in the Minimal tier. The planner should know the context tier when sizing tasks.

### With Learning 3 (Per-Phase Reassessment)

If reassessment after Phase N discovers that Phase N+1's plan has oversized tasks (because the implementation revealed more complexity than expected), the reassessment step should trigger a re-planning pass that splits those tasks. This is "backfill, don't skip" applied to task sizing.

### With Learning 4 (Stuck Detection)

Stuck detection is complementary to task sizing. A properly sized task should not get stuck — if it does, the problem is the approach, not the scope. Stuck detection catches the cases where the task is correctly sized but the agent is taking the wrong approach. Task sizing catches the cases where the agent is taking the right approach but runs out of context.

### With Learning 7 (Pipeline Ceremony Overhead)

Per-wave execution increases the number of Agent() calls. This pushes against Learning 7's goal of reducing ceremony. The resolution is that per-wave execution replaces one low-quality call with N high-quality calls — the total token cost may be similar, but the output quality is higher. Additionally, if the planner creates well-sized waves, single-wave plans (common for TRIVIAL/SIMPLE tasks) still use only one Agent() call.

### With Learning 6 (Deterministic Complexity Classification)

If complexity classification becomes deterministic (Learning 6), the sizing thresholds can be complexity-aware:

| Complexity | Max files per task | Max tasks per wave | Max waves |
| ---------- | ------------------ | ------------------ | --------- |
| TRIVIAL    | 3                  | 2                  | 1         |
| SIMPLE     | 5                  | 3                  | 1         |
| MODERATE   | 6                  | 4                  | 2         |
| COMPLEX    | 8                  | 5                  | 3         |
| CRITICAL   | 8                  | 6                  | 5         |

These limits would be enforced at plan time (by the planner) and validated at review time (by the plan checker).
