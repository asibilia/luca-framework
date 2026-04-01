# External Research: Cross-Cutting Analysis

## Overview

This directory contains analysis of 8 external sources informing the design of Luca Workflow v2. Each source was fetched and analyzed on 2026-03-22. The research covers autonomous coding agents, multi-agent workflow patterns, memory management, review systems, and product development methodologies.

## Source Impact Ranking

Sources ranked by impact on Luca v2 design, from most to least impactful:

| Rank | Source                                                      | Relevance | Primary Contribution                                                                       |
| ---- | ----------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------ |
| 1    | [GSD 2 Framework](./gsd-2-framework.md)                     | HIGH      | Task decomposition, fresh sessions, context pre-loading, verification ladder               |
| 2    | [Claude Workflow Patterns](./claude-workflow-patterns.md)   | HIGH      | Formal pattern taxonomy (Sequential/Parallel/Evaluator-Optimizer), composition rules       |
| 3    | [Claude Code Review](./claude-code-review.md)               | HIGH      | Multi-agent parallel review with verification filtering, scaling depth with complexity     |
| 4    | [Mastra Code](./mastra-code.md)                             | HIGH      | Observational memory, non-destructive context compression, plan/build mode separation      |
| 5    | [LangChain Open SWE](./langchain-open-swe.md)               | HIGH      | Agentic vs. deterministic orchestration split, curated toolsets, subagent isolation        |
| 6    | [Claude Skill Creator](./claude-skill-creator.md)           | HIGH      | Eval-based validation, capability uplift vs. encoded preference, memory graduation signals |
| 7    | [Claude Product Management](./claude-product-management.md) | MEDIUM    | Capability-first optimization, short-sprint planning, simplicity for adaptability          |
| 8    | [Claude Builds Visuals](./claude-builds-visuals.md)         | LOW       | Minimal relevance -- consumer product feature announcement                                 |

## Cross-Cutting Themes

Seven themes emerged consistently across multiple sources. These represent the highest-confidence design inputs for v2.

### Theme 1: Fresh Context Per Unit with Pre-Loaded Knowledge

**Sources**: GSD 2, Open SWE, Mastra Code

Every production system converges on the same pattern: start each task with a clean context window, inject only what is needed from persistent storage, and never carry forward degrading conversation history. GSD 2 calls this "fresh session per unit." Open SWE calls it "rich context at startup." Mastra Code's observational memory compresses context without destructive compaction.

**v2 Design Implication**: Per-task context recall from MuninnDB is the right architecture. Assemble a focused context package (research excerpts, task plan, dependent task summaries, relevant engrams) and inject it at dispatch time. Never rely on accumulated conversation context.

### Theme 2: Evaluator-Optimizer Review Loops with Stopping Criteria

**Sources**: Claude Workflow Patterns, Claude Code Review, Claude Skill Creator

The evaluator-optimizer pattern is the formal model for review loops. A generator produces output; an evaluator assesses against criteria; the generator refines. The critical guardrail across all sources: define maximum iteration counts AND quality thresholds before starting. Claude Code Review adds a verification phase that filters false positives before surfacing findings.

**v2 Design Implication**: Every review loop must have both a max iteration count (from config, gated by complexity) and a measurable quality threshold. Add a verification/consensus step after parallel reviews to filter noise. Track whether review iterations actually improve quality -- if score plateaus, stop early.

### Theme 3: Parallel Agents with Isolated Contexts and External Aggregation

**Sources**: Open SWE, Claude Code Review, Claude Workflow Patterns, Claude Skill Creator

Multiple agents working in parallel must have fully isolated contexts -- no shared conversation history, no context bleed. Results are aggregated externally by a separate orchestration layer, not by the agents themselves. Claude's key insight: "Agents don't hand off work to each other -- they operate autonomously."

**v2 Design Implication**: Multi-agent parallel research agents each get their own context window, write to separate output files, and have no knowledge of other agents' findings. A separate aggregation step merges results. Same for parallel reviewers -- each reviews independently, findings are merged externally.

### Theme 4: Agentic Reasoning + Deterministic Orchestration

**Sources**: Open SWE, GSD 2, Claude Workflow Patterns

The most reliable systems split orchestration into two layers: agentic (model-driven) for complex reasoning tasks, and deterministic (code-driven) for critical reliability operations. Open SWE uses middleware for PR creation and message injection. GSD 2 uses a state machine for dispatch and a sliding-window detector for stuck loops.

