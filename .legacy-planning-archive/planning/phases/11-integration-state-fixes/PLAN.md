---
phase: 11
plan: 1
type: bug
autonomous: true
wave: 1
depends_on: []
---

# Phase 11 Plan 1: Audit Closure -- Integration + State Model Fixes

## Objective

Close six integration and data-integrity gaps identified during the v8 Luca Studio audit. These are correctness bugs that would cause silent data loss, stack overflows, or race conditions in production. MED-7 (sidecar error sanitization) was already addressed in Phase 9 (SEC-007) and is excluded.

## Context

- @packages/luca-studio/stores/config-atoms.ts -- HIGH-4: circular self-referencing `set()` in draft atoms
- @packages/luca-studio/app/pipeline/page.tsx -- INT-1: no configAtom hydration from server
- @packages/luca-studio/hooks/use-agent-save.ts -- INT-2: form field edits silently discarded on save
- @packages/luca-studio/components/agents/agent-config-form.tsx -- field-level edit source
- @packages/luca-studio/components/agents/agent-tab-container.tsx -- INT-3: compiled tab shows local placeholder
- @packages/luca-studio/app/api/compile/route.ts -- compile proxy route already exists
- @packages/luca-studio/lib/atomic-write.ts -- MED-2: shared .tmp path race
- @packages/luca-studio/hooks/use-vault-health.ts -- MED-4: duplicated KNOWN_TYPES
- @packages/luca-studio/lib/graph-types.ts -- canonical KNOWN_ENTITY_TYPES source

## Tasks

### 1. Fix configDraftAtom / routingDraftAtom circular set (HIGH-4) and add configAtom hydration (INT-1)

**Type:** auto
**TDD:** false
**Depends on:** none

Both `configDraftAtom` and `routingDraftAtom` in `config-atoms.ts` have self-referencing `set()` calls that will stack overflow at runtime. Fix with the standard two-atom pattern: a private primitive atom for the draft value, and a derived atom whose `get` reads the server atom when the primitive is null, and whose `set` writes to the primitive.

Then add a `useConfigHydration` hook that fetches `GET /api/config` on mount and seeds `configAtom` via `useSetAtom`. Import and call this hook from the pipeline page (or from the layout shell so it runs once for the entire app).

**Files to create/edit:**

- `packages/luca-studio/stores/config-atoms.ts` -- fix circular set pattern
- `packages/luca-studio/hooks/use-config-hydration.ts` -- new hook: fetch /api/config, set configAtom
- `packages/luca-studio/app/pipeline/page.tsx` or `packages/luca-studio/components/layout/layout-shell.tsx` -- invoke hydration hook

**Verification:**

- Confirm `configDraftAtom` can be read and written without stack overflow
- Confirm pipeline page loads configAtom with server data (no empty payload on save)
- Verify `set(configDraftAtom, newValue)` updates only the draft, not the server atom

### 2. Fix agent save to include form field edits (INT-2)

**Type:** auto
**TDD:** false
**Depends on:** none

`useAgentSave` currently serializes only `rawConfigText` from the draft atom. The `AgentConfigForm` writes field-level overrides (description, enabled, modelTier, purpose, stage) into the draft atom, but those fields are never merged back into rawConfigText before PUT. This means form edits are silently discarded.

Fix by reconstructing the rawConfigText in the save path: read field-level overrides from the draft, apply regex replacements to the rawConfigText (matching the same regex patterns used in `parseAgentConfig`), and send the patched text. If a field was not changed in the draft (still undefined), leave the original rawConfigText value.

**Files to create/edit:**

- `packages/luca-studio/hooks/use-agent-save.ts` -- merge draft field overrides into rawConfigText before PUT

**Verification:**

- Edit description in the Configure tab, save, and confirm the PUT payload contains the updated description in rawConfigText
- Edit model tier, save, and confirm model_tier field is updated in the raw text
- Verify fields not edited by the user remain untouched in rawConfigText

### 3. Connect compile route to Compiled tab (INT-3)

**Type:** auto
**TDD:** false
**Depends on:** none

