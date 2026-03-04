---
title: "P2: Standardize loading states with LoadingSkeleton component"
area: ui
created: 2026-03-04
source: repo-review audit (uiux-reviewer)
priority: P2
---

## Context

A reusable `LoadingSkeleton` component exists with 4 variants (card, table, chart, text) and proper `role="status"` accessibility, but 7 pages use inline `animate-pulse` divs instead.

## Task

1. Replace inline loading states in: agents, iterations, planning, workflow, harness, cost, decisions pages
2. Import `LoadingSkeleton` and use appropriate variant for each page
3. Ensure consistent animation and accessibility across all loading states
4. Add `animate-pulse` to cost page loading text for consistency (currently missing)

## Notes

- Affected pages: `/agents`, `/iterations`, `/planning`, `/workflow`, `/harness`, `/cost`, `/decisions`
- LoadingSkeleton provides semantic HTML that inline divs lack
- Quick batch fix — mostly import + replace
