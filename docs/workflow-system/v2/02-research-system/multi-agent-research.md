# Multi-Agent Research

How four parallel researcher agents investigate different facets of a problem independently, producing structured findings that converge into a comprehensive research corpus.

## The Four Default Researcher Specializations

Each researcher agent has a distinct focus area, a tailored system prompt, and a specific output file. They are designed to be complementary -- together they cover the full research surface, but individually they never overlap in scope.

> **Canonical agent names and routing:** All four researchers use NEW dedicated agents (not v1's `lu-phase-researcher`). They use the `ROUTER` model routing preset (see [Decision 10](../CANONICAL-DECISIONS.md#decision-10-model-routing-presets)) and **cold isolation** (see [Decision 11](../CANONICAL-DECISIONS.md#decision-11-researcher-isolation)). Full agent specifications live in [`04-agent-orchestration/research-team.md`](../04-agent-orchestration/research-team.md).

### 1. Architecture Researcher (`lu-architecture-researcher`)

**Focus:** How similar systems are built, design patterns, module boundaries, data flow.

**Questions this agent answers:**

- How do well-built systems solve this problem?
- What design patterns apply to this domain?
- Where should module boundaries fall?
- What is the recommended project structure?
- What data flow patterns work at scale?

**Output file:** `01-architecture-patterns.md`

**Example output (WebSocket reconnection):**

```markdown
## F-ARCH-001: State Machine Pattern for Connection Lifecycle

**Confidence:** HIGH
**Source:** Official WebSocket API specification (WebFetch verified)

WebSocket connections should be modeled as a state machine with explicit
states: CONNECTING, OPEN, CLOSING, CLOSED, RECONNECTING, BACKOFF_WAIT.

The RECONNECTING and BACKOFF_WAIT states are not part of the WebSocket
spec but are critical for reconnection logic. They prevent race
conditions where multiple reconnection attempts fire simultaneously.

### Implications

- Connection manager needs a typed state enum
- State transitions must be atomic (no partial state)
- Event handlers should be state-gated (e.g., don't queue messages in CLOSED)
```

### 2. Implementation Researcher (`lu-implementation-researcher`)

**Focus:** Specific libraries, APIs, code patterns, version constraints, configuration options.

**Questions this agent answers:**

- What libraries exist for this problem?
- What are the current stable versions?
- What API surfaces are available?
- What configuration options matter?
- What code patterns do official docs recommend?

**Output file:** `02-implementation-approaches.md`

**Example output (WebSocket reconnection):**

```markdown
## F-IMPL-001: Exponential Backoff Parameters

**Confidence:** HIGH
**Source:** Context7 docs for `reconnecting-websocket` library

The standard exponential backoff formula is:

delay = min(baseDelay \* 2^attempt + jitter, maxDelay)

Recommended defaults from production systems:

- baseDelay: 1000ms
- maxDelay: 30000ms
- jitter: random 0-1000ms (prevents thundering herd)
- maxAttempts: Infinity (with maxDelay cap)

### Implications

- These parameters should be configurable via constructor options
- Jitter is critical for multi-client scenarios
- maxAttempts: Infinity is safe when combined with maxDelay
```

### 3. Ecosystem Researcher (`lu-ecosystem-researcher`)

**Focus:** Existing solutions, alternatives, community practices, what NOT to build.

**Questions this agent answers:**

- What existing solutions solve this problem?
- What do the community and ecosystem recommend?
- What should we use instead of building from scratch?
- What are the tradeoffs between options?
- What is the adoption trajectory of each option?

**Output file:** `03-existing-solutions.md`

**Example output (WebSocket reconnection):**

```markdown
## F-ECO-001: Existing WebSocket Reconnection Libraries

**Confidence:** MEDIUM
**Source:** WebSearch (multiple sources agree), npm download stats

| Library                | Weekly Downloads | Last Updated | Approach                                  |
| ---------------------- | ---------------- | ------------ | ----------------------------------------- |
| reconnecting-websocket | 850K             | 2024-09      | Drop-in replacement for native WebSocket  |
| socket.io-client       | 4.2M             | 2025-01      | Full framework with built-in reconnection |
| ws (server-side)       | 12M              | 2025-02      | No built-in reconnection (server lib)     |

### Recommendation

For client-side reconnection without a full framework:
`reconnecting-websocket` is the established choice. It wraps the native
WebSocket API, so existing code needs minimal changes.

For full bidirectional event systems: `socket.io-client` provides
reconnection, rooms, namespaces, and fallback transports -- but it
requires a socket.io server.

### Implications

- If the project uses native WebSocket, prefer reconnecting-websocket
- If the project already uses socket.io, use its built-in reconnection
- Hand-rolling reconnection is justified ONLY if neither library fits
```

### 4. Risk Researcher (`lu-risk-researcher`)

**Focus:** Known pitfalls, failure modes, deprecation warnings, security concerns, edge cases.

**Questions this agent answers:**

- What are the known failure modes for this type of system?
- What security concerns exist?
- Are any dependencies deprecated or at risk?
- What edge cases cause production incidents?
- What do post-mortems reveal about similar systems?

**Output file:** `04-pitfalls-and-risks.md`

**Example output (WebSocket reconnection):**

```markdown
## F-RISK-001: Thundering Herd on Server Restart

**Confidence:** HIGH
**Source:** Cloudflare engineering blog (WebFetch verified)

When a WebSocket server restarts, all connected clients detect
disconnection simultaneously and attempt reconnection at the same
instant. Without jitter in the backoff, thousands of clients hit the
server in a synchronized wave, causing it to crash again.

**Severity:** CRITICAL
**Mitigation:** Mandatory jitter in backoff calculation
**Verification:** Load test with 100+ simultaneous reconnections

### Implications

- Jitter is not optional -- it is a correctness requirement
- The planner must include a load test task for reconnection
- Backoff parameters must be randomized per-client
```

## How Researchers Are Spawned

### Parallel, Background, Cold-Isolated

The research orchestrator spawns all four researchers simultaneously using background task spawning. Each researcher runs as an independent agent with no shared state.

```
Orchestrator (phase-research skill)
  │
  ├──▶ [background] Architecture Researcher
  ├──▶ [background] Implementation Researcher
  ├──▶ [background] Ecosystem Researcher
  └──▶ [background] Risk Researcher
  │
  │    (all four run in parallel, no communication)
  │
  ▼ (wait for all to complete)
  │
  Synthesis + Review Loop
```

**Why background spawning:** Researchers can run for 30-120 seconds each (depending on web search latency). Running them in background allows the orchestrator to wait for all four to complete without blocking the main thread.

**Why cold isolation:** Each researcher gets its own fresh context window. They do not share:

- Session state
- Intermediate findings
- Tool call history
- Memory recalls

This isolation is deliberate. When four independent agents arrive at the same conclusion through different research paths, that convergence is a strong signal of accuracy. When they produce conflicting findings, that divergence is a strong signal that the topic needs human review.

### What Each Researcher Receives

Every researcher gets the same base inputs:

| Input                            | Purpose                                |
| -------------------------------- | -------------------------------------- |
| User's brief (`00-brief.md`)     | The raw request from the user          |
| CONTEXT.md (if exists)           | Locked decisions from `/phase-discuss` |
| Researcher-specific focus prompt | Their specialization instructions      |
| Phase metadata                   | Phase number, name, description        |
| Today's date                     | For including year in web searches     |

Researchers do NOT receive:

- Each other's findings (cold isolation)
- Previous research iterations (fresh perspective)
- MuninnDB session context (no memory bias)
- Planner output (research comes before planning)

### Cold Isolation Details

Cold isolation means each researcher starts with zero shared context from the other researchers. This is enforced structurally:

1. **No shared files during research.** Researchers write to individual output files. They never read each other's output files.
2. **No shared memory.** Researchers do not write to or recall from MuninnDB session context during research.
3. **No shared tool state.** Each researcher's WebSearch queries are independent. If two researchers search for the same topic, they may find different results -- and that is acceptable.
4. **No orchestrator relay.** The orchestrator does not pass partial results from an early-finishing researcher to a still-running one.

The only point where findings merge is after all researchers complete, during the synthesis phase.

## Tool Access Per Researcher

All four researchers share the same tool set:

| Tool                             | Purpose                                        | Usage Pattern                                  |
| -------------------------------- | ---------------------------------------------- | ---------------------------------------------- |
| **WebSearch**                    | Discover what exists, find community practices | Ecosystem surveys, pattern discovery           |
| **WebFetch**                     | Verify sources, read official documentation    | URL verification, changelog checks             |
| **Read**                         | Examine codebase files                         | Understand existing patterns, module structure |
| **Grep**                         | Search codebase for patterns                   | Find related implementations, usage patterns   |
| **Glob**                         | Find files by pattern                          | Locate configuration, related modules          |
| **Context7** (mcp**context7**\*) | Query current library documentation            | API verification, version-specific features    |

**Tool access is intentionally identical.** The differentiation between researchers comes from their focus prompts, not their tool sets. An Architecture Researcher and an Implementation Researcher might both use Context7 to query the same library, but they ask different questions and extract different information.

> **Output format note:** The agent prompt templates in [`04-agent-orchestration/research-team.md`](../04-agent-orchestration/research-team.md) use domain-specific section headers (e.g., "Recommended Architecture", "Component Map"). These are the **raw agent output** structures. The orchestrator post-processes raw output into the **mandatory format** defined in [`research-file-structure.md`](research-file-structure.md) (Summary, Findings with F-PREFIX-NNN numbering, Sources with tier grouping, Metadata). Reviewers evaluate the post-processed files, not raw agent output.

### Tool Usage Patterns by Specialization

**Architecture Researcher** leans heavily on:

- Read + Grep + Glob for understanding the existing codebase structure
- WebSearch for "how to architect [type of system]"
- WebFetch for official architecture guides

**Implementation Researcher** leans heavily on:

- Context7 for library API documentation
- WebFetch for official getting-started guides
- WebSearch for version-specific features

**Ecosystem Researcher** leans heavily on:

- WebSearch for library comparisons, npm download stats
- WebFetch for GitHub READMEs and changelogs
- Context7 for verifying library capabilities

**Risk Researcher** leans heavily on:

- WebSearch for "common mistakes with [technology]", post-mortems
- WebFetch for security advisories, deprecation notices
- Read + Grep for finding existing error handling patterns in the codebase

## Time and Token Budgets

Research budgets are complexity-gated. The budgets below represent the **full context budget** per researcher (input context + tool calls + output generation). For output-only token budgets used in agent orchestration, see [`04-agent-orchestration/research-team.md`](../04-agent-orchestration/research-team.md).

| Complexity | Per-Researcher Context Budget | Per-Researcher Time Limit | Total Research Context Budget |
| ---------- | ----------------------------- | ------------------------- | ----------------------------- |
| TRIVIAL    | 8K tokens                     | 30 seconds                | 32K tokens                    |
| SIMPLE     | 12K tokens                    | 45 seconds                | 48K tokens                    |
| MODERATE   | 20K tokens                    | 90 seconds                | 80K tokens                    |
| COMPLEX    | 35K tokens                    | 120 seconds               | 140K tokens                   |
| CRITICAL   | 50K tokens                    | 180 seconds               | 200K tokens                   |

> **Budget distinction:** These numbers are the full context envelope (input + output + tool calls). The agent orchestration spec in `04-agent-orchestration/research-team.md` specifies the **output-only** token budget (what the agent writes), which is a subset of this context budget. Example: MODERATE complexity has 20K context budget here, of which ~8K is the output-only budget in agent-orchestration.

**Budget enforcement:**

- Token budget is a soft cap. The researcher should aim to complete within budget but may exceed by up to 20% for critical findings.
- Time limit is enforced by the orchestrator. If a researcher has not returned within the time limit, the orchestrator proceeds with the results from the completed researchers and notes the incomplete specialization in the review.
- Total research budget includes all four researchers plus the synthesis step. It does NOT include the review loop (which has its own budget).

**Budget allocation guidance:**

- Spend 60% on core investigation (tool calls, source verification)
- Spend 20% on writing structured output
- Reserve 20% for verification protocol (cross-referencing, confidence assignment)

## Adding Custom Researcher Specializations

The four default researchers cover the most common research facets, but some domains benefit from additional specializations. Custom researchers can be added for specific phases or project types.

### When to Add a Custom Researcher

Add a custom researcher when:

- The domain has a specialized concern not covered by the four defaults (e.g., regulatory compliance, accessibility standards, data migration patterns)
- The phase involves a technology with domain-specific pitfalls that the Risk Researcher's general focus would miss (e.g., database migration strategies, real-time audio processing constraints)
- Previous research review loops consistently flag the same gap category

### How to Add a Custom Researcher

1. **Create the agent definition** following the pattern in `src/agents/general/lu-phase-researcher.agent.ts`, with a domain-specific focus prompt.

2. **Register the researcher** in the research orchestrator's spawn list. Custom researchers are spawned alongside the four defaults -- they do not replace any default.

3. **Define the output file** using the numbering convention: `05-{topic}.md`, `06-{topic}.md`, etc. Custom researcher files always start at `05` or higher.

4. **Set the research scope** in the custom researcher's focus prompt. The scope should be non-overlapping with the four defaults:

```
Architecture Researcher: system design, module boundaries, data flow
Implementation Researcher: libraries, APIs, code patterns, versions
Ecosystem Researcher: existing solutions, alternatives, community practices
Risk Researcher: pitfalls, failure modes, security, deprecation
Custom Researcher: [your non-overlapping scope]
```

### Example: Accessibility Researcher

For a UI-heavy phase, you might add an Accessibility Researcher:

**Focus:** WCAG compliance, screen reader compatibility, keyboard navigation patterns, ARIA implementation.

**Output file:** `05-accessibility-requirements.md`

**Non-overlapping scope:** The Architecture Researcher covers component structure but not accessibility semantics. The Implementation Researcher covers library APIs but not assistive technology compatibility. The Accessibility Researcher fills this gap.

### Configuration

Custom researchers are configured per-phase in the phase metadata or globally in `.planning/config.json`:

```json
{
  "research": {
    "customResearchers": [
      {
        "name": "accessibility-researcher",
        "agentId": "lu-accessibility-researcher",
        "outputFile": "05-accessibility-requirements.md",
        "phases": ["03-dashboard-ui", "07-form-system"]
      }
    ]
  }
}
```

If no `phases` array is specified, the custom researcher runs on all phases.

> **Schema reference:** The Zod schema for `research.customResearchers` will be defined in `src/agents/__schemas/research.schemas.ts` during implementation. Per the project's schema-first-parsing rule, the schema is the single source of truth for defaults, validation, and types. The config example above uses camelCase keys per [Decision 9](../CANONICAL-DECISIONS.md#decision-9-config-key-casing).

## Relationship to v1 Research

v2 multi-agent research replaces v1's `lu-phase-researcher` (single agent) and `lu-project-researcher` (project-level ecosystem survey). The key differences:

| Aspect      | v1                               | v2                                                                |
| ----------- | -------------------------------- | ----------------------------------------------------------------- |
| Agent count | 1 researcher per phase           | 4+ researchers per phase                                          |
| Isolation   | N/A (single agent)               | Cold isolation between researchers                                |
| Review      | None (planner consumes directly) | 3-agent review loop with convergence criteria                     |
| Output      | Single RESEARCH.md               | Multiple specialized files + REVIEW-LOG.md + GRADUATION-REPORT.md |
| Confidence  | Informal (prose-level mentions)  | Formal model with propagation rules                               |
| Memory      | Not graduated to MuninnDB        | Findings graduated for targeted recall during execution           |
| Synthesis   | None (single file)               | Dedicated synthesis step merges parallel outputs                  |

The graduation step (Step 6) is handled by `lu-research-graduator`, a NEW dedicated agent (not v1's `lu-learner` or `lu-research-synthesizer`). It uses the `ORCHESTRATOR` model routing preset and produces the final GRADUATION-REPORT.md that records what was stored in MuninnDB. For the full graduation agent specification, see [`04-agent-orchestration/research-team.md`](../04-agent-orchestration/research-team.md). For MuninnDB integration details, see [`03-muninndb-integration/`](../03-muninndb-integration/).
