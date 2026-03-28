---
title: "Config page (Complexity + Gates + Harness as tabs)"
area: ui
created: 2026-03-25
source: docs/brainstorm/observer-studio-rework
depends_on:
  [
    studio-w3-config-write-routes,
    studio-w4-layout-components,
    studio-w4-navigation-restructure,
  ]
phase: studio-w7
estimated_size: L
priority: P2
---

## Context

The Config page consolidates three related configuration surfaces into a single tabbed page under the CONFIGURE navigation group. Research (R8) determined that Complexity, Gates, and Harness are closely related concepts that belong together rather than as separate pages.

## Task

Build a unified Config page with three tabs:

**Complexity Routing tab:**

- Editable model routing matrix (agents x complexity levels) using ModelRoutingGrid
- Loop budget table with numeric inputs
- Named routing presets (ALWAYS_FAST, ORCHESTRATOR, DEEP_ANALYSIS, etc.)
- Visual indicator of which agents use which preset
- Reads/writes via routing table API routes

**Gates tab:**

- Toggle grid (gates x complexity levels)
- Fail-closed semantics indicator
- Per-complexity gate matrix
- Reads/writes via `/api/config/gates`

**Harness tab:**

- Check type toggles (test/typecheck/lint/build)
- Command overrides per check
- Iteration limit configuration
- Reads/writes via `/api/config/harness`

See `docs/brainstorm/observer-studio-rework/1.product-vision.md` (Complexity Routing, Gate Management, Verification Configuration features) and `docs/brainstorm/observer-studio-rework/8.research-ux-product.md` (R8) for the tab consolidation decision.

## Key Files

- New: `packages/luca-studio/app/config/page.tsx`
- New: `packages/luca-studio/components/config/complexity-tab.tsx`
- New: `packages/luca-studio/components/config/gates-tab.tsx`
- New: `packages/luca-studio/components/config/harness-tab.tsx`
- Uses: ModelRoutingGrid, SaveBar, ValidationBanner

## Verification

- Config page renders three tabs with correct content
- Complexity routing matrix is editable with preset detection
- Gate toggles persist via PUT API
- Harness check toggles and command overrides save correctly
- Validation errors display inline via ValidationBanner
- Dirty tracking works across all three tabs
