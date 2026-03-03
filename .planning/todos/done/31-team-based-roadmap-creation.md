---
title: "Team-Based Roadmap Creation via Agent Swarm"
area: autopilot
created: 2026-03-02
source: user-request
tier: 2
complexity: COMPLEX
---

## Context

Currently the autopilot skill does roadmap revision as a single-agent task (lu-pm-planner). This misses the benefit of diverse specialist perspectives evaluating todos from different angles before synthesizing into a cohesive roadmap.

## Task

Implement a TeamCreate-based swarm for roadmap creation within the autopilot skill. Replace the single lu-pm-planner spawn in Step 2 (Roadmap Revision) with a multi-agent team.

### Proposed Team Structure

1. **Architect** — Evaluates todos for architectural impact, dependency ordering, structural risk, and domain tier implications
2. **PM/Prioritizer** — WSJF scoring (Business Value + Time Criticality + Risk Reduction / Effort), milestone scoping, effort estimation
3. **Quality Engineer** — Testing gap analysis, verification requirements, tech debt severity, CI/CD impact assessment
4. **Lead/Synthesizer** (team lead) — Merges specialist inputs into a cohesive roadmap with phases, dependency graphs, and milestone boundaries

### Workflow

1. TeamCreate with 4 agents
2. Each specialist reads pending todos + project state + MEMORY.md
3. Specialists produce assessments (sent to lead via SendMessage)
4. Lead synthesizes into proposed ROADMAP.md revision with:
   - WSJF-ordered phases
   - Dependency graph
   - Milestone boundaries (when scope warrants a new milestone vs cleanup patch)
   - Requirements draft
5. Lead presents proposal for oversight gate approval
6. TeamDelete after approval

### Integration Points

- Replaces Step 2 (Roadmap Revision) in `.claude/skills/autopilot/`
- Respects existing oversight gates (full-auto: auto-approve, phase/milestone: pause for review)
- Team agents use worktree isolation (read-only — they don't write code, just produce assessments)

## Notes

- This is a meta-orchestration enhancement — affects the autopilot skill, not the framework source
- Should also consider whether the team approach applies to milestone-new skill
- Could reuse team structure for other planning activities (phase-plan, phase-discuss)
