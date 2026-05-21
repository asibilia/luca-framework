---
title: "Home page (status card, recent activity, quick actions)"
area: ui
created: 2026-03-25
source: docs/brainstorm/observer-studio-rework
depends_on:
  [
    studio-w3-read-api-routes,
    studio-w4-layout-components,
    studio-w4-navigation-restructure,
  ]
phase: studio-w7
estimated_size: M
priority: P2
---

## Context

The Home page replaces the Observer Dashboard. Instead of vanity metric stat cards, it shows actionable information: what Luca is currently doing, what happened recently, and quick actions to jump into common workflows.

## Task

Build the Home page with three sections:

- **Status card:** "Luca is idle" or "Luca is running Phase 3: Execute on branch `feat/auth-flow`" -- reads from state.json via `/api/state`
- **Recent activity feed:** Last 3-5 completed workflows with outcome badges (success/failure/partial). Reads from session-ledger.jsonl via `/api/ledger`
- **Quick actions row:** "Browse Agents", "View Workflow Pipeline", "Search Memory" -- navigation links to key pages

Design principles: No modals, no tours, no tooltips on first launch. Clean, scannable, action-oriented.

See `docs/brainstorm/observer-studio-rework/1.product-vision.md` (Page Consolidation section, Home replaces Dashboard) and `docs/brainstorm/observer-studio-rework/2.ux-design.md` for Home page UX.

## Key Files

- New: `packages/luca-studio/app/home/page.tsx` (or modify existing dashboard)
- New: `packages/luca-studio/components/home/status-card.tsx`
- New: `packages/luca-studio/components/home/recent-activity.tsx`
- New: `packages/luca-studio/components/home/quick-actions.tsx`

## Verification

- Home page loads and displays current Luca status from state.json
- Recent activity shows last 3-5 ledger entries with outcome badges
- Quick action links navigate to correct pages
- Page renders correctly when state.json or ledger is missing/empty
