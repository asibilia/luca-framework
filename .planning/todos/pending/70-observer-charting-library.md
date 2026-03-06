---
title: "Observer: Replace CSS charts with proper charting library"
area: ui
priority: 5
created: 2026-03-06
source: conversation
---

## Context

Charts are CSS div bars — no tooltips, axis labels, gridlines, or smooth interpolation. @tremor/react is in dependencies but barely used. The convergence chart and cost curve look like homework assignments.

## Task

- Evaluate: commit to Tremor fully, or replace with Recharts (more customizable) or Nivo (better defaults)
- Convergence chart: Y-axis with error counts, X-axis with iteration numbers, hover tooltips, gridlines, area fill
- Cost curve: proper area chart with gradient fill instead of bars
- Budget gauge: radial/gauge chart (circular progress indicator)
- Add sparklines to overview cards — tiny inline chart showing trend in each card
- Token usage trends: proper multi-series line chart
- Ensure all charts respect the design system color tokens

## Notes

Priority 5 — data visualization quality. Major upgrade for analytical dashboard credibility.
