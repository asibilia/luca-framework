---
phase: 202
plan: 2
type: feature
autonomous: true
wave: 2
depends_on: [1]
---

# Phase 202 Plan 2: Memory Page Consolidation Into Tabs

## Objective

Convert the Memory page from a six-section scrollable dashboard into a five-tab interface that absorbs standalone pages (knowledge-graph, semantic-search, vault, learning). Remove absorbed standalone pages from navigation. Add redirects from old URLs to the Memory page with the appropriate tab parameter.

> Appetite: Large (~130,000 tokens remaining of 200,000 ceiling after Wave 1)

## Context

@packages/luca-studio/app/memory/page.tsx (current six-section memory page)
@packages/luca-studio/app/knowledge-graph/page.tsx (absorbed into Graph tab)
@packages/luca-studio/app/semantic-search/page.tsx (absorbed into Search tab)
@packages/luca-studio/app/vault/page.tsx (absorbed into Health tab)
@packages/luca-studio/app/learning/page.tsx (absorbed into Learning tab)
@packages/luca-studio/app/contradictions/page.tsx (removed entirely)
@packages/luca-studio/app/entities/page.tsx (removed -- replaced by Agents/Skills/Rules)
@packages/luca-studio/app/entities/[name]/page.tsx (removed)
@packages/luca-studio/app/decisions/page.tsx (content accessible under Sessions)
@packages/luca-studio/components/memory/ (existing memory section components)
@packages/luca-studio/components/knowledge-graph/ (graph components to absorb)
@packages/luca-studio/components/semantic-search/ (search components to absorb)
@packages/luca-studio/components/vault/ (vault components to absorb)
@packages/luca-studio/components/learning/ (learning components to absorb)
@packages/luca-studio/hooks/use-memory.ts
@packages/luca-studio/hooks/use-memory-health.ts
@packages/luca-studio/hooks/use-observations.ts
@packages/luca-studio/hooks/use-entity-clusters.ts
@packages/luca-studio/hooks/use-knowledge-graph.ts
@packages/luca-studio/hooks/use-learning-evolution.ts
@packages/luca-studio/hooks/use-semantic-search.ts
@packages/luca-studio/hooks/use-vault-health.ts
@packages/luca-studio/lib/constants.ts (NAV_GROUPS to update)
@packages/luca-studio/components/ui/tabs.tsx (shadcn Tabs component)
@.planning/phases/202-studio-w7-pages-consolidation/01-CONTEXT.md
@.planning/phases/202-studio-w7-pages-consolidation/01-PREMORTEM.md

## Tasks

### 1. Create Memory tab components wrapping existing page content

**Type:** auto
**TDD:** false
**Depends on:** none

Create five thin tab wrapper components that compose existing section components and hooks. Each tab mounts its own hooks -- this is the key to the conditional rendering strategy.

**PRE-MORTEM CONSTRAINT:** Memory consolidation MUST use conditional tab rendering (mount/unmount), NOT CSS-hidden panels. Each tab wrapper manages its own hook lifecycle so unmounted tabs do not fetch data.

**New components:**

- `components/memory/tabs/browse-tab.tsx` -- Composes SessionStatusHero, HealthDashboard, RecallEffectiveness, MemoryTimeline, EnhancedBrainTree. Mounts `useMemory`, `useMemoryHealth`, `useObservations`, `useCheckpoint` hooks internally. This is essentially the current memory page content extracted into a component.

- `components/memory/tabs/graph-tab.tsx` -- Renders the full KnowledgeGraph view (absorbing `app/knowledge-graph/page.tsx` content). Mounts `useKnowledgeGraph` and `useEntityClusters` hooks internally. Expands KnowledgeGraphMini to full-size graph with controls, sidebar, and cluster legend.

- `components/memory/tabs/search-tab.tsx` -- Renders the semantic search interface (absorbing `app/semantic-search/page.tsx` content). Mounts `useSemanticSearch` hook internally. Shows SearchBar, SearchResults, ScoreBreakdown.

