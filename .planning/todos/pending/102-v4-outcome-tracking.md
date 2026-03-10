---
title: "v4: Outcome tracking (contextual trigger + /outcome skill)"
area: workflow
created: 2026-03-10
source: docs/brainstorm/3.final-workflow.md
priority: P1
complexity: MODERATE
milestone: v4.0.0
---

## Context

Luca currently captures what was built but never checks whether it achieved its goal. Outcome tracking closes this gap with two modes: a low-touch contextual prompt during cognitive pre-flight, and a manual `/outcome` skill for proactive recording.

Design decision D3: minimal contextual trigger + manual skill (ultra-low-touch).

Spec: `docs/brainstorm/3.final-workflow.md` (Outcome Tracking)

## Task

### 1. Contextual Trigger in lu-cognition

Enhance `src/agents/general/lu-cognition.agent.ts`:

- During cognitive pre-flight, recall `outcome:*` engrams for the current domain
- If a feature was shipped recently in this domain AND no outcome recorded:
  - Prompt: "You shipped [Feature X] here. Did it achieve its goal?" (yes / no / too early)
- Store response as `outcome:feature-goal` engram in MuninnDB
- Developer attention: ~15 seconds

### 2. Create /outcome Skill

New skill: `src/skills/general/outcome.skill.ts`

- Developer runs `/outcome` at any time
- Records: feature name, goal achieved (yes/no/partial), evidence, notes
- Stored as `outcome:feature-goal` engram in MuninnDB
- No complexity gating — available at all levels

### 3. Graduation Criteria

- If completion rate <20% over 10 features → drop contextual trigger, keep `/outcome` skill
- Track completion rate via `metric:outcome-completion` engram

## Notes

- Runs at all complexity levels (contextual trigger)
- Zero token cost for the trigger itself (part of existing pre-flight)
- Feeds into process retro dashboard (#104)
