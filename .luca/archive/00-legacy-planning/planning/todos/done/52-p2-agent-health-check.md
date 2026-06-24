---
title: "P2: Add agent health check system"
area: agentic
created: 2026-03-04
source: repo-review audit (agentic-reviewer)
priority: P2
---

## Context

The agent registry exports 33 agents but there's no mechanism to verify agent availability, check dependencies, or report missing agents at runtime. When `lu-executor` tries to spawn a missing agent, the error is implicit.

## Task

1. Create `src/agents/__helpers/health-check.ts`
2. Implement `checkAgentHealth(agentName)` that verifies:
   - Agent definition exists in registry
   - Required tools are available
   - Model is accessible
3. Run health check during cognitive pre-flight
4. Report missing/broken agents with clear error messages

## Notes

- Workflow can silently degrade if agents are missing
- Also suggested: skill dependency graph (separate todo)
- Consider adding to session-start hook
- **Audit update (2026-03-08):** The Muninn memory audit found 8+ agents operating as T0 (stateless) that could benefit from memory integration. Health check should also verify:
  - Agent's `cognition.default_tier` is appropriate for its role (audit found lu-debugger, lu-test-writer, roadmap agents are T0 but should be T1)
  - Agent's `memory_tags` are properly configured
  - Agent's cognition tier is compatible with its spawning skill's expectations
  - Agents that SHOULD use memory but don't: lu-debugger (debugging/pitfalls), lu-test-writer (testing/patterns), lu-roadmap-\* swarm agents (architecture/decisions), code review agents (conventions/patterns)
