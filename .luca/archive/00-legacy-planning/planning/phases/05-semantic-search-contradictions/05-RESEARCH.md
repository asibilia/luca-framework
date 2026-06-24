# Phase 5: Semantic Search + Contradiction Views - Research

**Researched:** 2026-03-09
**Domain:** Next.js pages, React hooks, MuninnDB client integration
**Confidence:** HIGH

## Summary

This phase adds two new observer pages -- Semantic Search (`/semantic-search`) and Contradictions (`/contradictions`) -- following established patterns already used across 15+ observer pages. All API routes already exist. The primary work is creating two hooks and two page components with their sub-components.

The codebase has an extremely consistent pattern: every page uses `PageContainer` + `ErrorBoundary` + `LoadingSkeleton` + a custom `use-*` hook with `fetchJson`/`fetchingRef`/`Promise.allSettled`. Every hook duplicates `fetchJson` and `createNotConfiguredError` locally (6 existing copies). This is known debt; new hooks should follow the same duplication pattern for consistency.

**Primary recommendation:** Follow the vault/decisions page pattern exactly. Each page = 1 hook + 1 page.tsx + 2-4 sub-components. Register both pages in NAV_ITEMS (constants.ts) and add their icons to ICON_MAP (sidebar.tsx).

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library              | Version  | Purpose                  | Why Standard                              |
| -------------------- | -------- | ------------------------ | ----------------------------------------- |
| Next.js (App Router) | 15.x     | Page routing, API routes | Project standard                          |
| React                | 19.x     | Component framework      | Project standard                          |
| lucide-react         | ^0.577.0 | Icon library             | Already used in sidebar, all pages        |
| jotai                | \*       | Sidebar state atom       | Only for sidebar, not needed in new pages |

### Supporting

| Library | Version | Purpose           | When to Use                                      |
| ------- | ------- | ----------------- | ------------------------------------------------ |
| zod     | \*      | Schema validation | API request/response validation (already exists) |

### Alternatives Considered

| Instead of               | Could Use                 | Tradeoff                                                                |
| ------------------------ | ------------------------- | ----------------------------------------------------------------------- |
| Local fetchJson per hook | Shared fetch util in lib/ | Would reduce duplication but breaks current pattern; defer to DRY phase |

**Installation:**

```bash
# No new dependencies needed -- everything is already installed
```

## Architecture Patterns

### Recommended Project Structure

```
packages/luca-observer/
├── app/
│   ├── semantic-search/
│   │   └── page.tsx              # NEW: Semantic Search page
│   └── contradictions/
│       └── page.tsx              # NEW: Contradictions page
├── hooks/
│   ├── use-semantic-search.ts    # NEW: Search hook
│   └── use-contradictions.ts     # NEW: Contradictions hook
├── components/
│   ├── semantic-search/          # NEW: directory
│   │   ├── search-bar.tsx        # Search input + advanced toggle
│   │   ├── search-result-card.tsx # Individual result card
│   │   ├── search-results.tsx    # Results list container
│   │   └── score-breakdown.tsx   # Inline explain bar chart
│   └── contradictions/           # NEW: directory
│       ├── contradiction-card.tsx # Side-by-side pair card
│       └── contradiction-list.tsx # List container
└── lib/
    └── constants.ts              # MODIFY: Add 2 NAV_ITEMS entries
```

### Pattern 1: Page Structure (PageContainer + Hook + ErrorBoundary)

**What:** Every observer page follows the same three-layer structure.
**When to use:** Always -- this is the only accepted page pattern.
**Example:**

```typescript
// Source: Verified from app/vault/page.tsx, app/decisions/page.tsx, app/memory/page.tsx
"use client";

import { PageContainer } from "~/components/layout/page-container";
import { ErrorBoundary } from "~/components/shared/error-boundary";
import { LoadingSkeleton } from "~/components/shared/loading-skeleton";
import { useSemanticSearch } from "~/hooks/use-semantic-search";
import { relativeTime } from "~/lib/format";

export default function SemanticSearchPage() {
  const { results, loading, lastUpdated, configured, error, refresh, ... } = useSemanticSearch();

  return (
    <PageContainer
      title="Semantic Search"
      subtitle="MuninnDB Knowledge Search"
      actions={<RefreshButton loading={loading} refresh={refresh} lastUpdated={lastUpdated} />}
    >
      {loading ? <LoadingSkeleton variant="card" /> : !configured ? <NotConfiguredState /> : error ? <ErrorState /> : <Results />}
    </PageContainer>
  );
}
```

### Pattern 2: Hook Structure (fetchJson + fetchingRef + Promise.allSettled)

