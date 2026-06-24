---
phase: 09
plan: 1
type: bug
autonomous: true
wave: 1
depends_on: []
---

# Phase 09 Plan 1: Audit Closure -- Security + Input Hardening

## Objective

Close all 6 HIGH/MEDIUM security findings from the v8.0.0 milestone audit. These are surgical fixes to existing files -- path traversal, injection, missing enforcement, command constraints, reflected input, and env validation. Every fix is independent and can be applied in any order.

## Context

- @.planning/v8.0.0-MILESTONE-AUDIT.md (audit source -- SEC-001 through SEC-008)
- @packages/luca-studio/lib/entity-route-helpers.ts (SEC-001, SEC-002, SEC-003)
- @packages/luca-studio/lib/config-section-schemas.ts (SEC-006)
- @packages/luca-studio/sidecar/compiler.ts (SEC-007)
- @packages/luca-studio/lib/project-root.ts (SEC-008)

## Tasks

### 1. SEC-001: Path traversal -- Add entity name allowlist regex

**Type:** auto
**TDD:** false
**Depends on:** none

Add a `SAFE_ENTITY_NAME` regex `/^[a-z0-9][a-z0-9-]*$/` and validate the `name` parameter before it reaches `resolveEntityPath()`. Return 400 if name contains anything outside the allowlist. This blocks `../../etc/passwd` style traversals since `path.join()` does NOT prevent upward traversal.

**Where to add the guard:** Both the `GET` and `PUT` handlers inside `createEntityDetailHandler()`, immediately after `const { name } = await params;`. The name is also used in `resolveEntityPath()` to build a filename, so the regex must pass before any filesystem access.

**Pattern:**

```typescript
// Add near top of file, after imports
const SAFE_ENTITY_NAME = /^[a-z0-9][a-z0-9-]*$/;

// Add in both GET and PUT, right after: const { name } = await params;
if (!SAFE_ENTITY_NAME.test(name)) {
  return NextResponse.json({ error: "Invalid entity name" }, { status: 400 });
}
```

**Files to create/edit:**

- packages/luca-studio/lib/entity-route-helpers.ts

**Verification:**

- Confirm `SAFE_ENTITY_NAME` regex exists and is applied in both GET and PUT handlers
- Confirm names like `../../etc/passwd`, `foo/bar`, `foo bar`, `.hidden` are rejected
- Confirm valid names like `lu-router`, `git-commit`, `typescript` pass
- `bunx --bun tsc --noEmit` passes

### 2. SEC-002: TS injection -- Add Zod schema for PUT body with size cap

**Type:** auto
**TDD:** false
**Depends on:** none

Replace the manual `body.rawConfigText || body.metadata` truthy check with a Zod schema that validates shape, types, and enforces a 512KB size cap on `rawConfigText`. This prevents arbitrary payloads from being written directly to `.ts` source files.

**Pattern:**

```typescript
// Add after imports
import { z } from "zod";

const MAX_CONFIG_TEXT_BYTES = 512 * 1024; // 512KB

const EntityPutBodySchema = z.object({
  rawConfigText: z.string().min(1).max(MAX_CONFIG_TEXT_BYTES),
  metadata: z.object({
    varName: z.string().min(1),
    configType: z.string().min(1),
    exportName: z.string().min(1),
  }),
});

// In PUT handler, replace the manual truthy check block with:
const bodyResult = EntityPutBodySchema.safeParse(body);
if (!bodyResult.success) {
  return NextResponse.json(
    { error: "Invalid request body", details: bodyResult.error.issues },
    { status: 422 },
  );
}
// Then use bodyResult.data.rawConfigText and bodyResult.data.metadata
```

**Files to create/edit:**

- packages/luca-studio/lib/entity-route-helpers.ts

**Verification:**

- Confirm `EntityPutBodySchema` exists with Zod validation and 512KB cap
- Confirm the old `if (!body.rawConfigText || !body.metadata)` block is replaced
- Confirm `bodyResult.data` is used for the `writeEntityFile()` call
- `bunx --bun tsc --noEmit` passes

### 3. SEC-003: If-Match enforcement -- Return 428 when header absent

**Type:** auto
**TDD:** false
**Depends on:** none

Make the `If-Match` header mandatory on PUT requests. Currently the `if (ifMatch)` block is skippable -- any client omitting the header bypasses the concurrency guard entirely. Return HTTP 428 (Precondition Required) when absent.

**Pattern:**

```typescript
// Replace the current optional If-Match block:
//   const ifMatch = request.headers.get("If-Match");
//   if (ifMatch) { ... }
// With mandatory enforcement:
const ifMatch = request.headers.get("If-Match");
if (!ifMatch) {
  return NextResponse.json(
    { error: "If-Match header is required for PUT operations" },
    { status: 428 },
  );
}

const currentSource = await Bun.file(filePath).text();
const currentEtag = computeETag(currentSource);

if (ifMatch !== currentEtag) {
  return NextResponse.json(
    {
      error: "Conflict: entity has been modified since last read",
      currentEtag,
    },
    { status: 409 },
  );
}
```

**Files to create/edit:**

- packages/luca-studio/lib/entity-route-helpers.ts

**Verification:**

- Confirm the `if (ifMatch)` optional check is gone
- Confirm a missing `If-Match` header returns 428
- Confirm a mismatched `If-Match` still returns 409
- `bunx --bun tsc --noEmit` passes

### 4. SEC-006: Harness command injection -- Constrain command field

