# Step 3: Discuss + Pre-mortem

## Purpose

The Discuss step transforms research findings into locked implementation decisions through interactive conversation with the user (or auto-mode AI research). It then runs a pre-mortem risk analysis to identify failure scenarios before any planning begins.

This step is the bridge between "what we know" (research) and "what we will do" (plan). Its output -- CONTEXT.md -- is a binding contract that all downstream agents treat as locked decisions. Without this step, planners and executors make their own assumptions, leading to implementations that technically work but do not match the user's intent.

## Inputs

| Input             | Source                                                   | Description                      |
| ----------------- | -------------------------------------------------------- | -------------------------------- |
| Research corpus   | `.planning/phases/{NN}-{name}/research/*.md` from Step 2 | All facet files and SUMMARY.md   |
| Structured intent | STATE.md from Step 1                                     | Scope boundary and complexity    |
| Project identity  | MuninnDB `brain:project-identity` (repo vault)           | Stack, conventions, architecture |
| Complexity        | STATE.md `Task Complexity:` field                        | Determines discussion depth      |

## Process

### 3.1 Vault resolution

```bash
REPO_VAULT=$(cat .planning/config.json 2>/dev/null | grep -o '"vault"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"')
if [ -z "$REPO_VAULT" ]; then
  REPO_VAULT=${LUCA_MUNINN_VAULT:-default}
fi
DEFAULT_VAULT="default"
```

### 3.2 Read research findings

The orchestrator loads all research files to inform gray area identification:

```bash
RESEARCH_DIR=".planning/phases/${PHASE_DIR}/research"
RESEARCH_SUMMARY=$(cat "$RESEARCH_DIR/SUMMARY.md")
RESEARCH_FILES=$(ls "$RESEARCH_DIR"/*.md)
```

### 3.3 Identify gray areas (research-informed)

Unlike v1, gray area identification is now **research-informed**. The orchestrator reads the research corpus and identifies decision points that the research surfaced but did not resolve.

For the WebSocket reconnection example:

| Gray Area           | Source                                                            | Why It Needs Discussion                                             |
| ------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| Heartbeat mechanism | Research found Bun WS does not fire `close` on network disconnect | User decides: ping/pong frequency, timeout threshold                |
| Reconnection UX     | Research identified state machine pattern                         | User decides: show loading state? toast notification? silent retry? |
| Connection sharing  | Not in research (emerged from analysis)                           | User decides: single global WS or per-feature connections?          |
| Backoff jitter      | Research recommends jitter but user specified exact delays        | User decides: strict delays (1,2,4,8) or jittered?                  |

### 3.4 Interactive mode (default)

**Discussion depth scales with complexity:**

| Complexity | Questions per area |
| ---------- | ------------------ |
| TRIVIAL    | 2                  |
| SIMPLE     | 2                  |
| MODERATE   | 4                  |
| COMPLEX    | 4-6                |
| CRITICAL   | 6+                 |

The orchestrator presents gray areas and the user selects which to discuss:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca > DISCUSSION: WebSocket Reconnection
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Research surfaced these decision points:

  [1] Heartbeat mechanism - How to detect network disconnects
      (Research: Bun WS 'close' does not fire on network failure)

  [2] Reconnection UX - What the user sees during reconnection
      (Research: State machine pattern identified, UX not specified)

  [3] Connection sharing - Single global WS or per-feature
      (Not in research scope -- architecture question)

  [4] Backoff jitter - Strict delays or randomized
      (Research recommends jitter; user spec says exact delays)

Which areas to discuss? [1,2,3,4 / all]:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

For each selected area, the orchestrator asks 4 probing questions (at MODERATE complexity), then offers "more questions or move to next?"

### 3.5 Auto mode (`--auto` flag)

When running autonomously, spawn `lu-discuss-researcher` per gray area:

```python
# For each gray area -- spawn in PARALLEL
Task(
  prompt="""
  <research_question>
  **Gray area:** Heartbeat mechanism
  **Context:** Bun WebSocket 'close' event does not fire on network-level disconnects.
  Need to decide: ping/pong frequency, timeout threshold, detection strategy.
  **Tech stack:** Bun 1.1+, TypeScript
  **Research reference:** .planning/phases/{NN}-{name}/research/02-implementation-approaches.md
  </research_question>
  Produce a cited recommendation with confidence level.
  """,
  subagent_type="lu-discuss-researcher",
  description="Auto-discuss: Heartbeat mechanism"
)
```

