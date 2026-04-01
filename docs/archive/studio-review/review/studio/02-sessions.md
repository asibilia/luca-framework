# S-04, S-05 — Sessions Page Issues

## S-04: Sessions Page Always Empty (High)

### Symptom

The Sessions page displays an empty list regardless of how many sessions have been recorded. No error is shown — just a blank content area.

### Root Cause

**Two compounding filter failures** ensure session data is never displayed.

#### Layer 1: API `memory_type` filter matches nothing

**File:** `packages/luca-studio/app/api/muninn/engrams/route.ts:43`

The hook sends:

```
GET /api/muninn/engrams?vault=<vault>&limit=200&type=session
```

The API route filters with:

```typescript
e.memory_type === type;
```

But MuninnDB's `listEngrams()` does not populate the `memory_type` field on returned engrams. Every engram has `memory_type: undefined`, so `undefined === "session"` is always false — zero results.

#### Layer 2: Client-side filter is never reached

**File:** `packages/luca-studio/hooks/use-session-explorer.ts:221`

The hook has a secondary client-side filter:

```typescript
e.concept.startsWith("session:");
```

This filter is correct and would work, but it never executes because the API already returns an empty array.

### Fix

**Option A (recommended):** Change the API's `type` filter to use concept prefix matching:

```typescript
// In route.ts, replace:
e.memory_type === type;
// With:
e.concept?.startsWith(type + ":");
```

**Option B:** Remove `type=session` from the hook's API call and rely solely on the client-side concept filter (already implemented at line 221). This shifts filtering to the client but avoids the broken server-side filter.

### Evidence

- `GET /api/muninn/engrams?vault=luca-framework&limit=200&type=session` → `{"engrams":[],"total":0}`
- `GET /api/muninn/engrams?vault=luca-framework&limit=20` (no type filter) → **20 engrams** including `session:findings`, `session:context`, `session:checkpoint`

---

## S-05: Wrong Default Vault (Medium)

### Symptom

Even if the `memory_type` filter were fixed, first-time users would still see "No Sessions" because the vault defaults to `"default"`.

### Root Cause

**File:** `packages/luca-studio/stores/vault.ts:12`

```typescript
// CURRENT
export const vaultAtom = atom("default");
```

Per vault routing rules (`.claude/rules/vault-routing.md`), `session:*` engrams are stored in the **repo vault** (`luca-framework`, configured in `.planning/config.json`). The `"default"` vault contains zero session engrams.

### Fix

The vault atom should auto-detect the project vault from the config API on initialization:

```typescript
// Option 1: Default to repo vault from config
export const vaultAtom = atom(async (get) => {
  const config = await fetch("/api/config").then((r) => r.json());
  return config?.muninn?.vault ?? "default";
});

// Option 2: Sessions hook explicitly queries repo vault
// In use-session-explorer.ts, override vault for session queries
const vault = projectVault ?? "luca-framework";
```

Alternatively, the sessions hook should query **both vaults** per the dual-vault recall strategy in `vault-routing.md`.

---

## Files Involved

| File                                                   | Lines        | Issue                                                      |
| ------------------------------------------------------ | ------------ | ---------------------------------------------------------- |
| `packages/luca-studio/app/api/muninn/engrams/route.ts` | 43           | `memory_type` filter never matches                         |
| `packages/luca-studio/hooks/use-session-explorer.ts`   | 203, 221     | Sends `type=session` param; has correct client-side filter |
| `packages/luca-studio/stores/vault.ts`                 | 12           | Defaults to `"default"` vault                              |
| `.planning/config.json`                                | muninn.vault | Source of truth for repo vault name                        |
