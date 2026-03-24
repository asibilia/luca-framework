# Step 4: Deep Expand

## Purpose

The Deep Expand step takes the initial research corpus (Step 2) and the locked decisions (Step 3) and produces comprehensive, specialist-level deep-dives for each research facet. While Step 2 answers "What do we need to know?", Step 4 answers "What do we need to know _in detail_ given our locked decisions?"

This step is entirely NEW in v2. It exists because:

1. **Decisions constrain research scope**: After Step 3 locks "use Bun native WebSocket with heartbeat", a specialist can go much deeper into that specific API surface than the initial broad researcher could.
2. **Risk scenarios need investigation**: PREMORTEM.md identified specific failure modes (timer leaks, false heartbeat positives) that need targeted deep-dives.
3. **Implementation-grade research**: Step 2 produces planning-grade research ("use a state machine"). Step 4 produces implementation-grade research ("here is the exact Bun WebSocket close code mapping and when each fires").

## Inputs

| Input               | Source                                                         | Description                                       |
| ------------------- | -------------------------------------------------------------- | ------------------------------------------------- |
| Initial research    | `.planning/phases/{NN}-{name}/research/01-04-*.md` from Step 2 | Broad facet research files                        |
| CONTEXT.md          | Step 3                                                         | Locked decisions that constrain deep-dive scope   |
| PREMORTEM.md        | Step 3 (if exists)                                             | Risk scenarios that need targeted investigation   |
| Research SUMMARY.md | `.planning/phases/{NN}-{name}/research/SUMMARY.md`             | Gaps and contradictions identified by synthesizer |
| Complexity          | STATE.md                                                       | Determines number of specialist agents and depth  |

## Process

### 4.1 Identify deep-dive topics

The orchestrator reads the research corpus, CONTEXT.md, and PREMORTEM.md to identify topics that need specialist expansion. Topics come from three sources:

1. **LOW/MEDIUM confidence findings** from Step 2 that need verification
2. **Locked decisions** from CONTEXT.md that need implementation-grade detail
3. **Risk scenarios** from PREMORTEM.md that need mitigation research

For the WebSocket reconnection example:

