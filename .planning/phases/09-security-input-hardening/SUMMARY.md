# Phase 09 Plan 1: Audit Closure -- Security + Input Hardening

## Result: PASS

All 6 security findings from the v8.0.0 milestone audit have been closed.

## Changes

### SEC-001: Path traversal -- Entity name allowlist regex

- **File:** `packages/luca-studio/lib/entity-route-helpers.ts`
- Added `SAFE_ENTITY_NAME` regex (`/^[a-z0-9][a-z0-9-]*$/`) near top of file
- Applied validation in both GET and PUT handlers inside `createEntityDetailHandler()`, immediately after `const { name } = await params`
- Returns 400 for names containing path traversal characters, slashes, spaces, dots, etc.

### SEC-002: TS injection -- Zod schema for PUT body with size cap

- **File:** `packages/luca-studio/lib/entity-route-helpers.ts`
- Added `EntityPutBodySchema` with Zod validation including 512 KB max on `rawConfigText`
- Metadata validated against all required `EntityMetadata` fields with `.passthrough()` to preserve extra fields
- Replaced manual `if (!body.rawConfigText || !body.metadata)` truthy check with `EntityPutBodySchema.safeParse()`
- Returns 422 with structured Zod error issues on validation failure

### SEC-003: If-Match enforcement -- Return 428 when header absent

- **File:** `packages/luca-studio/lib/entity-route-helpers.ts`
- Changed `if (ifMatch)` optional block to `if (!ifMatch)` mandatory enforcement
- Missing `If-Match` header now returns HTTP 428 (Precondition Required)
- Mismatched ETag still returns 409 Conflict

### SEC-006: Harness command injection -- Constrain command field

- **File:** `packages/luca-studio/lib/config-section-schemas.ts`
- Added `.max(256).regex(/^[a-zA-Z0-9 _.\-/]+$/)` to `CheckConfigSchema.command`
- Blocks shell metacharacters (`; | & $ \` ( )`) in harness configuration

### SEC-007: Reflected input -- Remove user values from sidecar error messages

- **File:** `packages/luca-studio/sidecar/compiler.ts`
- `resolveOutputPath` default case: replaced `Unknown domain: ${domain}` with fixed string
- `compileEntity` invalid domain: replaced `Invalid domain: ${domain}` with fixed string
- `compileEntity` 404: truncated domain/name to 64 chars with `String().slice(0, 64)`
- `compileEntity` switch default: replaced `Unknown domain: ${domain}` with fixed string
- `handleCompile` Zod error: replaced reflected `rawBody.domain` with fixed string

### SEC-008: Env root validation -- Verify .planning/ exists

- **File:** `packages/luca-studio/lib/project-root.ts`
- Added `access()` check for `.planning/` directory before caching env-supplied root
- Invalid `LUCA_PROJECT_DIR`/`WORKSPACE_ROOT` now falls through to auto-detect walk-up

## Deviations

- **[Rule 1 - Bug] EntityPutBodySchema metadata shape**: The plan specified a 3-field metadata schema (`varName`, `configType`, `exportName`). The actual `EntityMetadata` interface has 9 required fields. Expanded the Zod schema to validate all 9 fields with `.passthrough()` to maintain type safety with `writeEntityFile()`.

## Verification

- `bunx --bun tsc --noEmit` passes with zero new errors (2 pre-existing unrelated module resolution errors in `shared-constant-registry.ts` remain)
- No new files created -- all 6 fixes are to existing files
- No changes to existing route handler signatures

## Files Modified

| File                                                 | Findings Closed           |
| ---------------------------------------------------- | ------------------------- |
| `packages/luca-studio/lib/entity-route-helpers.ts`   | SEC-001, SEC-002, SEC-003 |
| `packages/luca-studio/lib/config-section-schemas.ts` | SEC-006                   |
| `packages/luca-studio/sidecar/compiler.ts`           | SEC-007                   |
| `packages/luca-studio/lib/project-root.ts`           | SEC-008                   |