**v2 Design Implication**: Review loop convergence criteria, memory graduation thresholds, and phase transitions should be deterministic. The content of reviews, research, and planning should be agentic. This maps to Luca's existing hook/skill boundary -- extend it to v2's new subsystems.

### Theme 5: Complexity-Gated Workflow Depth

**Sources**: Claude Workflow Patterns, Claude Code Review, GSD 2

Simple tasks should use simple workflows. Multi-agent parallel research, multi-pass review loops, and deep verification are only justified for complex work. Claude's Workflow Patterns post: "Default to sequential. Move to parallel when latency is the bottleneck." Claude Code Review scales the number of agents and analysis depth with PR size.

**v2 Design Implication**: Luca's existing 5-level complexity system (TRIVIAL through CRITICAL) should gate v2 features. TRIVIAL/SIMPLE: single-agent research, single-pass review. MODERATE: multi-agent research, single-pass review. COMPLEX/CRITICAL: multi-agent research, multi-pass review with verification filtering. This prevents over-engineering simple tasks.

### Theme 6: Memory Graduation and Knowledge Evolution

**Sources**: Mastra Code, Claude Skill Creator, GSD 2

Knowledge systems need progression: raw observations -> compressed patterns -> persistent memory. Mastra Code's observe-reflect-compress cycle, Skill Creator's capability uplift vs. encoded preference distinction, and GSD 2's KNOWLEDGE.md all model knowledge that evolves over time. Skills/patterns may become unnecessary as base capabilities improve.

**v2 Design Implication**: MuninnDB graduation should follow a lifecycle: research file (raw) -> candidate engram (reviewed) -> graduated engram (validated across tasks) -> archived engram (obsoleted by model capabilities). Different memory types have different graduation criteria: patterns graduate when validated across tasks, preferences graduate when confirmed by the user, pitfalls graduate when encountered and avoided.

### Theme 7: Task Sizing to Context Window Boundaries

**Sources**: GSD 2

GSD 2's "iron rule" -- a task must fit in one context window -- is the simplest and most actionable decomposition heuristic. If a task does not fit, split it. This is directly validated by GSD 2's production experience across thousands of autonomous runs.

**v2 Design Implication**: The planner should enforce context window sizing as a hard constraint. Research should identify natural decomposition boundaries. Each task plan should estimate context requirements (files to read, context to inject, expected output size) and flag tasks that risk exceeding the window.

## Patterns to Adopt (High Confidence)

These patterns have strong cross-source validation and clear implementation paths:

1. **Fresh session per task with MuninnDB context injection** -- 3 sources validate
2. **Evaluator-optimizer review loops with max iterations + quality thresholds** -- 3 sources validate
3. **Parallel agent isolation with external aggregation** -- 4 sources validate
4. **Deterministic convergence criteria for review loops** -- 3 sources validate
5. **Complexity-gated workflow depth** -- 3 sources validate
6. **Verification filtering after parallel reviews** -- 2 sources validate (Claude Code Review, Open SWE)
7. **Hallucination guard** (reject zero-tool-call completions) -- 1 source, but high impact (GSD 2)
8. **Curated tool sets per agent role** -- 2 sources validate
9. **Sliding-window stuck detection for review loops** -- 1 source, but directly applicable (GSD 2)
10. **Memory lifecycle with graduation criteria** -- 3 sources validate

## Anti-Patterns to Avoid

1. **Review loops without stopping criteria** -- "endless minor refinements" (Workflow Patterns)
2. **Complex workflows for simple tasks** -- complexity gating prevents this (Workflow Patterns)
3. **Destructive context compaction** -- compress, don't discard (Mastra Code)
4. **Single-metric quality evaluation** -- track multiple dimensions (Skill Creator)
5. **Auto-approval** -- humans retain final decision authority (Code Review)
6. **Agents discovering context via tool calls** -- pre-load at dispatch time (Open SWE, GSD 2)
7. **Shared context between parallel agents** -- isolate fully (Skill Creator, Open SWE)

## Research Gaps

Areas not well covered by these sources that v2 should investigate further:

1. **MuninnDB-specific graduation algorithms** -- No source uses semantic graph memory with structured graduation. This is novel territory for Luca
2. **Multi-file research output schemas** -- Sources validate the concept but don't detail output structure for multi-agent research aggregation
3. **Review loop token budgets** -- Claude Code Review costs $15-25/PR; what is the right budget for per-phase review in an agentic workflow?
4. **Cross-session research caching** -- When should research be re-done vs. recalled from prior sessions?
5. **Debate patterns for conflicting findings** -- When parallel research agents produce contradictory findings, how should conflicts be resolved?
