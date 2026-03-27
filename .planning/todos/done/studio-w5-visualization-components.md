---
title: "Visualization components (WorkflowNode, WorkflowEdge)"
area: ui
created: 2026-03-25
source: docs/brainstorm/observer-studio-rework
depends_on: []
phase: studio-w5
estimated_size: M
priority: P1
---

## Context

The Pipeline page needs custom React Flow node and edge components to render workflow steps with domain-specific styling and interactivity. React Flow v12 is already installed in the Observer codebase.

## Task

Build custom React Flow components:

- **WorkflowNode:** Custom node for pipeline steps. Fixed 280px width, variable height (capped ~120px). Shows: step name + icon, model tier, agent count, iteration budget, status pill (enabled/disabled/error), overflow menu. Left border accent (2px) colored by domain: blue=planning, green=execution, amber=verification, purple=learning. Selected state: `ring-2 ring-primary`.
- **WorkflowEdge:** Animated flow direction edge with direction indicators. Supports connection drawing and validation (acyclic constraint).
- **ComplexityBadge:** Colored badge for complexity levels (TRIVIAL through CRITICAL). Color-coded by tier.

See `docs/brainstorm/observer-studio-rework/3.ui-architecture.md` (Workflow Editor UI and Visualization Components sections) for node design spec and interactive capabilities.

## Key Files

- New: `packages/luca-studio/components/workflow/workflow-node.tsx`
- New: `packages/luca-studio/components/workflow/workflow-edge.tsx`
- New: `packages/luca-studio/components/shared/complexity-badge.tsx`

## Verification

- WorkflowNode renders with correct dimensions (280px width)
- Domain-colored left border accent displays correctly
- Status pill shows enabled/disabled/error states
- WorkflowEdge animates flow direction
- ComplexityBadge renders correct colors per complexity level
- Components integrate with React Flow v12 custom node/edge APIs
