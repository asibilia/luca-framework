---
id: "01"
title: "Extract readWithFallback Helper and Migrate node:fs to Bun.file API"
phase: 116
status: complete
---

# SUMMARY-116-01: Extract readWithFallback Helper and Migrate node:fs

## Outcome: Complete

### Changes

1. **Created `read-with-fallback.ts`** — Generic `readWithFallback<T, R>` helper encapsulating the SpacetimeDB-primary + JSON-fallback pattern shared by all bridge read handlers.

2. **Refactored 5 read handlers** in `bridge.ts` to use `readWithFallback`:
   - `handleReadComplexity` (42 → ~13 lines)
   - `handleReadOversight` (42 → ~13 lines)
   - `handleReadPhase` (60 → ~25 lines)
   - `handleReadStatus` (104 → ~65 lines)
   - `handleReadField` (37 → ~22 lines)

3. **Documented `node:fs/promises` retention** in `ledger.ts` (Bun.write lacks append mode).

4. **Verified** `suspend-checkpoint.ts` already migrated in prior phase. `persistence.ts` uses only dynamic imports.

### Verification

- `bunx --bun tsc --noEmit` — clean
- `readWithFallback` used 6 times in bridge.ts (5 handlers + import)