Results are presented for user override:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca > AUTO-DISCUSS RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| # | Gray Area           | Recommendation              | Confidence | Sources |
|---|--------------------|-----------------------------|------------|---------|
| 1 | Heartbeat mechanism | Ping every 30s, timeout 10s | HIGH       | 2 cited |
| 2 | Reconnection UX     | Toast + subtle indicator    | MEDIUM     | 1 cited |
| 3 | Connection sharing   | Single global connection    | MEDIUM     | 1 cited |
| 4 | Backoff jitter       | Add jitter (research agrees)| HIGH       | 2 cited |

Actions: [A] Accept all | [O] Override some | [D] Discuss instead
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 3.6 Write CONTEXT.md

After all decisions are locked, write CONTEXT.md:

**Location:** `.planning/phases/{NN}-websocket-reconnection/{NN}-CONTEXT.md`

```markdown
# Phase {N}: WebSocket Reconnection - Context

## Decisions

### Heartbeat mechanism [researched]

- Ping interval: 30 seconds
- Timeout threshold: 10 seconds (3 missed pings)
- Detection: Client-side ping; if no pong within timeout, treat as disconnect

### Reconnection UX [user-input]

- Show subtle connection indicator in header (green/yellow/red)
- Toast notification on disconnect: "Connection lost. Reconnecting..."
- Toast on reconnect: "Connected" (auto-dismiss after 3s)

### Connection sharing [user-input]

- Single global WebSocket connection shared across all features
- Multiplexing via message type field in JSON payload

### Backoff jitter [researched]

- Add random jitter (0-1s) to prevent thundering herd
- Formula: min(baseDelay \* 2^attempt + random(0, 1000), maxDelay)

## Claude's Discretion

- Internal state machine implementation details
- Error logging format and verbosity
- TypeScript type structure for WS messages

## Deferred Ideas

- Server-side WebSocket scaling (own phase)
- Message queuing during reconnection (future enhancement)
```

### 3.7 Declare appetite

After CONTEXT.md, the user sets the investment ceiling:

For MODERATE complexity, prompt the user:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Luca > APPETITE DECLARATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
| Level  | Token Ceiling | Context % | Best For                    |
|--------|--------------|-----------|------------------------------|
| Micro  | 25,000       | 30%       | Trivial fixes, typos         |
| Small  | 50,000       | 40%       | Simple features, small bugs  |
| Medium | 100,000      | 50%       | Standard features            |
| Large  | 200,000      | 60%       | Cross-cutting changes        |
| XL     | 400,000      | 70%       | Major refactors, new systems |

Choose appetite level [Micro/Small/Medium/Large/XL]:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

User chooses **Medium** (100k tokens, 50% context).

```bash
luca-bridge set-field --field=appetite_level --value="\"Medium\"" 2>/dev/null || true
luca-bridge set-field --field=appetite_token_ceiling --value=100000 2>/dev/null || true
luca-bridge set-field --field=appetite_context_percent --value=50 2>/dev/null || true
```

### 3.8 Pre-mortem risk analysis

**Gate check (fail-closed):**

```bash
if echo "$ARGS" | grep -q -- "--run-premortem"; then
  PREMORTEM_GATE="true"
else
  PREMORTEM_GATE="false"
fi
```

If gate is enabled, check self-tuning auto-skip:

```
mcp__muninn__muninn_recall(vault: "luca-framework", context: "metric:signal-rate-aggregate")
```

If signal rate is acceptable (>= 10% over 20+ runs), spawn `lu-premortem`:

```python
Task(
  prompt="""
  <premortem_context>
  **Phase objective:** Add WebSocket reconnection with exponential backoff
  **Complexity:** MODERATE
  **Decisions locked:** Heartbeat (30s ping), single global WS, jittered backoff
  **Appetite:** Medium (100k tokens)
  **Research:** .planning/phases/{NN}-{name}/research/SUMMARY.md
  </premortem_context>
  Generate a Tier 1 Risk Brief with exactly 3 domain-specific failure scenarios.
  """,
  subagent_type="lu-premortem",
  description="Pre-mortem risk analysis"
)
```

Present risk brief for developer approval (Approve / Reject / Modify).

If approved, write PREMORTEM.md to `.planning/phases/{NN}-websocket-reconnection/PREMORTEM.md`.

### 3.9 Store decisions in MuninnDB

```
mcp__muninn__muninn_remember(
  vault: "luca-framework",
  concept: "session:decisions",
  content: "Phase decisions locked: heartbeat 30s/10s timeout, single global WS, jittered backoff, toast UX on disconnect/reconnect. Appetite: Medium (100k tokens)."
)
```

## Outputs

