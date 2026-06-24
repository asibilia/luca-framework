---
title: "Observer: Add time range selector & session picker UI"
area: ui
priority: 8
created: 2026-03-06
source: conversation
---

## Context

For a world-class analytical dashboard, filtering by time and session is essential. selectedSessionAtom exists but has no visible UI picker. No time range filtering exists.

## Task

- Time range selector in header: filter all data by time window (last 1h, 4h, 24h, 7d, custom)
- Session picker dropdown: surface selectedSessionAtom as a visible UI control
- Comparison view: compare two sessions side-by-side (cost, iterations, convergence)
- Alerting indicators: visual prominence for things requiring attention (failed harness, regressing convergence, high context usage)
- Global filter state should propagate to all hooks/data sources

## Notes

Priority 8 — analytical power. Transforms the dashboard from "current state viewer" to "analytical investigation tool."
