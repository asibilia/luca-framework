---
title: "v2 External Research — validated patterns to adopt in implementation"
area: design
created: 2026-03-23
source: docs/workflow-system/v2/07-external-research/README.md
---

## Context

8 external sources were analyzed. 10 high-confidence patterns emerged. These should guide implementation decisions, not be treated as separate tasks. Tracked here as a reference for implementers.

## Validated Patterns (adopt)

1. **Fresh session per task with MuninnDB context injection** (GSD 2, Open SWE, Mastra Code)
2. **Evaluator-optimizer review loops with max iterations + quality thresholds** (Workflow Patterns, Code Review, Skill Creator)
3. **Parallel agent isolation with external aggregation** (Open SWE, Code Review, Workflow Patterns, Skill Creator)
4. **Deterministic convergence criteria for review loops** (Open SWE, GSD 2, Workflow Patterns)
5. **Complexity-gated workflow depth** (Workflow Patterns, Code Review, GSD 2)
6. **Verification filtering after parallel reviews** (Code Review, Open SWE)
7. **Hallucination guard** — reject zero-tool-call completions (GSD 2)
8. **Curated tool sets per agent role** (Open SWE, Skill Creator)
9. **Sliding-window stuck detection for review loops** (GSD 2)
10. **Memory lifecycle with graduation criteria** (Mastra Code, Skill Creator, GSD 2)

## Anti-Patterns (avoid)

1. Review loops without stopping criteria
2. Complex workflows for simple tasks
3. Destructive context compaction
4. Single-metric quality evaluation
5. Auto-approval — humans retain final authority
6. Agents discovering context via tool calls (pre-load at dispatch)
7. Shared context between parallel agents

## Research Gaps (investigate during implementation)

1. MuninnDB-specific graduation algorithms (novel for Luca)
2. Multi-file research output schemas
3. Review loop token budgets
4. Cross-session research caching
5. Debate patterns for conflicting findings

## Notes

- This is a reference document, not an implementation task
- Patterns #7 (hallucination guard) and #9 (stuck detection) are good candidates for future enhancements beyond initial v2
