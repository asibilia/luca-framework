---
phase: 215
plan: 02
type: bug
autonomous: true
wave: 1
depends_on: []
---

# Phase 215 Plan 02: Fix Sessions API Filter and Vault Default

## Objective

Fix the sessions page so engrams are visible by correcting the API filter logic (using `concept` prefix matching instead of the unreliable `memory_type` field) and auto-detecting the repo vault from project config on app initialization.

> Appetite: Small (50000 tokens remaining of 50000 ceiling)

## Context

@packages/luca-studio/app/api/muninn/engrams/route.ts
@packages/luca-studio/stores/vault.ts
@packages/luca-studio/lib/muninn-types.ts
@packages/luca-studio/lib/muninn-schemas.ts
@packages/luca-studio/app/api/config/route.ts
@.planning/config.json (muninn.vault field)

## Tasks

### 1. Fix engrams route type filter to use concept prefix

**Type:** auto
**TDD:** false
**Depends on:** none

Replace the `memory_type` filter on line 43 of `engrams/route.ts` with concept-prefix matching. The `memory_type` field on MuninnDB engrams is often null or missing, but `concept` always follows the `{type}:{name}` convention (e.g., `session:findings`, `pattern:bun-file-api`, `pitfall:orphan-test-processes`).

Change:

```typescript
engrams = engrams.filter((e) => e.memory_type === type);
```

To:

```typescript
engrams = engrams.filter((e) => e.concept?.startsWith(type + ":"));
```

This matches the Luca two-vault concept naming convention where the prefix before the colon indicates the memory type.

**Files to create/edit:**

- `packages/luca-studio/app/api/muninn/engrams/route.ts`

**Verification:**

- Filtering by `type=session` returns engrams with concepts like `session:findings`
- Filtering by `type=pattern` returns engrams with concepts like `pattern:bun-file-api`
- Engrams without a concept field are excluded (no crashes from null/undefined)
- No TypeScript errors from `bunx --bun tsc --noEmit`

### 2. Auto-detect repo vault from config API on initialization

**Type:** auto
**TDD:** false
**Depends on:** none

Update the vault store so the app auto-detects the repo vault name from `/api/config` instead of defaulting to `"default"`. The config API already returns `muninn.vault` from `.planning/config.json` (currently `"luca-framework"`).

Create a provider component or hook that:

1. Runs once on app mount
2. Fetches `/api/config`
3. Reads `muninn.vault` from the response
4. If the vault atom is still at `"default"` (never changed by user), updates it to the repo vault name
5. If the user has previously selected a different vault (stored in localStorage), respects that choice

This ensures the sessions page queries the correct vault (`luca-framework`) instead of `"default"` on first load, while preserving user overrides.

**Files to create/edit:**

- `packages/luca-studio/stores/vault.ts` (add the auto-detect hook)
- `packages/luca-studio/app/layout.tsx` or appropriate app-level component (wire up the hook)

**Verification:**

- On fresh load (no localStorage), vault atom is set to repo vault from config
- On subsequent loads, localStorage value is respected
- If `/api/config` fails or has no `muninn.vault`, falls back to `"default"` gracefully
- Sessions page shows engrams from the repo vault without manual vault selection
- No TypeScript errors from `bunx --bun tsc --noEmit`

## Verification

1. Run `bunx --bun tsc --noEmit` from repo root -- no type errors
2. Confirm `engrams/route.ts` uses `e.concept?.startsWith(type + ":")` for type filtering
3. Confirm vault store auto-detects repo vault from `/api/config` on mount
4. Confirm localStorage override is respected when present

## Success Criteria

- Sessions page engram list populates when filtering by type (e.g., `session`, `pattern`)
- Vault defaults to repo vault (`luca-framework`) without manual selection
- User vault overrides persist across page loads
- Zero TypeScript errors

## Output Specification

- Modified: `packages/luca-studio/app/api/muninn/engrams/route.ts`
- Modified: `packages/luca-studio/stores/vault.ts`
- Modified: `packages/luca-studio/app/layout.tsx` (or equivalent app-level component)