| Output            | Location                                       | Description                                           |
| ----------------- | ---------------------------------------------- | ----------------------------------------------------- |
| CONTEXT.md        | `.planning/phases/{NN}-{name}/{NN}-CONTEXT.md` | Locked decisions, Claude's discretion, deferred ideas |
| PREMORTEM.md      | `.planning/phases/{NN}-{name}/PREMORTEM.md`    | Risk brief with 3 failure scenarios (if gate enabled) |
| Appetite          | STATE.md + bridge fields                       | Token ceiling and context percentage                  |
| Session decisions | MuninnDB `session:decisions` (repo vault)      | Condensed decisions for downstream recall             |

## Agents Involved

| Agent                   | Count                 | Role                           | Isolation                 | Model Tier (MODERATE)          |
| ----------------------- | --------------------- | ------------------------------ | ------------------------- | ------------------------------ |
| `lu-discuss-researcher` | 0-4 (auto mode only)  | Research individual gray areas | None                      | balanced (ORCHESTRATOR preset) |
| `lu-premortem`          | 0-1 (if gate enabled) | Generate failure scenarios     | Read-only codebase access | balanced (ORCHESTRATOR preset) |

## v1 Mapping

**v1 behavior**: `phase-discuss` identified gray areas through domain analysis, conducted interactive discussion, wrote CONTEXT.md, declared appetite, and optionally ran pre-mortem. Discussion was not informed by prior research.

**v2 changes**:

- Gray areas are now **research-informed** -- they reference specific findings from Step 2
- Discussion can reference research files directly ("Research found X, do you want Y or Z?")
- Auto mode researchers receive research context, making their recommendations more accurate
- CONTEXT.md includes provenance annotations (`[researched]`, `[user-input]`, `[user-override]`)
- Pre-mortem receives research findings, making failure scenarios more domain-specific

## Failure Modes

| Failure                                 | Cause                                        | Mitigation                                                                                     |
| --------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| User skips discussion                   | Wants to jump to planning                    | All gray areas get Claude's Discretion defaults (research-informed)                            |
| Auto mode produces wrong recommendation | Research was incomplete or misinterpreted    | User override option always available; non-researchable items flagged                          |
| Pre-mortem too generic                  | Failure scenarios not domain-specific        | lu-premortem receives research context; novelty enforcement disqualifies generic scenarios     |
| Scope creep during discussion           | User suggests new features                   | Scope guardrail: "That's its own phase. I'll note it for later." Deferred ideas captured.      |
| Decision contradicts research           | User decides against research recommendation | Allowed (user has final authority), but recorded as `[user-override]` for downstream awareness |

## Example

### PREMORTEM.md output for WebSocket reconnection

```markdown
# Pre-Mortem Risk Brief

**Phase:** WebSocket Reconnection
**Complexity:** MODERATE
**Generated:** 2026-03-22

## Scenario 1: Heartbeat False Positives Under Load

**The failure:** The 10-second pong timeout triggers during high server load,
causing unnecessary reconnections even though the connection is alive.

**Root cause:** Server under load delays pong response beyond 10s. Client
interprets this as disconnect and starts reconnection cycle.

**Mitigation:** Use adaptive timeout (increase threshold when server latency
is high) or separate heartbeat from application-level load.

**Detection:** Monitor reconnection frequency. Spike without actual outage
indicates false positive heartbeat timeouts.

## Scenario 2: Timer Leak on Rapid State Transitions

**The failure:** Rapid disconnect/reconnect cycles (e.g., flaky WiFi) create
zombie timers that fire out of order, corrupting connection state.

**Root cause:** State machine transitions do not clear pending timers from
previous states. Multiple setTimeout calls accumulate.

**Mitigation:** Single timer reference per state. On EVERY state transition,
clearTimeout(activeTimer) before setting new timer. Consider AbortController.

**Detection:** Log timer creation/cancellation. Any state with >1 active
timer is a bug.

## Scenario 3: Thundering Herd Despite Jitter

**The failure:** Server restart causes all clients to reconnect. Despite
per-client jitter, the jitter range (0-1s) is too narrow relative to
reconnection volume, overwhelming the server.

**Root cause:** Jitter of 0-1s with hundreds of clients means most reconnect
within a 1-second window. Server cannot handle the burst.

**Mitigation:** Scale jitter with attempt number (wider jitter on later
retries). Consider server-sent retry-after header support.

**Detection:** Server connection rate monitoring. Alert if connections/second
exceeds N during recovery.
```

**Handoff to Step 4**: CONTEXT.md (locked decisions) and PREMORTEM.md (risk constraints) are now available. The Deep Expand step will produce specialist deep-dives informed by these decisions and risk scenarios.
