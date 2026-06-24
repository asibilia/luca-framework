---
title: "Layer 1: Progressive disclosure executor mode"
area: workflow
created: 2026-03-28
source: conversation
---

## Context

Research shows LLMs physically cannot skip steps they cannot see. Progressive disclosure (from game design quest gating) reveals only the current step, requiring a mandatory tool call to advance. Anthropic's own guidance: "Design systems where agents cannot accidentally skip steps because the environment itself makes each step mandatory."

## Task

Extend `src/workflow/__helpers/dag-executor.ts` with a `progressive` execution mode:

1. **Step-by-step prompt generation**: For each step in the DAG, generate a focused prompt containing only that step's instructions + minimal context from prior steps
2. **Mandatory tool call**: Each step requires `report_step_complete(step_id, evidence)` before the next step is revealed
3. **Evidence validation**: Orchestrator validates the evidence against the step's output schema before advancing
4. **Checkpoint persistence**: After each step, checkpoint state to enable crash recovery

### Key Design Decisions

- The LLM never sees the full workflow spec — only its current assignment
- Context from prior steps is passed as condensed summaries (1,000-2,000 tokens per Anthropic guidance)
- The DAG topological sort determines step order
- Parallel steps (same wave) can be revealed simultaneously

### Files to Modify/Create

- `src/workflow/__helpers/dag-executor.ts` — Add `executeProgressively()` mode
- `src/workflow/__schemas/contracts.schemas.ts` — Add evidence schemas per step
- Possibly a new `src/workflow/__helpers/step-prompt-generator.ts`

## Notes

- Research: `docs/research/anti-step-skipping/04-novel-approaches.md` (Section 2)
- "Blueprint First, Model Second" (arXiv 2508.02721): 10.1pp accuracy gain + 81.8% fewer tool calls
- Downside: higher latency (more round-trips), LLM loses global context
- Mitigate latency with context caching and model tiering
- Estimated effort: 1-2 days
