# Phase 8 Plan 1 Summary: Agents Browser Page

## Outcome

All four tasks completed successfully. The agents browser page is fully functional with a two-panel layout (entity tree + tabbed editor), structured config form, read-only prompt/source/compiled tabs, save/discard workflow with ETag concurrency, and Cmd+S keyboard shortcut.

## Tasks Completed

### Task 1: Agent List Page with EntityTree Integration

- Replaced stub `app/agents/page.tsx` with client component
- Sets `layoutContextAtom` to "editor" on mount (collapses NavRail)
- Created `hooks/use-agent-list.ts` -- fetches from `/api/entities/agents`, populates `agentRegistryAtom`
- Created `hooks/use-agent-detail.ts` -- fetches single agent detail, populates `agentDraftAtom(name)`
- ResizableSplit with EntityTree on left (20% default, 15-30% range)
- Loading skeletons and empty state when no agent selected

### Task 2: Tab Container with Configure, Prompt, Source, Compiled Tabs

- Created `components/agents/agent-tab-container.tsx` with four shadcn Tabs
- Prompt tab renders CodeMirrorWrapper with `readOnly={true}` and "coming in future" banner
- Source tab renders full TypeScript source via `shiki-code-block.tsx`
- Compiled tab renders markdown compiled preview via same Shiki component
- Created `components/shared/shiki-code-block.tsx` -- reusable Shiki syntax highlighter with light/dark theme support
- DirtyIndicator shows on Configure tab when draft is dirty

### Task 3: Agent Configure Form

- Created `components/agents/agent-config-form.tsx` with collapsible sections
- Identity section: name (read-only), description (textarea)
- Model Configuration section: enabled toggle (switch), model_tier (select dropdown)
- Routing section: read-only ModelRoutingDisplay showing preset grid per complexity level
- Metadata section: purpose, stage badge, variable name, config type, factory function
- Created `components/agents/model-routing-display.tsx` -- grid display of all 7 routing presets
- Every field change triggers `markDirtyAtom("agent:<name>")`
- ValidationBanner integrated at top of form

### Task 4: Live Preview Panel and Save Integration

- Created `components/agents/agent-preview.tsx` with debounced (300ms) compiled preview
- Created `hooks/use-agent-save.ts` -- PUT with ETag If-Match, error handling for 409 conflicts
- SaveBar wired at bottom of editor area, scoped to `entityFilter="agent:"`
- Cmd+S keyboard shortcut triggers save
- Discard resets draft atom and clears dirty tracking

## Files Created

| File                                          | Purpose                                          |
| --------------------------------------------- | ------------------------------------------------ |
| `app/agents/page.tsx`                         | Replaced stub with full agents browser           |
| `components/agents/agent-tab-container.tsx`   | Four-tab editor container                        |
| `components/agents/agent-config-form.tsx`     | Structured config form with collapsible sections |
| `components/agents/agent-preview.tsx`         | Debounced compiled preview component             |
| `components/agents/model-routing-display.tsx` | Read-only routing grid display                   |
| `components/shared/shiki-code-block.tsx`      | Reusable Shiki syntax highlighter                |
| `hooks/use-agent-list.ts`                     | Agent list data fetching hook                    |
| `hooks/use-agent-detail.ts`                   | Single agent fetch + draft population            |
| `hooks/use-agent-save.ts`                     | Save/discard with ETag concurrency               |

## Deviations

1. **[Deviation] DetailPanel preview deferred** -- The plan specified a docked DetailPanel showing compiled preview. The root layout (`app/layout.tsx`) renders LayoutShell statically and does not pass `detailChildren` from page context. Rather than refactoring the root layout (architectural change -- Rule 4), the compiled preview is accessible via the "Compiled" tab. The AgentPreview component is ready for integration when the root layout supports dynamic detail content injection.

2. **[Rule 2 -- Missing Critical] Type narrowing for regex extraction** -- The `parseAgentConfig` regex helper needed explicit nullish coalescing (`?? ""`) on match group access to satisfy TypeScript strict mode.

## Verification Results

- `bunx --bun tsc --noEmit`: 0 new errors (7 pre-existing in pipeline/workflow modules)
- All plan success criteria met except docked DetailPanel preview (deferred, covered by Compiled tab)
- File naming: all kebab-case
- Import standards: all top-level, grouped correctly
- No classes used -- functional components and hooks throughout
- No test files created (per no-tests rule)
