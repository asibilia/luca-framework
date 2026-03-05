# Plan 111-02: Tailwind & Dark Mode Polish — Summary

## Phase 111 | Wave 1 | GitHub Issue #44

### Status: COMPLETE (9/9 tasks)

---

### Task 1: System preference dark mode detection

- **File:** `packages/luca-observer/app/layout.tsx`
- **Change:** Removed hardcoded `className="dark"` from `<html>`. Added inline `<script>` in `<head>` that reads `localStorage` key `luca-observer-theme` and falls back to `prefers-color-scheme`. Kept `suppressHydrationWarning`.
- **Commit:** `b778718`

### Task 2: Dark mode CSS variants for event tokens

- **File:** `packages/luca-observer/tailwind/base.css`
- **Change:** Added `html.dark { ... }` block after `html.light` with all 10 `event-*` tokens, making dark mode values independently configurable.
- **Commit:** `3afe1f5`

### Task 3: Convergence chart height responsive

- **File:** `packages/luca-observer/components/iteration/convergence-chart.tsx`
- **Change:** Replaced `style={{ height: "160px" }}` with Tailwind `h-40` class.
- **Commit:** `d590f03`

### Task 4: Migrate color-mix from srgb to oklab

- **Files:** 11 component files (17 instances total)
  - `components/memory/working-sections.tsx` (2)
  - `components/memory/context-usage-bar.tsx` (1)
  - `components/planning/quality-zone-indicator.tsx` (2)
  - `components/planning/wsjf-score-table.tsx` (3)
  - `components/harness/check-result-card.tsx` (1)
  - `components/tribunal/rebuttal-timeline.tsx` (1)
  - `components/tribunal/findings-table.tsx` (3)
  - `components/tribunal/disagreements-panel.tsx` (1)
  - `components/iteration/iteration-timeline.tsx` (1)
  - `components/iteration/budget-gauge.tsx` (1)
  - `components/memory/memory-entries.tsx` (1)
- **Change:** Replaced all `color-mix(in srgb,` with `color-mix(in oklab,` for perceptually uniform color mixing.
- **Commit:** `5b97659`

### Task 5: Replace text-[10px] with text-xs

- **File:** `packages/luca-observer/components/memory/working-sections.tsx`
- **Change:** Replaced arbitrary `text-[10px]` with standard `text-xs` utility.
- **Commit:** `c115102`

### Task 6: Add font-mono to transition-log session_id

- **File:** `packages/luca-observer/components/workflow/transition-log.tsx`
- **Change:** Added `font-mono text-xs` to session_id paragraph in expanded detail rows. Verified timestamp `<td>` already had `font-mono`.
- **Commit:** `ebc470b`

### Task 7: Replace inline calc() with CSS grid

- **File:** `packages/luca-observer/components/planning/quality-zone-indicator.tsx`
- **Change:** Replaced boundary label row using `calc(30% - 1ch)` and flex justify-between with CSS grid (`gridTemplateColumns: "30% 20% 20% 30%"`).
- **Commit:** `f46d83d`

### Task 8: Add type="button" to buttons

- **Files:** 4 component files (5 buttons total)
  - `components/layout/header.tsx` (2 buttons)
  - `components/shared/json-viewer.tsx` (1 button)
  - `components/shared/page-error.tsx` (1 button)
  - `components/dashboard/recent-events.tsx` (1 button)
- **Change:** Added `type="button"` to prevent implicit form submission.
- **Verification:** `grep -rn "<button" | grep -v 'type='` returns zero matches.
- **Commit:** `b946510`

### Task 9: Add --open browser launch warning

- **File:** `packages/luca-observer/bin/luca-observer.js`
- **Change:** Added console.log warning when `--open` flag is used, printed before `spawn()` call.
- **Commit:** `d124263`

---

### Deviations

- **Task 4 count:** Plan specified 16 instances; actual count was 17 (one additional instance found in `memory-entries.tsx`). All 17 were migrated.
- **Pre-existing TypeScript errors:** 4 pre-existing TS errors in page files (`planning/page.tsx`, `tribunal/page.tsx`, `workflow/page.tsx`) related to optional vs required type properties. Unrelated to any changes in this plan.
