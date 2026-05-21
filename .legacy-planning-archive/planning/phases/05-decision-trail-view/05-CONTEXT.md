# Phase 05 Context: Decision Trail View

## Gray Area Decisions

### 1. Data Source

Use `/api/muninn/engrams?type=decision&limit=200` to fetch decision engrams. The
MuninnDB engrams route supports `?type=decision` filtering (added in Phase 03).
Decision engrams have `memory_type: "decision"` and concept prefix `decision:`.
Parse the concept suffix as the decision name and display the content as the
decision rationale.

### 2. Page Layout

Single-page filterable list, identical to Session Explorer. Decision cards show:

- Concept name (parsed from `decision:` prefix)
- Decision content (truncated in collapsed view, full on expand)
- Confidence score
- Tags (if present)
- Relative timestamp

Click to expand shows full content and related engrams (via find-by-entity).
Follow the established SessionCard collapsible pattern exactly.

### 3. Filtering

Client-side text search filtering on concept and content fields. No server-side
search needed for v1. A single text input filters the visible decision list.

### 4. Navigation

The nav entry already exists in `lib/constants.ts` at index 10:
`{ href: "/decisions", label: "Decisions", icon: "GitPullRequest" }`.
The ICON_MAP in sidebar.tsx already maps "GitPullRequest". No changes needed
to navigation infrastructure.

### 5. Existing Placeholder Files

The `/decisions` route already has placeholder files from a previous phase:

- `app/decisions/page.tsx` — placeholder "Coming soon" page
- `app/decisions/error.tsx` — already follows PageError pattern (keep as-is)
- `app/decisions/loading.tsx` — already exists but uses table variant; update to card variant

The error.tsx file is already correct. The loading.tsx needs a minor update
to use `variant="card"` instead of `variant="table"` to match the card-based
layout. The page.tsx will be replaced entirely.

### 6. Hook Design

Create a dedicated `useDecisionTrail()` hook following the `useSessionExplorer`
pattern exactly:

- `fetchingRef` to prevent double-fetch in strict mode
- `Promise.allSettled` for 503 graceful degradation
- Manual refresh (no polling)
- `fetchSessionDetail`-equivalent for expanding decision cards via find-by-entity
- Export `DecisionInfo` interface for use by components

### 7. Component Directory

Create `components/decisions/` directory with:

- `decision-card.tsx` — collapsible card (mirrors session-card.tsx)
- `decision-list.tsx` — list container with count header and filter input

### 8. No New Design Tokens

Use existing CSS custom properties only. Decision type badges use existing
color tokens (e.g., `accent`, `info`, `success`).
