---
title: "Observer: Install Lucide icons & redesign sidebar navigation"
area: ui
priority: 1
created: 2026-03-06
source: conversation
---

## Context

Frontend design review identified that sidebar nav uses text strings ("LayoutDashboard", "GitBranch") as icon placeholders — they're not rendered as SVG icons. The sidebar is a flat list with no grouping.

## Task

- Install `lucide-react` and render actual SVG icons in sidebar
- Group nav items into sections: "Overview" (Dashboard), "Execution" (Workflow, Iterations, Harness), "Intelligence" (Planning, Memory, Tribunal), "Analytics" (Agents, Cost, Decisions), "Tools" (Notes)
- Add section dividers with labels between groups
- Show live indicators on nav items: colored dot on "Harness" when failing, pulse on "Iterations" when actively iterating
- Make sidebar header more distinctive: logo mark, version, connection status

## Notes

Priority 1 — immediate visual credibility improvement. Foundation for professional feel.
