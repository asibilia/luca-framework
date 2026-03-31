# Step 7: Plan

## Purpose

The Plan step creates granular, bite-sized execution plans (PLAN.md files) that reference the research corpus and graduated MuninnDB engrams. Unlike v1's planning, which operated on best-effort knowledge, v2 plans are built on reviewer-approved research with explicit `@research` references that tie each task back to the evidence that informed it.

The planner produces PLAN.md files with:

- YAML frontmatter (phase, plan ID, wave, dependencies, `must_haves`)
- Tasks with files, actions, verification criteria, and done conditions
- `@research` annotations linking tasks to specific research findings
- `@engram` annotations linking tasks to graduated MuninnDB concepts

## Inputs

| Input               | Source                                                      | Description                        |
| ------------------- | ----------------------------------------------------------- | ---------------------------------- |
| Research corpus     | `.planning/phases/{NN}-{name}/research/*.md` from Steps 2-5 | Reviewer-approved research         |
| CONTEXT.md          | Step 3                                                      | Locked decisions                   |
| PREMORTEM.md        | Step 3 (if exists)                                          | Risk scenarios to mitigate in plan |
| Graduated engrams   | MuninnDB (recalled)                                         | Patterns, pitfalls, decisions      |
| ROADMAP.md          | Project state                                               | Phase goal and requirements        |
| STATE.md            | Project state                                               | Complexity, appetite               |
| Recalled procedures | MuninnDB `procedure:*`                                      | Past successful task sequences     |

## Process

### 7.1 Cognitive pre-flight

Before planning, run cognitive pre-flight to load MuninnDB context:

1. **Recall project identity:**

   ```
   mcp__muninn__muninn_recall_tree(vault: "luca-framework", id: "brain:project-identity")
   ```

2. **Recall graduated research engrams:**

   ```
   mcp__muninn__muninn_recall(vault: "luca-framework", context: "WebSocket reconnection patterns decisions pitfalls")
   mcp__muninn__muninn_recall(vault: "default", context: "WebSocket reconnection patterns decisions pitfalls")
   ```

3. **Recall relevant procedures:**

   ```
   mcp__muninn__muninn_recall(vault: "default", context: "procedures for implementing WebSocket features")
   ```

4. **Initialize session:**
   ```
   mcp__muninn__muninn_remember(
     vault: "luca-framework",
     concept: "session:info",
     content: "workflow=phase-plan, phase=N, started=2026-03-22T10:00:00Z"
   )
   ```

### 7.2 Load all context files

```bash
ROADMAP_CONTENT=$(cat .planning/ROADMAP.md)
STATE_CONTENT=$(cat .planning/STATE.md)
REQUIREMENTS_CONTENT=$(cat .planning/REQUIREMENTS.md 2>/dev/null || echo "No requirements file")
CONTEXT_CONTENT=$(cat .planning/phases/${PHASE_DIR}/*-CONTEXT.md 2>/dev/null || echo "No context file")
PREMORTEM_CONTENT=$(cat .planning/phases/${PHASE_DIR}/PREMORTEM.md 2>/dev/null || echo "No pre-mortem")
RESEARCH_SUMMARY=$(cat .planning/phases/${PHASE_DIR}/research/SUMMARY.md)
```

### 7.3 Spawn lu-planner agent

