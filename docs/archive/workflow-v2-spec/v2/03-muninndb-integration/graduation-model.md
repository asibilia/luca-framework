# Graduation Model

The core innovation of v2's memory integration: a structured process for distilling research files into persistent MuninnDB engrams that can be recalled per-task during execution.

## Overview

Graduation is the bridge between Luca's research phase and its execution phase. Research agents produce detailed, multi-page files with full citations, examples, and confidence reasoning. Executors need concise, actionable context scoped to a single task. Graduation transforms the former into the latter.

```
                    RESEARCH PHASE                              EXECUTION PHASE
                    (full detail)                               (targeted recall)

  +----------------+  +----------------+  +----------------+
  | ws-reconnect-  |  | bun-websocket- |  | message-queue- |
  | strategy.md    |  | api.md         |  | replay.md      |
  | (~3000 tokens) |  | (~2500 tokens) |  | (~2000 tokens) |
  +-------+--------+  +-------+--------+  +-------+--------+
          |                    |                    |
          +--------------------+--------------------+
                               |
                    +----------v-----------+
                    | lu-research-graduator |
                    |                       |
                    | 1. Read all files      |
                    | 2. Score findings      |
                    | 3. Deduplicate         |
                    | 4. Distill to engrams  |
                    | 5. Batch write MuninnDB|
                    | 6. Write GRAD REPORT   |
                    +-----------+-----------+
                                |
          +---------------------+---------------------+
          |                     |                     |
  +-------v--------+   +-------v--------+   +-------v--------+
  | research:       |   | research:       |   | research:       |
  | approach-ws-    |   | api-bun-        |   | pitfall-ws-     |
  | reconnect       |   | websocket       |   | memory-leak     |
  | (~100 tokens)   |   | (~120 tokens)   |   | (~80 tokens)    |
  +----------------+    +----------------+    +----------------+
         MuninnDB              MuninnDB              MuninnDB
```

## Three-Stage Memory Flow

### Stage 1: Research Files (Ephemeral, Full Detail)

Research agents write one file per concern into the phase research directory:

```
.planning/phases/{N}-{name}/research/
  ws-reconnection-strategy.md      # ~3000 tokens
  bun-websocket-api.md             # ~2500 tokens
  message-queue-replay.md          # ~2000 tokens
  connection-health-monitoring.md  # ~1800 tokens
```

Each file contains:

- Finding summaries with source URLs
- Code examples from official documentation
- Confidence levels with reasoning
- Alternative approaches considered
- Cross-references to other findings

These files are optimized for **review** -- human or agent reviewers need the full context to evaluate quality.

### Stage 2: MuninnDB Engrams (Persistent, Distilled)

The lu-research-graduator reads all research files and produces distilled engrams:

```
research:approach-ws-reconnect
  "Exponential backoff with jitter for WebSocket reconnection.
   Base delay 1s, max 30s, jitter factor 0.5. Use Bun's native
   WebSocket close event (code 1006) as disconnect trigger.
   Source: https://bun.sh/docs/api/websockets
   Confidence: HIGH"

research:api-bun-websocket
  "Bun.serve() WebSocket handler uses per-socket .data property
   for state. No external ws library needed. Methods: .send(),
   .close(), .subscribe(). Events: open, message, close, drain.
   Max message size configurable via maxPayloadLength.
   Source: https://bun.sh/docs/api/websockets
   Confidence: HIGH"

research:pitfall-ws-memory-leak
  "WebSocket message queue must be bounded. Unbounded queue during
   disconnect causes OOM under sustained load. Implement ring buffer
   or LRU eviction with configurable max size (default 1000 msgs).
   Source: research finding from load testing patterns
   Confidence: MEDIUM"
```

Each engram is:

- **Concise**: 3-5 sentences, 50-150 tokens
- **Actionable**: Contains enough detail to implement without re-researching
- **Traceable**: Includes source URL and confidence level
- **Searchable**: Concept prefix enables targeted semantic recall

### Stage 3: Targeted Context (Per-Task, Minimal)

When an executor starts a task, it recalls only the engrams referenced by that task:

