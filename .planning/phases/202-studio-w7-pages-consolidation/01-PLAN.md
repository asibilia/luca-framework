---
phase: 202
plan: 1
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 202 Plan 1: Home Page + Config Page + Skills/Rules Pages

## Objective

Build four Studio pages in parallel: replace the MuninnDB-centric home dashboard with a workflow-centric home page, build the tabbed config editor, and implement the Skills and Rules entity browser pages cloning the established Agents page pattern.

> Appetite: Large (200,000 tokens remaining of 200,000 ceiling)

## Context

@packages/luca-studio/app/agents/page.tsx (reference pattern for entity pages)
@packages/luca-studio/hooks/use-agent-list.ts (clone for skills/rules list hooks)
@packages/luca-studio/hooks/use-agent-detail.ts (clone for skills/rules detail hooks)
@packages/luca-studio/hooks/use-agent-save.ts (mergeFieldOverrides extraction source)
@packages/luca-studio/components/agents/agent-tab-container.tsx (clone for skill/rule tab containers)
@packages/luca-studio/components/agents/agent-config-form.tsx (reference for entity config forms)
@packages/luca-studio/stores/entity-atoms.ts (draft + history atoms already exist for all types)
@packages/luca-studio/stores/config-atoms.ts (configDraftAtom, configEtagAtom)
@packages/luca-studio/stores/dirty-tracking.ts (dirtySetAtom key conventions)
@packages/luca-studio/components/editor/entity-tree.tsx (shared, already supports all entity types)
@packages/luca-studio/components/feedback/save-bar.tsx (shared, uses entityFilter prefix)
@packages/luca-studio/components/layout/resizable-split.tsx (shared split pane)
@packages/luca-studio/hooks/use-config-hydration.ts (populates configAtom + configEtagAtom)
@packages/luca-studio/hooks/use-sse.ts (SSE handler for config change detection)
@packages/luca-studio/lib/constants.ts (NAV_GROUPS, WORKFLOW_STATES, COMPLEXITY_LEVELS)
@packages/luca-studio/app/api/ledger/route.ts (existing ledger API route)
@packages/luca-studio/app/api/state/route.ts (existing state API route)
@packages/luca-studio/app/api/config/route.ts (existing config GET/PUT route)
@packages/luca-studio/app/api/entities/skills/route.ts (existing skills list route)
@packages/luca-studio/app/api/entities/skills/[name]/route.ts (existing skills detail route)
@packages/luca-studio/app/api/entities/rules/route.ts (existing rules list route)
@packages/luca-studio/app/api/entities/rules/[name]/route.ts (existing rules detail route)
@.planning/phases/202-studio-w7-pages-consolidation/01-CONTEXT.md
@.planning/phases/202-studio-w7-pages-consolidation/01-PREMORTEM.md
@.planning/phases/202-studio-w7-pages-consolidation/RESEARCH.md

## Tasks

### 1. Extract mergeFieldOverrides into shared helper

**Type:** auto
**TDD:** false
**Depends on:** none

Extract the `mergeFieldOverrides`, `replaceStringField`, and `replaceBoolField` functions from `hooks/use-agent-save.ts` into a shared utility at `hooks/helpers/merge-field-overrides.ts`. The new helper accepts a `fieldKeyMap` parameter instead of using the hardcoded `FIELD_KEY_MAP`. Update `use-agent-save.ts` to import from the shared helper and pass its agent-specific field map.

**PRE-MORTEM CONSTRAINT:** Skills/Rules save hooks MUST NOT copy use-agent-save.ts verbatim. This task extracts the shared logic first.

**Files to create/edit:**

- Create: `packages/luca-studio/hooks/helpers/merge-field-overrides.ts`
- Edit: `packages/luca-studio/hooks/use-agent-save.ts` (import shared helper, pass AGENT_FIELD_KEY_MAP)

**Verification:**

