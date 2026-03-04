---
id: "108-03"
title: "Path traversal fix + query parameter validation"
phase: 108
wave: 1
complexity: MODERATE
depends_on: []
tasks:
  - id: "108-03-1"
    title: "Fix symlink path traversal in resolveProjectDir"
    goal: "Use realpathSync to resolve symlinks before the startsWith boundary check"
    verify: "Symlink pointing outside project boundary is rejected; normal relative paths still work; non-existent paths fall back to resolve-only check"
  - id: "108-03-2"
    title: "Deduplicate resolveProjectDir between file-watcher.ts and notes/route.ts"
    goal: "Extract resolveProjectDir to a shared lib module, eliminating the duplicate definition"
    verify: "Only one definition of resolveProjectDir exists; both file-watcher.ts and notes/route.ts import from shared location"
  - id: "108-03-3"
    title: "Add Zod schema validation for query parameters in events-query and ledger routes"
    goal: "Validate and clamp limit, offset, tail, since_id to safe numeric ranges with NaN protection"
    verify: "NaN values are rejected or clamped; negative values are clamped to 0; limit is capped at 1000; bun test passes"
---

# 108-03: Path Traversal Fix + Query Param Validation

## Goal

Close two input validation gaps: (1) symlink-based path traversal bypass in `resolveProjectDir`, and (2) missing range validation on numeric query parameters that could cause unexpected behavior or DoS via extreme values.

## Context

@packages/luca-observer/lib/file-watcher.ts -- Contains resolveProjectDir (lines 31-40)
@packages/luca-observer/app/api/notes/route.ts -- Contains duplicate resolveProjectDir (lines 16-25)
@packages/luca-observer/app/api/events-query/route.ts -- Parses limit, offset, since_id from query params with parseInt but no range validation
@packages/luca-observer/app/api/ledger/route.ts -- Parses tail, limit from query params with parseInt but no range validation

**Current state -- Path traversal:**

```typescript
// file-watcher.ts and notes/route.ts (identical code)
function resolveProjectDir(projectDir?: string): string {
  const base = process.cwd();
  if (!projectDir) return base;
  const resolved = resolve(base, projectDir);
  if (!resolved.startsWith(base)) {
    throw new Error("Directory outside project boundary");
  }
  return resolved;
}
```

The `resolve()` function normalizes `..` components but does NOT resolve symlinks. An attacker can create a symlink inside the project that points outside, and `resolve()` will return a path that starts with `base` but actually traverses outside.

**Example attack:**

```bash
# Create symlink inside project
ln -s /etc project/.planning/notes/evil-link
# Request: GET /api/notes?dir=.planning/notes/evil-link
# resolve() returns /project/.planning/notes/evil-link (starts with base)
# But readFile follows the symlink to /etc
```

**Current state -- Query params:**

```typescript
// events-query/route.ts
const filters = {
  limit: parseInt(searchParams.get("limit") ?? "50", 10),
  offset: parseInt(searchParams.get("offset") ?? "0", 10),
  since_id: searchParams.has("since_id")
    ? parseInt(searchParams.get("since_id")!, 10)
    : undefined,
};
```

- `parseInt("abc")` returns `NaN` -- passed through to queryEvents which may behave unexpectedly
- `parseInt("-999999")` returns a large negative -- no clamping
- `parseInt("999999999")` -- no upper bound on limit, could return massive result sets

## Tasks

### Task 108-03-1: Fix Symlink Path Traversal in resolveProjectDir

**File to create:** `packages/luca-observer/lib/resolve-project-dir.ts`

```typescript
import { realpathSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Resolve and validate a project directory parameter.
 *
 * Prevents path traversal (including symlink-based traversal) by:
 * 1. Resolving the path with node:path/resolve (handles .. components)
 * 2. Resolving symlinks with realpathSync (follows symlinks to real path)
 * 3. Checking that the real path starts with the real base path
 *
 * Falls back to resolve-only check if the path does not exist yet
 * (realpathSync throws ENOENT for non-existent paths).
 *
 * @param projectDir - User-supplied directory parameter
 * @returns Validated absolute directory path
 * @throws Error if the resolved path is outside cwd
 */
export function resolveProjectDir(projectDir?: string): string {
  const base = process.cwd();
  if (!projectDir) return base;

  const resolved = resolve(base, projectDir);

  // First check: logical path traversal (handles .. without I/O)
  if (!resolved.startsWith(base)) {
    throw new Error("Directory outside project boundary");
  }

  // Second check: resolve symlinks to catch symlink-based traversal
  try {
    const realBase = realpathSync(base);
    const realResolved = realpathSync(resolved);
    if (!realResolved.startsWith(realBase)) {
      throw new Error("Directory outside project boundary (symlink traversal)");
    }
    return realResolved;
  } catch (err: unknown) {
    // If path does not exist, realpathSync throws ENOENT.
    // Fall back to the logical resolve check (which already passed).
    if (
      err instanceof Error &&
      "code" in err &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return resolved;
    }
    // Re-throw our own boundary errors
    if (
      err instanceof Error &&
      err.message.includes("outside project boundary")
    ) {
      throw err;
    }
    // Unknown error -- reject to be safe
    throw new Error("Directory outside project boundary");
  }
}
```