**What:** Every data hook follows the same fetch lifecycle pattern.
**When to use:** Always for hooks that fetch from /api/muninn/\* routes.
**Example:**

```typescript
// Source: Verified pattern across all 6 existing hooks
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Duplicated per hook (known debt -- 6 existing copies)
function createNotConfiguredError(message: string): Error {
  const e = new Error(message);
  e.name = "NotConfiguredError";
  return e;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (res.status === 503) throw createNotConfiguredError("MuninnDB not configured");
  if (!res.ok) throw new Error(`Fetch ${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export function useSemanticSearch() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);
  const fetchingRef = useRef(false);

  const search = useCallback(async (query: string, options: SearchOptions) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      // ... fetch logic with Promise.allSettled for resilience
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, []);

  return { ... };
}
```

### Pattern 3: Navigation Registration

**What:** Two files must be updated to add nav items: `lib/constants.ts` (NAV_ITEMS array) and `components/layout/sidebar.tsx` (ICON_MAP record).
**When to use:** For every new page.
**Example:**

```typescript
// In lib/constants.ts -- add to NAV_ITEMS array:
{ href: "/semantic-search", label: "Semantic Search", icon: "Search" },
{ href: "/contradictions", label: "Contradictions", icon: "AlertTriangle" },

// In components/layout/sidebar.tsx -- add to ICON_MAP:
import { Search, AlertTriangle } from "lucide-react";
// Add to ICON_MAP record:
Search,
AlertTriangle,
```

### Pattern 4: Component Directory Organization

**What:** Each page gets its own component subdirectory under `components/`.
**When to use:** When a page has 2+ dedicated components.
**Source:** Verified from `components/decisions/`, `components/knowledge-graph/`, `components/vault/`, `components/memory/`.

### Anti-Patterns to Avoid

- **Shared fetchJson util:** Do NOT extract fetchJson to a shared module. Every existing hook duplicates it. Follow the pattern until a DRY extraction phase.
- **Auto-fetch on mount for search:** The semantic search hook should NOT auto-fetch on mount (unlike vault/decisions which fetch data on mount). Search requires user input first.
- **Direct muninn-config import in client code:** NEVER import from `~/lib/muninn-config` in client components. Always use `/api/muninn/*` proxy routes.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem                        | Don't Build          | Use Instead                                                              | Why                                                         |
| ------------------------------ | -------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Page layout with title/actions | Custom div wrapper   | `PageContainer` from `~/components/layout/page-container`                | Consistent padding, responsive gap, title + actions layout  |
| Loading states                 | Custom pulse divs    | `LoadingSkeleton` with variant="card"/"text"/"chart"/"table"             | Accessible, consistent, 4 variants                          |
| Error boundaries               | try/catch in JSX     | `ErrorBoundary` from `~/components/shared/error-boundary`                | Catches render errors, shows fallback                       |
| Empty data states              | Custom empty divs    | `EmptyState` from `~/components/shared/empty-state`                      | Consistent dashed-border pattern                            |
| Relative timestamps            | Date math            | `relativeTime()` from `~/lib/format`                                     | Handles epoch s/ms and Date objects                         |
| API 503 handling               | Custom error checks  | `createNotConfiguredError` + check `error.name === "NotConfiguredError"` | Consistent MuninnDB-not-configured detection                |
| Icons                          | SVGs or custom icons | `lucide-react` icons                                                     | Already used everywhere, Search and AlertTriangle available |

**Key insight:** The observer codebase has already extracted all common UI patterns into shared components. The job is assembly, not invention.

## Common Pitfalls

### Pitfall 1: MuninnContradiction Type Is Incomplete for Display

**What goes wrong:** The CONTEXT.md says to show "content preview (2-3 lines), created_at date, confidence score" for contradictions, but `MuninnContradiction` only has `id_a`, `id_b`, `concept_a`, `concept_b`, `reason`.
**Why it happens:** The MuninnDB contradictions endpoint returns minimal data (IDs + concepts + reason). Content, confidence, and timestamps are NOT included.
**How to avoid:** Two options: (a) Enrich by fetching individual engrams via `/api/muninn/engrams` for each contradiction's IDs (expensive, up to 2N fetches). (b) Show what's available: concept names + reason, with a "View in Memory" link for full details. Option (b) is recommended for MVP.
**Warning signs:** Trying to access `contradiction.content_a` or `contradiction.confidence` -- these fields don't exist.

### Pitfall 2: No Forget API Route Exists

**What goes wrong:** The CONTEXT.md decision #2 says "Forget A" | "Forget B" buttons but there is no `/api/muninn/forget` route and no `forget` method on MuninnClient.
**Why it happens:** The MuninnDB server has a forget endpoint (`POST /api/forget`), but the observer proxy layer never implemented it.
**How to avoid:** Either (a) add a new `/api/muninn/forget/route.ts` proxy + MuninnClient method (small scope addition, ~30 lines), or (b) render the buttons as disabled with a tooltip "Coming soon" and link to MuninnDB directly.
**Warning signs:** Clicking "Forget A" does nothing or crashes.

### Pitfall 3: Search Hook Differs From Other Hooks (On-Demand vs Auto-Fetch)

**What goes wrong:** Following the vault/decisions pattern where `fetchAll` runs on mount via `useEffect`. Semantic search should NOT auto-search on mount.
**Why it happens:** All existing hooks auto-fetch on mount because they display data immediately. Search requires user input first.
**How to avoid:** The `useSemanticSearch` hook should expose a `search(query, options)` function that the page calls on form submit. No `useEffect` auto-fetch. The contradictions hook SHOULD auto-fetch on mount (it needs no user input).
**Warning signs:** Page loads with empty search query hitting the API.

### Pitfall 4: fetchJson Duplication Pattern

**What goes wrong:** Instinct to extract fetchJson to a shared module.
**Why it happens:** There are 6 identical copies across hooks. DRY instinct kicks in.
**How to avoid:** Follow the established pattern. Copy fetchJson + createNotConfiguredError into each new hook. The DRY extraction will happen in a dedicated cleanup phase.
**Warning signs:** Creating a `lib/fetch-helpers.ts` file.

### Pitfall 5: Explain API Requires Original Search Query

**What goes wrong:** Calling `/api/muninn/explain` without the original search query context.
**Why it happens:** The explain endpoint needs `engram_id` AND `query` (the original search terms). If the hook doesn't preserve the search query, explain calls will fail or return wrong scores.
**How to avoid:** Store the last search query in the hook state so explain calls can reference it.
**Warning signs:** Explain scores don't match the search result scores.

## Code Examples

### Semantic Search Hook (Key Patterns)

```typescript
// Source: Derived from use-memory.ts activate pattern + use-decision-trail.ts structure

export interface SemanticSearchResult {
  id: string;
  concept: string;
  content: string;
  score: number;
  confidence: number;
  score_components?: Record<string, number>;
  tags?: string[];
  memory_type?: string;
  /** Populated on-demand via explain endpoint */
  explain?: MuninnExplainResult;
}

