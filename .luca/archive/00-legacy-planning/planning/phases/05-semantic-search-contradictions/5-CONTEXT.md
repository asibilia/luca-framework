# Phase 5 Context: Semantic Search + Contradiction Views

## Decisions

### 1. Search Interface UX [researched]

**Decision:** Progressive disclosure with search bar as primary UI element.

- Main search bar at top (full width, prominent) with placeholder "Search your knowledge..."
- "Advanced" toggle reveals: mode selector, profile selector, threshold slider
- Default mode: "semantic", default profile: "default", default threshold: 0.3
- Mode options: semantic | recent | balanced | deep (from MuninnDB activate modes)
- Profile options: default | causal | confirmatory | adversarial | structural
- Threshold: slider 0.0-1.0 with numeric display
- Search on Enter key or button click (not live/debounced — semantic search is expensive)

### 2. Contradiction Display [researched]

**Decision:** Vertical list of side-by-side contradiction pairs.

- Each contradiction is a card with two columns (Memory A | Memory B)
- Show: concept, content preview (2-3 lines), created_at date, confidence score
- Highlighted "reason" field between the two columns explaining the conflict
- Action buttons below each pair: "Forget A" | "Forget B" | "View in Memory"
- No inline merge action — merging is complex and out of scope; link to MuninnDB directly
- The `evolve` action from the todo becomes "View in Memory" — navigate to /memory?entity=X
- Empty state: "No contradictions found — your knowledge base is consistent"

### 3. Search Result Cards [researched]

**Decision:** Compact cards with inline expand for explain breakdown.

- Each result card shows: concept (bold), content preview (2 lines), relevance score bar, type badge, date
- Tags shown as small pills below content
- "Explain" button toggles an inline expandable section showing score_components breakdown (bar chart of each component: semantic_similarity, decay_factor, hebbian_boost, etc.)
- "Traverse" link navigates to /knowledge-graph?entity={first_tag_entity}
- "View" link navigates to /memory?entity={concept}
- Results sorted by score descending (already from API)

### 4. Cross-View Navigation [researched]

**Decision:** Simple URL-based navigation between views.

- "Traverse" from search results → /knowledge-graph (Phase 4 page)
- "View in Memory" from contradictions → /memory?entity={name}
- No state transfer between views — each view loads its own data from URL params
- Bookmark/save searches: store in localStorage as JSON array of {query, mode, profile, threshold, timestamp}

### 5. Page Structure [researched]

**Decision:** Two separate pages, both under the existing nav structure.

- `/semantic-search` — Semantic Search page (nav: "Semantic Search", icon: Search)
- `/contradictions` — Contradiction & Conflict page (nav: "Contradictions", icon: AlertTriangle)
- Both follow PageContainer + hook + ErrorBoundary pattern
- Both handle 503 (MuninnDB not configured) with EmptyState

## Data Sources

| View              | API Route                  | Method | Already Exists? |
| ----------------- | -------------------------- | ------ | --------------- |
| Semantic Search   | /api/muninn/activate       | POST   | Yes             |
| Explain Breakdown | /api/muninn/explain        | POST   | Yes             |
| Contradictions    | /api/muninn/contradictions | GET    | Yes             |
| Entity Link       | /memory?entity=X           | URL    | Yes             |
| Graph Link        | /knowledge-graph           | URL    | Yes (Phase 4)   |

## Key Files

| File                                                          | Purpose                                                          |
| ------------------------------------------------------------- | ---------------------------------------------------------------- |
| packages/luca-observer/lib/muninn-config.ts                   | Server-side MuninnDB client                                      |
| packages/luca-observer/lib/muninn-types.ts                    | MuninnActivation, MuninnContradiction, MuninnExplainResult types |
| packages/luca-observer/lib/muninn-schemas.ts                  | Zod schemas for API validation                                   |
| packages/luca-observer/lib/muninn-route-helper.ts             | Proxy handler pattern                                            |
| packages/luca-observer/app/api/muninn/activate/route.ts       | Semantic recall proxy                                            |
| packages/luca-observer/app/api/muninn/contradictions/route.ts | Contradictions proxy                                             |
| packages/luca-observer/app/api/muninn/explain/route.ts        | Explain scoring proxy                                            |

## Scope Boundary

- Two new pages: semantic search + contradictions
- Two new hooks: useSemanticSearch + useContradictions
- Reuse existing API routes (activate, explain, contradictions already exist)
- One new API route: /api/muninn/forget (proxy to MuninnDB forget endpoint, ~25 lines)
- One new MuninnClient method: forget() (research identified missing proxy for contradiction resolution)
- Nav registration (2 new entries)
- Bookmark/save search deferred (not in scope for this phase — minimal value vs. core search+contradictions)
