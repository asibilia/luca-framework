---
title: "Fix complexity filter to show model tier badges instead of hiding agents"
area: ui
created: 2026-03-13
source: conversation
---

## Context

The workflow editor's complexity filter currently hides agents based on `complexity_min` — but per `.claude/rules/complexity-gating.md`, ALL agents run at ALL complexity levels. Complexity only controls model tier (haiku/sonnet/opus), not agent visibility.

## Task

1. Remove `complexity_min` gating logic from `workflow-topology.ts` that hides agents
2. Update `complexity-filter.tsx` to change model tier badges on agent cards when a complexity level is selected
3. Show the routing preset name (ALWAYS_FAST, ORCHESTRATOR, DEEP_ANALYSIS, etc.) as metadata on agent nodes
4. Read tier data from `MODEL_ROUTING_TABLE` presets (or hardcode until workflow.json exists)

## References

- `docs/workflow-system/topology-audit.md` — "Complexity Gating (Wrong)" section
- `.claude/rules/complexity-gating.md` — authoritative complexity rules
- `src/complexity/__helpers/model-routing.ts` — 7 named routing presets, source of truth

## Notes

This is a standalone fix that doesn't depend on the workflow.json migration. The complexity filter panel stays in the same position — only its behavior changes from "hide agents" to "update tier badges."
