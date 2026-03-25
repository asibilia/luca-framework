---
title: "v2 Phase 5: Executor Enhancement — per-task MuninnDB recall"
area: skills
created: 2026-03-23
source: docs/workflow-system/v2/06-implementation-plan/phased-rollout.md
---

## Context

Enhance the executor to recall only the MuninnDB engrams referenced by its specific task's `research_refs`. This gives executors targeted context (~500 tokens) instead of loading the full research corpus (~8000+ tokens).

## Task

### Modified Files (2)

- `src/agents/luca/lu-executor.agent.ts` — add per-task MuninnDB recall protocol section
- `src/skills/general/phase-execute.skill.ts` — extract research_refs from task frontmatter, pass to executor

### Per-Task Recall Protocol

1. If `research_refs` present: recall each concept from repo vault, inject into working context
2. If `research_refs` absent: v1 behavior (no recall)
3. Fallback: if recall returns no results, log warning and continue (don't halt)

### Verification

- Enhanced executor + phase-execute pass `bunx --bun tsc --noEmit`
- Executor receives only task-specific research context (not full corpus)
- With research_refs: recalls matching engrams
- Without research_refs: behaves like v1
- Missing engrams: warns but does not halt

## Notes

- Depends on Phase 3 (needs graduated engrams in MuninnDB)
- Can be parallelized with Phase 4 (but full integration testing needs Phase 4 complete)
- Low risk — small changes, graceful fallback
