# Phase 04 — Session Explorer View: Context

## Gray Area 1: Session Data Model & Data Source

**Decision:** Sessions are identified by `session:info` and `session:findings` concepts in MuninnDB. Use the enhanced `/api/muninn/engrams?type=session` filter (from Phase 03) to fetch session engrams, and `/api/muninn/find-by-entity` to find all engrams related to a session. [codebase-analysis]

**Rationale:**

- The emitter (Phase 01) writes `session:info` engrams at session start with workflow, phase, and timestamp metadata
- The emitter writes `session:findings` engrams throughout execution with timestamped findings
- The Phase 03 enhanced engrams route supports `type` filtering, making session engram retrieval straightforward
- The `useMemory()` hook already fetches `/api/muninn/session?limit=50` — the Session Explorer can reuse this pattern with filtering

**Locked:**

- Fetch session list via `/api/muninn/engrams?type=session` or by filtering engrams with concept prefix `session:`
- Fetch session detail via `/api/muninn/find-by-entity` with the session concept as entity
- Group engrams by session using the `session:info` concept's timestamp/workflow metadata
- Each "session" in the UI = a unique `session:info` engram, with its findings as children

## Gray Area 2: Page Layout & Information Density

**Decision:** Use a single-page filterable list layout (not master-detail). Session cards show summary info; clicking expands inline to show findings. Follows the existing `MemoryEntries` collapsible section pattern. [codebase-analysis]

**Rationale:**

- The existing `MemoryEntries` component uses a collapsible sections pattern that works well for grouped data
- Master-detail layouts require more complexity (split panes, responsive handling) and are not used elsewhere in the observer
- The observer's design system uses `space-y-6` vertical rhythm with card-based layouts
- Inline expansion keeps the user in context without navigation

**Locked:**

- Page layout: `PageContainer` with title "Session Explorer", subtitle describing the view
- Session list: Vertical list of session cards, most recent first
- Each card shows: session ID/name, workflow type, phase, start timestamp, engram count
- Click to expand inline: shows session findings as a timeline within the card
- Use `LoadingSkeleton variant="card"` during data fetch
- Use `EmptyState` when no sessions found
- Use `ErrorBoundary` around the session list and each expanded session

## Gray Area 3: Data Fetching Strategy

**Decision:** Create a new `useSessionExplorer()` hook that uses the Phase 03 API routes. Do NOT extend `useMemory()` — keep hooks focused and single-purpose. [codebase-analysis]

**Rationale:**

- `useMemory()` is already complex (4 parallel fetches) and serves the Memory page
- The Session Explorer needs different data: filtered engrams by session concept, not all engrams
- New hooks for new views prevents the "god hook" anti-pattern
- The hook follows the same pattern: `Promise.allSettled()`, manual `refresh()`, no polling

**Locked:**

- Create `hooks/use-session-explorer.ts` with a `useSessionExplorer()` hook
- The hook fetches session-type engrams via `/api/muninn/engrams?type=session` (or concept prefix filter)
- Returns: `{ sessions, loading, error, refresh, lastUpdated }`
- Session detail data (findings) fetched on-demand when a session card is expanded
- Follow the same `fetchingRef` pattern to prevent double-fetch in React strict mode

## Gray Area 4: Navigation & Design System Integration

**Decision:** Add "Sessions" to NAV_ITEMS in `lib/constants.ts` with the `Activity` lucide icon. The design system already exists — reuse it exactly. No new design tokens needed. [codebase-analysis]

**Rationale:**

- NAV_ITEMS already has 11 entries — adding "Sessions" is consistent
- The `Activity` icon from lucide-react fits the session/timeline concept
- The design system (colors, typography, spacing, components) is already complete from Phase 02
- Phase 04 ROADMAP says "Establish design system" but the design system was already established — Phase 04 simply uses it
- No new CSS custom properties, spacing tokens, or component primitives needed

**Locked:**

- Add `{ href: "/sessions", label: "Sessions", icon: "Activity" }` to NAV_ITEMS (position after Dashboard)
- Create page at `app/sessions/page.tsx`
- Reuse existing components: `PageContainer`, `EmptyState`, `ErrorBoundary`, `LoadingSkeleton`, `EventBadge`
- Use existing color tokens from `tailwind/base.css` (event-session, event-state, etc.)
- Use existing formatters from `lib/format.ts` (relativeTime, formatDateTime)
- No new design tokens or component primitives

## Deferred Ideas

- **Session comparison**: Side-by-side comparison of two sessions. Too complex for first view — defer to v3.3.0.
- **Session replay**: Step-by-step replay of session events with timeline scrubbing. Requires SSE or WebSocket. Defer.
- **Session search**: Full-text search across session content. Can be added later with MuninnDB recall API.

---

_Context gathered: 2026-03-09 (auto-discuss, Phase 04, codebase-analysis)_
