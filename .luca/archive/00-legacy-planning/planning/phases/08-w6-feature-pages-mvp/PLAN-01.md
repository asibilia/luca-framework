---
phase: 08
plan: 01
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 8 Plan 1: Agents Browser Page

## Objective

Build the Agents page as a three-column entity browser with structured configuration editing, read-only prompt/source/compiled tabs, and live compiled preview. This page lets users browse all 47 agents, view their configuration, and customize model routing and enable/disable toggles. In v1, prompt editing is read-only. The page establishes patterns reused by Skills and Rules pages in Wave 7.

> Appetite: Large (200000 tokens remaining of 200000 ceiling)

## Context

@packages/luca-studio/app/agents/page.tsx (current stub to replace)
@packages/luca-studio/components/editor/entity-tree.tsx (EntityTree component -- groups entities by directory, search/filter, dirty indicators, context menus)
@packages/luca-studio/components/editor/code-mirror-wrapper.tsx (CodeMirror 6 editor with Luca theme, markdown support, toolbar)
@packages/luca-studio/components/feedback/save-bar.tsx (sticky save/discard bar consuming dirtySetAtom)
@packages/luca-studio/components/feedback/dirty-indicator.tsx (amber dot for unsaved changes)
@packages/luca-studio/components/feedback/validation-banner.tsx (inline validation error banner)
@packages/luca-studio/components/layout/layout-shell.tsx (three-zone CSS grid)
@packages/luca-studio/components/layout/detail-panel.tsx (right-side panel with docked/floating/closed states)
@packages/luca-studio/components/layout/resizable-split.tsx (react-resizable-panels wrapper)
@packages/luca-studio/stores/entity-atoms.ts (agentDraftAtom, agentHistoryAtom -- per-entity atomFamily)
@packages/luca-studio/stores/config-atoms.ts (agentRegistryAtom -- server state mirror)
@packages/luca-studio/stores/dirty-tracking.ts (dirtySetAtom, markDirtyAtom, markCleanAtom, canSaveAtom)
@packages/luca-studio/stores/layout.ts (layoutContextAtom, detailPanelStateAtom)
@packages/luca-studio/app/api/entities/agents/route.ts (GET -- list all agents)
@packages/luca-studio/app/api/entities/agents/[name]/route.ts (GET/PUT -- single agent detail + write)
@docs/brainstorm/observer-studio-rework/3.ui-architecture.md (Agent Editor UI spec)

## Tasks

### 1. Agent List Page with EntityTree Integration

**Type:** auto
**TDD:** false
**Depends on:** none

Replace the stub `app/agents/page.tsx` with a client component that:

1. Sets `layoutContextAtom` to `"editor"` on mount (collapses NavRail, enables detail panel).
2. Fetches agent list from `/api/entities/agents` via SWR or useEffect and populates `agentRegistryAtom`.
3. Renders a `ResizableSplit` with left panel (280px default, 20% min, 30% max) containing `EntityTree` and right panel containing the tab editor area.
4. EntityTree receives the agent list mapped to `EntityItem[]` (name, directory, type: "agent"). Selection state via `useState` drives which agent is shown in the editor area.
5. When an agent is selected, fetch its full config from `/api/entities/agents/[name]` and populate `agentDraftAtom(name)`.
6. Show a loading skeleton in the editor area while fetching, and an empty state when no agent is selected.

Create the route-level layout if needed (agents/layout.tsx) for consistent page shell.

**Files to create/edit:**

- `packages/luca-studio/app/agents/page.tsx` (replace stub)
- `packages/luca-studio/app/agents/layout.tsx` (optional, if route layout needed)
- `packages/luca-studio/hooks/use-agent-list.ts` (data fetching hook)
- `packages/luca-studio/hooks/use-agent-detail.ts` (single agent fetch + draft population)

**Verification:**

- Agent list loads and renders in EntityTree grouped by directory (general/, luca/)
- Clicking an agent fetches and displays its config
- Search/filter in EntityTree works
- Layout context is "editor" (NavRail collapses)

### 2. Tab Container with Configure, Prompt, Source, Compiled Tabs

**Type:** auto
**TDD:** false
**Depends on:** 1

Build the agent editor tab container using shadcn Tabs:

1. Create `agent-tab-container.tsx` with four tabs: Configure, Prompt, Source, Compiled.
2. Tab state persisted in URL search params or local component state.
3. Configure tab renders `AgentConfigForm` (Task 3).
4. Prompt tab renders `CodeMirrorWrapper` with `readOnly={true}` showing the agent's prompt/system message content. In v1, editing is disabled. Show a banner indicating "Prompt editing coming in a future release."
5. Source tab renders the agent's raw TypeScript source with Shiki syntax highlighting. Create a `shiki-code-block.tsx` component that uses Shiki for static TypeScript rendering with the app theme.
6. Compiled tab renders the agent's compiled markdown output with Shiki. Uses the same `shiki-code-block.tsx` with markdown language.
7. Tab bar shows `DirtyIndicator` on the Configure tab label when the agent draft is dirty.

