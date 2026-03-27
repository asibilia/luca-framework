# Workflow Canvas: UX Analysis

> **Author:** UX Designer (AI agent)
> **Date:** 2026-03-25
> **Status:** Approved — incorporated into main spec
> **Note:** This is a summary of key decisions. The full 400+ line UX analysis covered canvas interaction model, information architecture, node inspector UX, execution visualization, accessibility, and anti-patterns. Key decisions are captured here.

---

## Critical UX Items (Priority Order)

### CRITICAL (must-have for MVP)

1. **Undo/Redo (Cmd+Z / Cmd+Shift+Z)** — Without undo, users fear experimentation. Use `jotai-history` on combined graph atom.
2. **Handle size increase (8px -> 12px visual, 44px hit area)** — Current 8px handles violate accessibility minimums (Apple HIG: 44x44px).
3. **Connection rejection feedback (toast with reason)** — Silent rejection is confusing. Show "Connection rejected: would create a cycle."

### HIGH (should-have for launch)

4. Multi-select (marquee + shift-click)
5. Right-click context menu for node placement
6. Keyboard shortcuts (Delete, Cmd+D, Tab navigation)
7. Execution visualization (node states, edge animation)
8. Error state visualization (red nodes, click for details)
9. Port type differentiation (shape + size)

### MEDIUM (polish for v1.1)

10. Slash command palette for node placement
11. Drag-from-palette node placement
12. Template variable autocomplete
13. Bottom results drawer for execution output
14. Zoom level indicator
15. Node grouping / subgraph collapse
16. Workflow templates gallery

## Key Interaction Decisions

- **Pan/zoom:** Scroll to zoom (standard), trackpad pinch (native React Flow), double-click to zoom-to-node
- **Selection:** Click to select, Shift+drag for marquee, Shift+click for additive
- **Node placement:** Right-click context menu (power user), toolbar button (discoverable), slash command (fastest)
- **Connection drawing:** Drag from port, valid targets glow, invalid targets dim, cycle rejection toast
- **Edge routing:** Keep smoothstep (existing), bezier too spaghetti-prone
- **Inspector:** Side panel (keep existing 480px), NOT modal (n8n's biggest UX complaint), NOT inline (too complex for MVP)
- **Inline editing:** Deferred to Phase 2 per Frontend recommendation — inspector-panel-only for MVP

## Node Visual Hierarchy

| Node Type             | Color                       | Shape               | Handle Config         |
| --------------------- | --------------------------- | ------------------- | --------------------- |
| Skill                 | Violet                      | Card (250px)        | Top in, Bottom out    |
| Agent                 | Sky/Amber/Emerald (by tier) | Card (250px)        | Top in, Bottom out    |
| Hook                  | Teal                        | Narrow card (200px) | Bottom out ONLY       |
| StageGroup            | Per-stage color             | Container           | N/A (parent)          |
| Gate                  | Amber                       | Card with lock icon | Top in, Bottom out    |
| Conditional (Phase 2) | Blue                        | Diamond             | Top in, 2+ bottom out |

## Execution States (5 for MVP, not 7)

| State   | Visual                   | Animation                  |
| ------- | ------------------------ | -------------------------- |
| Pending | Gray dashed border       | Subtle pulse               |
| Running | Blue ring                | Pulsing glow + spinner     |
| Success | Green check badge        | 3s green ring, then fade   |
| Error   | Red X badge + red border | Persistent until inspected |
| Skipped | Dimmed (opacity 0.5)     | None                       |

Dropped: "Idle" (indistinguishable from default) and "Paused" (requires debug mode UI that doesn't exist).

## Accessibility Position

- Desktop-first, tablet-tolerated, mobile-excluded (minimum 1024px viewport)
- All actions keyboard-accessible (Tab between nodes, Enter to inspect, Delete to remove)
- ARIA live regions for execution status announcements
- List-view alternative for screen readers (Phase 2)
- Full WCAG 2.1 AA for canvas is unrealistic — focus on keyboard access + screen reader alternatives

## Key Files Referenced

- `components/workflow/pipeline-canvas.tsx` — Main canvas component
- `components/workflow/nodes/node-card.tsx` — Shared node card (handle size lives here)
- `components/workflow/canvas-toolbar.tsx` — Toolbar (add undo/redo/play here)
- `components/workflow/step-config-panel.tsx` — Inspector panel
- `stores/pipeline-atoms.ts` — Canvas state atoms
- `components/workflow/add-step-menu.tsx` — Current add menu
- `lib/workflow-types.ts` — Node/edge Zod schemas
- `components/layout/layout-shell.tsx` — 3-zone layout grid
