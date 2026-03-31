# Per-Task Recall

How executors receive exactly the research context they need for each task, using MuninnDB semantic recall driven by research refs embedded in PLAN.md.

## The Problem

Giving an executor the full research corpus causes context rot. A phase with 4 research files totaling 10,000 tokens would consume a significant fraction of the executor's context budget before it even reads the plan. Worse, most of that context is irrelevant to any single task -- an executor implementing WebSocket reconnection does not need the findings about database migration strategy.

v1 solved this by having the planner summarize research into the plan itself. But summaries lose detail: the executor knows "use exponential backoff" but not the specific parameters (base delay 1s, max 30s, jitter factor 0.5) or the pitfall to avoid (unbounded message queue causes OOM). This detail loss leads to guesswork, which is the failure mode v2 is designed to eliminate.

## The Solution: Research Refs

Each task in PLAN.md includes a `Research refs:` field that lists the MuninnDB concept prefixes relevant to that task. When an executor starts the task, it recalls those specific engrams and injects them into its context.

> **Annotation syntax note**: The `**Research refs:**` field in PLAN.md is the canonical format for concept-based MuninnDB recall. If `01-workflow-steps/` references an `@research(file-path#section)` or `@engram(concept)` annotation syntax, those are alternative annotation forms. `**Research refs:**` with comma-separated concept prefixes is the format this section specifies and that the phase-execute orchestrator parses.

### PLAN.md Task Format With Research Refs

```markdown
### Wave 2

#### Task 2.1: Implement WebSocket connection manager

Create the core connection manager module with connect/disconnect lifecycle.

**Files:** src/ws/connection-manager.ts (new)
**Research refs:** research:api-bun-websocket, research:approach-ws-reconnect
**Verification:** WebSocket connects to test server, handles clean disconnect

---

#### Task 2.2: Add reconnection logic with exponential backoff

Implement automatic reconnection when connection drops unexpectedly.

**Files:** src/ws/reconnection.ts (new), src/ws/connection-manager.ts (modify)
**Research refs:** research:approach-ws-reconnect, research:pattern-exponential-backoff, research:pitfall-ws-memory-leak
**Verification:** Connection resumes within 2s after network drop, backoff doubles per attempt up to 30s

---

#### Task 2.3: Implement connection health monitor

Add heartbeat-based health monitoring with configurable interval.

**Files:** src/ws/health-monitor.ts (new)
**Research refs:** research:approach-health-monitor, research:constraint-bun-ws-version
**Verification:** Health monitor detects dead connection within 2 heartbeat intervals
```

### How the Planner Writes Research Refs

During Step 7 (Planning), the planner has access to:

1. The GRADUATION-REPORT.md listing all graduated engrams
2. The research files themselves (for understanding scope)
3. MuninnDB recall of `research:*` engrams

For each task in the plan, the planner:

1. Identifies which research findings are relevant based on the task's implementation scope
2. Lists the corresponding `research:*` concept prefixes as research refs
3. Does NOT copy the engram content into the plan (that would bypass the recall mechanism)

The research refs are a contract: "this task needs this context, and MuninnDB has it."

## Executor Recall Protocol

When lu-executor starts a task, it follows this protocol to load research context:

```
+------------------------------------------------------------------+
|  lu-executor receives task from phase-execute orchestrator        |
|                                                                  |
|  Task prompt includes:                                           |
|    - Task description                                            |
|    - Files to create/modify                                      |
|    - Verification criteria                                       |
|    - Research refs: [concept1, concept2, concept3]               |
+------------------------------------------------------------------+
                               |
                               v
+------------------------------------------------------------------+
|  Step 1: Parse research refs from task                           |
|                                                                  |
|  refs = ["research:approach-ws-reconnect",                       |
|          "research:pattern-exponential-backoff",                  |
|          "research:pitfall-ws-memory-leak"]                      |
+------------------------------------------------------------------+
                               |
                               v
+------------------------------------------------------------------+
|  Step 2: Recall each ref from MuninnDB                           |
|                                                                  |
|  For each ref:                                                   |
|    muninn_recall(                                                 |
|      vault: REPO_VAULT,                                          |
|      context: ref                                                 |
|    )                                                              |
|                                                                  |
|  Collect results into research_context[]                         |
+------------------------------------------------------------------+
                               |
                               v
+------------------------------------------------------------------+
|  Step 3: Inject as "Research Context" block                      |
|                                                                  |
|  <research_context>                                               |
|  ## research:approach-ws-reconnect                                |
|  Exponential backoff with jitter for WebSocket reconnection.     |
|  Base delay 1s, max 30s, jitter factor 0.5...                    |
|                                                                  |
|  ## research:pattern-exponential-backoff                          |
|  Implement as: delay = min(base * 2^attempt, max) +              |
|  random(0, jitter * delay)...                                    |
|                                                                  |
|  ## research:pitfall-ws-memory-leak                               |
|  WebSocket message queue must be bounded. Unbounded queue        |
|  during disconnect causes OOM...                                  |
|  </research_context>                                              |
+------------------------------------------------------------------+
                               |
                               v
+------------------------------------------------------------------+
|  Step 4: Execute task with research context available             |
|                                                                  |
|  Executor implements based on:                                   |
|    - Task description (what to build)                            |
|    - Research context (how to build it)                           |
|    - Verification criteria (how to prove it works)               |
+------------------------------------------------------------------+
```

