---
title: Replace complexity gating with per-agent model routing
area: framework/architecture
created: 2026-02-28
source: conversation
---

## Context

Current complexity gating system (TRIVIAL/SIMPLE/MODERATE/COMPLEX/CRITICAL) skips entire workflow steps based on task complexity to save tokens. User believes this is the wrong approach — it creates inconsistent workflows and the savings aren't worth the loss of thoroughness.

## Task

Redesign the complexity system to:

1. **Keep a consistent workflow** — every task goes through the same phases/steps regardless of complexity
2. **Route models per sub-agent** — instead of skipping steps, assign cheaper/faster models to sub-agents based on their responsibility:
   - File discovery agents -> small/fast model (e.g., Haiku)
   - Code review agents -> mid-tier model (e.g., Sonnet)
   - Reasoning/architecture agents -> capable model (e.g., Opus)
3. **Create more granular sub-agents** — break large agents into smaller, specialized ones that can each use the right model for their job
4. **Remove or repurpose the complexity matrix** — the current skip/run/optional matrix in `complexity-gating.md` should be replaced with a model-routing table

## Affected Areas

- `src/complexity/` — complexity schemas and gating logic
- `.claude/rules/complexity-gating.md` — the rule file defining the matrix
- Agent definitions that reference complexity for step-skipping
- Any skill/hook that reads complexity to decide whether to run
- `packages/luca-framework/` — model profile resolution

## Key Insight

> "I'd rather create more subagents to get more granular with our task delegation than skip entire workflows by complexity gating at the top of the phase."

The token savings should come from **using the right model for the right job**, not from **skipping steps entirely**.

## Notes

- This is a significant architectural shift — plan carefully before implementing
- Need to audit all places that currently read complexity level to decide skip/run
- Model routing could be configured per-agent in agent definitions (e.g., `modelTier: "fast" | "balanced" | "capable"`)
- Consider backward compatibility — complexity levels might still be useful for other purposes (e.g., estimating effort)
