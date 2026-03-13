---
title: "Add core pipeline skill nodes to workflow editor topology"
area: ui
created: 2026-03-13
source: conversation
---

## Context

The topology audit found zero skill nodes in the workflow graph. Skills are the orchestration layer — they invoke agents, not the reverse. 51 skills exist in `src/skills/` but none appear in the topology.

## Task

Add skill nodes for the core pipeline skills to `AGENTS[]` in `workflow-topology.ts` with `node_type: "skill"`:

### Core Pipeline Skills (must add)

| Skill          | Stage   | Role                                      |
| -------------- | ------- | ----------------------------------------- |
| lu             | entry   | Unified entry point, routes to sub-skills |
| phase-discuss  | discuss | Orchestrates discussion phase             |
| phase-plan     | plan    | Orchestrates planning phase               |
| phase-execute  | execute | Orchestrates execution, spawns agents     |
| phase-research | plan    | Pre-planning research                     |
| verify         | verify  | Ad-hoc verification                       |
| autopilot      | meta    | Autonomous multi-phase orchestrator       |
| debug          | meta    | Debug workflow entry point                |
| quick          | meta    | Quick task handler                        |

### Add skill→agent edges

Add `spawns` edges from skills to the agents they invoke:

- phase-execute → lu-executor, code reviewers (5 agents)
- phase-plan → lu-phase-researcher, lu-planner, lu-plan-checker
- phase-discuss → lu-discuss-researcher
- lu (entry) → phase-discuss, phase-plan, phase-execute (skill chain)

### Consider "meta" stage

Skills like `autopilot`, `debug`, and `quick` don't fit neatly into the 6 pipeline stages. May need a "meta" or "entry" stage container, or render them outside stage containers.

## References

- `docs/workflow-system/topology-audit.md` — "Skills (Completely Missing)" section
- `src/skills/luca/lu.skill.ts` — entry point skill with routing logic
- `src/skills/general/phase-*.skill.ts` — phase orchestration skills

## Notes

This is more involved than adding agents because skills need edge connections to agents they invoke. The skill→agent invocation data is currently prose in skill body text — will need to be extracted manually for now.