export interface SearchOptions {
  mode?: "semantic" | "recent" | "balanced" | "deep";
  profile?:
    | "default"
    | "causal"
    | "confirmatory"
    | "adversarial"
    | "structural";
  threshold?: number;
}

export interface SemanticSearchData {
  results: SemanticSearchResult[];
  loading: boolean;
  error: string | null;
  configured: boolean;
  lastQuery: string | null;
  search: (query: string, options?: SearchOptions) => void;
  explainResult: (engramId: string) => Promise<MuninnExplainResult | null>;
  refresh: () => void;
  lastUpdated: Date | null;
}
```

### Contradictions Hook (Key Patterns)

```typescript
// Source: Derived from use-decision-trail.ts auto-fetch pattern

export interface ContradictionPair {
  id_a: string;
  id_b: string;
  concept_a: string;
  concept_b: string;
  reason: string;
}

export interface ContradictionsData {
  contradictions: ContradictionPair[];
  loading: boolean;
  error: string | null;
  configured: boolean;
  lastUpdated: Date | null;
  refresh: () => void;
}
```

### Activate API Call (POST)

```typescript
// Source: Verified from app/api/muninn/activate/route.ts and use-memory.ts
const response = await fetchJson<{
  activations: MuninnActivation[];
  total_found: number;
}>("/api/muninn/activate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    context: [queryText], // string array
    vault: "default",
    limit: 20,
  }),
});
```

### Explain API Call (POST)

```typescript
// Source: Verified from app/api/muninn/explain/route.ts
const explain = await fetchJson<MuninnExplainResult>("/api/muninn/explain", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    vault: "default",
    engram_id: engramId,
    query: [lastSearchQuery], // Must be the ORIGINAL search query
  }),
});
```

### Contradictions API Call (GET)

```typescript
// Source: Verified from app/api/muninn/contradictions/route.ts
const response = await fetchJson<{ contradictions: MuninnContradiction[] }>(
  "/api/muninn/contradictions",
);
```

### Nav Registration

```typescript
// In lib/constants.ts -- add after knowledge-graph entry:
{ href: "/semantic-search", label: "Semantic Search", icon: "Search" },
{ href: "/contradictions", label: "Contradictions", icon: "AlertTriangle" },