- `mergeFieldOverrides` is now a generic function accepting `(draft, fieldKeyMap)` parameters
- `use-agent-save.ts` still works identically (no behavioral change)
- TypeScript compiles: `bunx --bun tsc --noEmit` passes

### 2. Build Home page with status card and activity feed

**Type:** auto
**TDD:** false
**Depends on:** none

Replace the existing MuninnDB-centric dashboard in `app/page.tsx` with a workflow-centric home page. Create three new components and a data hook.

**New components:**

- `components/home/status-card.tsx` -- Displays current Luca state from `/api/state` (idle, running phase N, etc.) with the appropriate badge color from `WORKFLOW_STATES`
- `components/home/recent-activity.tsx` -- Shows last 5 session-ledger entries from `/api/ledger`, each entry as a row with event type badge, timestamp, and summary
- `components/home/quick-actions.tsx` -- Row of navigation cards linking to Agents, Pipeline, Memory, Config

**New hook:**

- `hooks/use-home-data.ts` -- Fetches both `/api/state` and `/api/ledger` on mount, returns combined data with loading/error/refresh states

**Page replacement:**

- Replace `app/page.tsx` content entirely with the new layout: StatusCard (full width) -> RecentActivity (full width) -> QuickActions (grid)
- Uses `PageContainer` with "Home" title (this is a dashboard page, not an editor page)

**Edge cases:**

- Missing/empty state.json: Show "No active session" placeholder in StatusCard
- Missing/empty session-ledger.jsonl: Show "No recent activity" in RecentActivity
- Ledger parse errors: Skip malformed lines (graceful degradation)

**Files to create/edit:**

- Create: `packages/luca-studio/hooks/use-home-data.ts`
- Create: `packages/luca-studio/components/home/status-card.tsx`
- Create: `packages/luca-studio/components/home/recent-activity.tsx`
- Create: `packages/luca-studio/components/home/quick-actions.tsx`
- Edit: `packages/luca-studio/app/page.tsx` (replace content)

**Verification:**

- Home page renders StatusCard, RecentActivity, QuickActions
- StatusCard shows workflow state from `/api/state` with proper badge
- RecentActivity shows ledger entries or "No recent activity" placeholder
- QuickActions links navigate to correct pages
- TypeScript compiles: `bunx --bun tsc --noEmit` passes

### 3. Build Config page with Complexity/Gates/Harness tabs

**Type:** auto
**TDD:** false
**Depends on:** none

Replace the config page stub with a three-tab editor using shadcn Tabs. Each tab displays a structured form for its config section. The page shares a single SaveBar at the bottom.

**PRE-MORTEM CONSTRAINT:** Config page MUST include SSE conflict-detection when configEtagAtom changes during editing. On SSE config re-hydration, compare incoming ETag against configEtagAtom; if changed while dirtySetAtom contains "config", show a conflict toast and block save until user resolves.

**New components:**

- `components/config/complexity-tab.tsx` -- Model routing matrix display (agents x complexity levels read from configDraftAtom.complexity section), loop budget table, named preset indicators. Fields are editable when in edit state.
- `components/config/gates-tab.tsx` -- Toggle grid showing gates as rows with on/off Switch controls. Each gate shows its name, description, and fail-closed semantics badge.
- `components/config/harness-tab.tsx` -- Check type toggles (test/typecheck/lint/build) with Switch controls, command override text inputs, iteration limit numeric inputs.

**New hook:**

- `hooks/use-config-save.ts` -- Save logic for config sections. Uses `configDraftAtom`, `configEtagAtom`, dirty tracking with key `"config"`. PUT to `/api/config` with If-Match header. Handles 409 conflict.

**SSE conflict detection:**

- Create `hooks/use-config-conflict.ts` -- Watches `configEtagAtom` changes via SSE. When ETag changes while `dirtySetAtom` has `"config"`, sets a conflict flag. The SaveBar (or a toast) shows "Config changed externally" warning and blocks save until user clicks "Refresh" or "Force Save".

**Page assembly:**

