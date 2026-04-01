# Step 6: Graduate to MuninnDB

## Purpose

The Graduate step distills the reviewer-approved research corpus into persistent MuninnDB engrams using the `research:*` namespace (Decision 4). This is the bridge between ephemeral file-based research and semantic memory that survives across sessions.

Graduation writes to `research:*` prefixes in the **repo vault**. These are research-stage engrams, NOT permanent `pattern:*`/`pitfall:*` engrams. Promotion to permanent namespaces happens later in Step 10 via `lu-learner`, after the research has been validated through actual execution.

This step is entirely NEW in v2. It exists because:

1. **Research is expensive**: Steps 2-5 invested significant tokens and time. Without graduation, all that knowledge is lost when the session ends or context is cleared.
2. **Per-task recall depends on it**: Step 9 (Execute) performs targeted MuninnDB recall before each task. Without graduated engrams, there is nothing to recall.
3. **Cross-session learning**: Future sessions working on related problems (e.g., "add WebSocket message queuing") will recall these engrams and skip redundant research.
4. **Deferred promotion**: Generic patterns only graduate to permanent `pattern:*`/`pitfall:*` in the default vault after execution validates them (Step 10).

## Inputs

| Input                     | Source                                                   | Description                              |
| ------------------------- | -------------------------------------------------------- | ---------------------------------------- |
| Reviewed research corpus  | `.planning/phases/{NN}-{name}/research/*.md` (all files) | Approved by Step 5 reviewers             |
| Research SUMMARY.md       | `.planning/phases/{NN}-{name}/research/SUMMARY.md`       | Synthesized findings with deep expansion |
| CONTEXT.md                | Step 3                                                   | Locked decisions                         |
| Review convergence record | MuninnDB `session:research-review`                       | Scores and quality confirmation          |
| Vault config              | `.planning/config.json`                                  | Repo vault name (`luca-framework`)       |

## Process

### 6.1 Vault resolution

```bash
REPO_VAULT=$(cat .planning/config.json 2>/dev/null | grep -o '"vault"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"')
DEFAULT_VAULT="default"
```

### 6.2 Classify research findings for graduation

The `lu-research-graduator` agent reads the entire research corpus and classifies each finding using the `research:*` namespace (Decision 4). **All graduation engrams go to the repo vault.** Promotion to permanent `pattern:*`/`pitfall:*`/`decision:*` in the default vault happens in Step 10 after execution validates them.

| Finding                                            | Engram Concept                                            | Vault            | Rationale               |
| -------------------------------------------------- | --------------------------------------------------------- | ---------------- | ----------------------- |
| Bun WS `close` does not fire on network disconnect | `research:pitfall-bun-ws-close-not-on-network-disconnect` | `luca-framework` | Research-stage pitfall  |
| State machine: 6 states, 14 transitions            | `research:pattern-ws-reconnection-state-machine`          | `luca-framework` | Research-stage pattern  |
| AbortController for timer cleanup                  | `research:pattern-abort-controller-timer-cleanup`         | `luca-framework` | Research-stage pattern  |
| Exponential backoff with jitter formula            | `research:pattern-exponential-backoff-jitter`             | `luca-framework` | Research-stage pattern  |
| Bun WS close code mapping (reconnectable vs not)   | `research:decision-bun-ws-close-code-reconnection-map`    | `luca-framework` | Research-stage decision |
| Heartbeat: 30s ping, adaptive EWMA timeout         | `research:decision-ws-heartbeat-config`                   | `luca-framework` | Research-stage decision |
| Single global WS with message type multiplexing    | `research:decision-ws-connection-sharing`                 | `luca-framework` | Research-stage decision |

### 6.3 Spawn lu-research-graduator

The dedicated `lu-research-graduator` agent (Decision 2 -- NOT `lu-learner`) performs graduation. `lu-learner` retains its existing role in Step 10 for post-verification learning and promotion.

The graduator uses a **weighted sum** scoring formula (Decision 5) to determine which findings meet the graduation threshold:

```
score = confidence * 0.40 + actionability * 0.35 + uniqueness * 0.25
threshold = 0.55
```

Actionability is scored by observable signals (Decision 6). See [`03-muninndb-integration/`](../03-muninndb-integration/) for the full scoring specification.

```python
Task(
  prompt="""
  <graduation_context>
  **Task:** Graduate reviewed research findings to MuninnDB research:* engrams.
  **Repo vault:** luca-framework

  **Research corpus summary:**
  {content of research/SUMMARY.md}

  **Classification table:**
  {classification from step 6.2}

  **Instructions:**
  1. Score each finding using: score = confidence * 0.40 + actionability * 0.35 + uniqueness * 0.25
  2. Graduate findings scoring >= 0.55
  3. Write ALL engrams to repo vault with research:* prefix
  4. Use muninn_remember_batch for efficiency
  5. Link related engrams (e.g., state machine pattern -> timer cleanup pattern)
  6. Do NOT graduate implementation details (code examples stay in files)
  7. Write GRADUATION-REPORT.md to research directory

  **Quality filter:**
  - Only graduate HIGH and MEDIUM confidence findings
  - LOW confidence findings remain in research files only
  - Do not graduate obvious/trivial information
  </graduation_context>
  """,
  subagent_type="lu-research-graduator",
  description="Graduate research to MuninnDB"
)
```

