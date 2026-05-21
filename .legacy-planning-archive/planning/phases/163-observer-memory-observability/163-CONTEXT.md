# Phase 163 Context: Observer Memory Observability Upgrade

## Decision 1: Page Redesign Scope [researched]

**Decision:** Redesign the `/memory` page in `packages/luca-observer/` with 6 sections, surfacing the 15 MuninnDB API routes (only 4 currently used) plus hook checkpoint data from Phase 162's observation system.

The 6 sections:

1. **Session Status Hero** — Real-time context gauge with zone color, observation count, checkpoint age
2. **Memory Health Dashboard** — Coherence subscores, orphan ratio, entity count, contradiction count
3. **Recall Effectiveness** — Hit rate, precision, confidence calibration (from Phase 158+ metric engrams)
4. **Memory Timeline** — Observation chronology with zone markers, checkpoint events, phase boundaries
5. **Brain Tree Viewer** — Existing brain tree with enhanced drill-down (already partially built)
6. **Knowledge Graph Mini** — Entity relationship visualization (simplified from existing Knowledge Graph Explorer)

## Decision 2: New API Routes [researched]

**Decision:** Add new API routes in `packages/luca-observer/app/api/muninn/`:

| Route                      | MuninnDB Source                              | Purpose                            |
| -------------------------- | -------------------------------------------- | ---------------------------------- |
| `/api/muninn/health`       | `muninn_state` + `muninn_contradictions`     | Coherence scores, entity stats     |
| `/api/muninn/observations` | `muninn_recall` with `session:observation-*` | Recent observations from Phase 162 |
| `/api/muninn/metrics`      | `muninn_recall` with `metric:*`              | Memory recall precision, hit rate  |
| `/api/muninn/checkpoint`   | Read `.planning/.context-checkpoint.json`    | Latest checkpoint data             |
| `/api/muninn/zone-history` | Read `.context-metrics.json` history         | Zone transition timeline           |

These are all read-only GET routes using the existing MuninnDB REST client pattern.

## Decision 3: Component Architecture [researched]

**Decision:** Use the existing observer component patterns:

- React hooks for data fetching (`useMemoryHealth`, `useObservations`, `useMetrics`)
- Polling pattern from existing hooks (configurable interval, default 30s)
- Zod safeParse on all API responses
- Empty state components for missing data
- CSS chart patterns from existing views (no new chart library)

## Decision 4: Enhanced Header Bar [researched]

**Decision:** Extend the existing context window bar in the observer header with:

- Memory health indicator (green/yellow/red based on coherence score)
- Observation count badge
- Checkpoint age indicator (time since last checkpoint)

## Decision 5: Wave Structure [researched]

**Decision:** 3 waves:

| Wave | What                                  | Rationale                           |
| ---- | ------------------------------------- | ----------------------------------- |
| 1    | API routes + React hooks (data layer) | Foundation — all UI depends on this |
| 2    | 6 page sections (UI components)       | Core UI work                        |
| 3    | Enhanced header bar + polish          | Final touches                       |

## Decision 6: Design System [researched]

**Decision:** Follow existing observer design patterns:

- Tailwind CSS for styling (matches existing pages)
- shadcn/ui components where applicable
- CSS charting patterns (bar charts via CSS, no chart library)
- Dark mode support (observer already has it)
- Responsive layout with grid

## Scope

- All changes in `packages/luca-observer/` (fully isolated from src/)
- 5 new API routes
- 3-4 new React hooks
- 6 new section components + 1 enhanced header component
- 1 redesigned page.tsx

## Verification

- `bunx --bun tsc --noEmit` from packages/luca-observer/
- Manual: launch observer and verify all 6 sections render
- Manual: verify API routes return expected data shapes
