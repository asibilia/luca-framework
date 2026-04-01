# Step 2: Research

## Purpose

The Research step produces comprehensive, multi-facet ecosystem knowledge that informs all downstream decisions. Unlike v1's single-researcher model, v2 spawns **4 specialized researcher agents** in parallel -- each investigating a different facet of the problem -- and synthesizes their outputs into a structured research corpus.

This step answers: "What do we need to know before we can make good decisions and good plans?" The research output is not consumed once and discarded -- it persists as a phase-scoped `.planning/phases/{NN}-{name}/research/` directory that later steps reference, and its key findings eventually graduate to MuninnDB (Step 6).

## Inputs

| Input                     | Source                      | Description                                     |
| ------------------------- | --------------------------- | ----------------------------------------------- |
| Structured intent         | STATE.md from Step 1        | What the user wants, with scope boundary        |
| Cognitive report          | lu-cognition from Step 1    | Project identity, prior art, intuition flags    |
| Complexity classification | STATE.md from Step 1        | Determines research depth and agent model tiers |
| Project files             | ROADMAP.md, REQUIREMENTS.md | Phase goal and project requirements             |
| CONTEXT.md (if exists)    | Prior `/phase-discuss` run  | Locked decisions that constrain research scope  |

## Process

### 2.1 Determine research facets

The orchestrator analyzes the structured intent and decomposes it into research facets. Each facet represents a distinct knowledge domain that needs investigation.

For the WebSocket reconnection example, the facets are:

| Facet                   | Research Question                                                             | Agent Focus                                     |
| ----------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------- |
| `bun-websocket-api`     | How does Bun's native WebSocket API handle connections, closures, and errors? | API surface, lifecycle events, gotchas          |
| `reconnection-patterns` | What are the standard patterns for WebSocket reconnection with backoff?       | State machines, timer management, jitter        |
| `error-handling`        | What network error scenarios must be handled, and how?                        | Partial disconnects, DNS failures, TLS errors   |
| `testing-strategy`      | How do you test WebSocket reconnection logic?                                 | Mock servers, timer manipulation, chaos testing |

**Facet count scales with complexity:**

| Complexity | Facets | Rationale                         |
| ---------- | ------ | --------------------------------- |
| TRIVIAL    | 1      | Single focused investigation      |
| SIMPLE     | 2      | Primary + supporting              |
| MODERATE   | 3-4    | Multi-facet problem decomposition |
| COMPLEX    | 4-6    | Comprehensive domain coverage     |
| CRITICAL   | 5-8    | Exhaustive investigation          |

### 2.2 Create research directory

```bash
mkdir -p .planning/phases/{NN}-websocket-reconnection/research
```

### 2.3 Spawn parallel researcher agents

