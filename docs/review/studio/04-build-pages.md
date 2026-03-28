# S-08, S-09 — Build Pages Issues (Agents, Skills, Rules)

## S-08: Sidebar Permanently Collapsed (Critical)

### Symptom

On all three build pages (Agents, Skills, Rules), the sidebar is collapsed to a 48px icon strip. It cannot be expanded — no toggle, no hover-expand. The sidebar works normally on non-build pages (Home, Sessions, Memory).

### Root Cause

The build pages set `layoutContextAtom` to `"editor"`, which force-collapses the sidebar to 48px. The collapse is **intentional** (editor pages need more horizontal space), but the sidebar never recovers because `navRailExpandedAtom` defaults to `false` and the editor context overrides any expansion.

**File:** `packages/luca-studio/app/agents/page.tsx:43-49` (same pattern in skills/rules)

```typescript
useEffect(() => {
  setLayoutContext("editor");
  return () => {
    setLayoutContext("dashboard");
  };
}, [setLayoutContext]);
```

**File:** `packages/luca-studio/components/layout/nav-rail.tsx:44-46`

```typescript
const isEditorContext = layoutContext === "editor";
const effectiveWidth = isEditorContext ? 48 : width;
const isExpanded = !isEditorContext && (expanded || width === 240);
```

When `layoutContextAtom === "editor"`:

- `effectiveWidth` is forced to `48`
- `isExpanded` is forced to `false` regardless of `navRailExpandedAtom`

**File:** `packages/luca-studio/components/layout/layout-shell.tsx:67`

```typescript
const effectiveNavWidth = layoutContext === "editor" ? 48 : navWidth;
```

### Why It Feels Broken

The editor context correctly collapses the nav rail. But users expect the sidebar to show an entity list (agents/skills/rules) within the collapsed space, not just navigation icons. The build pages likely need a **secondary sidebar** (entity list panel) that replaces the nav rail content, rather than relying on the main nav rail.

### Fix

**Option A (recommended):** Build pages should render their own entity sidebar panel adjacent to the collapsed nav rail, rather than expecting the nav rail itself to show entities.

**Option B:** Auto-expand the sidebar on build pages with a different layout that shows both navigation and entity list:

```typescript
// In nav-rail.tsx, add auto-expand for editor context
useEffect(() => {
  if (!isEditorContext && !expanded && width === 48) {
    setExpanded(true);
  }
}, [isEditorContext, expanded, width, setExpanded]);
```

---

## S-09: Clicking Sidebar Items Crashes the Page (Critical)

### Symptom

Clicking any agent/skill/rule in the sidebar list crashes the page with:

```
Runtime Error: Cannot save: no ETag available. Please reload the entity.

at useEntitySave.useCallback[save] (hooks/use-entity-save.ts:63:13)
at AgentsPage.useEffect (app/agents/page.tsx:142:27)
at Object.eval [as write] (stores/layout.ts:130:5)
```

### Root Cause: Jotai Functional Updater Bug

**This is the same bug as S-10 (config page crash)** — a Jotai `set()` on a primitive atom treats function values as updaters, causing `save()` to fire immediately on mount before any data loads.

#### The Bug Chain

**Step 1:** Page registers its save callback on mount.

**File:** `packages/luca-studio/app/agents/page.tsx:141-144`

```typescript
// Register save callback for centralized Cmd+S shortcut
const setSaveCallback = useSetAtom(setGlobalSaveCallbackAtom);
useEffect(() => {
  setSaveCallback(() => save()); // <-- THIS IMMEDIATELY CALLS save()
  return () => setSaveCallback(null);
}, [save, setSaveCallback]);
```

**Step 2:** `setSaveCallback` dispatches to the write atom.

**File:** `packages/luca-studio/stores/layout.ts:127-132`

```typescript
export const setGlobalSaveCallbackAtom = atom(
  null,
  (_get, set, callback: (() => Promise<void>) | null) => {
    set(_saveCallbackAtom, callback); // <-- Jotai treats `callback` as updater
  },
);
```

