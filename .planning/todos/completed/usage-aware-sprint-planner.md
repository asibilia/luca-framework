---
title: Usage-aware sprint planner — optimize todo backlog for Claude Code session/weekly caps
area: workflow
created: 2026-02-11
source: conversation
---

## Context

User wants smart subagents that can look at the todo backlog and create an optimized roadmap that fits within Claude Code's usage constraints: 3-hour rolling session caps and weekly rolling limits. The planner should balance "needle mover" high-impact tickets with total velocity (number of tickets completed).

## Task

1. **Build a sprint planner subagent** — Reads pending todos, estimates relative effort, and produces an ordered roadmap for a single 3-hour session
2. **Implement session-aware scheduling strategy:**
   - Start with a big, dependency-free "needle mover" todo first (while context is fresh and quality is peak)
   - Progress to smaller tickets as context fills, maximizing total throughput
   - Respect the quality degradation curve (0-30% peak, 30-50% good, 50-70% degrading, 70%+ stop)
3. **Build a weekly planner layer** — Distributes work across multiple 3-hour sessions within the weekly cap
4. **Create a design/product/PM subagent role** that:
   - Analyzes backlog for impact vs. effort
   - Prioritizes "needle movers" (high business value, unblocking)
   - Balances velocity (number of tickets done) with impact
   - Produces a session plan with ordering rationale
5. **Implement technical review gate** — Developer agents review the planned sprint to validate:
   - Priority ratings make sense from a technical perspective
   - Dependencies are correctly ordered
   - Effort estimates are reasonable
   - No hidden blockers

## Usage Cap Reference

- **Session cap:** 3-hour rolling window, then resets
- **Weekly cap:** Rolling weekly limit across all Claude surfaces (claude.ai, Claude Code, Claude Desktop)
- **Different tiers:** Pro, Max ($100), Max ($200) have different allowances
- **Key insight:** All product surfaces share the same usage pool
- Source: https://support.claude.com/en/articles/11647753-understanding-usage-and-length-limits

## Design Considerations

- Should integrate with existing Luca workflow (BRAIN.md context, MEMORY.md learnings)
- Sprint plan output should be a PLAN.md-compatible format
- Should learn from past sessions (which estimates were accurate, which tasks took longer)
- Consider outputting a Mermaid gantt chart for visual planning
- The planner should be aware of the quality degradation curve and front-load complex work
- Could track "session budget" as a percentage and warn when approaching limits

## Notes

- Related to: progressive-context-disclosure.md (context management), context-modularity-subagent-architecture.md (subagent design)
- The PM subagent is a new agent archetype — not executor, not verifier, but strategic planner
- Technical review by developer agents creates a checks-and-balances system between product and engineering perspectives
- This is a meta-workflow tool: it plans how to use the workflow system itself
