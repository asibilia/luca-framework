# Step 9: Execute

## Purpose

The Execute step runs each approved PLAN.md file through wave-based parallel execution. The key v2 enhancement is **per-task targeted MuninnDB recall**: before implementing each task, the executor reads the task's `@research` and `@engram` annotations and performs a focused recall to load only the relevant research findings and graduated patterns into its context.

This means the executor never works from "general knowledge" -- it always has the specific, reviewer-approved research for the task at hand.

## Inputs

| Input                | Source                                       | Description                                  |
| -------------------- | -------------------------------------------- | -------------------------------------------- |
| PLAN.md files        | Step 7 (approved by Step 8)                  | Plans with @research and @engram annotations |
| Research corpus      | `.planning/phases/{NN}-{name}/research/*.md` | Available for @research annotation loading   |
| Plan review warnings | MuninnDB `session:plan-review-warnings`      | Non-blocking issues from Step 8              |
| Complexity           | STATE.md                                     | Determines model tier and harness iterations |
| Appetite             | STATE.md                                     | Token budget ceiling                         |
| Project identity     | MuninnDB `brain:project-identity`            | Conventions, stack, patterns                 |

## Process

### 9.1 Cognitive pre-flight

```
mcp__muninn__muninn_recall_tree(vault: "luca-framework", id: "brain:project-identity")
mcp__muninn__muninn_recall(vault: "luca-framework", context: "session:plan-review-warnings")
mcp__muninn__muninn_remember(
  vault: "luca-framework",
  concept: "session:info",
  content: "workflow=phase-execute, phase=08, started=2026-03-22T11:00:00Z"
)
```

### 9.2 Discover plans and group into waves

```bash
PHASE_DIR=".planning/phases/08-websocket-reconnection"
ls "$PHASE_DIR"/*-PLAN.md
```

**Wave grouping (from plan frontmatter):**

| Wave | Plans                        | Dependencies           |
| ---- | ---------------------------- | ---------------------- |
| 1    | 08-01-PLAN.md, 08-02-PLAN.md | None (run in parallel) |
| 2    | 08-03-PLAN.md                | Depends on 01 + 02     |

### 9.3 Execute Wave 1 (parallel)

For each plan in the wave, spawn a `lu-executor` agent:

```python
# Wave 1: Spawn executors in PARALLEL
Task(
  prompt="""
  <execution_context>
  **Plan:** 08-01-PLAN.md (WebSocket Reconnection Core)
  **Wave:** 1
  **Phase directory:** .planning/phases/08-websocket-reconnection
  **Complexity:** MODERATE
  **Appetite:** Medium (100k tokens)

  **Plan content:**
  {content of 08-01-PLAN.md}

  **Per-task research context:**
  See @research and @engram annotations in each task. Before implementing each
  task, load the referenced research file sections and recall the referenced
  MuninnDB engrams.

  **Plan review warnings:**
  (none for this plan)

  **Working memory:** {memory_context_block}
  </execution_context>
  """,
  subagent_type="lu-executor",
  description="Execute Plan 08-01 (Core)"
)

Task(
  prompt="""
  <execution_context>
  **Plan:** 08-02-PLAN.md (Heartbeat Mechanism)
  **Wave:** 1
  **Phase directory:** .planning/phases/08-websocket-reconnection
  **Complexity:** MODERATE

  **Plan content:**
  {content of 08-02-PLAN.md}

  **Plan review warnings:**
  - Task 2: EWMA threshold adjustment logic needs explicit implementation

  **Working memory:** {memory_context_block}
  </execution_context>
  """,
  subagent_type="lu-executor",
  description="Execute Plan 08-02 (Heartbeat)"
)
```

### 9.4 Per-task MuninnDB recall (inside executor)

This is the core v2 enhancement. Before implementing each task, the executor:

1. **Parse @research annotations** from the task's `<action>` block
2. **Read the referenced research sections** from the file system
3. **Parse @engram annotations** and recall from MuninnDB
4. **Combine into task-specific context**