**Files to create/edit:**

- `packages/luca-studio/components/agents/agent-tab-container.tsx`
- `packages/luca-studio/components/shared/shiki-code-block.tsx` (reusable Shiki syntax highlighter)

**Verification:**

- All four tabs render and switch correctly
- Prompt tab shows read-only CodeMirror with agent prompt content
- Source tab shows TypeScript with syntax highlighting
- Compiled tab shows markdown with syntax highlighting
- DirtyIndicator appears on Configure tab when draft is modified

### 3. Agent Configure Form

**Type:** auto
**TDD:** false
**Depends on:** 1

Build the structured configuration form for the Configure tab:

1. Create `agent-config-form.tsx` that reads from `agentDraftAtom(name)` and writes changes back to the draft atom.
2. Form fields rendered as collapsible sections using shadcn Collapsible or simple disclosure:
   - **Identity**: name (read-only display), description (textarea)
   - **Model Configuration**: model_tier (select dropdown), enabled (switch toggle)
   - **Routing**: ModelRoutingGrid placeholder (render a read-only table showing the agent's routing preset with tiers per complexity level -- full interactive ModelRoutingGrid is a future enhancement)
   - **Metadata**: purpose (text), stage (badge display)
3. Every field change triggers `markDirtyAtom("agent:<name>")`.
4. Include `ValidationBanner` at the top of the form for the entity key `"agent:<name>"`.
5. Form uses shadcn form primitives (Input, Textarea, Switch, Select) with consistent spacing.

**Files to create/edit:**

- `packages/luca-studio/components/agents/agent-config-form.tsx`
- `packages/luca-studio/components/agents/model-routing-display.tsx` (read-only routing grid display)

**Verification:**

- Form renders all agent config fields
- Editing any field marks the agent as dirty (amber dot appears in tree)
- Enable/disable toggle updates the draft
- Validation banner appears for invalid data
- Form displays current values from the draft atom

### 4. Live Preview Panel and Save Integration

**Type:** auto
**TDD:** false
**Depends on:** 2, 3

Wire up the compiled preview in the DetailPanel and the save/discard workflow:

1. When an agent is selected and has a compiled output, set `detailPanelStateAtom` to `"docked"` and render the compiled markdown preview in the DetailPanel with Shiki highlighting. Title: "Preview: {agent-name}".
2. Preview updates on draft changes with 300ms debounce (use a derived atom or useMemo with debounce).
3. Add `SaveBar` at the bottom of the agent editor area, scoped to `entityFilter="agent:"`.
4. `onSave` handler: serialize the draft back through `PUT /api/entities/agents/[name]`, including the ETag for optimistic concurrency. On success, mark the agent clean via `markCleanAtom`. On 409 conflict, show error toast.
5. `onDiscard` handler: reset `agentDraftAtom(name)` to the server state and clear dirty tracking.
6. Keyboard shortcut: Cmd+S triggers save when on agents page.

**Files to create/edit:**

- `packages/luca-studio/components/agents/agent-preview.tsx` (compiled preview component)
- `packages/luca-studio/hooks/use-agent-save.ts` (save/discard logic with ETag handling)
- `packages/luca-studio/app/agents/page.tsx` (integrate SaveBar and DetailPanel)

**Verification:**

- Detail panel opens with compiled preview when agent selected
- Preview updates debounced after config changes
- Save button persists changes via PUT API
- Discard button reverts to server state
- ETag conflict shows error message
- Cmd+S saves the current agent
- Dirty indicators clear after save

## Verification

1. Navigate to /agents -- page renders with full agent list in EntityTree
2. Click an agent -- all four tabs load with correct content
3. Edit config fields -- dirty indicator appears, SaveBar slides up
4. Save changes -- PUT request succeeds, dirty state clears
5. Discard changes -- form reverts to server values
6. Filter/search in entity tree -- narrows results correctly
7. Detail panel shows live compiled preview
8. Layout adapts correctly (NavRail collapsed, detail panel docked)

## Success Criteria

- All 47 agents are browsable with grouped tree navigation
- Configure tab provides editable form for agent configuration
- Prompt/Source/Compiled tabs render content with syntax highlighting
- Save/discard cycle completes without errors
- Dirty tracking and validation feedback work end-to-end
- Page follows editor layout adaptation (collapsed rail, docked preview)

## Output Specification

- `app/agents/page.tsx` -- fully functional agents browser page
- `components/agents/agent-tab-container.tsx` -- four-tab editor container
- `components/agents/agent-config-form.tsx` -- structured config form
- `components/agents/agent-preview.tsx` -- live compiled preview
- `components/agents/model-routing-display.tsx` -- read-only routing grid
- `components/shared/shiki-code-block.tsx` -- reusable Shiki syntax highlighter
- `hooks/use-agent-list.ts` -- agent list data fetching
- `hooks/use-agent-detail.ts` -- single agent fetch + draft population
- `hooks/use-agent-save.ts` -- save/discard with ETag concurrency