```python
Task(
  prompt="""
  <planning_context>
  **Phase:** {phase_number} - WebSocket Reconnection
  **Complexity:** MODERATE
  **Appetite:** Medium (100k tokens, 50% context)
  **Phase Directory:** .planning/phases/{NN}-websocket-reconnection

  **Roadmap:** {roadmap_content}
  **Requirements:** {requirements_content}
  **Locked decisions (CONTEXT.md):** {context_content}
  **Risk scenarios (PREMORTEM.md):** {premortem_content}
  **Research summary:** {research_summary}

  **Graduated MuninnDB engrams (research:* namespace, repo vault):**
  - research:pattern-ws-reconnection-state-machine (6 states, 14 transitions)
  - research:pattern-abort-controller-timer-cleanup (AbortController per state)
  - research:pattern-exponential-backoff-jitter (delay formula with jitter)
  - research:pitfall-bun-ws-close-not-on-network-disconnect (heartbeat required)
  - research:decision-bun-ws-close-code-reconnection-map (reconnectable codes)
  - research:decision-ws-heartbeat-config (30s ping, EWMA timeout)
  - research:decision-ws-connection-sharing (single global, multiplexed)

  **Working Memory:** {memory_context_block}
  </planning_context>

  <research_reference_requirement>
  CRITICAL: Every task MUST include @research annotations linking to the specific
  research file and section that informed the task. Format:
    @research(.planning/phases/{NN}-{name}/research/08-state-machine.md#state-transitions)
    @engram(research:pattern-ws-reconnection-state-machine)

  This allows the executor to load targeted context before implementing each task.
  </research_reference_requirement>

  <downstream_consumer>
  Output consumed by /phase-execute. Plans must be executable prompts with:
  - YAML frontmatter (id, title, wave, tasks, must_haves)
  - @research refs per task
  - Clear task descriptions with goals
  - Verification criteria for each task
  - Dependencies between tasks
  - Mitigation tasks for PREMORTEM scenarios
  </downstream_consumer>

  Create PLAN.md files for this phase.
  """,
  subagent_type="lu-planner",
  description="Plan Phase {phase_number}"
)
```

### 7.4 Planner output

The planner creates PLAN.md files in the phase directory. For the WebSocket example:

**File: `.planning/phases/{NN}-websocket-reconnection/{NN}-01-PLAN.md`**

```yaml
---
phase: {NN}
plan: 01
title: "WebSocket Reconnection Core"
wave: 1
depends_on: []
files_modified: 4
autonomous: true
must_haves:
  truths:
    - "WebSocket connection state machine transitions correctly between all 6 states"
    - "Exponential backoff with jitter activates on unintentional disconnection"
    - "Max retry limit (10) causes transition to FAILED state"
  artifacts:
    - path: "src/ws/connection-state.ts"
      provides: "ConnectionState discriminated union type and transition function"
      min_lines: 60
    - path: "src/ws/reconnect-manager.ts"
      provides: "Reconnection manager with backoff and state machine"
      min_lines: 120
  key_links:
    - from: "src/ws/reconnect-manager.ts"
      to: "src/ws/connection-state.ts"
      via: "imports ConnectionState type and transition function"
---

# Plan 01: WebSocket Reconnection Core

## Objective
Implement the core reconnection state machine and exponential backoff logic.

<task type="auto">
  <name>Task 1: Connection state type system</name>
  <files>src/ws/connection-state.ts</files>
  <action>
  Create TypeScript discriminated union for connection states with AbortController per state.
  @research(.planning/phases/{NN}-websocket-reconnection/research/08-state-machine.md#typescript-discriminated-union)
  @engram(research:pattern-ws-reconnection-state-machine)
  @engram(research:pattern-abort-controller-timer-cleanup)

  States: IDLE, CONNECTING, OPEN, RECONNECTING, CLOSED, FAILED
  Each state carries its own AbortController for timer cleanup.
  Export transition function that aborts previous controller on every transition.
  </action>
  <verify>bunx --bun tsc --noEmit src/ws/connection-state.ts</verify>
  <done>All 6 states defined, transition function aborts previous controller, types compile</done>
</task>

<task type="auto">
  <name>Task 2: Exponential backoff calculator</name>
  <files>src/ws/backoff.ts</files>
  <action>
  Implement exponential backoff with jitter.
  @research(.planning/phases/{NN}-websocket-reconnection/research/01-architecture-patterns.md#exponential-backoff-with-jitter)
  @engram(research:pattern-exponential-backoff-jitter)

  Formula: delay = min(1000 * 2^attempt + random(0, 1000), 30000)
  Base: 1000ms, Cap: 30000ms, Max attempts: 10
  Export: calculateBackoff(attempt: number): number
  </action>
  <verify>bunx --bun tsc --noEmit src/ws/backoff.ts</verify>
  <done>Backoff function returns correct delays for attempts 0-10, capped at 30s</done>
</task>

<task type="auto">
  <name>Task 3: Reconnection manager</name>
  <files>src/ws/reconnect-manager.ts</files>
  <action>
  Implement reconnection manager using state machine and backoff.
  @research(.planning/phases/{NN}-websocket-reconnection/research/08-state-machine.md#complete-state-transition-table)
  @research(.planning/phases/{NN}-websocket-reconnection/research/07-timer-safety.md#abortcontroller-pattern)
  @engram(research:pattern-ws-reconnection-state-machine)
  @engram(research:decision-bun-ws-close-code-reconnection-map)

  - Import ConnectionState from connection-state.ts
  - Import calculateBackoff from backoff.ts
  - Implement connect(), disconnect(), onClose(), onOpen() methods
  - Use close code map to determine reconnectable vs non-reconnectable
  - Schedule reconnect via setTimeout with AbortController cleanup
  - Emit state change events for UI consumption
  </action>
  <verify>bunx --bun tsc --noEmit src/ws/reconnect-manager.ts</verify>
  <done>Manager transitions through all states correctly, timers cleaned up on transitions</done>
</task>
```