For example, when the executor reaches Task 3 (Reconnection Manager) in Plan 01:

```
# 1. Parse annotations from task action
@research(.planning/phases/{NN}-websocket-reconnection/research/08-state-machine.md#complete-state-transition-table)
@research(.planning/phases/{NN}-websocket-reconnection/research/07-timer-safety.md#abortcontroller-pattern)
@engram(research:pattern-ws-reconnection-state-machine)
@engram(research:decision-bun-ws-close-code-reconnection-map)

# 2. Read research file sections
research_context_1 = read(.planning/phases/{NN}-websocket-reconnection/research/08-state-machine.md)  # section: complete-state-transition-table
research_context_2 = read(.planning/phases/{NN}-websocket-reconnection/research/07-timer-safety.md)   # section: abortcontroller-pattern

# 3. Recall MuninnDB engrams (research:* in repo vault, from Step 6 graduation)
mcp__muninn__muninn_recall(vault: "luca-framework", context: "research:pattern-ws-reconnection-state-machine")
mcp__muninn__muninn_recall(vault: "luca-framework", context: "research:decision-bun-ws-close-code-reconnection-map")

# 4. Executor now has targeted context:
#    - State transition table (from research)
#    - AbortController pattern (from research)
#    - State machine pattern summary (from MuninnDB)
#    - Close code reconnection map (from MuninnDB)
```

This targeted recall means the executor's context is loaded with precisely the knowledge needed for each task, not a generic dump of all research.

### 9.5 Task execution cycle

For each task in the plan:

1. **Load per-task context** (9.4 above)
2. **Implement the code** (create/modify files per `<files>` element)
3. **Run verification** (`<verify>` command -- typically `bunx --bun tsc --noEmit`)
4. **Commit atomically** per task:

   ```bash
   git add src/ws/reconnect-manager.ts
   git commit -m "feat(ws): implement reconnection manager with state machine

   Phase 08 Plan 01 Task 3
   - State machine with 6 states and 14 transitions
   - AbortController cleanup on every state transition
   - Close code map determines reconnectable vs terminal
   @research: 08-state-machine.md, 07-timer-safety.md"
   ```

5. **Record session finding** in MuninnDB:
   ```
   mcp__muninn__muninn_remember(
     vault: "luca-framework",
     concept: "session:findings",
     content: "11:15 [FINDING] Bun WebSocket.send() throws if called during CONNECTING state -- added guard in reconnect-manager.ts"
   )
   ```

### 9.6 Track engram application

The executor tracks which recalled engrams it actually used:

```
mcp__muninn__muninn_remember(
  vault: "luca-framework",
  concept: "session:applied-engrams",
  content: "Phase 08 Plan 01: Applied: [pattern:ws-reconnection-state-machine, pattern:abort-controller-timer-cleanup, decision:bun-ws-close-code-reconnection-map]. Ignored: [pattern:exponential-backoff-jitter -- used in Plan 01 Task 2 instead]."
)
```

### 9.7 Create SUMMARY.md

After all tasks in a plan complete, the executor writes a SUMMARY.md:

**File: `.planning/phases/08-websocket-reconnection/08-01-SUMMARY.md`**

```markdown
# Plan 08-01: WebSocket Reconnection Core - Summary

**Status:** COMPLETE
**Tasks:** 3/3 completed
**Files modified:** 3
**Commits:** 3

## Task Results

| Task                      | Status | Files                       | Key Finding                                     |
| ------------------------- | ------ | --------------------------- | ----------------------------------------------- |
| 1: Connection state types | DONE   | src/ws/connection-state.ts  | AbortController per state works as researched   |
| 2: Backoff calculator     | DONE   | src/ws/backoff.ts           | Added Bun.nanoseconds() for high-res jitter     |
| 3: Reconnection manager   | DONE   | src/ws/reconnect-manager.ts | Bun WS.send() throws in CONNECTING; added guard |

## Deviations from Plan

- Task 3: Added send queue for messages attempted during RECONNECTING state
  (not in plan, but research/08-state-machine.md#edge-cases suggested it)

## Verification Results

- TypeScript: PASS (all 3 files compile)
- No runtime tests (testing deferred to Plan 03)
```

