# Phase 202: Studio W7 Pages & Consolidation — Context

## Decision Summary

All decisions resolved via codebase analysis and todo specifications (auto-mode, full-auto oversight).

---

## 1. Home Page — Replace Existing Dashboard

**Decision:** Replace the current MuninnDB-centric dashboard with a workflow-centric home page. [codebase-resolved]

**Current state:** `app/page.tsx` shows DashboardStatCards, DashboardCategoryCards, RecentEngrams, TodoTracker, QuickLinks — all MuninnDB-focused vanity metrics.

**New design (from todo):**

- **Status card:** Current Luca state from `/api/state` (idle, running phase N, etc.)
- **Recent activity feed:** Last 3-5 session-ledger entries via new `/api/ledger` route
- **Quick actions row:** Navigation links to key pages (Agents, Pipeline, Memory)

**Implementation approach:**

- Replace existing `app/page.tsx` content entirely
- Create new components: `components/home/status-card.tsx`, `components/home/recent-activity.tsx`, `components/home/quick-actions.tsx`
- Add `/api/ledger` route reading `.planning/session-ledger.jsonl`
- Remove old dashboard components (stat-cards, recent-engrams, quick-links) or keep for reference
- Keep `useDashboard` hook pattern but create `useHomeData` with state + ledger fetching

**Edge cases:**

- Missing/empty state.json: Show "No active session" state
- Missing/empty session-ledger.jsonl: Show "No recent activity" message
- Ledger parse errors: Graceful degradation, skip malformed lines

---

## 2. Config Page — Three Tabs with Structured Forms

**Decision:** Build tabbed config page with Complexity Routing, Gates, and Harness tabs using structured forms (not raw JSON). [codebase-resolved]

**Tab structure:**

- **Complexity Routing tab:** Model routing matrix (editable grid: agents x complexity levels), loop budget table, named preset indicators
- **Gates tab:** Toggle grid (gates as rows, on/off switches), fail-closed semantics badge
- **Harness tab:** Check type toggles (test/typecheck/lint/build), command override inputs, iteration limit numeric inputs

**Implementation approach:**

- Replace `app/config/page.tsx` stub with tabbed layout using shadcn Tabs component
- Three tab components: `components/config/complexity-tab.tsx`, `components/config/gates-tab.tsx`, `components/config/harness-tab.tsx`
- Use existing `configDraftAtom` from `stores/config-atoms.ts` (Layer 2 draft)
- Each tab reads its subsection from the config draft
- Dirty tracking via existing `dirtySetAtom` with key `"config"`
- ETag-based save via existing PUT `/api/config` pattern
- Validation using Zod schemas for each config section
- SaveBar at bottom (shared across all tabs)

**API routes:** Existing read routes (`/api/config/complexity`, `/api/config/gates`, `/api/config/harness`). Write goes to PUT `/api/config` (whole config, not per-section).

---

## 3. Skills + Rules Browser Pages — Clone Agents Pattern

**Decision:** Replicate the agents page pattern for skills and rules with entity-specific tab configurations. [codebase-resolved]

**Skills page:**

- EntityTree (left panel) showing skills grouped by `general/` and `luca/`
- SkillTabContainer (right panel) with tabs: Configure | Source | Compiled
- Configure tab: skill-specific fields (description, arguments schema, trigger patterns)
- Source tab: raw .skill.ts source with Shiki highlighting
- Compiled tab: compiled markdown output
- SaveBar + DirtyIndicator + useUndo (already pre-wired in stub)

**Rules page:**

- EntityTree (left panel) showing rules grouped by `general/` and `profiles/`
- RuleTabContainer (right panel) with tabs: Configure | Source
- Configure tab: rule-specific fields (description, glob patterns, alwaysApply toggle)
- Source tab: raw .rule.ts source with Shiki highlighting
- No "Compiled" tab for rules (rules compile to markdown but are simpler)
- SaveBar + DirtyIndicator + useUndo (already pre-wired in stub)

**Shared infrastructure:**

