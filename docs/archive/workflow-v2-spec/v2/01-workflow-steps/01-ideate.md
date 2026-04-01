# Step 1: Ideate

## Purpose

The Ideate step captures the user's rough idea and transforms it into a structured intent that downstream steps can act on. In v1, this was implicit -- the user typed a request and the `/lu` orchestrator routed it. In v2, ideation is an explicit step that:

1. **Captures the raw intent** in the user's own words
2. **Checks for prior art** in MuninnDB to avoid re-solving solved problems
3. **Establishes the initial scope boundary** that all subsequent steps respect
4. **Creates a traceable record** of what was originally requested vs. what was delivered

This step exists because the most common workflow failure is scope drift: the user says "add WebSocket reconnection" and the AI builds an entire real-time messaging system. By explicitly recording the intent before any research begins, v2 creates an anchor that every subsequent step references.

## Inputs

- **User's raw request**: Natural language description of what they want to build or fix
- **Current project state**: STATE.md, ROADMAP.md (read automatically)
- **MuninnDB project identity**: `brain:project-identity` tree (recalled automatically)

## Process

### 1.1 Receive raw intent

The user provides their idea through the `/lu` entry point or directly in conversation. The idea can be as rough as a single sentence or as detailed as a multi-paragraph specification.

```
User: "I need WebSocket reconnection logic with exponential backoff for my Bun server"
```

### 1.2 Spawn lu-cognition for cognitive pre-flight

Before any analysis, the orchestrator spawns `lu-cognition` to load project context:

```python
Task(
  prompt="Cognitive pre-flight for ideation: {raw_intent}",
  subagent_type="lu-cognition",
  description="Pre-flight for ideation"
)
```

`lu-cognition` performs:

1. **Recall project identity** from MuninnDB:

   ```
   mcp__muninn__muninn_recall_tree(vault: "luca-framework", id: "brain:project-identity")
   ```

   Extracts: project stack (Bun, TypeScript), architecture patterns, conventions.

2. **Semantic recall for prior art**:

   ```
   mcp__muninn__muninn_recall(vault: "luca-framework", context: "WebSocket reconnection exponential backoff")
   ```

   Checks if this problem (or something similar) was solved before. If a `pattern:*` or `decision:*` engram matches, it is surfaced to the user before research begins.

3. **Initialize session context**:
   ```
   mcp__muninn__muninn_remember(
     vault: "luca-framework",
     concept: "session:intent",
     content: "User requested: WebSocket reconnection with exponential backoff for Bun server. Raw intent captured."
   )
   ```

### 1.3 Spawn lu-router for complexity classification

The `lu-router` agent analyzes the raw intent and classifies complexity:

```python
Task(
  prompt="""
  <cognitive_report>{cognitive_report}</cognitive_report>
  <user_intent>{raw_intent}</user_intent>
  Classify complexity and determine execution path.
  """,
  subagent_type="lu-router",
  description="Route and classify"
)
```

The router considers:

- **File count estimate**: WebSocket reconnection likely touches 3-5 files (server handler, client reconnection logic, shared types, tests) -- MODERATE
- **Integration scope**: Needs to work with existing HTTP server and potentially existing WebSocket handlers -- cross-cutting
- **Risk level**: Network code has many edge cases (partial disconnects, concurrent reconnects, backoff overflow) -- medium-high

Classification: **MODERATE** (3-5 files, feature-scoped, medium risk)

### 1.4 Structure the intent

The orchestrator (or lu-router) transforms the raw idea into a structured intent record persisted in STATE.md:

```markdown
## Current Task

**Intent:** Add WebSocket reconnection logic with exponential backoff to Bun server
**Complexity:** MODERATE
**Scope:** WebSocket connection management (reconnect, backoff, max retries)
**Boundary:** Does NOT include new WebSocket features, message protocol changes, or server-side scaling
**Prior art:** None found in MuninnDB (new capability)
```

### 1.5 Persist via state bridge

```bash
luca-bridge transition --event=DISCUSS_COMPLETE --data='{"intent":"WebSocket reconnection with exponential backoff","complexity":"MODERATE"}' 2>/dev/null || true
```

### 1.6 Present to user and confirm

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca > IDEATION COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Intent: Add WebSocket reconnection logic with exponential backoff
Complexity: MODERATE
Prior art: None found