```
Task 3.2: "Implement WebSocket reconnection logic"
Research refs: research:approach-ws-reconnect, research:pitfall-ws-memory-leak

Recalled context (~180 tokens):
  - Exponential backoff with jitter, base 1s, max 30s...
  - Message queue must be bounded, implement ring buffer...
```

The executor receives exactly the context it needs -- no more, no less.

## What Gets Graduated vs. What Stays in Files Only

Not every finding in a research file merits graduation. The lu-research-graduator applies a scoring filter:

### GRADUATE (write to MuninnDB)

| Category                             | Examples                                                       | Why                                    |
| ------------------------------------ | -------------------------------------------------------------- | -------------------------------------- |
| High-confidence API patterns         | "Bun.serve() WebSocket handler uses per-socket .data property" | Executor needs this exact detail       |
| Verified implementation approaches   | "Exponential backoff with jitter, base 1s, max 30s"            | Executor will implement this directly  |
| Architecture decisions from research | "Use Bun native WS, not ws library"                            | Constrains executor's choices          |
| Pitfall warnings with mitigations    | "Unbounded queue causes OOM -- use ring buffer"                | Executor must avoid this               |
| Version/compatibility constraints    | "Requires Bun >= 1.1.0 for WebSocket drain event"              | Executor needs to verify compatibility |

### SKIP (stays in research files only)

| Category                          | Examples                                                                      | Why                                             |
| --------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------- |
| Raw exploration notes             | "Tried searching for 'bun websocket reconnect' -- found 3 relevant results"   | Process artifact, not a finding                 |
| Low-confidence speculation        | "Socket.io might have a built-in reconnect, but unclear if it works with Bun" | Not verified enough to act on                   |
| Redundant with existing engrams   | "Bun is faster than Node for WebSocket handling"                              | Already in brain:project-\* identity            |
| Alternative approaches not chosen | "Could use ws library instead of Bun native -- rejected due to bundle size"   | Decision is captured; rejected option is noise  |
| Verbose code examples             | "Full 40-line reconnection implementation from blog post"                     | Too large for engram; executor writes their own |
| Context only needed for review    | "Confidence reasoning: I verified this against 3 independent sources..."      | Reviewers needed this; executors do not         |

## The Graduation Process

### lu-research-graduator Agent

The graduation agent is spawned after the research review loop completes (Step 6). It operates deterministically with minimal LLM judgment -- most decisions are based on explicit scoring criteria.

> **Important**: Graduation uses the dedicated `lu-research-graduator` agent (see Decision 2 in CANONICAL-DECISIONS.md). This is NOT `lu-learner` adapted -- lu-learner retains its existing role in Step 10 (post-verification learning extraction and promotion). The full agent specification lives in `04-agent-orchestration/graduation-agent.md`.

**Agent properties:**

- **Isolation**: Cold (no access to researcher reasoning or reviewer discussion)
- **Tools**: Read, Glob, Grep (reads files), MuninnDB tools (writes engrams)
- **Input**: All files in `.planning/phases/{N}-{name}/research/`
- **Output**: MuninnDB engrams + `GRADUATION-REPORT.md`

### Step-by-Step Process

#### Step 1: Read All Research Files

```
Read all .md files in .planning/phases/{N}-{name}/research/
Parse each file for structured findings (look for ## Finding headings,
confidence markers, source URLs)
```

#### Step 2: Score Each Finding

For each finding extracted from research files, compute a graduation score based on three dimensions:

```
score = confidence * 0.40 + actionability * 0.35 + uniqueness * 0.25
threshold = 0.55

+--------------------+-------+-------------------------------------------+
| Dimension          | Weight| Scoring                                   |
+--------------------+-------+-------------------------------------------+
| Confidence Level   |  40%  | HIGH=1.0, MEDIUM=0.7, LOW=0.3, UNVERIF=0 |
| Actionability      |  35%  | See observable criteria table below        |
| Uniqueness         |  25%  | Novel=1.0, Partially overlaps=0.5, Dup=0  |
+--------------------+-------+-------------------------------------------+

Graduation threshold: 0.55 (configurable via research.graduation.scoringThreshold)
```