- Replace `app/config/page.tsx` with tabbed layout. Uses `PageContainer` (dashboard mode, not editor mode). Three tabs via shadcn Tabs. SaveBar at bottom with `entityFilter="config"`.
- Uses `useConfigHydration()` to seed configAtom on mount.

**Files to create/edit:**

- Create: `packages/luca-studio/components/config/complexity-tab.tsx`
- Create: `packages/luca-studio/components/config/gates-tab.tsx`
- Create: `packages/luca-studio/components/config/harness-tab.tsx`
- Create: `packages/luca-studio/hooks/use-config-save.ts`
- Create: `packages/luca-studio/hooks/use-config-conflict.ts`
- Edit: `packages/luca-studio/app/config/page.tsx` (replace stub)

**Verification:**

- Config page shows three tabs: Complexity Routing, Gates, Harness
- Each tab displays structured form controls (not raw JSON)
- Edits mark dirty tracking key `"config"` as dirty
- Save sends PUT with If-Match header and handles 409
- SSE conflict detection shows warning when external changes occur during editing
- TypeScript compiles: `bunx --bun tsc --noEmit` passes

### 4. Build Skills page hooks (list, detail, save)

**Type:** auto
**TDD:** false
**Depends on:** 1

Create the three hooks needed for the Skills page, following the agent hook patterns exactly. The save hook uses the shared `mergeFieldOverrides` from Task 1 with a skills-specific field key map.

**New hooks:**

- `hooks/use-skill-list.ts` -- Clone of `use-agent-list.ts`. Fetches `/api/entities/skills`. Returns `{ skills, loading, error, refresh }`.
- `hooks/use-skill-detail.ts` -- Clone of `use-agent-detail.ts`. Fetches `/api/entities/skills/[name]`. Populates `skillDraftAtom(name)`, resets `skillHistoryAtom(name)`. Uses nameRef guard for stale fetch prevention.
- `hooks/use-skill-save.ts` -- Uses shared `mergeFieldOverrides` with `SKILL_FIELD_KEY_MAP` (description, enabled). Reads from `skillDraftAtom(name)`. PUTs to `/api/entities/skills/[name]` with If-Match. Marks `skill:{name}` clean on success.

**Files to create:**

- `packages/luca-studio/hooks/use-skill-list.ts`
- `packages/luca-studio/hooks/use-skill-detail.ts`
- `packages/luca-studio/hooks/use-skill-save.ts`

**Verification:**

- All three hooks follow the established agent hook patterns
- `use-skill-detail.ts` calls `resetHistory(RESET)` after populating draft
- `use-skill-detail.ts` uses nameRef guard for stale fetch prevention
- `use-skill-save.ts` imports from shared `merge-field-overrides.ts` (not copy-pasted)
- TypeScript compiles: `bunx --bun tsc --noEmit` passes

### 5. Build Rules page hooks (list, detail, save)

**Type:** auto
**TDD:** false
**Depends on:** 1

Create the three hooks for the Rules page, following the same patterns as Task 4. Note: Rules have a unique directory structure (general/ + profiles/{language}/) that affects the EntityTree directory extraction on the page (not in the hook itself).

**New hooks:**

- `hooks/use-rule-list.ts` -- Clone of `use-agent-list.ts`. Fetches `/api/entities/rules`. Returns `{ rules, loading, error, refresh }`.
- `hooks/use-rule-detail.ts` -- Clone of `use-agent-detail.ts`. Fetches `/api/entities/rules/[name]`. Populates `ruleDraftAtom(name)`, resets `ruleHistoryAtom(name)`.
- `hooks/use-rule-save.ts` -- Uses shared `mergeFieldOverrides` with `RULE_FIELD_KEY_MAP` (description, alwaysApply, enabled). Reads from `ruleDraftAtom(name)`. PUTs to `/api/entities/rules/[name]` with If-Match. Marks `rule:{name}` clean on success.

**Files to create:**

