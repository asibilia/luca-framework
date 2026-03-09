# Phase 06 Context: Learning Evolution View

## Gray Area Decisions

### 1. Charting Approach: Pure CSS over JS Libraries

**Decision:** Use CSS-based charts (flexbox bars, percentage widths, CSS custom properties) instead of installing a charting library (recharts, d3, chart.js, etc.).

**Rationale:**

- The observer is a developer tool, not a dashboarding product
- The visualizations needed are simple: horizontal bars, vertical bar charts, summary cards
- Adding a charting library inflates the bundle for minimal gain
- CSS bars with `var(--color-*)` tokens integrate naturally with the existing design system
- This establishes a lightweight, reusable charting pattern for future phases

**Trade-off:** Complex chart interactions (tooltips, zoom, drill-down) would require more work. Acceptable because the learning page is read-only summary data.

### 2. Data Source: Reuse Existing Engrams Endpoint

**Decision:** Fetch from the existing `/api/muninn/engrams?limit=500` endpoint and group/aggregate client-side, rather than creating a new aggregation API route.

**Rationale:**

- The engrams endpoint already returns `memory_type`, `created_at`, `concept`, `confidence`, and `tags`
- Client-side grouping by `memory_type` and time period is trivial with the data shapes we have
- Avoids creating new server-side aggregation logic for what is essentially a view concern
- The `use-memory` hook already demonstrates this pattern (fetches all engrams, components group them)
- 500 engrams is a reasonable ceiling for client-side processing

**Trade-off:** If engram counts grow into thousands, the endpoint may need server-side aggregation. For now, the existing limit parameter caps the fetch.

### 3. Hook Architecture: Dedicated Hook vs Reusing useMemory

**Decision:** Create a new `use-learning-evolution` hook rather than extending `useMemory`.

**Rationale:**

- `useMemory` fetches brain activations, session entries, and stats in addition to engrams -- the learning page only needs engrams
- A dedicated hook can request a higher engram limit (500 vs 200) optimized for timeline analysis
- The hook encapsulates the grouping/aggregation logic (by time period, by category) that is specific to the learning view
- Follows the pattern of `use-decision-trail` which also creates a focused hook for a specific page

### 4. Time Grouping: Day Granularity with Weekly Fallback

**Decision:** Group engrams by day for the timeline chart. If the data spans more than 30 days, auto-bucket into weekly groups for readability.

**Rationale:**

- Daily granularity shows the most useful signal for learning velocity
- Weekly rollup prevents the timeline from becoming unreadable over long periods
- The `created_at` field on engrams is a Unix timestamp, so grouping is straightforward

### 5. Navigation Placement: After "Notes"

**Decision:** Place the "Learning" nav item after "Notes" in the sidebar, as the final entry. Use the `BookOpen` icon from lucide-react.

**Rationale:**

- Learning is a summary/analytics view, not a primary workflow page
- It complements the Memory and Notes pages by providing a higher-level view
- BookOpen conveys "knowledge gained over time" without conflicting with Brain (Memory) or StickyNote (Notes)

### 6. No Route-Level error.tsx / loading.tsx

**Decision:** Handle loading and error states inside the page component using the established pattern (inline `LoadingSkeleton` + `ErrorBoundary` wrappers) rather than creating separate Next.js route-level `error.tsx` and `loading.tsx` files.

**Rationale:**

- No other page in the observer uses route-level error/loading files (confirmed by glob search)
- All existing pages use inline `{loading ? <LoadingSkeleton /> : <Content />}` pattern
- Route-level files would be inconsistent with the established pattern
- The inline approach gives more control over partial loading states (e.g., stats loaded but timeline still loading)
