---
id: "109-02"
title: "Extract readJsonSnapshot helper and API route factory"
phase: 109
wave: 1
complexity: MODERATE
depends_on: []
tasks:
  - id: "109-02-1"
    title: "Extract readJsonSnapshot generic helper from file-watcher.ts"
    goal: "Create a generic readJsonSnapshot<T> function that encapsulates the read-file -> JSON.parse -> safeParse pattern used by 3 functions in file-watcher.ts"
    verify: "readJsonSnapshot exported from ~/lib/file-watcher.ts; readHarnessResult, readSessionPlan, readTribunalResult refactored to use it; bunx --bun tsc --noEmit passes"
  - id: "109-02-2"
    title: "Extract createFileReaderRoute API route factory"
    goal: "Create a generic factory function for the 6 structurally identical GET handlers that follow the pattern: read dir param, call file reader, return JSON with error handling"
    verify: "createFileReaderRoute exported from ~/lib/route-factory.ts; at least 4 routes refactored to use it; bunx --bun tsc --noEmit passes"
  - id: "109-02-3"
    title: "Refactor remaining API routes to use route factory"
    goal: "Apply the route factory to all eligible routes: state, harness, iterations, planning, tribunal, memory, metrics"
    verify: "All 7 simple GET routes use createFileReaderRoute; ledger and notes routes remain custom (they have unique logic); bunx --bun tsc --noEmit passes"
---

# 109-02: Extract readJsonSnapshot Helper and API Route Factory

## Goal

Close two MEDIUM-severity DRY violations: (1) the identical read-parse-validate pattern used by 3 JSON snapshot readers in file-watcher.ts, and (2) the identical GET route structure shared by 6+ API route files. Extract shared utilities to eliminate boilerplate.

## Context

@packages/luca-observer/lib/file-watcher.ts -- Contains readHarnessResult, readSessionPlan, readTribunalResult with identical structure
@packages/luca-observer/app/api/state/route.ts -- Simple GET route pattern
@packages/luca-observer/app/api/harness/route.ts -- Wrapped GET route pattern (result + has_result)
@packages/luca-observer/app/api/iterations/route.ts -- Array GET route pattern (array + total_count)
@packages/luca-observer/app/api/planning/route.ts -- Wrapped GET route pattern (plan + has_plan)
@packages/luca-observer/app/api/tribunal/route.ts -- Wrapped GET route pattern (result + has_result)
@packages/luca-observer/app/api/memory/route.ts -- Simple GET route pattern
@packages/luca-observer/app/api/metrics/route.ts -- Simple GET route pattern

**Pattern 1 -- readJsonSnapshot (3 identical functions):**

```typescript
export async function readXxx(projectDir?: string): Promise<T | null> {
  const dir = resolveProjectDir(projectDir);
  const resultPath = join(dir, ".planning", "xxx.json");
  try {
    const content = await readFile(resultPath, "utf-8");
    const parsed = XxxSchema.safeParse(JSON.parse(content));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
```

This pattern is used by readHarnessResult, readSessionPlan, and readTribunalResult. They differ only in the filename and schema.

**Pattern 2 -- API route factory (7 identical GET handlers):**

```typescript
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectDir = searchParams.get("dir") ?? undefined;
  try {
    const data = await readerFunction(projectDir);
    return NextResponse.json(/* shape varies */);
  } catch {
    return NextResponse.json({ error: "failed_to_read_xxx" }, { status: 500 });
  }
}
```

The routes differ in: (a) which reader function to call, (b) how to shape the response, (c) the error key.

**Excluded from factory:** The `/api/ledger` route has query parameter validation logic, and `/api/notes` has both GET and POST with custom logic. These stay custom.

## Tasks

### Task 109-02-1: Extract readJsonSnapshot generic helper

Add a generic `readJsonSnapshot<T>` function to `packages/luca-observer/lib/file-watcher.ts` that encapsulates the common read-parse-validate pattern.

**Implementation:**

