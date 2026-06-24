# Phase 243: Cross-Cutting Batch

## Objective

Build agents and skills for the cross-cutting batch pipeline (integration analysis, todo planning, memory graduation).

## Wave 1 — Agent + Skills (parallel, 2 agents + 3 skills)

### Task 1.1: Integrator Agent

Create `src/agents/general/lu-scout-integrator.agent.ts`

### Task 1.2: Planner Agent

Create `src/agents/general/lu-scout-planner.agent.ts`

### Task 1.3: Integrate Skill

Create `src/skills/general/scout-integrate.skill.ts`

### Task 1.4: Plan Skill

Create `src/skills/general/scout-plan.skill.ts`

### Task 1.5: Graduate Skill

Create `src/skills/general/scout-graduate.skill.ts`

## Success Criteria

1. All 5 files created and type-check clean
2. Agents registered in agent registry
3. Skills registered in skill registry
4. Integrator handles verdict routing (integrate/defer/conflict)
5. Planner includes conflict detection against existing todos
6. Graduate follows research-graduator scoring pattern
