# Phase 11 Plan 1 Summary: Audit Closure -- Integration + State Model Fixes

## Result: PASS

All six audit items resolved. Five code tasks completed, one documentation-only closure (MED-7 already done in Phase 9).

## Tasks Completed

### 1. Fix configDraftAtom / routingDraftAtom circular set (HIGH-4) + hydration (INT-1)

- **config-atoms.ts**: Replaced self-referencing `set(configDraftAtom, value)` with two-atom pattern. Private primitive atoms (`_configDraftPrimitiveAtom`, `_routingDraftPrimitiveAtom`) hold draft overrides; derived atoms fall through to server state when null. Eliminates stack overflow.
- **use-config-hydration.ts**: New hook fetches `GET /api/config` once on mount and seeds `configAtom`. Includes `useRef` guard for React strict-mode.
- **layout-shell.tsx**: Wired `useConfigHydration()` into LayoutShell so it runs once for the entire app, regardless of which page is active.

### 2. Fix agent save to include form field edits (INT-2)

- **use-agent-save.ts**: Added `mergeFieldOverrides()` that applies targeted regex replacements to `rawConfigText` for each draft field override (description, enabled, model_tier/modelTier, purpose, stage). Uses the same pattern-matching approach as `parseAgentConfig`. Fields not modified by the user (undefined in draft) are left untouched.

### 3. Connect Compiled tab to sidecar (INT-3)

- **agent-tab-container.tsx**: Replaced static `useMemo` placeholder with lazy fetch to `POST /api/compile`. Fetches on first tab activation. Shows loading spinner, sidecar-offline banner with fallback to local placeholder, and compile error banner. Graceful degradation when sidecar is unreachable (503).

### 4. UUID .tmp suffix for atomic-write (MED-2)

- **atomic-write.ts**: Changed temp file path from `${filePath}.tmp` to `${filePath}.tmp.${randomUUID()}`. Added try/catch cleanup that removes the temp file on failure. Concurrent writes to the same target are now race-free.

### 5. Deduplicate KNOWN_ENTITY_TYPES (MED-4)

- **use-vault-health.ts**: Removed local `KNOWN_TYPES` set, imported `KNOWN_ENTITY_TYPES` from `~/lib/graph-types`. All `KNOWN_TYPES.has()` calls updated to `KNOWN_ENTITY_TYPES.has()`. TYPE_DISPLAY map retained (uses Tailwind color tokens, different context from graph-types hex colors).
- **graph-types.ts**: Updated JSDoc to reflect canonical source status.

### 6. MED-7 closure

Documentation-only. Already addressed in Phase 9 (SEC-007).

## Verification

- `bunx --bun tsc --noEmit` passes with zero errors.
- All audit items (HIGH-4, INT-1, INT-2, INT-3, MED-2, MED-4, MED-7) resolved.

## Deviations

None. All tasks executed as planned.

## Files Changed

- `packages/luca-studio/stores/config-atoms.ts` -- two-atom draft pattern
- `packages/luca-studio/hooks/use-config-hydration.ts` -- new file
- `packages/luca-studio/components/layout/layout-shell.tsx` -- hydration hook wiring
- `packages/luca-studio/hooks/use-agent-save.ts` -- field merge logic
- `packages/luca-studio/components/agents/agent-tab-container.tsx` -- live compile tab
- `packages/luca-studio/lib/atomic-write.ts` -- UUID temp paths
- `packages/luca-studio/hooks/use-vault-health.ts` -- deduplicated types
- `packages/luca-studio/lib/graph-types.ts` -- updated JSDoc
