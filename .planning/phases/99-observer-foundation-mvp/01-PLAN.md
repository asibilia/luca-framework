---
id: "99-01"
title: "Schema bridge: ledger reader, harness result types, and API routes"
phase: 99
wave: 1
complexity: MODERATE
depends_on: []
tasks:
  - id: "99-01-1"
    title: "Add ledger entry and harness result Zod schemas to observer types"
    goal: "Define observer-local Zod schemas mirroring luca-framework ledger entry and harness result shapes — no cross-package imports"
    verify: "bunx --bun tsc --noEmit passes within packages/luca-observer; LedgerEntrySchema, HarnessResultSnapshotSchema exported from ~/lib/types.ts"
  - id: "99-01-2"
    title: "Create ledger file reader utility"
    goal: "Add readLedgerEntries() to ~/lib/file-watcher.ts that reads .planning/session-ledger.jsonl and returns parsed, validated entries"
    verify: "readLedgerEntries() exported from ~/lib/file-watcher.ts; handles missing file, corrupted lines, and filter params"
  - id: "99-01-3"
    title: "Create harness result file reader utility"
    goal: "Add readHarnessResult() to ~/lib/file-watcher.ts that reads .planning/harness-result.json and returns parsed, validated snapshot"
    verify: "readHarnessResult() exported from ~/lib/file-watcher.ts; handles missing file and invalid JSON gracefully"
  - id: "99-01-4"
    title: "Create GET /api/ledger route"
    goal: "New API route that reads session-ledger.jsonl with optional query params (session_id, event_type, tail, limit)"
    verify: "GET /api/ledger returns JSON array of ledger entries; uses snake_case for all API fields; handles empty/missing file"
  - id: "99-01-5"
    title: "Create GET /api/harness route"
    goal: "New API route that reads .planning/harness-result.json and returns the latest harness result snapshot"
    verify: "GET /api/harness returns JSON harness result; handles missing file with empty default"
  - id: "99-01-6"
    title: "Add harness result persistence to runner"
    goal: "After runHarness() completes, write the HarnessResult to .planning/harness-result.json so the observer can read it"
    verify: "After running harness, .planning/harness-result.json exists with valid JSON matching HarnessResultSchema"
---

# 99-01: Schema Bridge — Ledger Reader, Harness Result Types, and API Routes

## Goal

Build the schema bridge connecting the observer to luca-framework state. This plan creates observer-local Zod schemas mirroring the framework's ledger entries and harness results, file-reading utilities, and two new API routes. The observer MUST NOT import from luca-framework directly -- all types are locally defined. Resolves #25 (schema bridge).

## Context

@packages/luca-observer/src/lib/types.ts -- Existing observer Zod schemas (ObserverEventSchema, WorkflowSnapshotSchema)
@packages/luca-observer/src/lib/file-watcher.ts -- Existing file readers (readWorkflowState, readMemoryFiles, readMetrics)
@packages/luca-observer/src/app/api/state/route.ts -- Example API route pattern
@packages/luca-framework/src/state/ledger.ts -- Framework ledger: ledgerEntrySchema, readLedger, LEDGER_PATH
@packages/luca-framework/src/state/types.ts -- transitionRecordSchema (the base shape for ledger entries)
@src/harness/**schemas/harness.schemas.ts -- HarnessResultSchema, CheckResultSchema, ParsedErrorSchema
@src/harness/**helpers/runner.ts -- runHarness function (needs persistence addition)

**Architecture constraints:**

- Observer types are locally defined (no imports from luca-framework)
- API schemas use snake_case per project conventions
- Use Bun.file() for file reading where possible, node:fs/promises as fallback in Next.js context
- Functional patterns only (no classes)
- Use safeParse for external data validation

**Key data sources:**

- `.planning/session-ledger.jsonl` -- JSONL file with one transition record per line, richest data source
- `.planning/harness-result.json` -- JSON file with latest harness run result (does not exist yet, created by Task 99-01-6)
- `.planning/STATE.md` -- Already read by existing /api/state route

## Tasks

### Task 99-01-1: Add ledger entry and harness result Zod schemas to observer types

Add observer-local schemas to `packages/luca-observer/src/lib/types.ts` that mirror the luca-framework shapes. These are independent definitions -- they do not import from the framework.

**Add after the existing `WorkflowSnapshotSchema`:**

```typescript
/**
 * Observer-local mirror of luca-framework's TransitionRecord + LedgerEntry.
 *
 * Represents a single state machine transition recorded in session-ledger.jsonl.
 * Locally defined to avoid cross-package dependency.
 * Uses snake_case for API compatibility.
 */
