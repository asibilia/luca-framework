# Phase 218 — API Quality & Security Cleanup (Wave 1)

---

phase: 218
plan: 1
type: refactor
autonomous: true
wave: 1
depends_on: []

---

## Objective

DRY extraction of localhost guard and address Phase 208 code review HIGH findings: import grouping, barrel export, Date hoisting, and Bun.file() migration.

## Context

- @packages/luca-studio/app/api/compile/route.ts
- @packages/luca-studio/components/shared/index.ts
- @packages/luca-studio/components/shared/entity-tab-container.tsx
- @packages/luca-studio/sidecar/compiler.ts
- @packages/luca-studio/lib/request-guards.ts
- @packages/luca-studio/lib/constants.ts

## Tasks

### Task 1: Extract localhost guard helper (REQ-07)

type="auto"

**Already complete.** `isLocalhostRequest()` exists in `~/lib/request-guards.ts`. `SIDECAR_URL` exists in `~/lib/constants.ts`. All routes already import from shared helpers. No work needed.

### Task 2: Address Phase 208 review HIGH findings (REQ-08)

type="auto"

1. Fix `compile/route.ts` import grouping and hoist repeated `new Date().toISOString()` calls
2. Add `ShikiCodeBlock` to `components/shared/index.ts` barrel export
3. Extract `ENTITY_DOMAIN` map to `~/lib/constants.ts` (currently local to `entity-tab-container.tsx`)
4. Migrate `node:fs/promises` `mkdir` in `sidecar/compiler.ts` to Bun.file() equivalent (`mkdir` from `node:fs/promises` -> `Bun.write` is already used, just need to replace `mkdir` with native Bun approach)

## Verification

- [ ] `bunx --bun tsc --noEmit -p packages/luca-studio/tsconfig.json` passes
- [ ] `isLocalhostRequest` import used in all API routes (already done)
- [ ] `SIDECAR_URL` imported from `~/lib/constants` (already done)
- [ ] `ShikiCodeBlock` exported from `components/shared/index.ts`
- [ ] `ENTITY_DOMAIN` defined in `~/lib/constants.ts` and imported in `entity-tab-container.tsx`
- [ ] No `node:fs` imports remain in sidecar code

## Success Criteria

- All Phase 208 HIGH review findings addressed
- No regression in type checking
- DRY principle applied to shared constants and helpers
