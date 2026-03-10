# Phase 139: Observer Todo Tracking View

## Goal

Build a MuninnDB-native todo/backlog tracking view in luca-observer that surfaces task state, velocity metrics, and entity links through the existing MuninnDB API layer.

## Context

The observer already has a TodoTracker component imported in the dashboard and an API route stub at `/app/api/todos/route.ts`. Dependencies #79 (MuninnDB API layer) and #77 (emission layer) are complete from v3.2.0. The design system is established by existing views (Session Explorer, Decision Trail, etc.).

## Tasks

### Task 1: Implement todo API endpoint

**File:** `packages/luca-observer/app/api/todos/route.ts`

Wire the existing route stub to:

1. Query MuninnDB for engrams tagged `task:*`, `phase:*`, `session:*`
2. Parse todo state from engram content (pending, in-progress, completed)
3. Return structured response with todo items, timestamps, and phase context
4. Support query params: `status` filter, `milestone` filter, `limit`

### Task 2: Implement TodoTracker component

**File:** `packages/luca-observer/components/todo-tracker.tsx` (or existing location)

Build the view with:

1. Todo list with status badges (pending/in-progress/done)
2. Group by milestone or phase
3. Velocity sparkline (items completed per milestone)
4. Click to navigate to related MuninnDB entity (decision, learning)
5. Follow existing design system (shadcn components, zinc theme)

### Task 3: Wire into dashboard

**File:** `packages/luca-observer/app/page.tsx`

Ensure TodoTracker renders properly in the dashboard layout with loading states and error boundaries.

## Verification

- [ ] `bunx --bun tsc --noEmit` passes
- [ ] API endpoint returns structured todo data from MuninnDB
- [ ] TodoTracker renders with loading, empty, and data states
- [ ] Velocity metrics display correctly