### 6.4 Execute batch graduation

The `lu-research-graduator` agent writes engrams using batch operations. Per Decision 4, **all graduation engrams use the `research:*` namespace and go to the repo vault**. Promotion to permanent `pattern:*`/`pitfall:*`/`decision:*` in the default vault happens in Step 10 via `lu-learner`, after execution validates the research.

```
mcp__muninn__muninn_remember_batch(
  vault: "luca-framework",
  memories: [
    {
      concept: "research:pitfall-bun-ws-close-not-on-network-disconnect",
      content: "Bun's WebSocket 'close' event does NOT fire on network-level disconnects (only on graceful close). Client-side heartbeat with ping/pong is required to detect network failures. Without heartbeat, client will believe connection is open when server has dropped it."
    },
    {
      concept: "research:pattern-ws-reconnection-state-machine",
      content: "WebSocket reconnection state machine: 6 states (IDLE, CONNECTING, OPEN, RECONNECTING, CLOSED, FAILED), 14 transitions. Key transitions: OPEN->RECONNECTING on unintentional close, RECONNECTING->CONNECTING on backoff timer, RECONNECTING->FAILED on max retries. Use TypeScript discriminated union for type-safe state. Each state owns an AbortController for cleanup."
    },
    {
      concept: "research:pattern-abort-controller-timer-cleanup",
      content: "Use AbortController per state to guarantee timer cleanup on state transitions. Pattern: each state owns a controller, abort on exit, register setTimeout cleanup on controller.signal 'abort' event. Prevents zombie timers on rapid disconnect/reconnect cycles."
    },
    {
      concept: "research:pattern-exponential-backoff-jitter",
      content: "Exponential backoff with jitter: delay = min(base * 2^attempt + random(0, jitterRange), maxDelay). Jitter prevents thundering herd on server restart. Scale jitter range with attempt number for wider distribution on later retries."
    },
    {
      concept: "research:decision-bun-ws-close-code-reconnection-map",
      content: "Bun WebSocket close codes: RECONNECTABLE (1006 abnormal, 1011 unexpected, 1012 service restart, 1013 try again, 1014 bad gateway). NOT RECONNECTABLE (1000 normal, 1001 going away intentionally). On reconnectable codes: enter RECONNECTING state. On non-reconnectable: enter CLOSED state."
    },
    {
      concept: "research:decision-ws-heartbeat-config",
      content: "WebSocket heartbeat: client-side ping every 30s, adaptive timeout using EWMA (alpha=0.2, initial=10s). If no pong within EWMA-computed timeout, treat as disconnect and enter RECONNECTING state. Adaptive timeout prevents false positives during server load spikes."
    },
    {
      concept: "research:decision-ws-connection-sharing",
      content: "Single global WebSocket connection shared across all features. Multiplexing via JSON message type field. No per-feature connections. Reconnection manager is a singleton."
    }
  ]
)
```

### 6.5 Link related engrams

After batch creation, link related engrams in the repo vault for graph traversal:

```
mcp__muninn__muninn_link(
  vault: "luca-framework",
  source_id: "research:pattern-ws-reconnection-state-machine",
  target_id: "research:pattern-abort-controller-timer-cleanup"
)

mcp__muninn__muninn_link(
  vault: "luca-framework",
  source_id: "research:pattern-ws-reconnection-state-machine",
  target_id: "research:pattern-exponential-backoff-jitter"
)

mcp__muninn__muninn_link(
  vault: "luca-framework",
  source_id: "research:pattern-ws-reconnection-state-machine",
  target_id: "research:pitfall-bun-ws-close-not-on-network-disconnect"
)

mcp__muninn__muninn_link(
  vault: "luca-framework",
  source_id: "research:pattern-ws-reconnection-state-machine",
  target_id: "research:decision-bun-ws-close-code-reconnection-map"
)

mcp__muninn__muninn_link(
  vault: "luca-framework",
  source_id: "research:pattern-ws-reconnection-state-machine",
  target_id: "research:decision-ws-heartbeat-config"
)
```

### 6.6 Record graduation in session

```
mcp__muninn__muninn_remember(
  vault: "luca-framework",
  concept: "session:graduation",
  content: "Research graduated: 7 research:* engrams to luca-framework vault (1 pitfall, 3 patterns, 3 decisions). 5 links created. LOW confidence findings NOT graduated (remain in research files). Promotion to permanent pattern:*/pitfall:*/decision:* deferred to Step 10."
)
```

