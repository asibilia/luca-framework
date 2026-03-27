# Phase 214 Context — Critical Save & Layout Fixes

## Decisions

### Save Callback Fix (REQ-01)

- **Root cause confirmed:** `stores/layout.ts:130` uses `set(_saveCallbackAtom, callback)` where Jotai treats function values as updaters, invoking `callback` immediately instead of storing it.
- **Fix approach:** Wrap callback: `set(_saveCallbackAtom, () => callback)` — one-line fix.
- **Defense-in-depth:**
  - ETag null guard in `use-entity-save.ts:62` — return early with console.warn instead of throwing
  - Dirty guard in `use-config-save.ts` — skip save if not dirty
  - Try/catch around `saveCallback()` in `use-keyboard-shortcuts.ts:124`
- **Out of scope:** Post-save ETag refresh (both hooks don't update ETag from response). Note for future phase.

### Build Pages Entity Sidebar (REQ-02)

- **Approach:** Option A — Build pages render their own entity sidebar panel adjacent to the collapsed nav rail.
- **Rationale:** The nav rail collapse IS intentional (`layoutContext = "editor"` forces 48px to maximize editor space). The problem is that entity list (agents/skills/rules) is inaccessible, not that the nav should expand.
- **Implementation:** Entity list panel renders as a separate `<aside>` between the 48px nav rail and the main content area. Build pages already have their own layout — they just need to include the entity list alongside the editor.
- **Files:** `nav-rail.tsx` (no change needed — collapse is correct), `layout-shell.tsx` (adjust grid for entity panel), `app/agents/page.tsx`, `app/skills/page.tsx`, `app/rules/page.tsx` (render entity sidebar).

## Deferred Ideas

- Post-save ETag refresh in both entity and config save hooks
- Error feedback UX for save failures (currently fire-and-forget via `void`)

---

_Context created: 2026-03-27 — Phase 214 (SIMPLE complexity)_
