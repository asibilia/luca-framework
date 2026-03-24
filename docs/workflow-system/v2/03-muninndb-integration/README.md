# MuninnDB Integration

How research findings graduate from ephemeral files into persistent semantic memory, and how executors recall only the context they need for each task.

## Why Graduation Matters

Luca v1 stored findings directly in MuninnDB session context during execution and extracted them afterward via lu-learner. This worked for capturing patterns post-hoc, but it left a gap: the **research phase produced detailed findings that lived only in files**. By execution time, those files were either loaded wholesale into context (causing context rot) or summarized so aggressively that critical details were lost.

v2 introduces a **graduation model** that bridges this gap. Research findings are distilled into MuninnDB engrams between the research/review phase and the planning phase. During execution, agents recall only the specific engrams relevant to their current task. This eliminates both failure modes -- no context rot from loading everything, no detail loss from aggressive summarization.

## Position in the 10-Step Workflow

```
Step 1:  Ideate
Step 2:  Research (findings written to files)
Step 3:  Discuss + Pre-mortem
Step 4:  Deep Expand (targeted deep dives)
Step 5:  Review Research (review loop validates findings)
Step 6:  GRADUATION  <-- research files distilled to MuninnDB
Step 7:  Plan (PLAN.md created with research refs)
Step 8:  Review Plan
Step 9:  Execute (per-task recall from MuninnDB)
Step 10: Verify + UAT (lu-learner may promote research:* to pattern:*/pitfall:*)
```

Graduation is the hinge between the research world (files, full detail, human-readable) and the execution world (MuninnDB, distilled, semantically searchable). Without it, research and execution are disconnected.

## The Three-Stage Memory Model

Research context flows through three stages, each trading breadth for precision:

```
+---------------------------------------------------------------------+
|  Stage 1: Research Files                                            |
|  +-----------------------+  +-----------------------+               |
|  | api-authentication.md |  | error-handling.md     |  ...          |
|  | (2-4 pages, full      |  | (2-4 pages, full      |               |
|  |  citations, examples)  |  |  citations, examples)  |               |
|  +-----------------------+  +-----------------------+               |
|  Ephemeral | Full detail | Human-readable | One per concern         |
+---------------------------------------------------------------------+
                         |
                         | graduation (Step 6)
                         | lu-research-graduator
                         | filters, distills, deduplicates
                         v
+---------------------------------------------------------------------+
|  Stage 2: MuninnDB Engrams                                         |
|  +---------------------------+  +---------------------------+       |
|  | research:approach-ws-     |  | research:api-bun-         |       |
|  |   reconnect               |  |   websocket               |  ... |
|  | (3-5 sentences, key       |  | (3-5 sentences, key       |       |
|  |  detail + source URL)     |  |  detail + source URL)     |       |
|  +---------------------------+  +---------------------------+       |
|  Persistent | Distilled | Semantically searchable | Vault-routed   |
+---------------------------------------------------------------------+
                         |
                         | recall (Steps 7-10)
                         | muninn_recall per task
                         | filtered by research refs
                         v
+---------------------------------------------------------------------+
|  Stage 3: Targeted Context                                         |
|  +--------------------------------------------------+              |
|  | Task 3.2 context:                                 |              |
|  |  - research:approach-ws-reconnect (recalled)      |              |
|  |  - research:api-bun-websocket (recalled)          |              |
|  |  - research:pitfall-ws-memory-leak (recalled)     |              |
|  |  Total: ~500 tokens (vs ~8000 from raw files)     |              |
|  +--------------------------------------------------+              |
|  Per-task | Minimal | Focused | Injected into executor prompt       |
+---------------------------------------------------------------------+
```

Each stage compresses context while preserving the information that matters for the next consumer:

| Stage            | Consumer                                   | Token Budget       | Detail Level                                                      |
| ---------------- | ------------------------------------------ | ------------------ | ----------------------------------------------------------------- |
| Research files   | Reviewers, planner, humans                 | 2000-4000 per file | Full: citations, examples, alternatives, confidence reasoning     |
| MuninnDB engrams | Planner (for refs), executors (via recall) | 50-150 per engram  | Distilled: key finding, source URL, confidence, actionable detail |
| Targeted context | Single executor for single task            | 200-600 total      | Focused: only engrams referenced by the task's research refs      |

## How the Model Fits Together

The graduation model connects three existing Luca systems:

1. **Research system** (02-research-system) -- produces the input files
2. **MuninnDB memory** (this section) -- stores the graduated engrams
3. **Execution system** (phase-execute) -- recalls per-task context

It also introduces two new mechanisms:

1. **lu-research-graduator** -- the agent that performs graduation (detailed in [graduation-model.md](graduation-model.md))
2. **Research refs in PLAN.md** -- the planner embeds concept prefixes in each task (detailed in [per-task-recall.md](per-task-recall.md))

## Documents in This Section

| Document                                                     | Purpose                                                                                                                                     |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| [graduation-model.md](graduation-model.md)                   | The core innovation: how research files are distilled into MuninnDB engrams, the scoring/filtering process, the lu-research-graduator agent |
| [concept-prefix-extensions.md](concept-prefix-extensions.md) | New `research:*` concept prefixes, their relationship to existing prefixes, vault routing, lifecycle                                        |
| [per-task-recall.md](per-task-recall.md)                     | How executors get targeted context: research refs in PLAN.md, recall protocol, fallback behavior                                            |
| [lifecycle.md](lifecycle.md)                                 | Full lifecycle of research memories from creation through promotion to cleanup                                                              |

## Running Example

Throughout this documentation, we continue the **WebSocket reconnection system** example from the research system docs:

> "Add automatic WebSocket reconnection with exponential backoff, connection health monitoring, and message queue replay on reconnect."

This task produces research files like `ws-reconnection-strategy.md`, `bun-websocket-api.md`, and `message-queue-replay.md`. Graduation distills these into engrams like `research:approach-ws-reconnect`, `research:api-bun-websocket`, and `research:pitfall-ws-memory-leak`. Executors recall only the engrams relevant to their specific task.

## Key Design Decisions

### Why Not Just Load Research Files Directly?

Three reasons:

1. **Context budget** -- A phase with 5 research files at 3000 tokens each is 15,000 tokens. An executor's context budget cannot absorb this alongside the plan, project identity, and session context.

2. **Relevance filtering** -- Not every finding in `bun-websocket-api.md` is relevant to every task. Graduation extracts the actionable findings; recall returns only those matching the task.

3. **Persistence** -- Research files are phase-scoped ephemera. MuninnDB engrams survive the session and can be recalled in future phases if the work spans multiple sessions.

### Why Not Skip Files and Go Straight to MuninnDB?

Two reasons:

1. **Review quality** -- Reviewers need full context (citations, alternatives, confidence reasoning) to evaluate research quality. Distilled engrams lose the nuance needed for effective review.

2. **Human readability** -- Research files are the artifact a developer reads to understand what was investigated. Engrams are machine-optimized for recall, not human comprehension.

The three-stage model gives each consumer the right level of detail at the right time.

## Related Documentation

- [Research System](../02-research-system/) -- How research files are produced and reviewed
- [Design Principles](../00-design-principles/) -- Grounded decisions principle that motivates graduation
- [Agent Orchestration](../04-agent-orchestration/) -- How lu-research-graduator is spawned
- [Review Loops](../05-review-loops/) -- Research review loop that precedes graduation
