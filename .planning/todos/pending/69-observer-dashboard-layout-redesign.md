---
title: "Observer: Dashboard layout redesign with hero banner & asymmetric grid"
area: ui
priority: 4
created: 2026-03-06
source: conversation
---

## Context

Dashboard is an 8-column grid of identically-sized cards followed by two equal columns. No hierarchy — everything has the same visual weight. Workflow state and complexity are the most important info but rendered the same size as event count.

## Task

- Create dashboard hero area: workflow state + complexity as prominent banner with state-colored gradient background (3-4x larger than current cards)
- Asymmetric layouts: event feed wider (60/40 or 70/30 split), not 50/50
- Card size variation: key metrics (state, harness, context health) get large cards; supporting data (event count, transition count) get compact inline badges
- Increase gap between major sections, add dividers or subtle backgrounds to create content zones
- Apply similar layout principles to other pages

## Notes

Priority 4 — information hierarchy. Depends on color system (P2) and typography (P3) being in place.