This uses a **weighted sum** (not product) so that a single zero dimension does not annihilate the entire score (see Decision 5 in CANONICAL-DECISIONS.md).

**Confidence Level** (40% weight): Derived from the source confidence model. Findings from official documentation or Context7 score HIGH. Findings from blog posts with verification score MEDIUM. Unverified findings score zero and never graduate.

**Actionability** (35% weight): How directly the finding can be used during implementation, scored by observable signals:

| Score | Criteria                                                      | Example                                                           |
| ----- | ------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1.0   | Contains specific function name, parameter, or code pattern   | "Use `Bun.serve({ websocket: { ... } })` with `idleTimeout: 120`" |
| 0.8   | Names a specific technology choice or version constraint      | "Use Bun's built-in WebSocket, not the `ws` package"              |
| 0.3   | Describes a general strategy without implementation specifics | "Implement exponential backoff for reconnection"                  |
| 0.1   | Purely informational, no implementation implication           | "WebSocket protocol was standardized in RFC 6455"                 |

**Uniqueness** (25% weight): Whether this finding adds new information beyond what MuninnDB already contains.

- Novel finding (no similar engram exists): 1.0
- Partially overlaps existing engram but adds new detail: 0.5
- Duplicate of existing engram: 0.0

#### Step 3: Deduplicate Against Existing Engrams

Before writing, recall existing engrams with similar concepts:

```
For each finding that passes the graduation threshold:
  1. muninn_recall(vault: REPO_VAULT, context: "<finding summary>")
  2. If recall returns an engram with relevance score > dedupSimilarityThreshold (default 0.85):
     - The relevance score is MuninnDB's internal scoring (range 0.0-1.0),
       returned by muninn_recall for each result
     - Compare content detail level
     - If new finding adds significant detail: EVOLVE existing engram
     - If existing engram is sufficient: SKIP (mark as duplicate)
  3. If no similar engram (all results below threshold, or no results): PROCEED with new engram creation
```

This prevents engram bloat across phases. A project with 10 phases should not have 10 copies of "use Bun native WebSocket."

#### Step 4: Distill to Engram Content

For each finding that passes scoring and deduplication, distill to a concise engram:

**Distillation rules:**

- Maximum 5 sentences
- Must include: the key finding, enough detail to act on, source URL, confidence level
- Must NOT include: reasoning process, alternatives considered, verbose examples
- Preserve specific values (numbers, parameter names, version constraints)

**Template:**

```
{Concise description of the finding in 1-2 sentences.}
{Key implementation detail or constraint in 1-2 sentences.}
{Source: URL | Confidence: HIGH/MEDIUM}
```

**Example input** (from research file, ~400 tokens):

```markdown
## Finding: Bun WebSocket API Surface

Bun's native WebSocket support is built into `Bun.serve()` and does not require
the `ws` npm package. The handler receives `ServerWebSocket` objects with methods
`send()`, `close()`, `subscribe()`, `unsubscribe()`, `publish()`, and events
`open`, `message`, `close`, `drain`, `ping`, `pong`.

Each socket has a `.data` property that persists per-connection state. This is
the recommended place to store session IDs, authentication tokens, and reconnection
metadata.

Maximum payload size is configurable via `maxPayloadLength` (default 16MB).
Backpressure is handled via the `drain` event -- if `send()` returns a number
less than the message length, wait for `drain` before sending more.

**Source:** https://bun.sh/docs/api/websockets
**Confidence:** HIGH (official Bun documentation via Context7)
**Verified:** 2026-03-22
```

**Example output** (engram, ~120 tokens):

```
Bun.serve() WebSocket handler uses per-socket .data property for state.
No external ws library needed. Methods: .send(), .close(), .subscribe().
Events: open, message, close, drain. Max message size configurable via
maxPayloadLength (default 16MB). Backpressure: if send() returns less
than message length, wait for drain event.
Source: https://bun.sh/docs/api/websockets | Confidence: HIGH
```

#### Step 5: Assign Concept Prefix and Vault

Each engram receives a concept prefix from the `research:*` namespace:

