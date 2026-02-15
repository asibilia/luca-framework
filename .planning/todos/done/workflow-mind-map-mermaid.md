---
title: Build comprehensive Mermaid mind map of entire workflow
area: docs
created: 2026-02-10
source: conversation
---

## Context

User wants a visual mind map of the entire Luca workflow system using Mermaid diagrams, added to the project documentation. This serves as both a reference and a design validation tool.

## Task

1. **Map the full workflow** — Document every phase, step, decision point, and branch in the workflow
2. **Map agent orchestration** — Show how sub-agents are spawned, what context they receive, and how results flow back
3. **Map cognition flow** — Show how BRAIN/MEMORY/WORKING data flows through the system
4. **Map complexity gates** — Show how workflow branches based on task complexity
5. **Create Mermaid diagram(s)** — Build the actual diagrams (may need multiple: overview, execution detail, cognition flow)
6. **Add to docs** — Place in appropriate documentation location

## Notes

- Use Mermaid syntax for GitHub-compatible rendering
- May need multiple diagrams at different zoom levels (overview vs. detail)
- Should clearly show which steps are always-on vs. complexity-gated
- Include the iterative loop pattern (Ralph Wiggum) once designed
- This is also a design validation exercise — building the map may reveal gaps