export const LedgerEntrySchema = z.object({
  previous_state: z.string(),
  current_state: z.string(),
  event_type: z.string(),
  event_data: z.record(z.unknown()).default({}),
  actions_executed: z.array(z.string()).default([]),
  context: z.record(z.unknown()).default({}),
  timestamp: z.string().default(""),
  session_id: z.string().default(""),
  sequence_number: z.number().int().nonnegative(),
  parent_id: z.number().int().nonnegative().nullable().default(null),
});

export type LedgerEntry = z.infer<typeof LedgerEntrySchema>;
```

**Add harness result schemas:**

```typescript
/**
 * Observer-local mirror of luca-framework's ParsedError.
 *
 * A single parsed error from toolchain output.
 * Uses snake_case for API compatibility.
 */
export const ParsedErrorSnapshotSchema = z.object({
  file: z.string(),
  line: z.number().optional(),
  column: z.number().optional(),
  message: z.string(),
  code: z.string().optional(),
  severity: z.enum(["error", "warning"]),
});

export type ParsedErrorSnapshot = z.infer<typeof ParsedErrorSnapshotSchema>;

/**
 * Observer-local mirror of luca-framework's CheckResult.
 *
 * Result of a single harness check (test, typecheck, lint, build).
 * Uses snake_case for API compatibility.
 */
export const CheckResultSnapshotSchema = z.object({
  name: z.string(),
  status: z.enum(["passed", "failed", "skipped", "timeout"]),
  exit_code: z.number().int(),
  errors: z.array(ParsedErrorSnapshotSchema).default([]),
  warnings: z.array(ParsedErrorSnapshotSchema).default([]),
  raw_output: z.string().default(""),
  duration: z.number().nonnegative().default(0),
});

export type CheckResultSnapshot = z.infer<typeof CheckResultSnapshotSchema>;

/**
 * Observer-local mirror of luca-framework's HarnessResult.
 *
 * Aggregate result of running all harness checks.
 * Uses snake_case for API compatibility.
 */
export const HarnessResultSnapshotSchema = z.object({
  status: z.enum(["passed", "failed"]),
  checks: z.array(CheckResultSnapshotSchema).default([]),
  total_errors: z.number().int().nonnegative().default(0),
  total_warnings: z.number().int().nonnegative().default(0),
  duration: z.number().nonnegative().default(0),
  timestamp: z.string().default(""),
});

export type HarnessResultSnapshot = z.infer<typeof HarnessResultSnapshotSchema>;
```

**Important:** The harness result schema uses snake_case field names (`exit_code`, `raw_output`, `total_errors`, `total_warnings`). The framework-side persistence (Task 99-01-6) will transform from camelCase to snake_case when writing.

**Verify:**

- [ ] All schemas defined with proper JSDoc
- [ ] `z.infer<>` types exported for each schema
- [ ] No imports from luca-framework
- [ ] `bunx --bun tsc --noEmit` passes in packages/luca-observer
- [ ] Schemas use snake_case for API fields

### Task 99-01-2: Create ledger file reader utility

Add `readLedgerEntries()` to `packages/luca-observer/src/lib/file-watcher.ts`.

```typescript
/**
 * Read and parse entries from .planning/session-ledger.jsonl.
 *
 * Reads the JSONL file, validates each line with safeParse (skipping
 * corrupted entries), and applies optional filters.
 *
 * @param projectDir - The root project directory (defaults to cwd)
 * @param filters - Optional filter criteria
 * @returns Array of validated LedgerEntry objects
 */
