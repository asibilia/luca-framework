# Research System

The multi-agent parallel research system that transforms a rough user brief into verified, structured findings before planning begins.

## Why Multi-Agent Parallel Research

Luca v1 used a single `lu-phase-researcher` agent to investigate a domain before planning. This worked for narrowly-scoped phases but broke down on MODERATE+ tasks where the research surface area exceeded what a single agent could cover within its token budget. Findings were shallow, sources went unverified, and the planner received incomplete context.

v2 replaces the single-researcher model with four parallel specialist researchers, each cold-isolated from the others. The key insight: **research quality improves when multiple agents investigate independently and a separate team reviews their combined output.** This mirrors how high-performing human teams conduct design reviews -- different people examine the same problem from different angles, and their findings are synthesized rather than negotiated.

## Position in the 10-Step Workflow

Research is Step 2 of the Luca v2 workflow pipeline:

```
Step 1:  Ideate               (/lu entry point, parse & route)
Step 2:  RESEARCH             <-- you are here
Step 3:  Discuss + Pre-mortem (phase-discuss, gray areas)
Step 4:  Deep Expand          (targeted follow-up research)
Step 5:  Review Research      (3-reviewer convergence loop)
Step 6:  Graduate to MuninnDB (verified findings → memory)
Step 7:  Plan                 (PLAN.md creation)
Step 8:  Review Plan          (plan review loop)
Step 9:  Execute              (wave-based parallel execution)
Step 10: Verify + UAT         (harness + lu-verifier + code review + learning)
```

> **Note on v1 mapping:** v1 sub-processes like model resolution, cognitive pre-flight, and validation happen WITHIN v2 steps as sub-processes, not as top-level steps. The v2 numbering is the user-facing pipeline; v1's 15-step list is the internal implementation checklist.

Research runs early (Step 2) because all downstream steps benefit from factual grounding -- discussion (Step 3) is more productive when participants have verified context, and deep expansion (Step 4) can target gaps identified during discussion. Complexity classification (resolved during Step 1 routing) determines the research budget (token allocation, max iterations).

## Key Innovations

### Cold Isolation Between Researchers

Each researcher agent operates in complete isolation. They share no session state, no intermediate findings, and no communication channel. This prevents the "echo chamber" effect where one agent's early hypothesis biases the others. When findings converge independently, that convergence carries genuine signal. When findings diverge, that divergence surfaces real ambiguity the planner must address.

### Separate Research and Review Teams

The agents who produce research are different from the agents who review it. Researchers (4 agents) write findings. Reviewers (3 agents) evaluate those findings for completeness, accuracy, and actionability. This separation prevents the common failure mode where an author reviews their own work and misses gaps they are blind to.

### Source Confidence Model

Every finding carries an explicit confidence level (HIGH, MEDIUM, LOW, UNVERIFIED) derived from a documented source hierarchy. Confidence propagates forward: a plan task that depends on a LOW-confidence finding inherits that uncertainty. This forces the planner to either upgrade the finding's confidence or build contingency into the plan.

### Convergence-Based Review Loops

Research review continues until all CRITICAL gaps are resolved, with a configurable maximum iteration budget. Diminishing returns detection prevents infinite loops -- if iteration N produces fewer findings than N-1, the system is converging and should stop.

### MuninnDB Graduation

Verified research findings are "graduated" into MuninnDB as long-term memory. During execution, agents recall only the findings relevant to their current task rather than loading the entire research corpus into context. This solves the problem of research being too large for a single context window while ensuring nothing is lost.

## Documents in This Section

| Document                                                 | Purpose                                                                                         |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [multi-agent-research.md](multi-agent-research.md)       | How parallel research agents work: specializations, spawning, isolation, tool access, budgets   |
| [research-file-structure.md](research-file-structure.md) | Directory layout, file format standards, finding numbering, cross-referencing                   |
| [source-confidence-model.md](source-confidence-model.md) | How sources are graded, the confidence hierarchy, verification protocol, staleness rules        |
| [review-loop-convergence.md](review-loop-convergence.md) | When to stop the research review loop: reviewer agents, gap classification, convergence signals |

## Running Example

Throughout this documentation, we use a **WebSocket reconnection system** as a running example. The user's brief is:

> "Add automatic WebSocket reconnection with exponential backoff, connection health monitoring, and message queue replay on reconnect."

This task is classified as MODERATE (3-5 files, feature-scoped, medium risk) and exercises all four researcher specializations, the review loop, and MuninnDB graduation.

## Related Documentation

- [Luca v2 Workflow Overview](../01-workflow-steps/) -- Full 10-step pipeline and canonical step numbering
- [MuninnDB Integration](../03-muninndb-integration/) -- How research graduates into memory (Step 6)
- [Agent Orchestration](../04-agent-orchestration/) -- Agent specifications, model routing presets, spawning
- [Review Loops](../05-review-loops/) -- Canonical convergence criteria, iteration budgets, review protocols
