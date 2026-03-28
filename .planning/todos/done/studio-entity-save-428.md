---
title: "P0: Fix Jotai save callback bug crashing 5 pages (S-09/S-10)"
area: ui
created: 2026-03-27
source: docs/review/studio/04-build-pages.md, docs/review/studio/05-config.md
priority: P0
estimated_size: S
---

## Context

Root-caused during comprehensive Studio audit. `stores/layout.ts:130` calls `set(_saveCallbackAtom, callback)` where `callback` is a function. Jotai's primitive atom `set` treats function values as updaters, so `callback` (i.e. `() => save()`) is **called immediately** instead of being stored. This fires `save()` on every page mount before data loads, crashing Agents, Skills, Rules, Config, and potentially Pipeline pages.

Previously observed as a 428 error (no ETag), now also manifests as 500 (config read failure) depending on timing.

## Task

1. **Fix root cause** in `stores/layout.ts:130`:

   ```typescript
   // Before (broken):
   set(_saveCallbackAtom, callback);
   // After (fixed):
   set(_saveCallbackAtom, () => callback);
   ```

2. **Add null-ETag guard** in `hooks/use-entity-save.ts:62` — return early instead of throwing:

   ```typescript
   if (!etag) {
     console.warn(`[entity-save] No ETag for ${name}, skipping save.`);
     return;
   }
   ```

3. **Add dirty guard** in `hooks/use-config-save.ts` — don't save unless dirty

4. **Wrap saveCallback in try/catch** in `hooks/use-keyboard-shortcuts.ts:124`:
   ```typescript
   saveCallback().catch((err) => {
     console.error("[keyboard-shortcut] Save failed:", err.message);
   });
   ```

## Notes

- One-line fix in layout.ts resolves the crash on ALL 5 pages simultaneously
- Items 2-4 are defense-in-depth to prevent similar crashes in the future
- See review docs: `docs/review/studio/04-build-pages.md`, `docs/review/studio/05-config.md`
