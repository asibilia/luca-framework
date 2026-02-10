---
title: Add procedural memory layer (learned skills from experience)
area: workflow
created: 2026-02-10
source: research (cognitive architecture)
---

## Context

Current memory system has three tiers: BRAIN.md (semantic/identity), MEMORY.md (episodic/semantic learnings), WORKING.md (working memory). Research from the ICLR 2026 MemAgents Workshop and cognitive architecture surveys identifies a fourth critical type: **procedural memory** — "how to do things," learned from experience.

Currently, patterns in MEMORY.md are descriptive ("what worked") but not executable. Procedural memory would encode *reusable workflows* extracted from successful executions — essentially auto-generating skill-like templates from experience.

## Task

1. **Design procedural memory format** — Define how to represent executable learned procedures (mini-skill templates extracted from successful patterns)
2. **Add PROCEDURES.md** or extend MEMORY.md with a `## Procedures` section — Store learned "how-to" sequences
3. **Update lu-learner** — After successful verification, extract not just what worked but the *sequence of steps* that worked
4. **Implement procedure recall** — During planning, recall relevant procedures and offer them as starting templates
5. **Design procedure validation** — Track procedure success rate over time; retire procedures that stop working
6. **Consider procedure evolution** — When a procedure is modified in execution, update the stored version (inspired by MemRL self-evolving agents)

## Notes

- Cognitive science taxonomy: semantic (facts), episodic (experiences), procedural (skills), working (active)
- Luca covers semantic (BRAIN), episodic+semantic (MEMORY), working (WORKING) — but not procedural
- Example: "How to add a new CLI command" → sequence of file creates, template renders, test writes
- Procedures bridge the gap between "we learned this pattern works" and "here's exactly how to do it again"
- Research frontier: MemRL (Jan 2026) shows agents that evolve procedures via reinforcement learning
- This makes the framework genuinely smarter over time, not just more informed