### 7.5 Handle planner return

If planner returns PLANNING COMPLETE, proceed to Step 8. If CHECKPOINT REACHED, present to user. If PLANNING INCONCLUSIVE, offer options.

## Outputs

| Output        | Location                                         | Description                          |
| ------------- | ------------------------------------------------ | ------------------------------------ |
| PLAN.md files | `.planning/phases/{NN}-{name}/{NN}-{PP}-PLAN.md` | Executable plans with @research refs |
| Session info  | MuninnDB `session:info` (repo vault)             | Planning session metadata            |
| Git commit    | `docs(plan): plan phase {N}`                     | Plan files committed                 |

## Agents Involved

| Agent        | Count | Role                                                   | Isolation | Model Tier (MODERATE)          |
| ------------ | ----- | ------------------------------------------------------ | --------- | ------------------------------ |
| `lu-planner` | 1     | Create PLAN.md files with tasks, waves, @research refs | None      | balanced (ORCHESTRATOR preset) |

## v1 Mapping

**v1 behavior**: `phase-plan` spawned `lu-planner` with ROADMAP, STATE, REQUIREMENTS, CONTEXT, and optionally RESEARCH.md. The planner created PLAN.md files without research references. Tasks did not link back to research findings.

**v2 changes**:

- Plans include `@research` annotations per task (linking to specific research file and section)
- Plans include `@engram` annotations per task (linking to graduated MuninnDB concepts)
- Planner receives graduated MuninnDB engrams as explicit context
- PREMORTEM risk scenarios are addressed in plan tasks (mitigation is planned, not reactive)
- Research corpus (initial + deep expansion) is available as planning input
- Plans reference specific research findings, enabling per-task recall during execution

## Failure Modes

| Failure                               | Cause                                         | Mitigation                                                                |
| ------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------- |
| Planner ignores research              | Creates tasks without @research annotations   | Step 8 reviewers check for research coverage                              |
| Plans too large                       | 5+ tasks per plan, quality will degrade       | Step 8 reviewers catch scope violations, split plans                      |
| PREMORTEM scenario not mitigated      | Risk identified but no plan task addresses it | Step 8 reviewers verify risk coverage against PREMORTEM.md                |
| @research ref points to wrong section | Planner misattributes a finding               | Step 8 reviewers cross-reference annotations with actual research content |
| Plans do not cover all requirements   | Missing requirement from roadmap              | Step 8 reviewers perform requirement coverage check                       |

## Example

### Plan structure for WebSocket reconnection

```
.planning/phases/08-websocket-reconnection/
  08-CONTEXT.md          (from Step 3)
  PREMORTEM.md           (from Step 3)
  08-01-PLAN.md          (Wave 1: Core state machine + backoff)
  08-02-PLAN.md          (Wave 1: Heartbeat mechanism)
  08-03-PLAN.md          (Wave 2: Integration with server + UX, depends on 01, 02)
```

- **Plan 01** (Wave 1): Connection state machine, backoff calculator, reconnection manager
- **Plan 02** (Wave 1, parallel with 01): Heartbeat ping/pong with adaptive EWMA timeout
- **Plan 03** (Wave 2, depends on 01 + 02): Server integration, UI indicators, toast notifications

Each task in each plan carries `@research` and `@engram` annotations that the executor uses for targeted context loading in Step 9.

**Handoff to Step 8**: The PLAN.md files are now ready for independent review by fresh reviewer agents.