````typescript
/**
 * Generic helper to read and validate a JSON snapshot file.
 *
 * Reads a JSON file from the .planning directory, parses it, and
 * validates against the provided Zod schema using safeParse.
 * Returns null if the file does not exist, is empty, or fails validation.
 *
 * @param filename - Name of the JSON file within .planning/ (e.g., "harness-result.json")
 * @param schema - Zod schema to validate the parsed JSON
 * @param projectDir - The root project directory (defaults to cwd)
 * @returns Parsed and validated data, or null on any failure
 *
 * @example
 * ```typescript
 * const result = await readJsonSnapshot(
 *   "harness-result.json",
 *   HarnessResultSnapshotSchema,
 * );
 * ```
 */
async function readJsonSnapshot<T>(
  filename: string,
  schema: z.ZodType<T>,
  projectDir?: string,
): Promise<T | null> {
  const dir = resolveProjectDir(projectDir);
  const filePath = join(dir, ".planning", filename);

  try {
    const content = await readFile(filePath, "utf-8");
    const parsed = schema.safeParse(JSON.parse(content));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
````

Then refactor the three functions to use it:

```typescript
export async function readHarnessResult(
  projectDir?: string,
): Promise<HarnessResultSnapshot | null> {
  return readJsonSnapshot(
    "harness-result.json",
    HarnessResultSnapshotSchema,
    projectDir,
  );
}

export async function readSessionPlan(
  projectDir?: string,
): Promise<SessionPlanSnapshot | null> {
  return readJsonSnapshot(
    "session-plan.json",
    SessionPlanSnapshotSchema,
    projectDir,
  );
}

export async function readTribunalResult(
  projectDir?: string,
): Promise<TribunalResultSnapshot | null> {
  return readJsonSnapshot(
    "tribunal-result.json",
    TribunalResultSnapshotSchema,
    projectDir,
  );
}
```

**Important:** Import `z` from "zod" at the top of file-watcher.ts (may already be available via schema imports). The `readJsonSnapshot` function can be either exported (for potential reuse) or kept as a private helper. Prefer exporting it since the lib layer is a utility layer.

**Verify:**

- [ ] `readJsonSnapshot<T>` function exists in file-watcher.ts
- [ ] readHarnessResult, readSessionPlan, readTribunalResult all delegate to it
- [ ] Each function is now 1-3 lines (down from ~15)
- [ ] All three functions preserve identical behavior (null on missing/invalid file)
- [ ] `bunx --bun tsc --noEmit` passes

### Task 109-02-2: Extract createFileReaderRoute API route factory

Create `packages/luca-observer/lib/route-factory.ts` with a factory function that generates Next.js GET route handlers.

**Implementation:**

````typescript
import { NextResponse } from "next/server";

/**
 * Create a standard GET route handler for file-backed API endpoints.
 *
 * Generates a Next.js App Router GET handler that:
 * 1. Extracts the optional `dir` query parameter
 * 2. Calls the provided async reader function
 * 3. Shapes the response using the provided transform
 * 4. Returns a structured error on failure
 *
 * Handles three response shapes:
 * - "direct": Returns the reader result directly as JSON
 * - "nullable": Wraps result as { [key]: result, has_[key]: boolean }
 * - "array": Wraps result as { [key]: result, total_count: result.length }
 *
 * @param reader - Async function that reads data from the filesystem
 * @param errorKey - Error identifier for the 500 response (e.g., "failed_to_read_state")
 * @param shape - Response shape configuration
 * @returns Next.js GET route handler function
 *
 * @example
 * ```typescript
 * // Direct response (state, memory, metrics)
 * export const GET = createFileReaderRoute(
 *   readWorkflowState,
 *   "failed_to_read_state",
 *   { type: "direct" },
 * );
 *
 * // Nullable response (harness, planning, tribunal)
 * export const GET = createFileReaderRoute(
 *   readHarnessResult,
 *   "failed_to_read_harness_result",
 *   { type: "nullable", key: "result" },
 * );
 *
 * // Array response (iterations, agents)
 * export const GET = createFileReaderRoute(
 *   readIterationHistory,
 *   "failed_to_read_iterations",
 *   { type: "array", key: "iterations" },
 * );
 * ```
 */
type ResponseShape =
  | { type: "direct" }
  | { type: "nullable"; key: string }
  | { type: "array"; key: string };

export function createFileReaderRoute(
  reader: (projectDir?: string) => Promise<unknown>,
  errorKey: string,
  shape: ResponseShape,
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    const { searchParams } = new URL(request.url);
    const projectDir = searchParams.get("dir") ?? undefined;

    try {
      const result = await reader(projectDir);

      if (shape.type === "direct") {
        return NextResponse.json(result);
      }

      if (shape.type === "nullable") {
        return NextResponse.json({
          [shape.key]: result,
          [`has_${shape.key}`]: result !== null,
        });
      }

      if (shape.type === "array") {
        const arr = Array.isArray(result) ? result : [];
        return NextResponse.json({
          [shape.key]: arr,
          total_count: arr.length,
        });
      }

      return NextResponse.json(result);
    } catch {
      return NextResponse.json({ error: errorKey }, { status: 500 });
    }
  };
}
````

**Verify:**

- [ ] File exists at `packages/luca-observer/lib/route-factory.ts`
- [ ] `createFileReaderRoute` exported with correct types
- [ ] Supports "direct", "nullable", and "array" response shapes
- [ ] Extracts `dir` query param and passes to reader
- [ ] Returns structured error on failure
- [ ] `bunx --bun tsc --noEmit` passes

### Task 109-02-3: Refactor API routes to use route factory

Refactor 7 API routes to use `createFileReaderRoute`:

**1. /api/state/route.ts** (direct shape):

```typescript
import { readWorkflowState } from "~/lib/file-watcher";
import { createFileReaderRoute } from "~/lib/route-factory";

export const dynamic = "force-dynamic";

/**
 * GET /api/state -- Read current workflow state.
 * ... (keep existing JSDoc)
 */
export const GET = createFileReaderRoute(
  readWorkflowState,
  "failed_to_read_state",
  { type: "direct" },
);
```

**2. /api/harness/route.ts** (nullable shape):

```typescript
export const GET = createFileReaderRoute(
  readHarnessResult,
  "failed_to_read_harness_result",
  { type: "nullable", key: "result" },
);
```

**3. /api/iterations/route.ts** (array shape):

```typescript
export const GET = createFileReaderRoute(
  readIterationHistory,
  "failed_to_read_iterations",
  { type: "array", key: "iterations" },
);
```

**4. /api/planning/route.ts** (nullable shape):

```typescript
export const GET = createFileReaderRoute(
  readSessionPlan,
  "failed_to_read_planning",
  { type: "nullable", key: "plan" },
);
```

**5. /api/tribunal/route.ts** (nullable shape):

```typescript
export const GET = createFileReaderRoute(
  readTribunalResult,
  "failed_to_read_tribunal",
  { type: "nullable", key: "result" },
);
```

**6. /api/memory/route.ts** (direct shape):

```typescript
export const GET = createFileReaderRoute(
  readMemoryFiles,
  "failed_to_read_memory",
  { type: "direct" },
);
```

**7. /api/metrics/route.ts** (direct shape):

```typescript
export const GET = createFileReaderRoute(
  readMetrics,
  "failed_to_read_metrics",
  { type: "direct" },
);
```

**NOT refactored (custom logic):**

- `/api/ledger/route.ts` -- Has query parameter validation with LedgerQueryParamsSchema
- `/api/notes/route.ts` -- Has both GET and POST with custom note parsing logic
- `/api/stream/route.ts` -- SSE streaming, completely different pattern
- `/api/events/route.ts`, `/api/events-query/route.ts`, `/api/sessions/route.ts` -- DB-backed, different pattern

**Important:** Each route file must keep its existing JSDoc documentation and `export const dynamic = "force-dynamic"` declaration.

**Verify:**

- [ ] All 7 routes use createFileReaderRoute
- [ ] Each route file is reduced to ~15 lines (imports + JSDoc + dynamic + export)
- [ ] All routes preserve identical response shapes
- [ ] `/api/ledger`, `/api/notes`, `/api/stream` remain unchanged
- [ ] `bunx --bun tsc --noEmit` passes

## Success Criteria

- [ ] `readJsonSnapshot<T>` eliminates 3 identical read-parse-validate functions (~30 lines saved)
- [ ] `createFileReaderRoute` eliminates 7 identical GET handler implementations (~150 lines saved)
- [ ] All existing response shapes preserved (no breaking API changes)
- [ ] Custom routes (ledger, notes, stream) left unchanged
- [ ] `bunx --bun tsc --noEmit` passes