- `packages/luca-studio/hooks/use-rule-list.ts`
- `packages/luca-studio/hooks/use-rule-detail.ts`
- `packages/luca-studio/hooks/use-rule-save.ts`

**Verification:**

- All three hooks follow the established agent hook patterns
- `use-rule-save.ts` field key map includes `alwaysApply` (boolean field unique to rules)
- TypeScript compiles: `bunx --bun tsc --noEmit` passes

### 6. Build Skills page components and page

**Type:** auto
**TDD:** false
**Depends on:** 4

Build the Skills page UI components and replace the stub page.

**New components:**

- `components/skills/skill-tab-container.tsx` -- Three tabs: Configure | Source | Compiled. Clone of `agent-tab-container.tsx` with skill-specific field references. Configure tab shows `SkillConfigForm`. Source tab shows Shiki-highlighted TypeScript. Compiled tab fetches from `/api/compile` with `domain: "skills"`.
- `components/skills/skill-config-form.tsx` -- Structured form for skill fields: description (textarea), arguments schema display, trigger patterns. Writes to `skillDraftAtom(name)` and marks `skill:{name}` dirty.

**Page assembly:**

- Replace `app/skills/page.tsx` with full entity editor layout cloning agents/page.tsx:
  - `setLayoutContext("editor")` on mount, revert on unmount
  - `useSkillList()` for EntityTree
  - `useSkillDetail(selectedName)` for tab container
  - `useUndo(skillHistoryAtom(selectedName))` for undo/redo
  - `useSkillSave(selectedName, etag)` for save/discard
  - Cmd+S keyboard shortcut
  - `ResizableSplit` with EntityTree left, SkillTabContainer + SaveBar right
  - `SaveBar` with `entityFilter="skill:"`

**Directory extraction for EntityTree:**

- Skills use `general/` and `luca/` subdirectories (same as agents). Use the same `filePath.split("/")` pattern from agents page.

**Files to create/edit:**

- Create: `packages/luca-studio/components/skills/skill-tab-container.tsx`
- Create: `packages/luca-studio/components/skills/skill-config-form.tsx`
- Edit: `packages/luca-studio/app/skills/page.tsx` (replace stub with full editor)

**Verification:**

- Skills page shows EntityTree on left, tab editor on right
- EntityTree shows skills grouped by general/ and luca/ directories
- Configure tab edits mark dirty tracking with `skill:` prefix
- Source tab shows Shiki-highlighted TypeScript source
- Compiled tab fetches from compilation sidecar (with offline fallback)
- SaveBar filters to `skill:` entities only
- Cmd+S triggers save
- TypeScript compiles: `bunx --bun tsc --noEmit` passes

### 7. Build Rules page components and page

**Type:** auto
**TDD:** false
**Depends on:** 5

Build the Rules page UI components and replace the stub page.

**New components:**

- `components/rules/rule-tab-container.tsx` -- Two tabs: Configure | Source. No Compiled tab for rules (simpler output). Configure tab shows `RuleConfigForm`. Source tab shows Shiki-highlighted TypeScript.
- `components/rules/rule-config-form.tsx` -- Structured form for rule fields: description (textarea), glob patterns (comma-separated input), alwaysApply toggle (Switch), enabled toggle. Writes to `ruleDraftAtom(name)` and marks `rule:{name}` dirty.

**Page assembly:**

- Replace `app/rules/page.tsx` with full entity editor layout (same as skills, with rule-specific atoms and hooks).
- `SaveBar` with `entityFilter="rule:"`

**Directory extraction for EntityTree (CRITICAL -- differs from agents/skills):**

- Rules use `general/` and `profiles/{language}/` subdirectories. The EntityTree directory for rules needs to extract potentially two path levels. From the research:
  ```typescript
  const srcIdx = pathParts.indexOf("rules");
  if (srcIdx >= 0) {
    const subdir = pathParts[srcIdx + 1];
    if (subdir === "profiles" && srcIdx + 2 < pathParts.length) {
      directory = `profiles/${pathParts[srcIdx + 2]}/`;
    } else {
      directory = `${subdir}/`;
    }
  }
  ```