**Key decisions:**

- Use `realpathSync` (synchronous) because the callers are synchronous functions
- ENOENT fallback: If the directory does not exist yet (e.g., notes dir before first note), the logical check is sufficient since there is no symlink to follow
- Real base path is also resolved with realpathSync to handle the case where cwd itself is a symlink
- This is a pure function (no classes), following project conventions

### Task 108-03-2: Deduplicate resolveProjectDir

**File to modify:** `packages/luca-observer/lib/file-watcher.ts`

Remove the local `resolveProjectDir` function definition. Add import:

```typescript
import { resolveProjectDir } from "./resolve-project-dir";
```

**File to modify:** `packages/luca-observer/app/api/notes/route.ts`

Remove the local `resolveProjectDir` function definition. Add import:

```typescript
import { resolveProjectDir } from "~/lib/resolve-project-dir";
```

Both files currently use `resolveProjectDir` in exactly the same way, so the import is a drop-in replacement.

### Task 108-03-3: Zod Schema Validation for Query Parameters

**File to modify:** `packages/luca-observer/app/api/events-query/route.ts`

Replace manual `parseInt` parsing with Zod schema:

```typescript
import { z } from "zod";

/**
 * API Request: Event query parameters.
 *
 * Validates and clamps numeric query parameters to safe ranges.
 * Uses snake_case for API compatibility.
 */
const EventQueryParamsSchema = z.object({
  session_id: z.string().optional(),
  event_type: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(50),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
  since_id: z.coerce.number().int().min(0).optional(),
});
```

Update the GET handler to parse query params through the schema:

```typescript
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  try {
    const raw = {
      session_id: searchParams.get("session_id") ?? undefined,
      event_type: searchParams.get("event_type") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      offset: searchParams.get("offset") ?? undefined,
      since_id: searchParams.has("since_id")
        ? searchParams.get("since_id")
        : undefined,
    };

    const parseResult = EventQueryParamsSchema.safeParse(raw);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "invalid_query_params", details: parseResult.error.issues },
        { status: 400 },
      );
    }

    const filters = parseResult.data;
    const events = queryEvents(filters);
    const total_count = getEventCount();

    return NextResponse.json({
      events,
      total_count,
      limit: filters.limit,
      offset: filters.offset,
    });
  } catch {
    return NextResponse.json(
      { error: "failed_to_query_events" },
      { status: 500 },
    );
  }
}
```

**File to modify:** `packages/luca-observer/app/api/ledger/route.ts`

Add Zod schema for ledger query params:

```typescript
import { z } from "zod";

/**
 * API Request: Ledger query parameters.
 *
 * Validates and clamps numeric query parameters to safe ranges.
 * Uses snake_case for API compatibility.
 */
const LedgerQueryParamsSchema = z.object({
  dir: z.string().optional(),
  session_id: z.string().optional(),
  event_type: z.string().optional(),
  tail: z.coerce.number().int().min(1).max(10000).optional(),
  limit: z.coerce.number().int().min(1).max(10000).default(100),
});
```

Update the GET handler similarly, using `safeParse` and returning 400 on validation failure.

**Key decisions:**

- `z.coerce.number()` handles string-to-number conversion and returns NaN for non-numeric strings, which Zod then rejects
- `max(1000)` for events-query limit prevents massive result sets
- `max(10000)` for ledger params is more generous since ledger files are disk-based
- Error responses use the standard `{ error, details }` pattern already used by POST endpoints
- Default values defined in schema, not in destructuring (per schema-first-parsing rule)

## Exit Criteria

1. `resolveProjectDir` rejects symlinks pointing outside the project boundary
2. `resolveProjectDir` still works for normal relative paths and non-existent paths
3. Only one definition of `resolveProjectDir` exists (in `lib/resolve-project-dir.ts`)
4. `file-watcher.ts` and `notes/route.ts` import from the shared module
5. `?limit=abc` returns 400 with validation error
6. `?limit=-5` returns 400 with validation error
7. `?limit=999999` is clamped to max (1000 for events-query)
8. `?offset=NaN` returns 400 with validation error
9. Normal valid query params still work as before
10. `bunx --bun tsc --noEmit` passes
11. `bun test` passes