| Finding Type              | Concept Prefix                 | Example                                |
| ------------------------- | ------------------------------ | -------------------------------------- |
| Implementation approach   | `research:approach-{topic}`    | `research:approach-ws-reconnect`       |
| API surface / usage       | `research:api-{technology}`    | `research:api-bun-websocket`           |
| Identified pitfall        | `research:pitfall-{concern}`   | `research:pitfall-ws-memory-leak`      |
| Version/compat constraint | `research:constraint-{detail}` | `research:constraint-bun-ws-version`   |
| Grounded decision         | `research:decision-{choice}`   | `research:decision-ws-library-choice`  |
| Implementation pattern    | `research:pattern-{name}`      | `research:pattern-exponential-backoff` |

**Vault routing**: ALL `research:*` engrams go to the REPO vault (project-scoped). See [concept-prefix-extensions.md](concept-prefix-extensions.md) for full routing details.

#### Step 6: Batch Write to MuninnDB

Use `muninn_remember_batch` for efficiency:

```
muninn_remember_batch(
  vault: REPO_VAULT,
  memories: [
    { concept: "research:approach-ws-reconnect", content: "..." },
    { concept: "research:api-bun-websocket", content: "..." },
    { concept: "research:pitfall-ws-memory-leak", content: "..." },
    { concept: "research:pattern-exponential-backoff", content: "..." },
    { concept: "research:constraint-bun-ws-version", content: "..." }
  ]
)
```

#### Step 7: Write GRADUATION-REPORT.md

Write a report to `.planning/phases/{N}-{name}/research/GRADUATION-REPORT.md`:

```markdown
# Graduation Report -- Phase {N}: {name}

## Summary

- Research files processed: 4
- Findings extracted: 12
- Findings graduated: 7
- Findings skipped: 5
- Existing engrams evolved: 1

## Graduated Engrams

| #   | Concept                              | Score | Source File                     |
| --- | ------------------------------------ | ----- | ------------------------------- |
| 1   | research:approach-ws-reconnect       | 0.92  | ws-reconnection-strategy.md     |
| 2   | research:api-bun-websocket           | 0.88  | bun-websocket-api.md            |
| 3   | research:pitfall-ws-memory-leak      | 0.78  | message-queue-replay.md         |
| 4   | research:pattern-exponential-backoff | 0.85  | ws-reconnection-strategy.md     |
| 5   | research:constraint-bun-ws-version   | 0.72  | bun-websocket-api.md            |
| 6   | research:decision-ws-library-choice  | 0.80  | ws-reconnection-strategy.md     |
| 7   | research:approach-health-monitor     | 0.76  | connection-health-monitoring.md |

## Skipped Findings

| #   | Finding                             | Score | Reason                               |
| --- | ----------------------------------- | ----- | ------------------------------------ |
| 1   | Socket.io reconnect exploration     | 0.32  | LOW confidence, not verified         |
| 2   | ws library benchmark comparison     | 0.45  | Below threshold, background only     |
| 3   | General WebSocket protocol overview | 0.28  | Not actionable, background context   |
| 4   | Alternative: polling fallback       | 0.48  | Below threshold, approach not chosen |
| 5   | Bun runtime performance vs Node     | 0.15  | Duplicate of brain:project-identity  |

## Evolved Engrams

| #   | Existing Concept            | Change                   | Reason                                 |
| --- | --------------------------- | ------------------------ | -------------------------------------- |
| 1   | pattern:bun-serve-websocket | Added drain event detail | New finding adds implementation detail |
```

This report serves as an audit trail. If an executor encounters a gap, the planner can check whether the finding was graduated, skipped, or never researched.

## Graduation Confidence Threshold