export async function readLedgerEntries(
  projectDir?: string,
  filters?: {
    session_id?: string;
    event_type?: string;
    tail?: number;
    limit?: number;
  },
): Promise<LedgerEntry[]> {
  const dir = resolveProjectDir(projectDir);
  const ledgerPath = join(dir, ".planning", "session-ledger.jsonl");

  try {
    const content = await readFile(ledgerPath, "utf-8");
    let lines = content.trim().split("\n").filter(Boolean);

    if (filters?.tail && filters.tail > 0) {
      lines = lines.slice(-filters.tail);
    }

    const entries: LedgerEntry[] = [];
    for (const line of lines) {
      try {
        const parsed = LedgerEntrySchema.safeParse(JSON.parse(line));
        if (parsed.success) {
          entries.push(parsed.data);
        }
      } catch {
        // Skip malformed JSON lines
      }
    }

    let filtered = entries;

    if (filters?.session_id) {
      filtered = filtered.filter((e) => e.session_id === filters.session_id);
    }
    if (filters?.event_type) {
      filtered = filtered.filter((e) => e.event_type === filters.event_type);
    }
    if (filters?.limit && filters.limit > 0) {
      filtered = filtered.slice(0, filters.limit);
    }

    return filtered;
  } catch {
    return [];
  }
}
```

**Steps:**

1. Import `LedgerEntrySchema` and `LedgerEntry` from `./types` at the top of file-watcher.ts
2. Add the `readLedgerEntries` function after the existing `readMetrics` function
3. The function reuses the existing `resolveProjectDir` helper already in the file

**Verify:**

- [ ] `readLedgerEntries()` exported from `~/lib/file-watcher.ts`
- [ ] Handles missing file gracefully (returns empty array)
- [ ] Handles corrupted lines (skips them, does not throw)
- [ ] Supports all four filter params
- [ ] Uses safeParse for validation
- [ ] `bunx --bun tsc --noEmit` passes

### Task 99-01-3: Create harness result file reader utility

Add `readHarnessResult()` to `packages/luca-observer/src/lib/file-watcher.ts`.

```typescript
/**
 * Read the latest harness result from .planning/harness-result.json.
 *
 * @param projectDir - The root project directory (defaults to cwd)
 * @returns Parsed HarnessResultSnapshot or null if file does not exist
 */
export async function readHarnessResult(
  projectDir?: string,
): Promise<HarnessResultSnapshot | null> {
  const dir = resolveProjectDir(projectDir);
  const resultPath = join(dir, ".planning", "harness-result.json");

  try {
    const content = await readFile(resultPath, "utf-8");
    const parsed = HarnessResultSnapshotSchema.safeParse(JSON.parse(content));
    if (parsed.success) {
      return parsed.data;
    }
    return null;
  } catch {
    return null;
  }
}
```

**Steps:**

1. Import `HarnessResultSnapshotSchema` and `HarnessResultSnapshot` from `./types`
2. Add the function after `readLedgerEntries`

**Verify:**

- [ ] `readHarnessResult()` exported from `~/lib/file-watcher.ts`
- [ ] Returns `HarnessResultSnapshot | null`
- [ ] Handles missing file (returns null)
- [ ] Handles invalid JSON (returns null)
- [ ] Uses safeParse for validation
- [ ] `bunx --bun tsc --noEmit` passes

### Task 99-01-4: Create GET /api/ledger route

Create `packages/luca-observer/src/app/api/ledger/route.ts`.

```typescript
import { NextResponse } from "next/server";

import { readLedgerEntries } from "~/lib/file-watcher";

export const dynamic = "force-dynamic";

