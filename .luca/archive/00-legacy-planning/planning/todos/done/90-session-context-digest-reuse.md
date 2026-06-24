---
title: "Session context digest reuse across sub-agents"
area: framework/memory
created: 2026-03-08
source: muninn-memory-audit (context-analyst, pipeline-auditor)
priority: P1
complexity: MODERATE
---

## Context

The Muninn memory audit found that session findings are recalled 2-3 times per phase by different agents (lu-verifier, lu-learner) independently re-querying MuninnDB for the same session:\* engrams. This is the highest-ROI token optimization target.

Additionally, the pipeline auditor found that sub-agents spawned via Task() receive zero session context — they work in isolation from accumulated workflow knowledge.

## Task

1. After lu-executor completes a wave, publish a single `session:digest-{phase}` engram summarizing key findings
2. Pass the digest engram ID (not full content) to lu-verifier and lu-learner in their Task() prompts
3. Lu-verifier and lu-learner recall by ID (`muninn_read`) instead of broad semantic recall
4. Reduce redundant `muninn_recall(context: "session findings")` calls from 2-3 per phase to 1

Files to modify:

- `src/skills/general/phase-execute.skill.ts` — add digest creation between execution and verification
- `src/agents/luca/lu-executor.agent.ts` — produce structured digest after wave completion
- `src/agents/general/lu-verifier.agent.ts` — accept digest ID in prompt, use `muninn_read` instead of `muninn_recall`
- `src/agents/general/lu-learner.agent.ts` — same pattern

Estimated savings: **2-3.8K tokens per phase (~2% of 200K context window)**

## Notes

- Estimated effort: 3-4 hours
- Part of Muninn Memory Audit Tier 1 recommendations
- Related: #92 (inject memory context into sub-agents)