**Files to create/edit:**

- Create: `packages/luca-studio/components/rules/rule-tab-container.tsx`
- Create: `packages/luca-studio/components/rules/rule-config-form.tsx`
- Edit: `packages/luca-studio/app/rules/page.tsx` (replace stub with full editor)

**Verification:**

- Rules page shows EntityTree on left, tab editor on right
- EntityTree shows rules grouped correctly: general/ and profiles/{language}/ directories
- Rules under `profiles/typescript/` appear under that group, not flat "profiles/"
- Configure tab shows rule-specific fields including alwaysApply toggle and glob patterns
- Source tab shows Shiki-highlighted TypeScript source
- SaveBar filters to `rule:` entities only
- TypeScript compiles: `bunx --bun tsc --noEmit` passes

## Verification

1. All four pages render without errors in the browser
2. Home page shows workflow state, activity feed, and quick actions
3. Config page tabs switch correctly, edits trigger dirty tracking, save works with ETag concurrency
4. Config page shows SSE conflict warning when config.json changes externally during editing
5. Skills page entity editor works end-to-end: list -> select -> edit -> save -> dirty cleared
6. Rules page entity editor works end-to-end with correct directory grouping
7. `bunx --bun tsc --noEmit` passes with no new type errors
8. Cmd+S keyboard shortcut works on Skills and Rules pages
9. SaveBar on each page only shows its own entity type's dirty count

## Success Criteria

- Home page replaced with workflow-centric design (StatusCard + RecentActivity + QuickActions)
- Config page has three functional tabs with structured forms and SSE conflict detection
- Skills page is a fully functional entity browser cloning the Agents page pattern
- Rules page is a fully functional entity browser with correct profiles/ directory handling
- mergeFieldOverrides extracted to shared utility (pre-mortem constraint satisfied)
- No copy-paste of use-agent-save.ts into skill/rule save hooks (pre-mortem constraint satisfied)
- SSE conflict detection on config page (pre-mortem constraint satisfied)

## Output Specification

**New files (16):**

- `packages/luca-studio/hooks/helpers/merge-field-overrides.ts`
- `packages/luca-studio/hooks/use-home-data.ts`
- `packages/luca-studio/hooks/use-skill-list.ts`
- `packages/luca-studio/hooks/use-skill-detail.ts`
- `packages/luca-studio/hooks/use-skill-save.ts`
- `packages/luca-studio/hooks/use-rule-list.ts`
- `packages/luca-studio/hooks/use-rule-detail.ts`
- `packages/luca-studio/hooks/use-rule-save.ts`
- `packages/luca-studio/hooks/use-config-save.ts`
- `packages/luca-studio/hooks/use-config-conflict.ts`
- `packages/luca-studio/components/home/status-card.tsx`
- `packages/luca-studio/components/home/recent-activity.tsx`
- `packages/luca-studio/components/home/quick-actions.tsx`
- `packages/luca-studio/components/config/complexity-tab.tsx`
- `packages/luca-studio/components/config/gates-tab.tsx`
- `packages/luca-studio/components/config/harness-tab.tsx`

**New files (4 -- skill/rule components):**

- `packages/luca-studio/components/skills/skill-tab-container.tsx`
- `packages/luca-studio/components/skills/skill-config-form.tsx`
- `packages/luca-studio/components/rules/rule-tab-container.tsx`
- `packages/luca-studio/components/rules/rule-config-form.tsx`

**Edited files (4):**

- `packages/luca-studio/hooks/use-agent-save.ts` (import shared helper)
- `packages/luca-studio/app/page.tsx` (replace home page content)
- `packages/luca-studio/app/config/page.tsx` (replace stub)
- `packages/luca-studio/app/skills/page.tsx` (replace stub)
- `packages/luca-studio/app/rules/page.tsx` (replace stub)