- `components/memory/tabs/health-tab.tsx` -- Renders vault health deep-dive (absorbing `app/vault/page.tsx` content). Mounts `useVaultHealth` hook internally. Shows VaultOverview, CoherenceMetrics, EngramTypeBreakdown, StorageInfo.

- `components/memory/tabs/learning-tab.tsx` -- Renders pattern/decision/pitfall tracking (absorbing `app/learning/page.tsx` content). Mounts `useLearningEvolution` hook internally. Shows LearningStats, LearningTimeline, CategoryBreakdown, RecentLearnings.

**Files to create:**

- `packages/luca-studio/components/memory/tabs/browse-tab.tsx`
- `packages/luca-studio/components/memory/tabs/graph-tab.tsx`
- `packages/luca-studio/components/memory/tabs/search-tab.tsx`
- `packages/luca-studio/components/memory/tabs/health-tab.tsx`
- `packages/luca-studio/components/memory/tabs/learning-tab.tsx`

**Verification:**

- Each tab component is self-contained with its own hooks
- No tab pre-fetches data when not mounted
- Each tab wraps existing components without duplicating their logic
- TypeScript compiles: `bunx --bun tsc --noEmit` passes

### 2. Rebuild Memory page with tab navigation

**Type:** auto
**TDD:** false
**Depends on:** 1

Replace the current Memory page with a tabbed interface using shadcn Tabs. Tab state is managed via URL search param `?tab=browse|graph|search|health|learning`.

**Tab rendering strategy (PRE-MORTEM CONSTRAINT):**
Use conditional rendering to mount/unmount tab content. Only the active tab's component is in the React tree at any given time. This prevents the waterfall fetch problem identified in the pre-mortem.

```tsx
{
  activeTab === "browse" && <BrowseTab />;
}
{
  activeTab === "graph" && <GraphTab />;
}
{
  activeTab === "search" && <SearchTab />;
}
{
  activeTab === "health" && <HealthTab />;
}
{
  activeTab === "learning" && <LearningTab />;
}
```

Do NOT use `<TabsContent>` with all tabs mounted simultaneously. Do NOT use CSS `display: none` to hide inactive tabs.

**URL-driven tab state:**

- Read initial tab from `?tab=` search param via `useSearchParams()`
- Default to "browse" when no param present
- Update URL on tab change via `router.replace()` (no history push)
- Valid tab values: `browse`, `graph`, `search`, `health`, `learning`

**Page layout:**

- Uses `PageContainer` (dashboard mode) with "Memory" title
- Tab bar at top using shadcn Tabs with line variant
- Refresh button refreshes the currently active tab's data
- Connection status indicator (from existing memory health)

**Files to edit:**

- `packages/luca-studio/app/memory/page.tsx` (complete rewrite)

**Verification:**

- Memory page shows five tabs: Browse, Graph, Search, Health, Learning
- Default tab is Browse (shows current memory overview content)
- Tab switches via URL param (`/memory?tab=graph`)
- Only the active tab's hooks are mounted (check network tab -- inactive tabs should NOT fetch)
- Refresh button works for the active tab
- TypeScript compiles: `bunx --bun tsc --noEmit` passes

### 3. Remove absorbed standalone pages and update navigation

**Type:** auto
**TDD:** false
**Depends on:** 2

Remove the standalone pages that have been absorbed into the Memory tabs. Replace their content with redirects to the Memory page with the appropriate tab parameter. Update NAV_GROUPS to remove entries that no longer need top-level navigation.

**Pages to convert to redirects:**

- `app/learning/page.tsx` -> redirect to `/memory?tab=learning`
- `app/vault/page.tsx` -> redirect to `/memory?tab=health`
- `app/knowledge-graph/page.tsx` -> redirect to `/memory?tab=graph`
- `app/semantic-search/page.tsx` -> redirect to `/memory?tab=search`

**Pages to remove entirely:**