The graduation threshold is configurable in `.planning/config.json` under `research.graduation` (see [Configuration](#configuration) below for the full schema):

**`scoringThreshold`** (default: 0.55): The weighted score below which findings are not graduated. The default of 0.55 means a MEDIUM-confidence, moderately actionable, unique finding will pass, while a LOW-confidence or purely informational finding will not.

**`confidenceThreshold`** (default: "MEDIUM"): Hard floor on confidence level. Even if a LOW-confidence finding scores above the threshold due to high actionability and uniqueness, it is still skipped. This prevents unverified findings from entering MuninnDB.

The two thresholds work together:

- `confidenceThreshold` acts as a **hard gate** (boolean: pass/fail)
- `scoringThreshold` acts as a **soft filter** (score-based ranking)

## Post-Graduation: Files as Archive

After graduation, research files are NOT deleted. They remain in the phase directory as:

1. **Audit trail** -- humans can review what was researched
2. **Review artifact** -- the REVIEW-LOG.md references specific files
3. **Recovery source** -- if an engram is accidentally deleted, the finding can be re-graduated

However, executors do NOT read research files directly. They use MuninnDB recall via the research refs embedded in their PLAN.md task. This is the key behavioral change: files are for humans and reviewers; engrams are for executors.

## Configuration

Graduation behavior is controlled by fields under `research.graduation` in `.planning/config.json` (see Decision 9 in CANONICAL-DECISIONS.md for camelCase convention):

```json
{
  "research": {
    "graduation": {
      "enabled": true,
      "scoringThreshold": 0.55,
      "confidenceThreshold": "MEDIUM",
      "maxEngramsPerGraduation": 50,
      "dedupSimilarityThreshold": 0.85,
      "autoCleanupAfterMilestone": false,
      "retainPromotedSource": true
    }
  }
}
```

| Field                       | Default    | Purpose                                                                                                                                      |
| --------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`                   | `true`     | Master toggle for graduation                                                                                                                 |
| `scoringThreshold`          | `0.55`     | Weighted score cutoff (see [scoring formula](#step-2-score-each-finding))                                                                    |
| `confidenceThreshold`       | `"MEDIUM"` | Hard floor on confidence level                                                                                                               |
| `maxEngramsPerGraduation`   | `50`       | Cap per graduation run to prevent engram bloat                                                                                               |
| `dedupSimilarityThreshold`  | `0.85`     | MuninnDB recall relevance score (0.0-1.0) above which engrams are considered duplicate. Uses MuninnDB's internal relevance scoring.          |
| `autoCleanupAfterMilestone` | `false`    | Whether to clean up research:\* engrams after milestone completion                                                                           |
| `retainPromotedSource`      | `true`     | If true, keep the research:\* source copy in REPO after promotion for audit trail. If false, source is cleaned up with non-promoted engrams. |

## Error Handling

### No Research Files Found

If the research directory is empty or missing, the graduator writes a minimal report and exits:

```markdown
# Graduation Report -- Phase {N}: {name}

## Summary

No research files found in .planning/phases/{N}-{name}/research/.
Graduation skipped. Executors will operate without research context.
```

### All Findings Below Threshold

If research files exist but ALL findings score below the graduation threshold, 0 engrams are written. This is distinct from "No Research Files Found" -- files exist, but nothing qualified. The graduator:

1. Writes a GRADUATION-REPORT.md noting that all findings were below threshold, with individual scores
2. Flags this condition prominently: "WARNING: 0 engrams graduated from N findings"
3. The planner in Step 7 proceeds without research refs rather than writing refs that would produce research gaps

### MuninnDB Unavailable

If MuninnDB write fails, the graduator:

1. Logs the failure in GRADUATION-REPORT.md
2. Falls back to writing a `RESEARCH-CONTEXT.md` file that the planner can reference directly
3. Sets a flag that executors check: if research engrams are absent, they load the fallback file

### Score Ties at Threshold Boundary

Findings scoring exactly at the threshold (0.55) are included (threshold is inclusive). In practice, the three-dimensional scoring rarely produces exact ties.

## Related Documentation

- [concept-prefix-extensions.md](concept-prefix-extensions.md) -- New research:\* concept prefixes
- [per-task-recall.md](per-task-recall.md) -- How executors use graduated engrams
- [lifecycle.md](lifecycle.md) -- Full engram lifecycle from creation to cleanup
- [Source Confidence Model](../02-research-system/source-confidence-model.md) -- How confidence levels are assigned