Scope boundary:
  IN:  Reconnection logic, exponential backoff, max retries, connection state
  OUT: New WS features, protocol changes, server scaling

Proceed to Research? [Y/n]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Outputs

| Output                    | Location                               | Description                                  |
| ------------------------- | -------------------------------------- | -------------------------------------------- |
| Structured intent         | STATE.md `## Current Task` section     | Raw intent + complexity + scope boundary     |
| Session context           | MuninnDB `session:intent` (repo vault) | Persisted intent for recall across steps     |
| Cognitive report          | In-memory (passed to Step 2)           | Project identity, prior art, intuition flags |
| Complexity classification | STATE.md `Task Complexity:` field      | TRIVIAL through CRITICAL                     |

## Agents Involved

| Agent          | Role                                    | Isolation | Model Tier (MODERATE)                |
| -------------- | --------------------------------------- | --------- | ------------------------------------ |
| `lu-cognition` | Cognitive pre-flight, MuninnDB recall   | None      | fast (ALWAYS_FAST preset)            |
| `lu-router`    | Complexity classification, path routing | None      | balanced (ROUTER preset at MODERATE) |

## v1 Mapping

**v1 behavior**: The user typed a request into `/lu`. The `lu-cognition` agent ran pre-flight, then `lu-router` classified and routed. There was no explicit "ideation" step -- the intent was implicit in the routing decision.

**v2 changes**:

- Intent is explicitly captured and persisted in STATE.md before any downstream work
- Scope boundary is declared upfront (IN/OUT) to anchor against drift
- Prior art check in MuninnDB surfaces previously solved problems
- User confirms the structured intent before research begins

## Failure Modes

| Failure            | Cause                                                          | Mitigation                                                                                                               |
| ------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Scope too broad    | User describes a system, not a feature                         | Router flags COMPLEX/CRITICAL and prompts user to narrow                                                                 |
| Scope too narrow   | User describes a single line change                            | Router classifies TRIVIAL; all 10 steps still run but with `fast` tier, minimal facets (1), and 1-iteration review loops |
| Prior art missed   | MuninnDB recall misses relevant engram                         | Research step (Step 2) will independently discover if the pattern exists in the codebase                                 |
| Wrong complexity   | Router misclassifies (e.g., SIMPLE for a cross-cutting change) | Complexity can be overridden with `--complexity=MODERATE` flag                                                           |
| User rejects scope | Structured intent does not match raw idea                      | User can modify the scope boundary before confirming                                                                     |

## Example

### Scenario: Adding WebSocket reconnection logic to a Bun server

**User input:**

```
I need WebSocket reconnection logic with exponential backoff for my Bun server.
When the connection drops, the client should automatically reconnect with increasing
delays (1s, 2s, 4s, 8s, up to 30s max). After 10 failed attempts, it should give up
and show an error state.
```

**lu-cognition recall results:**

```
brain:project-identity => Stack: Bun 1.1+, TypeScript, no external WS library
pattern:* recall => No matches for "WebSocket reconnection"
decision:* recall => decision:ws-native -- "Use Bun's built-in WebSocket, not ws package"
```

**lu-router classification:**

```
Complexity: MODERATE
Rationale:
  - 3-5 files (ws-handler.ts, reconnect-manager.ts, types.ts, existing server config)
  - Feature-scoped (reconnection is self-contained)
  - Medium risk (network edge cases, timer management, state transitions)
  - Prior decision constrains to Bun native WS (reduces research surface)
```

**Structured intent (written to STATE.md):**

```markdown
## Current Task

**Intent:** Add WebSocket reconnection with exponential backoff to Bun server
**Complexity:** MODERATE
**Scope:**

- IN: Client reconnection logic, exponential backoff (1s base, 30s cap, 10 max retries), connection state tracking, error state on exhaustion
- OUT: Server-side WebSocket changes, new WS message types, ws npm package

**Prior art:** decision:ws-native (use Bun built-in WebSocket)
**Appetite:** TBD (set in Step 3)
```

**Handoff to Step 2**: The structured intent, cognitive report, and complexity classification are passed to the Research step. The prior decision about using Bun's native WebSocket constrains the research scope -- researchers will not evaluate `ws` or `socket.io` as alternatives.