**Type:** auto
**TDD:** false
**Depends on:** none

Replace the unconstrained `z.string()` on the `command` field in `CheckConfigSchema` with a strict regex that only allows safe characters and a max length of 256. This prevents shell metacharacter injection through the harness configuration.

**Pattern:**

```typescript
// In CheckConfigSchema, replace:
//   command: z.string(),
// With:
command: z.string().max(256).regex(
  /^[a-zA-Z0-9 _.\-/]+$/,
  "Command must contain only alphanumeric characters, spaces, dots, hyphens, underscores, and forward slashes",
),
```

**Files to create/edit:**

- packages/luca-studio/lib/config-section-schemas.ts

**Verification:**

- Confirm the `command` field has `.max(256).regex(...)` constraints
- Confirm safe commands like `bun test`, `bunx --bun tsc --noEmit`, `bun run build` pass
- Confirm dangerous commands like `rm -rf /; echo pwned`, `$(curl evil)`, `` `whoami` `` are rejected
- `bunx --bun tsc --noEmit` passes

### 5. SEC-007: Reflected input -- Remove user values from sidecar error messages

**Type:** auto
**TDD:** false
**Depends on:** none

The sidecar compiler.ts reflects user-supplied `domain` and `name` values directly into error messages. Replace these with fixed strings or truncate to 64 characters max.

**Three locations to fix:**

1. Line 100 `resolveOutputPath`: `throw new Error("Unknown domain: ${domain}")` -- This is unreachable after Zod validation but should still be hardened. Replace with fixed string.

2. Line 247 `handleCompile` Zod error branch: Reflects `(rawBody as Record<string, unknown>)?.domain` in the error message. Replace with a fixed message.

3. Line 129 `compileEntity`: `"${domain}/${name} not found in registry"` -- Truncate both values.

**Pattern:**

```typescript
// resolveOutputPath (line 100) -- replace interpolation with fixed string
throw new Error("Unsupported domain for output path resolution");

// handleCompile Zod error (line 247) -- remove reflected domain value
error: hasDomainError
  ? "Invalid domain value. Must be agents, skills, or rules."
  : "Validation failed",

// compileEntity (line 129) -- truncate to 64 chars
const safeDomain = String(domain).slice(0, 64);
const safeName = String(name).slice(0, 64);
const error = new Error(`${safeDomain}/${safeName} not found in registry`);
```

Also fix line 123 in `compileEntity`:

```typescript
// Replace: `Invalid domain: ${domain}. Must be agents, skills, or rules.`
// With fixed string:
"Invalid domain. Must be agents, skills, or rules.";
```

**Files to create/edit:**

- packages/luca-studio/sidecar/compiler.ts

**Verification:**

- Confirm no error message directly interpolates raw user input without truncation
- Confirm `resolveOutputPath` default case uses a fixed string
- Confirm `handleCompile` Zod error branch uses a fixed string for domain errors
- Confirm `compileEntity` 404 error truncates domain/name to 64 chars
- `bunx --bun tsc --noEmit` passes

### 6. SEC-008: Env root validation -- Verify .planning/ exists for env-supplied roots

**Type:** auto
**TDD:** false
**Depends on:** none

When `LUCA_PROJECT_DIR` or `WORKSPACE_ROOT` supplies the project root, the current code caches it immediately without verifying that `.planning/` exists there. Add an `access()` check before caching. If the env-supplied path lacks `.planning/`, fall through to the auto-detect walk-up strategy.

**Pattern:**

```typescript
// Replace the current envRoot block:
//   if (envRoot) {
//     cachedRoot = resolve(envRoot);
//     return cachedRoot;
//   }
// With validated version:
if (envRoot) {
  const resolved = resolve(envRoot);
  try {
    await access(resolve(resolved, ".planning"));
    cachedRoot = resolved;
    return cachedRoot;
  } catch {
    // Env var points to a directory without .planning/ -- fall through to auto-detect
  }
}
```

**Files to create/edit:**

- packages/luca-studio/lib/project-root.ts

**Verification:**

- Confirm `access()` check is called before caching an env-supplied root
- Confirm a bad `LUCA_PROJECT_DIR` (no `.planning/`) falls through to auto-detect
- Confirm a valid `LUCA_PROJECT_DIR` (with `.planning/`) still caches correctly
- `bunx --bun tsc --noEmit` passes

## Verification

1. Run `bunx --bun tsc --noEmit` from packages/luca-studio -- zero type errors
2. Manually inspect each file to confirm the security fix is in place
3. Confirm no new files were created -- all fixes are to existing files
4. Confirm no regressions in existing route handler signatures

## Success Criteria

- All 6 audit findings (SEC-001, SEC-002, SEC-003, SEC-006, SEC-007, SEC-008) are resolved
- Entity name parameter validated with allowlist regex in both GET and PUT
- PUT body validated with Zod schema including 512KB size cap
- If-Match header mandatory on all entity PUT routes (428 on absence)
- Harness command field constrained to safe character regex with 256-char max
- No user input reflected verbatim in sidecar error messages
- Env-supplied project root verified to contain .planning/ before caching
- TypeScript compilation passes with zero errors

## Output Specification

- Modified: `packages/luca-studio/lib/entity-route-helpers.ts` (tasks 1, 2, 3)
- Modified: `packages/luca-studio/lib/config-section-schemas.ts` (task 4)
- Modified: `packages/luca-studio/sidecar/compiler.ts` (task 5)
- Modified: `packages/luca-studio/lib/project-root.ts` (task 6)
