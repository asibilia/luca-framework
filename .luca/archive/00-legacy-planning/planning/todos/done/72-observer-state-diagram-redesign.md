---
title: "Observer: Redesign workflow state diagram with SVG flow & transitions"
area: ui
priority: 7
created: 2026-03-06
source: conversation
---

## Context

Current state diagram is a grid of rounded rectangles. It doesn't show transitions, flow direction, or relationships. It's a list masquerading as a diagram.

## Task

- Build proper flow chart with SVG arrows connecting states
- Show the path taken: highlighted edges for transitions that have occurred
- Animate transitions: when state changes, arrow between old and new state pulses
- Consider horizontal swimlane layout: states flow left-to-right with branching at exception states
- Add transition counts on edges (how many times each transition has fired)
- Make it the centerpiece of the /workflow page
- Consider using a lightweight graph layout library or custom SVG

## Notes

Priority 7 — unique differentiator. This is what makes it a world-class observability tool rather than just a data table viewer.