### 9.8 Wave 1 complete, start Wave 2

After both Plan 01 and Plan 02 complete, spawn Wave 2 executor:

```python
Task(
  prompt="""
  <execution_context>
  **Plan:** 08-03-PLAN.md (Server Integration + UX)
  **Wave:** 2
  **Dependencies completed:** Plan 01 (core), Plan 02 (heartbeat)
  **Complexity:** MODERATE

  **Plan content:** {content of 08-03-PLAN.md}
  **Plan 01 summary:** {content of 08-01-SUMMARY.md}
  **Plan 02 summary:** {content of 08-02-SUMMARY.md}

  **Plan review warnings:**
  - Task 1: Wire UI indicator to reconnection manager state events
  </execution_context>
  """,
  subagent_type="lu-executor",
  description="Execute Plan 08-03 (Integration + UX)"
)
```

### 9.9 Harness verification

After all waves complete, run the verification harness:

```bash
# Run harness checks
bun test           # If tests exist
bunx --bun tsc --noEmit  # Type checking
bun run check:drift      # Build verification
```

If harness fails, spawn executor to fix (up to `harnessFixIterations` from complexity matrix -- 2 at MODERATE).

### 9.10 Spawn lu-verifier

After harness passes, spawn `lu-verifier` for goal-backward verification:

```python
Task(
  prompt="""
  <verification_context>
  **Phase goal:** Add WebSocket reconnection with exponential backoff
  **Plans executed:** 3 (08-01, 08-02, 08-03)
  **Summaries:** {all summary contents}
  **Research:** {research summary}
  </verification_context>
  Verify that the phase goal has been achieved by examining the codebase.
  """,
  subagent_type="lu-verifier",
  description="Verify Phase 08"
)
```

### 9.11 Spawn lu-learner (post-execution)

After verification (pass or fail), capture learnings. **Note:** This is the first of two `lu-learner` invocations. This invocation captures implementation findings and execution-time discoveries. The second invocation in Step 10 (section 10.6) captures the full learning loop including UAT results, code review findings, and promotes high-value `research:*` engrams to permanent `pattern:*`/`pitfall:*`/`decision:*` namespaces (Decision 4).

```python
Task(
  prompt="""
  <learning_context>
  **Phase:** 08 - WebSocket Reconnection
  **Verification result:** {PASSED/FAILED}
  **Session findings:** {recall session:findings and session:applied-engrams}
  **Repo vault:** luca-framework
  **Default vault:** default

  **Scope:** This is the post-execution learning pass. Capture implementation
  findings and execution-time discoveries. Do NOT promote research:* engrams
  to permanent namespaces yet -- that happens in Step 10 after UAT.
  </learning_context>
  Extract validated learnings and write to MuninnDB.
  """,
  subagent_type="lu-learner",
  description="Capture learnings from Phase 08 (post-execution)"
)
```

## Outputs

| Output           | Location                                            | Description                               |
| ---------------- | --------------------------------------------------- | ----------------------------------------- |
| Code changes     | Git commits (per task)                              | Atomic commits with @research attribution |
| SUMMARY.md files | `.planning/phases/{NN}-{name}/{NN}-{PP}-SUMMARY.md` | Per-plan execution results                |
| Session findings | MuninnDB `session:findings` (repo vault)            | Runtime discoveries                       |
| Applied engrams  | MuninnDB `session:applied-engrams` (repo vault)     | Engram effectiveness tracking             |
| VERIFICATION.md  | `.planning/phases/{NN}-{name}/VERIFICATION.md`      | Goal-backward verification result         |

## Agents Involved