- Reuse `EntityTree` component (already generic, just pass different entity type)
- Reuse `ResizableSplit` layout from agents page
- Create `use-skill-list.ts`, `use-skill-detail.ts`, `use-skill-save.ts` hooks (clone agent hook patterns)
- Create `use-rule-list.ts`, `use-rule-detail.ts`, `use-rule-save.ts` hooks
- Entity CRUD routes already exist (`/api/entities/skills/*`, `/api/entities/rules/*`)

---

## 4. Memory Page Consolidation — Five Tabs

**Decision:** Convert the six-section scrollable memory page into a five-tab interface, absorbing standalone pages. [codebase-resolved]

**Tab structure:**

- **Browse tab (default):** SessionStatusHero + HealthDashboard + RecallEffectiveness (current sections 1-3). Overview/summary view.
- **Graph tab:** KnowledgeGraphMini expanded to full size (absorbs standalone knowledge-graph page)
- **Search tab:** Semantic search interface (absorbs standalone semantic-search page)
- **Health tab:** Vault health deep-dive (absorbs standalone vault page)
- **Learning tab:** Pattern/decision/pitfall tracking (absorbs standalone learning page)

**Navigation changes:**

- Remove from NAV_GROUPS: entries for learning, vault, knowledge-graph, semantic-search, contradictions, entities
- Memory page stays in OBSERVE group at `/memory`
- Tab state managed via URL search param `?tab=browse|graph|search|health|learning`

**Page removals:**

- `app/learning/page.tsx` — content moves to Memory > Learning tab
- `app/vault/page.tsx` — content moves to Memory > Health tab
- `app/knowledge-graph/page.tsx` — content moves to Memory > Graph tab
- `app/semantic-search/page.tsx` — content moves to Memory > Search tab
- `app/contradictions/page.tsx` — removed entirely (never populated)
- `app/entities/page.tsx` + `app/entities/[name]/page.tsx` — removed (replaced by Agents/Skills/Rules pages)
- `app/decisions/page.tsx` — content accessible under Sessions

**Redirect handling:** Old URLs should still work. Add redirect logic in middleware or in the removed page files pointing to `/memory?tab=<appropriate>`.

---

## 5. Edit vs Observe Mode — Per-Entity Surface

**Decision:** Implement per-editing-surface mode distinction (not a global toggle). View mode is default. [codebase-resolved]

**View mode (default):**

- Standard background (`bg-background`)
- No SaveBar visible
- Fields rendered as text/badges, not inputs
- Detail panel header shows entity name

**Edit mode (entered explicitly):**

- Thin accent bar (2px, `bg-primary`) at top of editing surface
- Detail panel header: "Editing: {entity name}"
- Fields transform to inputs (border appears)
- SaveBar slides up from bottom
- Background shifts to `bg-card`

**Transitions:**

- Observe -> Edit: "Edit" button (pencil icon)
- Edit -> Observe: "Done" (after save) or "Discard"
- Navigation guard: Dialog on nav with dirty state

**Five unsaved-changes signals:**

1. DirtyIndicator dot
2. SaveBar visibility
3. Browser tab title prefix "[*]"
4. Navigation guard dialog
5. Breadcrumb suffix "(edited)"

**Implementation:**

- New hook: `hooks/use-edit-mode.ts` — manages per-entity edit state
- Integrates with existing dirty tracking atoms
- Navigation guard via `beforeunload` event + Next.js router events
- Applied to: agents, skills, rules pages (config page always editable)

---

## Deferred Ideas

- Real-time collaborative editing (multi-user) — separate milestone
- Config page raw JSON editor — Phase 203 (Settings page)
- Memory tab for Contradictions — re-add if data starts populating

---

## Wave Grouping Recommendation

Given dependencies:

- **Wave 1:** Home page + Config page + Skills/Rules pages (independent, can parallelize)
- **Wave 2:** Memory consolidation (depends on nav changes, benefits from stable pages)
- **Wave 3:** Edit vs Observe mode (cross-cutting, applies to all entity pages from Wave 1)