The "Compiled" tab in `AgentTabContainer` currently builds a local markdown placeholder from the raw config metadata. Replace this with a real call to `POST /api/compile` that sends `{ domain: "agents", name }` and displays the sidecar's compiled output. Show a loading state while the request is in flight. If the sidecar is unreachable (503), fall back to the existing local placeholder with a banner explaining the sidecar is offline.

**Files to create/edit:**

- `packages/luca-studio/components/agents/agent-tab-container.tsx` -- fetch compiled output from /api/compile, display result or fallback

**Verification:**

- With sidecar running: Compiled tab shows actual compiled markdown from the sidecar
- With sidecar stopped: Compiled tab falls back gracefully with an informational banner
- Loading state visible during compilation request

### 4. Eliminate .tmp race condition in atomic-write (MED-2)

**Type:** auto
**TDD:** false
**Depends on:** none

`atomicWrite` uses a fixed `.tmp` suffix (`${filePath}.tmp`) which causes a race condition when two concurrent writes target the same file. Fix by appending a random UUID suffix to the temp file path: `${filePath}.tmp.${crypto.randomUUID()}`. This guarantees concurrent writes use separate temp files and the final `rename()` remains atomic.

**Files to create/edit:**

- `packages/luca-studio/lib/atomic-write.ts` -- use UUID suffix for temp file path

**Verification:**

- Confirm atomic writes still work for single-writer case
- Confirm two concurrent atomicWrite calls to the same path do not clobber each other's temp files

### 5. Deduplicate KNOWN_ENTITY_TYPES (MED-4)

**Type:** auto
**TDD:** false
**Depends on:** none

`use-vault-health.ts` declares a local `KNOWN_TYPES` Set that duplicates `KNOWN_ENTITY_TYPES` from `lib/graph-types.ts`. Replace the local declaration with an import from the canonical source. The `TYPE_DISPLAY` map in the hook uses Tailwind color class names (e.g. "success", "info") while `graph-types.ts` uses hex values, so only the `KNOWN_TYPES` set itself should be deduplicated -- the display maps serve different rendering contexts and should remain separate.

**Files to create/edit:**

- `packages/luca-studio/hooks/use-vault-health.ts` -- import `KNOWN_ENTITY_TYPES` from `~/lib/graph-types`, remove local `KNOWN_TYPES`

**Verification:**

- Confirm `resolveEngramType` still correctly categorizes engrams using the imported set
- Confirm the vault health dashboard renders type breakdown identically to before
- Confirm no duplicate set declarations remain

### 6. Mark MED-7 (sidecar error sanitization) as complete

**Type:** auto
**TDD:** false
**Depends on:** none

MED-7 was already addressed in Phase 9 (SEC-007 -- sidecar error sanitization). No code changes needed. This task exists only to formally close the audit item and update the phase summary.

**Files to create/edit:**

- None (documentation-only closure)

**Verification:**

- Confirm Phase 9 SEC-007 changes are present in the codebase (error sanitization in sidecar routes)

## Verification

1. Type-check passes: `bunx --bun tsc --noEmit` from the luca-studio package
2. Dev server starts without errors: `bun run dev` in luca-studio
3. Pipeline page loads config from server (network tab shows GET /api/config)
4. Agent form edits round-trip through save (PUT payload reflects form changes)
5. Compiled tab fetches from sidecar when available, falls back gracefully when not
6. No stack overflow when interacting with config draft atoms

## Success Criteria

- All six audit items (HIGH-4, INT-1, INT-2, INT-3, MED-2, MED-4) are resolved or formally closed
- Zero silent data loss paths in the agent edit and config save workflows
- No runtime stack overflow from circular atom references
- Concurrent file writes are race-free via UUID temp paths

## Output Specification

- Fixed `packages/luca-studio/stores/config-atoms.ts` with two-atom draft pattern
- New `packages/luca-studio/hooks/use-config-hydration.ts` hook
- Updated `packages/luca-studio/hooks/use-agent-save.ts` with field merge logic
- Updated `packages/luca-studio/components/agents/agent-tab-container.tsx` with live compile
- Fixed `packages/luca-studio/lib/atomic-write.ts` with UUID temp paths
- Updated `packages/luca-studio/hooks/use-vault-health.ts` importing canonical set