### 6.7 Present graduation summary

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca > RESEARCH GRADUATED TO MUNINNDB
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Engrams created (all research:* in repo vault):
  research:pitfall-bun-ws-close-not-on-network-disconnect
  research:pattern-ws-reconnection-state-machine
  research:pattern-abort-controller-timer-cleanup
  research:pattern-exponential-backoff-jitter
  research:decision-bun-ws-close-code-reconnection-map
  research:decision-ws-heartbeat-config
  research:decision-ws-connection-sharing

Links: 5 (state machine -> timer cleanup, backoff, pitfall,
           close code map, heartbeat config)
Skipped: 2 LOW confidence findings (remain in research files only)

These research:* engrams will be recalled per-task during
execution (Step 9). Promotion to permanent pattern:*/pitfall:*
happens in Step 10 after execution validates them.

Proceed to Plan? [Y/n]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Outputs

| Output               | Location                                    | Description                                                    |
| -------------------- | ------------------------------------------- | -------------------------------------------------------------- |
| Research engrams     | MuninnDB repo vault (`research:pattern-*`)  | Research-stage patterns (promoted to `pattern:*` in Step 10)   |
| Research pitfalls    | MuninnDB repo vault (`research:pitfall-*`)  | Research-stage pitfalls (promoted to `pitfall:*` in Step 10)   |
| Research decisions   | MuninnDB repo vault (`research:decision-*`) | Research-stage decisions (promoted to `decision:*` in Step 10) |
| Engram links         | MuninnDB repo vault                         | Relationships between related research engrams                 |
| Graduation record    | MuninnDB `session:graduation` (repo vault)  | What was graduated, what was skipped                           |
| GRADUATION-REPORT.md | `.planning/phases/{NN}-{name}/research/`    | Human-readable graduation summary                              |

## Agents Involved

| Agent                   | Count | Role                                           | Isolation | Model Tier (MODERATE)          |
| ----------------------- | ----- | ---------------------------------------------- | --------- | ------------------------------ |
| `lu-research-graduator` | 1     | Classify findings, write engrams, create links | None      | balanced (ORCHESTRATOR preset) |

## v1 Mapping

**v1 behavior**: Learning capture happened only after execution (Step 10), not after research. Research findings were never persisted to MuninnDB. If a session ended after research but before execution, all research was lost.

**v2 changes**:

- Entirely new step
- Research findings graduate to MuninnDB `research:*` namespace in repo vault before planning begins
- Deferred promotion model: `research:*` engrams are promoted to permanent `pattern:*`/`pitfall:*`/`decision:*` in Step 10 after execution validates them
- Batch operations for efficiency
- Link creation for graph traversal
- Quality filter (only HIGH/MEDIUM confidence findings graduate)
- LOW confidence findings remain in files as reference but are not promoted to memory

## Failure Modes

| Failure              | Cause                                                        | Mitigation                                                                                       |
| -------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Duplicate engrams    | Same pattern already exists in MuninnDB from a prior session | lu-research-graduator checks for existing engrams before writing; deduplicates by concept prefix |
| Wrong vault routing  | Pattern stored in repo vault instead of default              | Vault routing rules enforced; vault-guard rule catches misroutes                                 |
| Over-graduation      | Too many trivial findings promoted to memory                 | Quality filter: only HIGH/MEDIUM confidence, only genuinely useful patterns                      |
| Under-graduation     | Important finding skipped                                    | Research files remain as backup; future sessions can re-graduate                                 |
| MuninnDB unavailable | MuninnDB server down or connection error                     | Graceful degradation: log warning, continue to planning. Research files are the backup.          |

## Example

### Graduated engram: `research:pattern-ws-reconnection-state-machine`

This engram, stored in the repo vault under the `research:*` namespace, is recalled during execution (Step 9) for per-task context loading:

```
mcp__muninn__muninn_recall(vault: "luca-framework", context: "WebSocket reconnection state management")

Result:
  concept: "research:pattern-ws-reconnection-state-machine"
  content: "WebSocket reconnection state machine: 6 states (IDLE, CONNECTING, OPEN,
  RECONNECTING, CLOSED, FAILED), 14 transitions. Key transitions: OPEN->RECONNECTING
  on unintentional close, RECONNECTING->CONNECTING on backoff timer, RECONNECTING->FAILED
  on max retries. Use TypeScript discriminated union for type-safe state. Each state
  owns an AbortController for cleanup."
  linked_to:
    - "research:pattern-abort-controller-timer-cleanup"
    - "research:pattern-exponential-backoff-jitter"
    - "research:pitfall-bun-ws-close-not-on-network-disconnect"
```

After execution validates these findings (Step 10), `lu-learner` may promote high-value `research:*` engrams to permanent `pattern:*`/`pitfall:*` in the default vault, making them available across all projects.

**Handoff to Step 7**: The planner now has access to both file-based research (`.planning/phases/{NN}-{name}/research/`) and MuninnDB `research:*` engrams. Plan tasks will include `@research` references to specific research files, and the executor will recall relevant engrams before implementing each task.