// In components/layout/sidebar.tsx -- add to imports:
import { Search, AlertTriangle } from "lucide-react";
// Add to ICON_MAP:
Search,
AlertTriangle,
```

## State of the Art

| Old Approach | Current Approach          | When Changed | Impact              |
| ------------ | ------------------------- | ------------ | ------------------- |
| N/A          | This is new functionality | Phase 5      | No migration needed |

**Existing patterns to follow:**

- All 6 hooks use the same fetchJson/fetchingRef/Promise.allSettled pattern
- All pages use PageContainer + ErrorBoundary + LoadingSkeleton trio
- All components use Tailwind CSS classes with CSS variables (not inline styles)
- Font: `font-mono` for code/data, default sans for labels

## Open Questions

1. **Forget API Route**
   - What we know: MuninnDB has `POST /api/forget` but observer has no proxy route for it
   - What's unclear: Should Phase 5 add a forget route (small scope) or defer it?
   - Recommendation: Add minimal forget route + MuninnClient.forget() method (est. ~30 lines total). Alternatively, render forget buttons as disabled with tooltip if scope is strict.

2. **Contradiction Content Enrichment**
   - What we know: MuninnContradiction only has concept/reason, not content/confidence/timestamps
   - What's unclear: Should the hook enrich by fetching individual engrams?
   - Recommendation: Show concepts + reason for MVP. "View in Memory" links provide full detail. Avoid N+1 fetch pattern.

3. **Search Mode/Profile/Threshold in Activate API**
   - What we know: The ActivateRequestSchema accepts `context`, `vault`, `limit` only. No mode/profile/threshold params.
   - What's unclear: Does MuninnDB's activate endpoint accept additional parameters like mode, profile, threshold that aren't in the schema?
   - Recommendation: The advanced search options (mode, profile, threshold) may need to be passed through. Check if the activate API supports them, and if so, extend the ActivateRequestSchema. If not, render them as client-side filters or future enhancements.

4. **localStorage Bookmark/Save Search**
   - What we know: CONTEXT.md says "Bookmark/save searches: store in localStorage as JSON array"
   - What's unclear: Whether this should be in the hook or a separate utility
   - Recommendation: Add to hook as `saveSearch()` / `loadSavedSearches()` methods. Simple localStorage read/write.

## Sources

### Primary (HIGH confidence)

- `packages/luca-observer/hooks/use-vault-health.ts` -- Canonical hook pattern
- `packages/luca-observer/hooks/use-knowledge-graph.ts` -- Complex hook pattern
- `packages/luca-observer/hooks/use-decision-trail.ts` -- Simple hook pattern
- `packages/luca-observer/hooks/use-memory.ts` -- Hook with POST activate call
- `packages/luca-observer/app/vault/page.tsx` -- Canonical page pattern
- `packages/luca-observer/app/decisions/page.tsx` -- Simple page pattern
- `packages/luca-observer/app/knowledge-graph/page.tsx` -- Complex page pattern
- `packages/luca-observer/lib/constants.ts` -- NAV_ITEMS registration
- `packages/luca-observer/components/layout/sidebar.tsx` -- ICON_MAP registration
- `packages/luca-observer/lib/muninn-types.ts` -- MuninnActivation, MuninnContradiction, MuninnExplainResult types
- `packages/luca-observer/lib/muninn-schemas.ts` -- ActivateRequestSchema, ExplainRequestSchema, ContradictionsQuerySchema
- `packages/luca-observer/app/api/muninn/activate/route.ts` -- Activate API route
- `packages/luca-observer/app/api/muninn/contradictions/route.ts` -- Contradictions API route
- `packages/luca-observer/app/api/muninn/explain/route.ts` -- Explain API route
- `packages/luca-observer/lib/muninn-config.ts` -- MuninnClient interface and implementations

### Secondary (MEDIUM confidence)

- lucide-react ^0.577.0 -- Search and AlertTriangle icons available (verified via package.json version)

### Tertiary (LOW confidence)

- MuninnDB activate endpoint additional parameters (mode, profile, threshold) -- unverified whether API supports them beyond current schema

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH -- all libraries already installed and in use
- Architecture: HIGH -- direct observation of 6 hooks + 15 pages in codebase
- Pitfalls: HIGH -- discovered via direct type inspection and API route analysis
- Open questions: MEDIUM -- forget API and activate params need validation

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable codebase patterns, no fast-moving dependencies)