| Agent         | Count                                | Role                                    | Isolation                     | Model Tier (MODERATE)          |
| ------------- | ------------------------------------ | --------------------------------------- | ----------------------------- | ------------------------------ |
| `lu-executor` | 1-3 (per plan, parallel within wave) | Execute plan tasks with per-task recall | None                          | balanced (ORCHESTRATOR preset) |
| `lu-verifier` | 1                                    | Goal-backward verification              | **Warm** (no session context) | capable (DEEP_ANALYSIS preset) |
| `lu-learner`  | 1                                    | Extract and persist learnings           | None                          | fast (FAST_PROMOTED preset)    |

## v1 Mapping

**v1 behavior**: `phase-execute` spawned `lu-executor` per plan with wave-based parallelization. Executors received plan content, project state, and optionally a `<memory_context>` block from the orchestrator's recall cache. There was no per-task targeted recall.

**v2 changes**:

- **Per-task MuninnDB recall**: Executor parses `@research` and `@engram` annotations from each task and loads targeted context before implementing
- **Research file reading**: Executor reads specific sections from research files referenced in annotations
- **Engram application tracking**: Executor records which engrams it actually used, feeding the memory effectiveness system
- **Plan review warnings**: Executor receives non-blocking warnings from Step 8 and addresses them during implementation
- **Commit attribution**: Git commits include `@research` references for traceability

## Failure Modes

| Failure                           | Cause                                                                  | Mitigation                                                                          |
| --------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| @research file not found          | Research file deleted or moved after planning                          | Executor logs warning, falls back to MuninnDB engram recall                         |
| Per-task recall overloads context | Too many annotations on a single task                                  | Recall is targeted (specific sections, not full files); context tier limits apply   |
| Executor deviates from plan       | Research reveals plan was wrong (e.g., API does not work as described) | Deviation recorded in SUMMARY.md; verifier checks actual outcome against phase goal |
| Harness fails repeatedly          | Code changes break existing functionality                              | Max fix iterations from complexity matrix; escalate to user                         |
| Wave dependency broken            | Plan 01 output incompatible with Plan 03's expectations                | SUMMARY.md from Plan 01 is passed to Plan 03 executor; deviations are visible       |

## Example

### Per-task recall for Task 3: Reconnection Manager

**Task annotations:**

```
@research(.planning/phases/{NN}-websocket-reconnection/research/08-state-machine.md#complete-state-transition-table)
@research(.planning/phases/{NN}-websocket-reconnection/research/07-timer-safety.md#abortcontroller-pattern)
@engram(research:pattern-ws-reconnection-state-machine)
@engram(research:decision-bun-ws-close-code-reconnection-map)
```

**Executor loads before implementing:**

1. State transition table (14 transitions, from research file)
2. AbortController pattern (guaranteed cleanup, from research file)
3. State machine summary (6 states overview, from MuninnDB)
4. Close code map (reconnectable codes list, from MuninnDB)

**Executor implements with this context loaded**, producing `src/ws/reconnect-manager.ts` that:

- Implements all 14 state transitions from the research
- Uses AbortController per state as prescribed
- Maps close codes to reconnect/no-reconnect per the decision engram
- Guards WebSocket.send() during non-OPEN states (session finding)

**Commit:**

```
feat(ws): implement reconnection manager with state machine

Phase 08 Plan 01 Task 3
- 6-state machine with 14 transitions (IDLE, CONNECTING, OPEN, RECONNECTING, CLOSED, FAILED)
- AbortController cleanup on every state transition (no zombie timers)
- Close code map: 1006/1011-1014 = reconnect, 1000/1001 = no reconnect
- Send queue for messages during RECONNECTING state (deviation from plan)
@research: 08-state-machine.md, 07-timer-safety.md
```

**Handoff to Step 10**: Code is committed, SUMMARY.md files are written, VERIFICATION.md is created. The Verify + UAT step performs user acceptance testing and final code review.
