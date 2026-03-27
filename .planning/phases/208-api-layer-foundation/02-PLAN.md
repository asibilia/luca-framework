---
phase: 208
plan: 2
type: feature
autonomous: true
wave: 2
depends_on: [1]
---

# Phase 208 Plan 2: Client-Side Integration

## Objective

Migrate the `useSSE` hook to typed event listeners, create the DiffPreview component for ETag conflict resolution, and enhance the ConfigHistory component with external-changes warnings — completing the client-side half of the API layer foundation.

> Appetite: Large (~100K tokens remaining of 200K ceiling after Wave 01)

## Context

@packages/luca-studio/hooks/use-sse.ts
@packages/luca-studio/stores/config-atoms.ts
@packages/luca-studio/stores/entity-atoms.ts
@packages/luca-studio/components/settings/config-history.tsx
@packages/luca-studio/components/shared/index.ts
@packages/luca-studio/app/api/events/route.ts (modified in Wave 01)
@packages/luca-studio/lib/compile-events.ts (created in Wave 01)
@packages/luca-studio/app/api/git/publish/route.ts (modified in Wave 01)
@packages/luca-studio/lib/config-section-handler.ts (modified in Wave 01)
@packages/luca-studio/lib/entity-route-helpers.ts (modified in Wave 01)
@.planning/phases/208-api-layer-foundation/01-CONTEXT.md
@.planning/phases/208-api-layer-foundation/01-PREMORTEM.md

## Tasks

### 1. Migrate useSSE hook to typed addEventListener dispatch

**Type:** auto
**TDD:** false
**Depends on:** Wave 01 Task 3 (SSE route typed events)

**PREMORTEM CONSTRAINT #1 (CRITICAL):** The `es.onmessage` handler MUST be removed in the SAME commit that adds typed `addEventListener` bindings. No intermediate state where both dispatch paths coexist — `onmessage` only fires for unnamed `message` events, while `addEventListener('file:changed', ...)` only fires for named events. Partial migration causes silent atom staleness.

Rewrite `packages/luca-studio/hooks/use-sse.ts` to:

1. Remove the `es.onmessage` handler entirely
2. Add typed `addEventListener` calls for each SSE event type:
   - `file:changed` -> re-fetch configAtom/configEtagAtom when path matches `config.json`
   - `state:transition` -> re-fetch stateAtom (replaces the current path-based state.json/STATE.md check)
   - `compile:start` -> set compile status atom to loading state
   - `compile:complete` -> set compile status atom to success
   - `compile:error` -> set compile status atom to error with message
   - `ledger:entry` -> (placeholder listener, logs to console for now)
   - `heartbeat` -> no-op (connection keepalive only)
3. Create a new `compileStatusAtom` in `stores/config-atoms.ts` for compile lifecycle state:
   ```typescript
   type CompileStatus =
     | { state: "idle" }
     | { state: "compiling"; domain: string; name: string }
     | { state: "success"; domain: string; name: string }
     | { state: "error"; domain: string; name: string; error: string };
   export const compileStatusAtom = atom<CompileStatus>({ state: "idle" });
   ```
4. Parse each event's `data` as JSON with try/catch (same defensive pattern as current implementation)
5. Keep the `useRef` guard against duplicate connections and the cleanup on unmount

The hook's return type (`void`) and mounting pattern remain unchanged.

**Files to edit:**

