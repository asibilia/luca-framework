# Phase 242: Per-Article Pipeline

## Objective

Build all agents and skills for the per-article pipeline stages (ingest, relevance, research, analysis, implementation research).

## Wave 1 — Agent Definitions (parallel, 3 files)

### Task 1.1: Ingest Agent

Create `src/agents/general/lu-scout-ingest.agent.ts` — WebFetch article, extract content, produce structured digest.
**Verify:** Exports via createAgent(), type-checks clean.

### Task 1.2: Relevance Agent

Create `src/agents/general/lu-scout-relevance.agent.ts` — Quick HIGH/MEDIUM/LOW relevance assessment.
**Verify:** Exports via createAgent(), type-checks clean.

### Task 1.3: Analyst Agent

Create `src/agents/general/lu-scout-analyst.agent.ts` — Framework impact analysis, gap identification.
**Verify:** Exports via createAgent(), type-checks clean.

## Wave 2 — Skill Definitions (parallel, 5 files)

### Task 2.1: Ingest Skill

Create `src/skills/general/scout-ingest.skill.ts` — Thin wrapper spawning ingest agent.

### Task 2.2: Relevance Skill

Create `src/skills/general/scout-relevance.skill.ts` — Wrapper with LOW-relevance routing.

### Task 2.3: Research Skill

Create `src/skills/general/scout-research.skill.ts` — Spawns 2 existing researchers in parallel.

### Task 2.4: Analyze Skill

Create `src/skills/general/scout-analyze.skill.ts` — Wrapper spawning analyst agent.

### Task 2.5: Impl Research Skill

Create `src/skills/general/scout-impl-research.skill.ts` — Reuses existing implementation researcher.

## Success Criteria

1. All 8 files created and type-check clean
2. Agent definitions registered in agent registry
3. Skill definitions registered in skill registry
4. Agents use scout shared sections
5. Skills follow progressive disclosure pattern
