# Phase 180 Pre-Mortem Risk Brief

**Phase:** 180 — DRY Consolidation & Convention Alignment
**Complexity:** COMPLEX
**Scenarios:** 3

## Risk 1: Fallback Chain Failure in Hook Registry Emission

**Likelihood:** MEDIUM | **Impact:** HIGH

init.ts reads dist/hooks-registry.json but it won't exist during dev (build:all can't run in Claude Code). Hardcoded fallback map may diverge from canonical registry.

**Mitigations:**

- Add sync version comment to fallback map
- Validate hook count parity between fallback and canonical
- Log warning when fallback is used
- Ensure fallback is accurate at time of writing

## Risk 2: Async Bun.file() Migration Breaks Synchronous Flow

**Likelihood:** MEDIUM | **Impact:** HIGH

Migrating readFileSync/writeFileSync to async Bun.file()/Bun.write() without properly threading async/await through all call sites in runDeployStep() could corrupt deploy manifest.

**Mitigations:**

- Verify every Bun.file() call has await
- Wrap deploy step in try/catch with rollback marker
- Validate manifest in-memory before writing to disk
- Post-write re-read verification

## Risk 3: Schema Casing Inconsistency at API/Internal Boundary

**Likelihood:** LOW | **Impact:** MEDIUM

Converting interfaces to Zod schemas without clear API vs internal casing direction could create mixed snake_case/camelCase fields that pass typecheck but fail at runtime merge.

**Mitigations:**

- Add explicit JSDoc direction comments (API vs Internal) to all schemas
- Audit all schema exports for casing consistency
- Use .transform() if schema must bridge API→internal casing
- No schema should have mixed casing

## Plan Constraints

- Run `bunx --bun tsc --noEmit` after EVERY schema file change
- Validate hooks-registry fallback accuracy before committing
- Ensure all Bun.file() calls are properly awaited
- Add schema direction comments to every new/modified Zod schema