- `packages/luca-studio/hooks/use-sse.ts`
- `packages/luca-studio/stores/config-atoms.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `es.onmessage` is completely removed from `use-sse.ts`
- All 7 event types have corresponding `addEventListener` calls
- `compileStatusAtom` is exported from config-atoms

### 2. Create DiffPreview component for ETag conflict resolution

**Type:** auto
**TDD:** false
**Depends on:** Wave 01 Task 5 (409 responses include current_content)

Create `packages/luca-studio/components/shared/diff-preview.tsx` — a component that displays a side-by-side comparison of local draft vs server content when an ETag 409 conflict occurs.

The component must:

- Accept props: `{ localContent: string; serverContent: string; onAcceptLocal: () => void; onAcceptServer: () => void; onDismiss: () => void }`
- Display a two-column layout:
  - Left column: "Your Changes" (local draft) with a monospace code block
  - Right column: "Server Version" (current server content) with a monospace code block
- Action buttons: "Keep My Changes" (retries with force), "Accept Server Version" (discards local), "Cancel"
- Use existing UI primitives: Card, Button from `~/components/ui/*`
- Use the existing `ShikiCodeBlock` from `~/components/shared/shiki-code-block.tsx` if content is JSON, otherwise plain `<pre>` blocks
- Render in a Dialog overlay (using `~/components/ui/dialog`)
- Export from `~/components/shared/index.ts` barrel

**Files to create:**

- `packages/luca-studio/components/shared/diff-preview.tsx`

**Files to edit:**

- `packages/luca-studio/components/shared/index.ts` (add DiffPreview export)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- DiffPreview is exported from the shared components barrel
- Component accepts the specified prop interface

### 3. Enhance ConfigHistory with external-changes warning

**Type:** auto
**TDD:** false
**Depends on:** Wave 01 Task 4 (publish 409 includes non_studio_files)

Extend `packages/luca-studio/components/settings/config-history.tsx` to surface "blocked by external changes" warnings when the publish route returns 409 with the new `non_studio_files` array.

The component currently has revert-then-publish flow but no awareness of external blocking files. Changes:

1. Add a "Publish All" button at the top of the history card (calls `POST /api/git/publish`)
2. When publish returns 409, show an inline warning banner listing the `non_studio_files`:
   - Warning text: "Publishing is blocked by N uncommitted files outside Studio:"
   - List each file path in monospace font
   - Add a dismissible "Resolution: commit or stash these files from your terminal" hint
3. Store publish-blocked state in local component state (not Jotai — this is transient UI state)
4. Clear the warning on successful publish or when the user dismisses it

**Files to edit:**

- `packages/luca-studio/components/settings/config-history.tsx`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- ConfigHistory has a "Publish All" button
- 409 response with `non_studio_files` renders an inline warning with file paths
- Warning is dismissible

### 4. Add compile status indicator wiring

**Type:** auto
**TDD:** false
**Depends on:** 1 (compileStatusAtom exists)

Wire the `compileStatusAtom` into the entity editor's compile button so users get real-time feedback on compilation status via SSE events rather than just the HTTP response.

Changes:

- Find the compile button in the entity editor (likely in entity detail/editor components)
- Read `compileStatusAtom` via `useAtomValue`
- Show a spinner overlay when `state === 'compiling'`
- Show a brief success toast/indicator when `state === 'success'`
- Show error state when `state === 'error'`
- Reset to idle after 3 seconds on success (auto-dismiss)
- The existing HTTP response-based compile feedback remains as the primary path — SSE status is supplementary (shows status even if another tab triggered compile)

**Files to edit:**

- Relevant entity editor component(s) that contain the compile button (discover during execution)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Compile button reads from `compileStatusAtom`
- Visual feedback changes based on compile lifecycle state

## Verification

1. `bunx --bun tsc --noEmit` passes across the entire `packages/luca-studio/` package
2. `useSSE` hook uses only `addEventListener` — no `onmessage` handler present
3. All 7 SSE event types are handled client-side with appropriate atom invalidation
4. DiffPreview component renders local vs server content with action buttons
5. ConfigHistory shows external-changes warning when publish is blocked
6. Compile status flows end-to-end: compile route -> pub/sub -> SSE -> useSSE -> compileStatusAtom -> UI

## Success Criteria

- The client-side SSE integration is fully migrated to typed events with zero regression in atom invalidation behavior
- ETag conflicts can be visually resolved via DiffPreview instead of silent failure
- Config History surfaces actionable information when publishing is blocked by external changes
- Compile status is visible in real-time across all open Studio tabs

## Output Specification

- `packages/luca-studio/hooks/use-sse.ts` (modified — full rewrite of event dispatch)
- `packages/luca-studio/stores/config-atoms.ts` (modified — new compileStatusAtom)
- `packages/luca-studio/components/shared/diff-preview.tsx` (new)
- `packages/luca-studio/components/shared/index.ts` (modified — new export)
- `packages/luca-studio/components/settings/config-history.tsx` (modified — publish + warning)
- Entity editor component(s) (modified — compile status wiring)
