---
title: "Add 19 missing agents to workflow editor topology"
area: ui
created: 2026-03-13
source: conversation
---

## Context

The topology audit (`docs/workflow-system/topology-audit.md`) found that only 20 of 38 agents from `src/agents/` are represented in the observer's hardcoded topology. 19 agents are missing.

## Task

Add entries to the `AGENTS[]` array in `packages/luca-observer/lib/workflow-topology.ts` for:

| Agent                   | Stage   | Purpose                          |
| ----------------------- | ------- | -------------------------------- |
| code-developer          | execute | Implementation partner           |
| lu-debugger             | execute | Bug investigation                |
| lu-integration-checker  | verify  | Cross-phase E2E checks           |
| lu-codebase-mapper      | plan    | Codebase exploration             |
| lu-pm-planner           | plan    | Sprint planning (WSJF)           |
| lu-pr-reviewer          | verify  | PR comment review                |
| lu-project-researcher   | plan    | Domain ecosystem research        |
| lu-repo-architect       | verify  | Repository structure audit       |
| lu-research-synthesizer | plan    | Synthesize parallel research     |
| lu-roadmap-architect    | plan    | Architectural impact analysis    |
| lu-roadmap-prioritizer  | plan    | WSJF scoring for roadmap         |
| lu-roadmap-qa           | verify  | Testing gap analysis             |
| lu-roadmap-synthesizer  | plan    | Merge specialist analyses        |
| lu-roadmapper           | plan    | Create project roadmaps          |
| lu-process-data         | learn   | Compute process metrics          |
| product                 | discuss | Feature request analysis         |
| qa-plan-generator       | verify  | QA testing plan generation       |
| ui                      | verify  | Visual design review             |
| ux                      | verify  | User flow / accessibility review |

Set `model_tier` from `MODEL_ROUTING_TABLE` presets for each.

## References

- `docs/workflow-system/topology-audit.md` — "Missing from Topology (19 agents)" table
- `src/agents/general/` and `src/agents/luca/` — agent source files

## Notes

Mechanical task — add entries to the existing hardcoded array. Will be superseded when workflow.json is implemented, but fixes immediate accuracy gap.