The comment on line 115-116 even acknowledges the problem: _"Uses a write atom to avoid the SetStateAction ambiguity that occurs when storing functions in basic atoms."_

But the fix is **incomplete**. The custom write atom correctly receives `callback` as a value (not updater). However, `set(_saveCallbackAtom, callback)` still passes a function to a **primitive atom's set**, and Jotai's internal set treats functions as updaters. So `callback` (which is `() => save()`) gets **called immediately** with the previous value, instead of being stored.

**Step 3:** `save()` fires before entity data loads.

**File:** `packages/luca-studio/hooks/use-entity-save.ts:60-66`

```typescript
const save = useCallback(async () => {
  if (!name) return;
  if (!etag) {
    throw new Error(
      "Cannot save: no ETag available. Please reload the entity.",
    );
  }
```

The entity hasn't been fetched yet (no ETag), so `save()` throws. The error is unhandled and crashes the page.

### Fix

**The root fix is in `stores/layout.ts:130`** — wrap the callback to prevent Jotai from treating it as an updater:

```typescript
export const setGlobalSaveCallbackAtom = atom(
  null,
  (_get, set, callback: (() => Promise<void>) | null) => {
    // Wrap in arrow function to prevent Jotai from calling `callback` as an updater.
    // Jotai's `set(primitiveAtom, fn)` treats `fn` as `(prev) => next`.
    set(_saveCallbackAtom, () => callback);
  },
);
```

**Also add a null-ETag guard in `use-entity-save.ts`** — return early instead of throwing:

```typescript
const save = useCallback(async () => {
  if (!name) return;
  if (!etag) {
    console.warn(`[entity-save] No ETag for ${name}, skipping save.`);
    return;  // graceful no-op instead of crash
  }
```

**Also add the same null-ETag guard in `use-config-save.ts`.**

### Impact

This single Jotai bug affects **every page that registers a save callback**:

| Page     | File                    | Line         |
| -------- | ----------------------- | ------------ |
| Agents   | `app/agents/page.tsx`   | 142          |
| Skills   | `app/skills/page.tsx`   | ~136         |
| Rules    | `app/rules/page.tsx`    | ~146         |
| Config   | `app/config/page.tsx`   | 48           |
| Pipeline | `app/pipeline/page.tsx` | (if present) |

Fixing `layout.ts:130` fixes the crash on ALL of these pages simultaneously.

### Deprecation Warning

The console also shows a Jotai deprecation warning:

```
[DEPRECATED] atomFamily is deprecated and will be removed in v3.
Please use the `jotai-family` package instead.
```

**File:** `packages/luca-studio/stores/entity-atoms.ts:32`

This should be addressed before upgrading Jotai to v3.

---

## Files Involved

| File                                            | Lines   | Issue                                                                |
| ----------------------------------------------- | ------- | -------------------------------------------------------------------- |
| `packages/luca-studio/stores/layout.ts`         | 127-132 | **ROOT CAUSE** — `set(_saveCallbackAtom, callback)` triggers updater |
| `packages/luca-studio/hooks/use-entity-save.ts` | 60-66   | Throws on null ETag instead of returning early                       |
| `packages/luca-studio/hooks/use-config-save.ts` | 57-62   | Same throwing pattern                                                |
| `packages/luca-studio/app/agents/page.tsx`      | 141-144 | `setSaveCallback(() => save())` triggers bug                         |
| `packages/luca-studio/app/skills/page.tsx`      | ~136    | Same pattern                                                         |
| `packages/luca-studio/app/rules/page.tsx`       | ~146    | Same pattern                                                         |
| `packages/luca-studio/app/config/page.tsx`      | 47-50   | Same pattern                                                         |
| `packages/luca-studio/stores/entity-atoms.ts`   | 32      | atomFamily deprecation warning                                       |
