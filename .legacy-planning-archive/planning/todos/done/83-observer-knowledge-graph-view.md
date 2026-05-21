---
title: "Build observer view: Knowledge Graph Explorer"
area: ui
created: 2026-03-08
source: conversation
priority: 4
---

## Context

Hero view for MuninnDB-native observer. Interactive force-directed graph of entities and relationships showing the AI's understanding of the project.

## Task

Build Knowledge Graph Explorer:

- Force-directed graph of entities and relationships
- Click entity node to expand connected engrams
- Filter by entity type and relationship type
- Color nodes by entity state (active=green, deprecated=gray)
- Size nodes by engram count
- Highlight contradiction edges in red
- Time slider to show graph evolution

## Notes

- Data source: `export_graph` (JSON-LD/GraphML)
- Graph library options: d3-force, react-force-graph, vis.js, cytoscape.js
- Needs to handle 100-1000 nodes gracefully
- Brainstorm doc: `.claude/plans/polished-mapping-fern.md`
