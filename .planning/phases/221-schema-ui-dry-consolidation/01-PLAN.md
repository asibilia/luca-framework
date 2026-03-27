---
phase: 221
plan: 1
type: refactor
autonomous: true
wave: 1
---

# Phase 221 — Schema & UI DRY Consolidation

## Objective

Extract reusable schema fragments, shared UI components, and concept prefix filtering helper to reduce duplication across Luca Studio.

## Context

- @packages/luca-studio/lib/muninn-schemas.ts — 15+ repetitive vault/limit defaults
- @packages/luca-studio/app/agents/page.tsx, skills/page.tsx, rules/page.tsx — duplicated conflict resolution logic
- @packages/luca-studio/components/shared/entity-tab-container.tsx — 6 similar compile status indicator divs
- @packages/luca-studio/sidecar/compiler.ts — lacks response schema validation
- @packages/luca-studio/app/api/muninn/metrics/route.ts, observations/route.ts, zone-history/route.ts — duplicated concept prefix filtering

## Tasks

### Task 1: Extract reusable schema fragments in muninn-schemas.ts

type="auto"

Create `vaultParam` and `limitParam()` reusable schema fragments at the top of muninn-schemas.ts.
Replace all 15+ repetitive `z.string().min(1).max(100).default("default")` and `z.coerce.number().int().min(1).max(N).default(D)` patterns.

**Verification:**

- [ ] `vaultParam` used everywhere vault was manually defined
- [ ] `limitParam(max, def)` factory used for all limit parameters
- [ ] No remaining manual vault schema definitions
- [ ] TypeScript compiles cleanly

### Task 2: Extract shared conflict resolution hook

type="auto"

Extract the duplicated conflict resolution logic (handleAcceptLocal, handleAcceptServer, handleDismissConflict) from agents/page.tsx, skills/page.tsx, rules/page.tsx into a shared `useEntityConflict` hook.

**Verification:**

- [ ] New hook in hooks/use-entity-conflict.ts
- [ ] All three pages import and use the shared hook
- [ ] Conflict resolution behavior unchanged
- [ ] TypeScript compiles cleanly

### Task 3: Extract CompileStatusBadge in entity-tab-container.tsx

type="auto"

Extract the 6 similar compile status indicator divs (compiling/success/error for both tab trigger and tab content) into an inline `CompileStatusBadge` component within entity-tab-container.tsx.

**Verification:**

- [ ] CompileStatusBadge component defined within the file
- [ ] All 6 status indicator instances replaced with CompileStatusBadge
- [ ] Visual rendering unchanged
- [ ] TypeScript compiles cleanly

### Task 4: Add Zod response schema validation to sidecar compiler

type="auto"

Add a Zod response schema for compile responses in sidecar/compiler.ts. Validate the compile response before returning it.

**Verification:**

- [ ] CompileResponseSchema defined with Zod
- [ ] Response validated with safeParse before returning
- [ ] Invalid responses still return meaningful errors
- [ ] TypeScript compiles cleanly

### Task 5: Extract filterByConceptPrefix helper

type="auto"

Extract the duplicated concept prefix filtering logic from metrics, observations, and zone-history routes into a shared `filterByConceptPrefix` helper in lib/muninn-helpers.ts.

**Verification:**

- [ ] filterByConceptPrefix helper exported from lib/muninn-helpers.ts
- [ ] All three routes refactored to use the helper
- [ ] Filtering behavior unchanged
- [ ] TypeScript compiles cleanly

## Success Criteria

- All 5 DRY extractions complete
- `bunx --bun tsc --noEmit -p packages/luca-studio/tsconfig.json` passes
- No behavioral changes — purely structural refactoring

## Output

- Modified: packages/luca-studio/lib/muninn-schemas.ts
- Modified: packages/luca-studio/app/agents/page.tsx
- Modified: packages/luca-studio/app/skills/page.tsx
- Modified: packages/luca-studio/app/rules/page.tsx
- Modified: packages/luca-studio/components/shared/entity-tab-container.tsx
- Modified: packages/luca-studio/sidecar/compiler.ts
- New: packages/luca-studio/hooks/use-entity-conflict.ts
- New: packages/luca-studio/lib/muninn-helpers.ts
- Modified: packages/luca-studio/app/api/muninn/metrics/route.ts
- Modified: packages/luca-studio/app/api/muninn/observations/route.ts
- Modified: packages/luca-studio/app/api/muninn/zone-history/route.ts