| Deep-dive Topic            | Source                                         | Specialist Focus                                     |
| -------------------------- | ---------------------------------------------- | ---------------------------------------------------- |
| Bun WebSocket close codes  | LOW confidence finding in bun-websocket-api.md | Map every close code to reconnection behavior        |
| Heartbeat implementation   | CONTEXT.md decision + PREMORTEM scenario 1     | Exact ping/pong implementation with adaptive timeout |
| Timer safety patterns      | PREMORTEM scenario 2 (timer leak)              | AbortController patterns, cleanup guarantees         |
| Reconnection state machine | CONTEXT.md (Claude's Discretion)               | Complete state transition table with edge cases      |

### 4.2 File placement

Deep expansion files are numbered starting at `05` and placed in the **same** research directory as the initial research files (no `deep/` subdirectory). This follows the canonical phase-scoped, flat layout defined in [`02-research-system/research-file-structure.md`](../02-research-system/research-file-structure.md):

```
.planning/phases/{NN}-{name}/research/
├── 01-architecture-patterns.md     # Step 2 output
├── 02-implementation-approaches.md # Step 2 output
├── 03-existing-solutions.md        # Step 2 output
├── 04-pitfalls-and-risks.md        # Step 2 output
├── 05-bun-ws-close-codes.md        # Step 4 deep expansion
├── 06-heartbeat-implementation.md  # Step 4 deep expansion
├── 07-timer-safety.md              # Step 4 deep expansion
├── 08-state-machine.md             # Step 4 deep expansion
└── SUMMARY.md
```

### 4.3 Spawn specialist agents

Each deep-dive topic gets a specialist researcher agent. Unlike Step 2's broad researchers, these agents are given:

- The initial research for their facet (so they do not re-investigate settled questions)
- The locked decisions (so they do not explore alternatives)
- Specific risk scenarios to address (from PREMORTEM.md)

```python
# Spawn specialist agents in PARALLEL
RESEARCH_DIR = ".planning/phases/{NN}-websocket-reconnection/research"

Task(
  prompt="""
  <deep_dive_context>
  **Topic:** Bun WebSocket close codes
  **Initial research:** {content of research/02-implementation-approaches.md}
  **Locked decisions:** Bun native WebSocket, heartbeat 30s/10s timeout
  **Risk to address:** None specific -- LOW confidence finding needs verification

  **Deep-dive mandate:**
  1. Map EVERY WebSocket close code (1000-4999) to reconnection behavior
  2. Determine which codes mean "should reconnect" vs "should not reconnect"
  3. Identify Bun-specific close code behaviors (if different from spec)
  4. Provide code example for close code switch statement
  </deep_dive_context>
  Write findings to {RESEARCH_DIR}/05-bun-ws-close-codes.md
  """,
  subagent_type="lu-implementation-researcher",
  description="Deep: Bun WS close codes"
)

Task(
  prompt="""
  <deep_dive_context>
  **Topic:** Heartbeat implementation with adaptive timeout
  **Initial research:** {content of research/02-implementation-approaches.md}
  **Locked decisions:** Ping every 30s, timeout 10s, client-side ping
  **Risk to address:** PREMORTEM Scenario 1 (false positives under load)

  **Deep-dive mandate:**
  1. Exact Bun WebSocket ping/pong API (not the spec -- the Bun implementation)
  2. Adaptive timeout algorithm (increase threshold based on observed latency)
  3. Implementation pattern that avoids false positives during server GC pauses
  4. Code example with ping scheduling and pong timeout detection
  </deep_dive_context>
  Write findings to {RESEARCH_DIR}/06-heartbeat-implementation.md
  """,
  subagent_type="lu-implementation-researcher",
  description="Deep: Heartbeat implementation"
)

Task(
  prompt="""
  <deep_dive_context>
  **Topic:** Timer safety and cleanup patterns
  **Initial research:** {content of research/01-architecture-patterns.md}
  **Locked decisions:** Single global WS, jittered exponential backoff
  **Risk to address:** PREMORTEM Scenario 2 (zombie timers on rapid transitions)

  **Deep-dive mandate:**
  1. AbortController pattern for timer cancellation in Bun/TypeScript
  2. Guaranteed cleanup on state transitions (no orphaned timers)
  3. Race condition analysis: what happens if disconnect fires during reconnect attempt?
  4. Code example: safe timer management with single-reference pattern
  </deep_dive_context>
  Write findings to {RESEARCH_DIR}/07-timer-safety.md
  """,
  subagent_type="lu-risk-researcher",
  description="Deep: Timer safety"
)

Task(
  prompt="""
  <deep_dive_context>
  **Topic:** Complete reconnection state machine
  **Initial research:** {content of research/01-architecture-patterns.md}
  **Locked decisions:** Single global WS, heartbeat detection, jittered backoff, 10 max retries
  **Risk to address:** All PREMORTEM scenarios (state machine must handle all edge cases)

  **Deep-dive mandate:**
  1. Complete state transition table (every state x every possible event)
  2. Edge cases: disconnect during connecting, reconnect during intentional close
  3. Integration with heartbeat mechanism (heartbeat timeout triggers reconnect)
  4. TypeScript discriminated union type for connection states
  5. Code example: full state machine implementation
  </deep_dive_context>
  Write findings to {RESEARCH_DIR}/08-state-machine.md
  """,
  subagent_type="lu-architecture-researcher",
  description="Deep: State machine"
)
```

### 4.4 Collect specialist outputs

When all specialists return, validate that each deep-dive file:

1. **Addresses its mandate** (all numbered items answered)
2. **References the initial research** (builds on, not duplicates)
3. **Addresses assigned risk scenarios** (PREMORTEM items covered)
4. **Includes code examples** (implementation-grade, not pseudocode)

### 4.5 Update research summary

Append deep expansion findings to `.planning/phases/{NN}-{name}/research/SUMMARY.md`:

```markdown
## Deep Expansion Results

| Topic         | File                           | Confidence | Key Finding                                                  |
| ------------- | ------------------------------ | ---------- | ------------------------------------------------------------ |
| Close codes   | 05-bun-ws-close-codes.md       | HIGH       | Codes 1000, 1001 = no reconnect; 1006, 1011-1014 = reconnect |
| Heartbeat     | 06-heartbeat-implementation.md | HIGH       | Use Bun.serve websocket.ping(); adaptive timeout via EWMA    |
| Timer safety  | 07-timer-safety.md             | HIGH       | AbortController per state; abort on every transition         |
| State machine | 08-state-machine.md            | HIGH       | 6 states, 14 transitions; TypeScript discriminated union     |
```

### 4.6 Commit deep expansion

```bash
git add .planning/phases/{NN}-websocket-reconnection/research/05-*.md .planning/phases/{NN}-websocket-reconnection/research/06-*.md .planning/phases/{NN}-websocket-reconnection/research/07-*.md .planning/phases/{NN}-websocket-reconnection/research/08-*.md
git commit -m "docs(research): deep expansion for WebSocket reconnection

Deep-dives: close codes, heartbeat, timer safety, state machine
Risk scenarios from PREMORTEM.md addressed in each deep-dive"
```

## Outputs

| Output          | Location                                      | Description                   |
| --------------- | --------------------------------------------- | ----------------------------- |
| Deep-dive files | `.planning/phases/{NN}-{name}/research/05-{topic}.md`+ | Numbered files starting at 05, same directory as initial research |
| Updated summary | `.planning/phases/{NN}-{name}/research/SUMMARY.md` (appended) | Deep expansion results table |
| Git commit      | `docs(research): deep expansion for {intent}` | Deep-dive files committed     |

## Agents Involved

Specialist agents are chosen from the same 4 researcher agent types used in Step 2, routed to the most relevant researcher for each deep-dive topic. See [`04-agent-orchestration/`](../04-agent-orchestration/) for full agent specifications.

| Agent                        | Count                         | Role                                      | Isolation                      | Model Tier (MODERATE)      |
| ---------------------------- | ----------------------------- | ----------------------------------------- | ------------------------------ | -------------------------- |
| `lu-{specialty}-researcher`  | 3-5 (one per deep-dive topic) | Specialist deep-dive on constrained topic | **Cold** (parallel isolation)  | balanced (ROUTER preset)   |

**Topic count scales with complexity:**

| Complexity | Deep-dive Topics | Rationale                                          |
| ---------- | ---------------- | -------------------------------------------------- |
| TRIVIAL    | 1                | Minimal deep-dive with `fast` tier (step still runs) |
| SIMPLE     | 1-2              | Only LOW confidence items                          |
| MODERATE   | 3-4              | Decisions + risks                                  |
| COMPLEX    | 4-6              | Comprehensive deep-dives                           |
| CRITICAL   | 5-8              | Exhaustive specialist investigation                |

## v1 Mapping

**v1 behavior**: This step did not exist. Research was a single pass -- whatever `lu-phase-researcher` produced was accepted as-is and fed directly to the planner.

**v2 changes**:

- Entirely new step
- Decision-constrained research (deep-dives only explore the locked path)
- Risk-driven investigation (PREMORTEM scenarios are explicit research targets)
- Implementation-grade output (code examples, not just recommendations)
- Builds on initial research (specialists receive the broad findings, go deeper)

## Failure Modes

| Failure                                       | Cause                                                | Mitigation                                                                |
| --------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------- |
| Specialist contradicts initial research       | Deep-dive reveals initial finding was wrong          | Step 5 (Review Research) catches contradictions across the corpus         |
| Deep-dive too broad                           | Specialist re-investigates already-settled questions | Mandate is scoped: numbered items that must be answered                   |
| PREMORTEM scenario not addressed              | Specialist ignores assigned risk                     | Validation check in 4.4 verifies risk coverage                            |
| Specialist cannot find implementation details | Bun API undocumented for edge case                   | Flag as LOW confidence; planner will note as uncertainty in plan          |
| Too many deep-dive topics                     | CRITICAL complexity generates 8+ topics              | Cap at 8 topics; combine related topics into single specialist assignment |

## Example

### Deep-dive output: Timer Safety

**File: `.planning/phases/{NN}-websocket-reconnection/research/07-timer-safety.md`**

````markdown
# Timer Safety Patterns - Deep Dive

**Topic:** Timer safety and cleanup patterns for WebSocket reconnection
**Risk addressed:** PREMORTEM Scenario 2 (zombie timers on rapid state transitions)
**Confidence:** HIGH

## AbortController Pattern

The recommended pattern uses AbortController to guarantee timer cleanup on state
transitions. Each state owns an AbortController that is aborted when leaving the state.

```typescript
type ConnectionState = {
  name: "idle" | "connecting" | "open" | "reconnecting" | "closed" | "failed";
  controller: AbortController;
};

const transition = (
  from: ConnectionState,
  toName: ConnectionState["name"],
): ConnectionState => {
  // Abort all pending timers/operations in the previous state
  from.controller.abort();

  // New state gets a fresh controller
  return {
    name: toName,
    controller: new AbortController(),
  };
};

const scheduleReconnect = (state: ConnectionState, delayMs: number): void => {
  const timer = setTimeout(() => {
    if (!state.controller.signal.aborted) {
      attemptConnect();
    }
  }, delayMs);

  // Clean up timer if state changes before it fires
  state.controller.signal.addEventListener("abort", () => clearTimeout(timer));
};
```
````

## Race Condition Analysis

**Scenario:** Disconnect fires during active reconnect attempt.

1. State is RECONNECTING, timer is pending
2. User calls `disconnect()` (intentional close)
3. Timer fires after disconnect -- should NOT attempt reconnect

**Solution:** AbortController pattern handles this. When `disconnect()` transitions
to CLOSED, it aborts the RECONNECTING controller. The timer's abort listener
fires clearTimeout, and the setTimeout callback checks `signal.aborted`.

## Guarantee: No Orphaned Timers

With this pattern, it is **impossible** to have orphaned timers because:

1. Every timer is registered on the current state's AbortController
2. Every state transition aborts the previous state's controller
3. setTimeout callbacks check `signal.aborted` before acting

```

**Handoff to Step 5**: The complete research corpus (initial + deep expansion) is now ready for independent review by fresh reviewer agents.
```
