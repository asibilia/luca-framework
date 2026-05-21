# Phase 273: Sessions Page Fixes (S-04, S-05)

**Goal:** Fix Sessions page — make sessions appear and default to correct vault.
**Complexity:** SIMPLE
**Wave:** 1

## Root Cause Analysis

**S-04 (Sessions page empty) + S-05 (Wrong default vault) are the same root cause:**

The vault atom in `stores/vault.ts` defaults to `"default"`, but session engrams are stored in the project vault `"luca-framework"` (from `.planning/config.json` `muninn.vault`). When the user first visits Studio, the vault is `"default"`, so the sessions query returns nothing because it's querying the wrong vault.

The `/api/config` route already serves `.planning/config.json` which includes `muninn.vault: "luca-framework"`. The fix is to initialize the vault atom from the project config on first load.

## Tasks

### Task 1: fix-vault-default — Auto-detect vault from project config on first visit

**Files:** `packages/luca-studio/stores/vault.ts`, `packages/luca-studio/app/layout.tsx` (or providers)
**file_count_estimate:** 2
**scope:** related-components

1. Create a `VaultInitializer` component (or add to existing provider) that:
   - On mount, fetches `/api/config`
   - Reads `muninn.vault` from the response
   - If localStorage doesn't already have a saved vault, sets the vault atom to the config value
   - If localStorage already has a saved vault, keeps the user's choice

2. Add the `VaultInitializer` to the app layout so it runs on first load.

Alternative simpler approach: Create a custom atom that initializes by checking localStorage first, then falls back to fetching config. But atomWithStorage already handles localStorage. The cleanest approach is a `useEffect` in a provider that sets the vault from config if the stored value is still the initial "default".

### Task 2: fix-session-query — Verify session query works with correct vault

**File:** `packages/luca-studio/hooks/use-session-explorer.ts`
**file_count_estimate:** 1
**scope:** single-component

After Task 1 fixes the vault, the session query should work. However, also verify:

- The `type=session` filter in the API query works correctly (it does — the engrams route filters by concept prefix `session:`)
- The hook re-fetches when the vault atom changes (it does — `vault` is in the `useCallback` deps)

No code changes expected for this task — it's a verification that the vault fix resolves S-04.

## Success Criteria

- [ ] Sessions page shows session data when vault is correctly set
- [ ] First-time visitors get the correct vault from config (not "default")
- [ ] Users who manually changed vault keep their selection
- [ ] `bunx --bun tsc --noEmit` passes
