---
title: "Layer 0: Decompose monolithic skills into atomic sub-skill chains"
area: skills
created: 2026-03-28
source: conversation
---

## Context

Research in `docs/research/anti-step-skipping/` demonstrates that LLMs skip steps in long workflow specs due to "Lost in the Middle" attention decay (Liu et al., ACL 2024), instruction saturation (IFScale 2025), and optimization bias. Decomposition is Layer 0 of the 5-layer anti-step-skipping architecture.

## Task

Break the 5 highest-risk monolithic skills into chains of focused sub-skills (~100-150 lines each):

### Priority 1: pr-address (815 lines, 9+ steps, HIGH skip risk)

```
pr-address (thin orchestrator)
  -> pr-fetch      (~100 lines: resolve PR, fetch comments)
  -> pr-validate   (~150 lines: categorize, spawn reviewers, collect verdicts)
  -> pr-debate     (~100 lines: split verdict handling, conditional)
  -> pr-fix        (~150 lines: plan + execute + verify fixes)
  -> pr-learn      (~80 lines: spawn lu-learner, MuninnDB capture)
  -> pr-respond    (~120 lines: post comments, push, summary)
```

### Priority 2: milestone-complete (~800 lines, 9+ steps, HIGH skip risk)

Break into: milestone-learn, milestone-prune, milestone-shadow-gate, milestone-archive, milestone-retro

### Priority 3: lu.skill.ts (~19,000 tokens, 11+ steps, HIGH skip risk)

Break routing, configuration, backlog scan, roadmap revision, and phase loop into distinct sub-skills.

### Priority 4: verify.skill.ts (~800 lines, 12 steps, MEDIUM skip risk)

Break into: verify-extract, verify-test, verify-diagnose, verify-review

### Priority 5: phase-execute.skill.ts (~29,000 tokens, MEDIUM risk — already has state machine)

Decompose wave execution, code review, and verification into distinct sub-skills.

### Implementation Pattern

- Each sub-skill is a new `.skill.ts` file in `src/skills/general/`
- Parent skill becomes a thin orchestrator calling `Skill()` for each sub-skill
- State passes between sub-skills via typed context objects
- Sub-skills follow `disable-model-invocation: true` pattern

## Notes

- Research: `docs/research/anti-step-skipping/02-decomposition-case.md`
- Key evidence: IFScale shows omission errors dominate at high instruction density
- LangGraph docs: "If a node is doing five things, it should probably be five nodes"
- Avoid the "micro-agent" anti-pattern — decompose at natural task boundaries, not arbitrary line counts
- Supersedes `pr-address-learning-capture.md` (quick-fix) with architectural solution
