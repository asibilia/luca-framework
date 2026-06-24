---
title: "Layout components (LayoutShell, DetailPanel, ResizableSplit, NavRail)"
area: ui
created: 2026-03-25
source: docs/brainstorm/observer-studio-rework
depends_on: [studio-w2-new-dependencies]
phase: studio-w4
estimated_size: M
priority: P1
---

## Context

The Studio uses a three-zone layout shell that adapts based on context (dashboard vs editor vs browser). These four layout components are required by all new pages and must be built before any page work can begin.

## Task

Build four layout components using shadcn primitives and react-resizable-panels:

- **LayoutShell:** Three-zone CSS Grid (`grid-template-columns: auto 1fr auto`) with rail, content, and detail panel zones. Adapts based on page context (dashboard: wide rail + centered content; editor: collapsed rail + full bleed + docked panel).
- **DetailPanel:** Right-side slide-over/docked panel with resize. Three states: closed, floating (overlay), docked (pushes content). Animates with `transform: translateX()` and `data-state` attribute. Width: 400-600px.
- **ResizableSplit:** Wrapper around `react-resizable-panels` for consistent resize behavior.
- **NavRail:** Collapsed (48px) / expanded (240px) navigation rail. Icon-first, hover/pin to expand. Auto-collapses during editing.

Panel state should be persisted in Jotai across navigation.

See `docs/brainstorm/observer-studio-rework/3.ui-architecture.md` (Layout Patterns section) for detailed specs and the layout adaptation table.

## Key Files

- New: `packages/luca-studio/components/layout/layout-shell.tsx`
- New: `packages/luca-studio/components/layout/detail-panel.tsx`
- New: `packages/luca-studio/components/layout/resizable-split.tsx`
- New: `packages/luca-studio/components/layout/nav-rail.tsx`

## Verification

- LayoutShell renders three-zone grid with correct CSS Grid columns
- DetailPanel transitions between closed/floating/docked states
- ResizableSplit allows drag-to-resize with min/max constraints
- NavRail collapses to 48px and expands to 240px on hover/pin
- Layout adapts correctly for dashboard vs editor contexts
