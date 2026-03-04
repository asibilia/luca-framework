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