- `app/contradictions/page.tsx` -- never populated, remove file
- `app/entities/page.tsx` -- replaced by Agents/Skills/Rules pages, remove file
- `app/entities/[name]/page.tsx` -- replaced by entity editors, remove file
- `app/decisions/page.tsx` -- content accessible under Sessions, redirect to `/sessions`

**Redirect implementation:**
Each absorbed page becomes a simple redirect component:

```tsx
"use client";
import { redirect } from "next/navigation";
export default function LearningPage() {
  redirect("/memory?tab=learning");
}
```

**Navigation update:**
The current `NAV_GROUPS` in `lib/constants.ts` already only has `/memory` in the OBSERVE group -- the standalone pages are not in the nav. No nav changes needed for this task. Verify this is correct and no other navigation references these removed pages.

**Files to edit/remove:**

- Edit: `packages/luca-studio/app/learning/page.tsx` (replace with redirect)
- Edit: `packages/luca-studio/app/vault/page.tsx` (replace with redirect)
- Edit: `packages/luca-studio/app/knowledge-graph/page.tsx` (replace with redirect)
- Edit: `packages/luca-studio/app/semantic-search/page.tsx` (replace with redirect)
- Edit: `packages/luca-studio/app/decisions/page.tsx` (replace with redirect to /sessions)
- Remove: `packages/luca-studio/app/contradictions/page.tsx`
- Remove: `packages/luca-studio/app/entities/page.tsx`
- Remove: `packages/luca-studio/app/entities/[name]/page.tsx`

**Verification:**

- Navigating to `/learning` redirects to `/memory?tab=learning`
- Navigating to `/vault` redirects to `/memory?tab=health`
- Navigating to `/knowledge-graph` redirects to `/memory?tab=graph`
- Navigating to `/semantic-search` redirects to `/memory?tab=search`
- Navigating to `/decisions` redirects to `/sessions`
- `/contradictions` returns 404 (page removed)
- `/entities` returns 404 (page removed)
- NAV_GROUPS still only contains `/memory` in OBSERVE (no broken nav links)
- TypeScript compiles: `bunx --bun tsc --noEmit` passes

## Verification

1. Memory page loads with Browse tab showing current memory overview content
2. All five tabs render their respective content correctly when selected
3. Tab state persists in URL search params
4. Switching tabs does not cause multiple simultaneous API fetches
5. Old standalone page URLs redirect correctly to the Memory page with appropriate tab
6. Removed pages (contradictions, entities) return 404
7. No broken navigation links in the sidebar
8. `bunx --bun tsc --noEmit` passes with no new type errors

## Success Criteria

- Memory page has five functional tabs: Browse, Graph, Search, Health, Learning
- Conditional tab rendering prevents waterfall fetches (pre-mortem constraint satisfied)
- All absorbed standalone pages redirect to `/memory?tab=<appropriate>`
- Removed pages cleaned up without breaking navigation
- URL-driven tab state (`?tab=`) works for bookmarking and deep-linking

## Output Specification

**New files (5):**

- `packages/luca-studio/components/memory/tabs/browse-tab.tsx`
- `packages/luca-studio/components/memory/tabs/graph-tab.tsx`
- `packages/luca-studio/components/memory/tabs/search-tab.tsx`
- `packages/luca-studio/components/memory/tabs/health-tab.tsx`
- `packages/luca-studio/components/memory/tabs/learning-tab.tsx`

**Edited files (6):**

- `packages/luca-studio/app/memory/page.tsx` (complete rewrite to tabbed layout)
- `packages/luca-studio/app/learning/page.tsx` (replace with redirect)
- `packages/luca-studio/app/vault/page.tsx` (replace with redirect)
- `packages/luca-studio/app/knowledge-graph/page.tsx` (replace with redirect)
- `packages/luca-studio/app/semantic-search/page.tsx` (replace with redirect)
- `packages/luca-studio/app/decisions/page.tsx` (replace with redirect)

**Removed files (3):**

- `packages/luca-studio/app/contradictions/page.tsx`
- `packages/luca-studio/app/entities/page.tsx`
- `packages/luca-studio/app/entities/[name]/page.tsx`