### Recall Implementation Detail

The orchestrator (phase-execute) is responsible for assembling the executor's prompt. When building the prompt for a task:

```
# Pseudocode for phase-execute orchestrator

for each task in wave:
  # Parse research refs
  refs = parse_research_refs(task.content)

  # Recall from MuninnDB
  research_context = []
  for ref in refs:
    result = muninn_recall(vault=REPO_VAULT, context=ref)
    if result.engrams.length > 0:
      research_context.append({
        concept: ref,
        content: result.engrams[0].content
      })
    else:
      research_gaps.append(ref)

  # Build executor prompt
  executor_prompt = build_prompt(
    task=task,
    research_context=research_context,
    research_gaps=research_gaps
  )

  # Spawn executor
  Task(agent: "lu-executor", prompt: executor_prompt)
```

## Benefits

### Targeted Context (No Noise)

Each executor gets exactly the 200-600 tokens of research context relevant to its task, instead of the 8,000-15,000 tokens of raw research files. This preserves context budget for the actual implementation work.

```
v1 executor context:
  Plan task           ~300 tokens
  Full research       ~10,000 tokens   <-- most is irrelevant
  Project identity    ~500 tokens
  Session context     ~400 tokens
  --------------------------------
  Total:              ~11,200 tokens

v2 executor context:
  Plan task           ~300 tokens
  Research context    ~400 tokens      <-- only relevant findings
  Project identity    ~500 tokens
  Session context     ~400 tokens
  --------------------------------
  Total:              ~1,600 tokens
```

### Parallel Execution With Different Context

In wave-based parallel execution, different executors work on different tasks simultaneously. Each executor gets its own research context:

```
Wave 2 (parallel):
  +-----------------------------------+  +-----------------------------------+
  | Executor A: Task 2.1              |  | Executor B: Task 2.2              |
  |                                   |  |                                   |
  | Research context:                 |  | Research context:                 |
  |   research:api-bun-websocket     |  |   research:approach-ws-reconnect  |
  |   research:approach-ws-reconnect |  |   research:pattern-exp-backoff    |
  |                                   |  |   research:pitfall-ws-memory-leak |
  | (2 engrams, ~220 tokens)         |  | (3 engrams, ~300 tokens)          |
  +-----------------------------------+  +-----------------------------------+
```

Executor A gets API details for the connection manager. Executor B gets the reconnection approach and pitfall warning. Neither is burdened with the other's context.

### Fault Isolation

If a research finding is wrong, only the tasks that reference it are affected. Tasks that reference different findings proceed correctly. This is a significant improvement over v1, where a single bad finding in a monolithic research summary could contaminate all tasks.

```
Wrong finding:                       Affected tasks:
research:pitfall-ws-memory-leak      Task 2.2 (references it)
  (says max 1000 msgs, should                   |
   be 5000 for this use case)        All other tasks: UNAFFECTED
```

### Engram Feedback Loop

After execution, lu-learner can provide feedback on which research engrams were useful. The `id` parameter must be the actual engram ID (returned by `muninn_recall` in the result set), not the concept prefix string:

```
# During recall, capture the engram ID from the result:
result = muninn_recall(vault: REPO_VAULT, context: "research:approach-ws-reconnect")
engram_id = result.engrams[0].id  # actual MuninnDB engram ID

# After execution, provide feedback using the captured ID:
muninn_feedback(vault: REPO_VAULT, id: engram_id, useful: true)
```

This feedback improves future recall relevance and informs the confidence evolution system.

## Fallback: Research Gap Handling

If `muninn_recall` returns no results for a research ref, the engram may have been:

1. Not graduated (below threshold)
2. Cleaned up (after milestone completion)
3. Lost (MuninnDB error)

The executor handles this as a **research gap**:

```
+------------------------------------------------------------------+
|  Recall returns empty for research:constraint-bun-ws-version     |
|                                                                  |
|  Step 1: Flag as research gap in executor output                 |
|    "RESEARCH GAP: research:constraint-bun-ws-version not found   |
|     in MuninnDB. Proceeding without this context."               |
|                                                                  |
|  Step 2: Continue execution without that context                 |
|    - Executor uses its training knowledge as fallback            |
|    - Marks any decisions made without research backing            |
|                                                                  |
|  Step 3: Report gap in SUMMARY.md                                |
|    "Research gaps encountered: 1                                  |
|     - research:constraint-bun-ws-version (not in MuninnDB)"     |
|                                                                  |
|  Step 4: Orchestrator evaluates severity                         |
|    - If gap is for a constraint or pitfall: may pause for review |
|    - If gap is for an approach: executor proceeds with best      |
|      judgment, verification will catch errors                     |
+------------------------------------------------------------------+
```