/**
 * GET /api/ledger -- Read session ledger entries.
 *
 * Reads .planning/session-ledger.jsonl and returns parsed entries.
 * Supports query parameters:
 * - session_id: Filter by session ID
 * - event_type: Filter by event type
 * - tail: Read only the last N raw lines before parsing
 * - limit: Cap the number of returned entries
 *
 * Uses snake_case for API compatibility.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectDir = searchParams.get("dir") ?? undefined;

  try {
    const filters = {
      session_id: searchParams.get("session_id") ?? undefined,
      event_type: searchParams.get("event_type") ?? undefined,
      tail: searchParams.has("tail")
        ? parseInt(searchParams.get("tail")!, 10)
        : undefined,
      limit: searchParams.has("limit")
        ? parseInt(searchParams.get("limit")!, 10)
        : 100,
    };

    const entries = await readLedgerEntries(projectDir, filters);

    return NextResponse.json({
      entries,
      total_count: entries.length,
    });
  } catch {
    return NextResponse.json(
      { error: "failed_to_read_ledger" },
      { status: 500 },
    );
  }
}
```

**Steps:**

1. Create directory: `mkdir -p packages/luca-observer/src/app/api/ledger`
2. Create `route.ts` with the above implementation
3. Follow exact pattern of existing API routes (dynamic = "force-dynamic", snake_case response)

**Verify:**

- [ ] File exists at `packages/luca-observer/src/app/api/ledger/route.ts`
- [ ] Returns JSON with `entries` array and `total_count`
- [ ] Supports all four query parameters
- [ ] Uses snake_case for all response fields
- [ ] Error handling returns structured error response
- [ ] `bunx --bun tsc --noEmit` passes

### Task 99-01-5: Create GET /api/harness route

Create `packages/luca-observer/src/app/api/harness/route.ts`.

```typescript
import { NextResponse } from "next/server";

import { readHarnessResult } from "~/lib/file-watcher";

export const dynamic = "force-dynamic";

/**
 * GET /api/harness -- Read latest harness verification result.
 *
 * Reads .planning/harness-result.json and returns the parsed snapshot.
 * Returns null fields if no harness result exists yet.
 *
 * Uses snake_case for API compatibility.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectDir = searchParams.get("dir") ?? undefined;

  try {
    const result = await readHarnessResult(projectDir);

    return NextResponse.json({
      result,
      has_result: result !== null,
    });
  } catch {
    return NextResponse.json(
      { error: "failed_to_read_harness_result" },
      { status: 500 },
    );
  }
}
```

**Steps:**

1. The directory `packages/luca-observer/src/app/api/harness` may already exist from the harness page route -- if not, it is an API route, create it as `api/harness-result` to avoid collision with the page route. Check if `packages/luca-observer/src/app/api/harness/` already exists. If it does not, create it for the API route.

**Important:** Next.js App Router does not allow a page.tsx and a route.ts to share the same path. The page `/harness` exists at `src/app/harness/page.tsx`. The API route goes at `src/app/api/harness/route.ts` (under `/api/`), which is a different path. No collision.

**Verify:**

- [ ] File exists at `packages/luca-observer/src/app/api/harness/route.ts`
- [ ] Returns JSON with `result` and `has_result` fields
- [ ] Handles missing harness-result.json gracefully
- [ ] Uses snake_case for all response fields
- [ ] `bunx --bun tsc --noEmit` passes

### Task 99-01-6: Add harness result persistence to runner

Modify `src/harness/__helpers/runner.ts` to persist the `HarnessResult` to `.planning/harness-result.json` after each run. The observer reads this file via the `/api/harness` route.

**Steps:**

1. In `runHarness()`, after constructing the result object and before returning it, write to disk:

```typescript
// In runHarness(), before `return`:

// Persist result for observer consumption
try {
  const resultPath = join(projectDir, ".planning", "harness-result.json");
  const snakeCaseResult = {
    status: result.status,
    checks: result.checks.map((c) => ({
      name: c.name,
      status: c.status,
      exit_code: c.exitCode,
      errors: c.errors,
      warnings: c.warnings,
      raw_output: c.rawOutput,
      duration: c.duration,
    })),
    total_errors: result.totalErrors,
    total_warnings: result.totalWarnings,
    duration: result.duration,
    timestamp: result.timestamp,
  };
  await Bun.write(resultPath, JSON.stringify(snakeCaseResult, null, 2));
} catch {
  // Best-effort persistence -- do not fail the harness run
}
```

2. The write transforms camelCase field names (exitCode, rawOutput, totalErrors, etc.) to snake_case (exit_code, raw_output, total_errors) for API compatibility with the observer schemas.

3. Uses `Bun.write` per project conventions.

**Verify:**

- [ ] After `runHarness()`, `.planning/harness-result.json` exists
- [ ] File content uses snake_case field names
- [ ] Existing harness behavior unchanged (return value, exit codes)
- [ ] Write failure does not break the harness run
- [ ] `bunx --bun tsc --noEmit` passes

## Success Criteria

- [ ] Observer-local schemas defined for LedgerEntry and HarnessResultSnapshot (no imports from luca-framework)
- [ ] `readLedgerEntries()` reads and parses session-ledger.jsonl with filtering
- [ ] `readHarnessResult()` reads and parses harness-result.json
- [ ] GET /api/ledger route returns filtered ledger entries
- [ ] GET /api/harness route returns latest harness result
- [ ] Harness runner persists results to .planning/harness-result.json after every run
- [ ] All API responses use snake_case field names
- [ ] `bunx --bun tsc --noEmit` passes for both observer and root project
