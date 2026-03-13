---
title: "Observer: Node-Graph Workflow Editor"
area: ui
created: 2026-03-13
source: conversation
---

## Context

The Luca Observer app needs a visual way to represent and edit the lu workflow design. The current workflow is defined in code/config but lacks a visual editor for understanding and modifying the agent pipeline.

## Task

Add a new page to the Observer app that provides a node-graph based editor (ComfyUI-style) for representing and editing the lu workflow design. This should visualize:

- Agent nodes (lu-router, lu-planner, lu-executor, lu-verifier, etc.)
- Skill nodes and their triggers
- Data flow between agents (context envelopes, state transitions)
- Workflow steps and their dependencies
- Complexity gating / model routing per node

## Notes

- Look at libraries like React Flow, xyflow, or similar for the node-graph UI
- The editor should be able to read the current workflow definition and render it
- Editing capabilities should allow reordering, adding/removing nodes, and configuring agent parameters
- Consider read-only mode first, then edit mode as a follow-up
- The Observer app lives in `packages/luca-observer/`