Each facet gets a specialized researcher agent, spawned in parallel with **cold isolation** (no access to each other's outputs during investigation). The 4 canonical researcher agents are defined in [`04-agent-orchestration/`](../04-agent-orchestration/):

| Agent                          | Facet Focus                             | Routing Preset |
| ------------------------------ | --------------------------------------- | -------------- |
| `lu-architecture-researcher`   | Architecture patterns, state machines   | ROUTER         |
| `lu-implementation-researcher` | API surfaces, code patterns             | ROUTER         |
| `lu-ecosystem-researcher`      | Libraries, community knowledge, testing | ROUTER         |
| `lu-risk-researcher`           | Error scenarios, edge cases, pitfalls   | ROUTER         |

Research files use **numbered filenames** (Decision 12) and are written to the phase-scoped research directory:

```python
# Spawn ALL researchers in PARALLEL (cold isolation)
Task(
  prompt="""
  <research_context>
  **Facet:** Architecture patterns
  **Question:** What are the standard patterns for WebSocket reconnection with exponential backoff?
  **Constraints:** Must work with Bun's native WebSocket. Backoff: 1s base, 30s cap, 10 max retries.
  **Project stack:** Bun 1.1+, TypeScript
  </research_context>
  Research this facet and write findings to .planning/phases/{NN}-websocket-reconnection/research/01-architecture-patterns.md
  """,
  subagent_type="lu-architecture-researcher",
  description="Research: Architecture patterns"
)

Task(
  prompt="""
  <research_context>
  **Facet:** Implementation approaches
  **Question:** How does Bun's native WebSocket API handle connections, closures, and errors?
  **Scope constraint:** Bun built-in WebSocket only (decision:ws-native). Do NOT research ws, socket.io, or other libraries.
  **Project stack:** Bun 1.1+, TypeScript
  </research_context>
  Research this facet and write findings to .planning/phases/{NN}-websocket-reconnection/research/02-implementation-approaches.md
  """,
  subagent_type="lu-implementation-researcher",
  description="Research: Implementation approaches"
)

Task(
  prompt="""
  <research_context>
  **Facet:** Existing solutions and testing
  **Question:** How do you test WebSocket reconnection logic effectively?
  **Constraints:** Bun test runner, no Jest/Vitest. Timer mocking with Bun APIs.
  **Project stack:** Bun 1.1+, TypeScript, bun:test
  </research_context>
  Research this facet and write findings to .planning/phases/{NN}-websocket-reconnection/research/03-existing-solutions.md
  """,
  subagent_type="lu-ecosystem-researcher",
  description="Research: Existing solutions"
)

Task(
  prompt="""
  <research_context>
  **Facet:** Pitfalls and risks
  **Question:** What network error scenarios must be handled for WebSocket reconnection?
  **Constraints:** Focus on client-side errors. Bun runtime context.
  **Project stack:** Bun 1.1+, TypeScript
  </research_context>
  Research this facet and write findings to .planning/phases/{NN}-websocket-reconnection/research/04-pitfalls-and-risks.md
  """,
  subagent_type="lu-risk-researcher",
  description="Research: Pitfalls and risks"
)
```

Each researcher follows the tool strategy hierarchy:

1. **Context7** first -- resolve Bun library, query WebSocket docs. (Context7 is an MCP tool that provides library-specific documentation lookups; see the MCP tool configuration for setup details.)
2. **Official docs** via WebFetch -- Bun.sh documentation
3. **WebSearch** with year -- ecosystem patterns, community knowledge
4. **Verification** -- cross-reference all findings

### 2.4 Collect and validate researcher outputs

When all parallel researchers return, the orchestrator:

1. **Validates each output file exists** in `.planning/phases/{NN}-{name}/research/`
2. **Checks confidence levels** -- any LOW confidence findings are flagged
3. **Identifies contradictions** across facets (e.g., one researcher says "use close code 1000" while another says "use 1001")

### 2.5 Spawn research synthesizer

After all facet files are written, spawn `lu-research-synthesizer` to create a unified summary:

```python
Task(
  prompt="""
  <synthesis_context>
  **Research files:**
  - .planning/phases/{NN}-websocket-reconnection/research/01-architecture-patterns.md
  - .planning/phases/{NN}-websocket-reconnection/research/02-implementation-approaches.md
  - .planning/phases/{NN}-websocket-reconnection/research/03-existing-solutions.md
  - .planning/phases/{NN}-websocket-reconnection/research/04-pitfalls-and-risks.md

  **Original intent:** WebSocket reconnection with exponential backoff for Bun server

  Synthesize these research files into .planning/phases/{NN}-websocket-reconnection/research/SUMMARY.md.
  Identify cross-facet patterns, contradictions, and key decisions.
  </synthesis_context>
  """,
  subagent_type="lu-research-synthesizer",
  description="Synthesize research"
)
```

### 2.6 Write session context to MuninnDB

```
mcp__muninn__muninn_remember(
  vault: "luca-framework",
  concept: "session:research-summary",
  content: "Research complete for WebSocket reconnection. 4 facets investigated: bun-websocket-api (HIGH confidence), reconnection-patterns (HIGH), error-handling (MEDIUM), testing-strategy (MEDIUM). Key finding: Bun WebSocket close event does not fire on network disconnect -- must use heartbeat mechanism."
)
```

### 2.7 Present research summary to user

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca > RESEARCH COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

4 facets researched | 2 HIGH confidence | 2 MEDIUM confidence

Key findings:
  1. Bun's WebSocket.close event does NOT fire on network disconnect
     -- must implement heartbeat/ping mechanism for detection
  2. Standard reconnection pattern: state machine (CONNECTING, OPEN,
     CLOSING, CLOSED, RECONNECTING) with timer-based backoff
  3. Exponential backoff with jitter recommended to prevent thundering herd
  4. Bun test runner supports timer mocking via Bun.sleep override

Research files:
  .planning/phases/{NN}-websocket-reconnection/research/01-architecture-patterns.md
  .planning/phases/{NN}-websocket-reconnection/research/02-implementation-approaches.md
  .planning/phases/{NN}-websocket-reconnection/research/03-existing-solutions.md
  .planning/phases/{NN}-websocket-reconnection/research/04-pitfalls-and-risks.md
  .planning/phases/{NN}-websocket-reconnection/research/SUMMARY.md

Proceed to Discuss? [Y/n]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Outputs

| Output               | Location                                                          | Description                                                         |
| -------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| Facet research files | `.planning/phases/{NN}-{name}/research/01-*.md` through `04-*.md` | One numbered file per researcher with findings, confidence, sources |
| Research summary     | `.planning/phases/{NN}-{name}/research/SUMMARY.md`                | Cross-facet synthesis, contradictions, key decisions                |
| Session context      | MuninnDB `session:research-summary` (repo vault)                  | Condensed findings for recall                                       |
| Git commit           | `docs(research): investigate {intent}`                            | Research files committed to branch                                  |

## Agents Involved

| Agent                          | Count | Role                                     | Isolation                          | Model Tier (MODERATE)          |
| ------------------------------ | ----- | ---------------------------------------- | ---------------------------------- | ------------------------------ |
| `lu-architecture-researcher`   | 1     | Architecture patterns and state machines | **Cold** (parallel, no cross-read) | balanced (ROUTER preset)       |
| `lu-implementation-researcher` | 1     | API surfaces and code patterns           | **Cold** (parallel, no cross-read) | balanced (ROUTER preset)       |
| `lu-ecosystem-researcher`      | 1     | Libraries, testing, community knowledge  | **Cold** (parallel, no cross-read) | balanced (ROUTER preset)       |
| `lu-risk-researcher`           | 1     | Error scenarios, edge cases, pitfalls    | **Cold** (parallel, no cross-read) | balanced (ROUTER preset)       |
| `lu-research-synthesizer`      | 1     | Merge facet outputs into unified summary | None                               | balanced (ORCHESTRATOR preset) |

## v1 Mapping

**v1 behavior**: The `phase-research` skill spawned a single `lu-phase-researcher` agent that produced one RESEARCH.md file covering all aspects of the phase. Research was optional (could be skipped with `--skip-research`).

**v2 changes**:

- 4 specialized parallel researchers (`lu-architecture-researcher`, `lu-implementation-researcher`, `lu-ecosystem-researcher`, `lu-risk-researcher`) instead of a single monolithic `lu-phase-researcher`
- Research files are organized in a phase-scoped `.planning/phases/{NN}-{name}/research/` directory with numbered filenames
- A synthesis step merges facet outputs and identifies contradictions
- Research is always run (no skip option) -- the depth scales with complexity instead
- Research findings are stored in MuninnDB session context for downstream recall
- Researchers receive scope constraints from Step 1 (prior decisions limit research surface)

## Failure Modes

| Failure                     | Cause                                                | Mitigation                                                                                                            |
| --------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Researcher hallucinates API | Bun WebSocket API described incorrectly              | Verification protocol: Context7 first, then official docs. LOW confidence if unverified.                              |
| Facet overlap               | Two researchers investigate the same sub-topic       | Synthesizer deduplicates and merges. Overlap is better than gaps.                                                     |
| Research too shallow        | TRIVIAL complexity produces insufficient depth       | Minimum 1 facet always runs with full tool strategy.                                                                  |
| Contradictions unresolved   | Synthesizer flags contradiction but does not resolve | Step 5 (Review Research) catches unresolved contradictions.                                                           |
| Researcher blocked          | Cannot access Context7 or WebSearch                  | Falls back to Bun documentation via WebFetch + training data (flagged LOW confidence).                                |
| All researchers timeout     | Parallel agents exhaust context or time              | Orchestrator collects partial results. Any facet with output is used; failed facets are flagged for Step 4 expansion. |

## Example

### Research output for facet: Architecture Patterns

**File: `.planning/phases/{NN}-websocket-reconnection/research/01-architecture-patterns.md`**

````markdown
# Reconnection Patterns Research

**Researched:** 2026-03-22
**Domain:** WebSocket reconnection with exponential backoff
**Confidence:** HIGH

## Summary

The standard approach for WebSocket reconnection uses a finite state machine
with timer-based exponential backoff and optional jitter. The client tracks
connection state (CONNECTING, OPEN, CLOSING, CLOSED, RECONNECTING) and
transitions between states based on WebSocket events and timer expiration.

## Standard Stack

### Core

| Library                  | Version | Purpose                  | Why Standard               |
| ------------------------ | ------- | ------------------------ | -------------------------- |
| Bun WebSocket (built-in) | 1.1+    | Native WS implementation | Project decision:ws-native |

### Supporting

No external libraries needed. Reconnection logic is implemented as a pure
TypeScript module using setTimeout/clearTimeout.

## Architecture Patterns

### Pattern 1: Reconnection State Machine

**What:** Finite state machine managing connection lifecycle
**States:** IDLE -> CONNECTING -> OPEN -> RECONNECTING -> CLOSED (terminal) | FAILED (terminal)
**Transitions:**

- IDLE -> CONNECTING: User initiates connection
- CONNECTING -> OPEN: WebSocket 'open' event
- OPEN -> RECONNECTING: WebSocket 'close' event (non-intentional)
- RECONNECTING -> CONNECTING: Backoff timer expires
- RECONNECTING -> FAILED: Max retries exceeded
- Any -> CLOSED: User calls disconnect()

### Pattern 2: Exponential Backoff with Jitter

**What:** Delay = min(base \* 2^attempt + random_jitter, max_delay)
**Why jitter:** Prevents thundering herd when server restarts and all clients reconnect simultaneously
**Formula:**

```typescript
const delay = Math.min(
  baseDelay * Math.pow(2, attempt) + Math.random() * 1000,
  maxDelay,
);
```
````

## Common Pitfalls

### Pitfall 1: Missing heartbeat

**What goes wrong:** Client thinks connection is open but server has dropped it
**Why it happens:** TCP keepalive is too slow; WebSocket 'close' event does not
fire on network-level disconnects (only on graceful close)
**How to avoid:** Implement ping/pong heartbeat with timeout detection

### Pitfall 2: Zombie timers

**What goes wrong:** Multiple reconnection timers run simultaneously after
rapid disconnect/reconnect cycles
**How to avoid:** Always clear existing timer before setting a new one.
Use a single timer reference, not a queue.

## Sources

### Primary (HIGH confidence)

- Context7: bun-websocket (queried: connection lifecycle, close events)
- MDN WebSocket API documentation

### Secondary (MEDIUM confidence)

- WebSearch: "websocket reconnection exponential backoff 2026"

```

**Handoff to Step 3**: All research files and the synthesis summary are available for the Discussion step. The user (and `lu-discuss-researcher` agents in auto mode) can reference specific research findings when making decisions.
```