### Gap Severity Matrix

| Gap Type                        | Severity | Executor Behavior                                              |
| ------------------------------- | -------- | -------------------------------------------------------------- |
| `research:approach-*` missing   | LOW      | Proceed with training knowledge; verification catches errors   |
| `research:api-*` missing        | MEDIUM   | Proceed but flag; may use wrong API patterns                   |
| `research:pitfall-*` missing    | HIGH     | Proceed with caution; log prominently in SUMMARY.md            |
| `research:constraint-*` missing | HIGH     | May violate compatibility; orchestrator should review          |
| `research:decision-*` missing   | MEDIUM   | Executor makes own decision; may conflict with research intent |
| `research:pattern-*` missing    | LOW      | Proceed with alternative pattern; non-critical                 |

### Recovery From Gaps

When the orchestrator detects HIGH-severity gaps in an executor's summary, it can:

1. **Re-run graduation** for the specific finding (if research file still exists)
2. **Spawn a targeted researcher** to re-investigate the gap
3. **Proceed and verify** -- let verification catch any issues from the missing context

## Research Ref Best Practices for Planners

### DO: Be Specific

```markdown
**Research refs:** research:api-bun-websocket, research:approach-ws-reconnect
```

Each ref points to a specific engram. The executor knows exactly what context it will receive.

### DO NOT: Use Wildcards

```markdown
**Research refs:** research:\*
```

Wildcards defeat the purpose of targeted recall. The executor gets everything, which is the same as getting nothing useful.

### DO: Match Refs to Task Scope

```markdown
#### Task 2.1: Implement connection manager

**Research refs:** research:api-bun-websocket
(only API details -- this task creates the basic connection)

#### Task 2.2: Add reconnection logic

**Research refs:** research:approach-ws-reconnect, research:pitfall-ws-memory-leak
(reconnection approach + known pitfall -- this task adds retry logic)
```

### DO NOT: Give Every Task All Refs

```markdown
#### Task 2.1: Implement connection manager

**Research refs:** research:api-bun-websocket, research:approach-ws-reconnect,
research:pitfall-ws-memory-leak, research:pattern-exponential-backoff,
research:constraint-bun-ws-version, research:decision-ws-library-choice
(too many -- most are irrelevant to basic connection setup)
```

### DO: Include Pitfall Refs for Relevant Tasks

If a research pitfall exists, the task most likely to trigger that pitfall should reference it. Do not assume the executor will independently discover the pitfall.

### DO: Include Constraint Refs When Task Touches That Boundary

Version constraints, compatibility requirements, and environment limitations should be referenced by the task that first touches that boundary.

## Integration With Existing Cognition System

Research refs complement -- not replace -- the existing cognition integration in lu-executor. The executor receives context from two sources:

```
+------------------------------------------------------------------+
|  Executor Context Assembly                                        |
|                                                                  |
|  From cognition system (existing):                               |
|    - Project identity (brain:project-*)                          |
|    - Recalled patterns (pattern:*)                               |
|    - Recalled pitfalls (pitfall:*)                               |
|    - Session context (session:*)                                 |
|                                                                  |
|  From research refs (v2 addition):                               |
|    - Phase-specific research findings (research:*)               |
|    - Task-scoped, not session-scoped                             |
|    - Distilled, not raw                                          |
|                                                                  |
|  Combined: executor has both long-term knowledge AND             |
|  phase-specific research for its current task.                    |
+------------------------------------------------------------------+
```

The cognition system provides cross-session knowledge ("this project uses Bun, not Node"). Research refs provide phase-specific knowledge ("this specific WebSocket API uses per-socket .data for state"). Both are needed; neither is sufficient alone.

## Metrics and Observability

To measure the effectiveness of per-task recall, the system tracks:

| Metric                       | Source                        | Purpose                                                |
| ---------------------------- | ----------------------------- | ------------------------------------------------------ |
| Research refs per task       | PLAN.md parsing               | Average should be 2-4; too many indicates poor scoping |
| Recall hit rate              | MuninnDB recall results       | % of refs that return engrams; should be >95%          |
| Research gap count           | Executor SUMMARY.md           | Count of refs that returned nothing; should be 0       |
| Engram feedback (useful/not) | lu-learner after verification | Whether research context actually helped               |
| Context budget usage         | Token counting                | Research context as % of total executor context        |

These metrics feed into lu-process-data for process improvement.

## Related Documentation

- [graduation-model.md](graduation-model.md) -- How engrams are created from research files
- [concept-prefix-extensions.md](concept-prefix-extensions.md) -- The research:\* concept prefixes
- [lifecycle.md](lifecycle.md) -- Full lifecycle including recall and promotion
- [Research System](../02-research-system/) -- How research files are produced
