---
title: Implement context-modular sub-agent architecture for token efficiency
area: workflow
created: 2026-02-10
source: conversation
---

## Context

User wants to shift from feeding large contexts to general-purpose agents toward using multiple specialized sub-agents working on small, isolated tasks. This maximizes token efficiency and output quality by keeping each agent's context focused and minimal.

## Task

1. **Audit current agent usage patterns** — How are agents currently invoked during execution? What context do they receive?
2. **Design sub-agent decomposition strategy** — Define how tasks get broken into small, isolated units suitable for sub-agents
3. **Define sub-agent types** — What specialized agent roles are needed (e.g., file editor, test writer, reviewer, etc.)
4. **Implement context isolation** — Each sub-agent gets only the context it needs, nothing more
5. **Design result aggregation** — How sub-agent outputs get combined into coherent results
6. **Implement parallel execution support** — Multiple sub-agents working simultaneously on independent tasks

## Notes

- Core principle: small context = better output quality + lower token cost
- Sub-agents should have clear, narrow responsibilities
- Context should be assembled per-agent, not broadcast to all
- This directly supports the Ralph Wiggum iterative loop pattern (each iteration can use focused sub-agents)
- Consider how WORKING.md tracks state across multiple parallel sub-agents
