---
title: "Agent Effectiveness Scorecard"
area: framework/memory
created: 2026-03-01
source: expert-panel-research
tier: 2
complexity: MODERATE
moat: Strong
---

## Context

No visibility into which agents perform well and which struggle. Quality-trend.ts has rolling average pattern but only at phase level.

## Task

Per-agent telemetry aggregation: first-pass success rate, avg iterations to convergence, learning yield (candidate -> MEMORY.md graduation rate), learning utility (recall_count), procedure reliability. Stored in `.planning/AGENT_SCORES.md`. Surfaced in cognitive pre-flight.

**Implementation:**

- New: `src/memory/__helpers/agent-scorecard.ts` — aggregation logic
- Add agentScorecardSchema to `src/memory/__schemas/memory.schemas.ts`
- Add read-agent-scores subcommand to `src/memory/__helpers/bridge.ts`
- Export scorecard utilities from `src/memory/index.ts`
- Surface scores in `src/agents/general/lu-cognition.agent.ts` pre-flight

## Notes

- Creates data flywheel for Tier 3 features (#12, #13, #15)
- Source agents: Intelligence Expert + Competitive Edge Expert
