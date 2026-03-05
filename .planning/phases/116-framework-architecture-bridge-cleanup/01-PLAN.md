---
id: "01"
title: "Extract readWithFallback Helper and Migrate node:fs to Bun.file API"
phase: 116
wave: 1
depends_on: []
---

# PLAN-116-A: Extract readWithFallback Helper and Migrate node:fs to Bun.file API

## Objective

Reduce boilerplate in `bridge.ts` by extracting a generic `readWithFallback` helper from 5 duplicated SpacetimeDB-primary + JSON-fallback read handlers, and migrate remaining `node:fs` usage to Bun.file API in `ledger.ts` and `suspend-checkpoint.ts`.

Source: `.planning/v2.7.0-MILESTONE-AUDIT.md` -- HIGH #5 (bridge boilerplate), MEDIUM (Bun convention).

## Context

@file packages/luca-framework/src/state/bridge.ts -- Contains 5 read handlers (lines 150-469) that all follow the identical SpacetimeDB-primary + JSON-fallback pattern.

@file packages/luca-framework/src/state/ledger.ts -- Uses `appendFile` and `mkdir` from `node:fs/promises` (line 12) at line 189.

@file packages/luca-framework/src/state/suspend-checkpoint.ts -- Uses `mkdirSync` from `node:fs` (line 13) at line 75, and dynamic `import("node:fs/promises")` for `unlink` at line 143.

@file packages/luca-framework/src/state/persistence.ts -- Uses dynamic `import("node:fs/promises")` for `unlink` at line 244 (same pattern, migrate for consistency).

@file packages/luca-framework/src/state/\_\_helpers/spacetimedb-client.ts -- Provides `queryOne()` used by all read handlers.

## Tasks

### Task 1: Create the `readWithFallback` helper

**Goal:** Create `packages/luca-framework/src/state/__helpers/read-with-fallback.ts` with a generic helper that encapsulates the SpacetimeDB-primary + JSON-fallback read pattern.

**File:** `packages/luca-framework/src/state/__helpers/read-with-fallback.ts` (NEW)

**Target content:**

````typescript
/**
 * Generic SpacetimeDB-primary read with JSON file fallback.
 *
 * Encapsulates the pattern shared by all bridge read handlers:
 * 1. Try SpacetimeDB query via queryOne()
 * 2. If result, extract fields via extractor callback and return
 * 3. On failure, log if LUCA_DEBUG
 * 4. Fall back to stateExists() -> loadPersistedActor() -> extract from snapshot
 *
 * @module luca-state/read-with-fallback
 */
import { queryOne } from "./spacetimedb-client";
import { stateExists, loadPersistedActor } from "../persistence";

/**
 * Configuration for a SpacetimeDB-primary read with JSON fallback.
 *
 * @param T - The shape of the SpacetimeDB row
 * @param R - The shape of the returned result
 */
interface ReadWithFallbackConfig<T, R> {
  /** Label for debug logging (e.g., "read-complexity") */
  label: string;
  /** SQL query to execute against SpacetimeDB */
  sql: string;
  /** Extract the result from a SpacetimeDB row. Return null to fall through to fallback. */
  fromRow: (row: T) => R | null;
  /** Extract the result from a persisted actor snapshot context */
  fromSnapshot: (context: Record<string, unknown>, stateValue: string) => R;
  /** Default value when state is not initialized */
  defaults: R;
}

/**
 * Execute a SpacetimeDB-primary read with JSON file fallback.
 *
 * Implements the standard bridge read pattern:
 * 1. Query SpacetimeDB via queryOne()
 * 2. If row exists, extract via fromRow() callback
 * 3. On SpacetimeDB failure, log (LUCA_DEBUG) and fall through
 * 4. Check stateExists() -> loadPersistedActor() -> fromSnapshot()
 * 5. Return defaults if state is not initialized or load fails
 *
 * @param config - Configuration for the read operation
 * @returns The extracted result or defaults
 *
 * @example
 * ```typescript
 * const result = await readWithFallback({
 *   label: "read-complexity",
 *   sql: "SELECT complexity FROM workflow_state WHERE id = 1",
 *   fromRow: (row) => ({ complexity: row.complexity, initialized: true }),
 *   fromSnapshot: (ctx) => ({ complexity: ctx.complexity, initialized: true }),
 *   defaults: { complexity: "TRIVIAL", initialized: false },
 * });
 * ```
 */
export async function readWithFallback<T, R>(
  config: ReadWithFallbackConfig<T, R>,
): Promise<R> {
  const { label, sql, fromRow, fromSnapshot, defaults } = config;

  // Primary: try SpacetimeDB
  try {
    const row = await queryOne<T>(sql);
    if (row) {
      const result = fromRow(row);
      if (result !== null) return result;
    }
  } catch (err) {
    if (process.env.LUCA_DEBUG) {
      console.error(
        `[bridge] SpacetimeDB unavailable for ${label}, falling back to JSON:`,
        (err as Error).message,
      );
    }
  }

  // Fallback: JSON file
  const exists = await stateExists();
  if (!exists) return defaults;

  const loadResult = await loadPersistedActor();
  if (!loadResult.success) return defaults;

  const snapshot = loadResult.data.getSnapshot();
  return fromSnapshot(
    snapshot.context as unknown as Record<string, unknown>,
    String(snapshot.value),
  );
}
````

**Verification:** File exists and exports `readWithFallback`.

### Task 2: Refactor handleReadComplexity to use readWithFallback

**Goal:** Replace the 42-line `handleReadComplexity` function with a ~15-line version using `readWithFallback`.

**File:** `packages/luca-framework/src/state/bridge.ts`

**Add import (after the existing `queryOne` import on line 69):**

```typescript
import { readWithFallback } from "./__helpers/read-with-fallback";
```

**Current (lines 150-192):** 42 lines of SpacetimeDB query + fallback logic.

**Target:**

```typescript
async function handleReadComplexity(): Promise<void> {
  const result = await readWithFallback({
    label: "read-complexity",
    sql: "SELECT complexity FROM workflow_state WHERE id = 1",
    fromRow: (row: { complexity: string }) => ({
      complexity: row.complexity,
      initialized: true,
    }),
    fromSnapshot: (ctx) => ({
      complexity: ctx.complexity as string,
      initialized: true,
    }),
    defaults: { complexity: "TRIVIAL", initialized: false },
  });
  console.log(JSON.stringify(result));
}
```

**Verification:** `bun run packages/luca-framework/src/state/bridge.ts read-complexity` still returns valid JSON.

### Task 3: Refactor handleReadOversight to use readWithFallback

**File:** `packages/luca-framework/src/state/bridge.ts`

**Current (lines 200-242):** 42 lines.

**Target:**

```typescript
async function handleReadOversight(): Promise<void> {
  const result = await readWithFallback({
    label: "read-oversight",
    sql: "SELECT oversight FROM workflow_state WHERE id = 1",
    fromRow: (row: { oversight: string }) => ({
      oversight: row.oversight,
      initialized: true,
    }),
    fromSnapshot: (ctx) => ({
      oversight: ctx.oversight as string,
      initialized: true,
    }),
    defaults: { oversight: "milestone", initialized: false },
  });
  console.log(JSON.stringify(result));
}
```

### Task 4: Refactor handleReadPhase to use readWithFallback

**File:** `packages/luca-framework/src/state/bridge.ts`

**Current (lines 250-310):** 60 lines.

**Target:**

```typescript
async function handleReadPhase(): Promise<void> {
  const result = await readWithFallback({
    label: "read-phase",
    sql: "SELECT contextJson FROM workflow_state WHERE id = 1",
    fromRow: (row: { contextJson: string }) => {
      if (!row.contextJson) return null;
      const ctx = JSON.parse(row.contextJson);
      return {
        current_phase: ctx.current_phase ?? null,
        current_milestone: ctx.current_milestone ?? null,
        current_plan_ids: ctx.current_plan_ids ?? [],
        current_wave_count: ctx.current_wave_count ?? 0,
        initialized: true,
      };
    },
    fromSnapshot: (ctx) => ({
      current_phase: (ctx.current_phase as number | null) ?? null,
      current_milestone: (ctx.current_milestone as string | null) ?? null,
      current_plan_ids: ctx.current_plan_ids as string[],
      current_wave_count: ctx.current_wave_count as number,
      initialized: true,
    }),
    defaults: {
      current_phase: null as number | null,
      current_milestone: null as string | null,
      current_plan_ids: [] as string[],
      current_wave_count: 0,
      initialized: false,
    },
  });
  console.log(JSON.stringify(result));
}
```

### Task 5: Refactor handleReadStatus to use readWithFallback

**File:** `packages/luca-framework/src/state/bridge.ts`

**Current (lines 318-422):** 104 lines.

**Target:**

```typescript
async function handleReadStatus(): Promise<void> {
  const defaults = {
    initialized: false,
    state: "idle",
    complexity: "TRIVIAL",
    oversight: "milestone",
    current_phase: null as number | null,
    current_milestone: null as string | null,
    current_plan_ids: [] as string[],
    current_wave_count: 0,
    ticket_id: null as string | null,
    github_issue: null as string | null,
    branch: null as string | null,
    base_branch: "main",
    session_id: null as string | null,
    started_at: null as string | null,
    last_transition_at: null as string | null,
    verification_attempts: 0,
    phase_results_count: 0,
    last_error: null as string | null,
  };

  const result = await readWithFallback({
    label: "read-status",
    sql: "SELECT * FROM workflow_state WHERE id = 1",
    fromRow: (row: {
      workflowState: string;
      complexity: string;
      oversight: string;
      contextJson: string;
    }) => {
      if (!row.contextJson) return null;
      const ctx = JSON.parse(row.contextJson);
      return {
        initialized: true,
        state: row.workflowState ?? "idle",
        complexity: row.complexity ?? ctx.complexity ?? "TRIVIAL",
        oversight: row.oversight ?? ctx.oversight ?? "milestone",
        current_phase: ctx.current_phase ?? null,
        current_milestone: ctx.current_milestone ?? null,
        current_plan_ids: ctx.current_plan_ids ?? [],
        current_wave_count: ctx.current_wave_count ?? 0,
        ticket_id: ctx.ticket_id ?? null,
        github_issue: ctx.github_issue ?? null,
        branch: ctx.branch ?? null,
        base_branch: ctx.base_branch ?? "main",
        session_id: ctx.session_id ?? null,
        started_at: ctx.started_at ?? null,
        last_transition_at: ctx.last_transition_at ?? null,
        verification_attempts: ctx.verification_attempts ?? 0,
        phase_results_count: Array.isArray(ctx.phase_results)
          ? ctx.phase_results.length
          : 0,
        last_error: ctx.last_error ?? null,
      };
    },
    fromSnapshot: (ctx, stateValue) => ({
      initialized: true,
      state: stateValue,
      complexity: ctx.complexity as string,
      oversight: ctx.oversight as string,
      current_phase: (ctx.current_phase as number | null) ?? null,
      current_milestone: (ctx.current_milestone as string | null) ?? null,
      current_plan_ids: ctx.current_plan_ids as string[],
      current_wave_count: ctx.current_wave_count as number,
      ticket_id: (ctx.ticket_id as string | null) ?? null,
      github_issue: (ctx.github_issue as string | null) ?? null,
      branch: (ctx.branch as string | null) ?? null,
      base_branch: ctx.base_branch as string,
      session_id: ctx.session_id as string,
      started_at: (ctx.started_at as string | null) ?? null,
      last_transition_at: (ctx.last_transition_at as string | null) ?? null,
      verification_attempts: ctx.verification_attempts as number,
      phase_results_count: (ctx.phase_results as unknown[]).length,
      last_error: (ctx.last_error as string | null) ?? null,
    }),
    defaults,
  });
  console.log(JSON.stringify(result));
}
```

### Task 6: Refactor handleReadField to use readWithFallback

**File:** `packages/luca-framework/src/state/bridge.ts`

**Current (lines 432-469):** 37 lines. This handler is slightly different because it errors on missing state instead of returning defaults, and it takes a dynamic `--field` argument. However, it still follows the SpacetimeDB-primary pattern closely enough to benefit from `readWithFallback`.

**Target:**

```typescript
async function handleReadField(args: string[]): Promise<void> {
  const fieldPath = getArg(args, "field");
  if (!fieldPath) {
    console.error("Missing --field argument");
    process.exit(2);
  }

  const result = await readWithFallback({
    label: "read-field",
    sql: "SELECT contextJson FROM workflow_state WHERE id = 1",
    fromRow: (row: { contextJson: string }) => {
      if (!row.contextJson) return null;
      const ctx = JSON.parse(row.contextJson);
      return { field: fieldPath, value: get(ctx, fieldPath) };
    },
    fromSnapshot: (ctx) => ({
      field: fieldPath,
      value: get(ctx, fieldPath),
    }),
    defaults: null as { field: string; value: unknown } | null,
  });

  if (result === null) {
    console.error("State not initialized. Run ensure-init first.");
    process.exit(2);
  }

  console.log(JSON.stringify(result));
}
```

Note: The `defaults: null` approach allows `handleReadField` to detect "no state" and exit with error, matching its current behavior of erroring on missing state (unlike the other read handlers that return safe defaults).

### Task 7: Remove the direct `queryOne` import from bridge.ts if no longer needed

**Goal:** After refactoring all 5 read handlers, check whether `queryOne` is still directly used in `bridge.ts`. Looking at the remaining code:

- `handleSetField` (line 537) uses `queryOne` directly for read-modify-write
- `handleResumePhase` (line 1033) uses `queryOne` directly for checkpoint loading

So `queryOne` is still needed. **Keep** the import.

**Verification:** `grep -n "queryOne" packages/luca-framework/src/state/bridge.ts` returns the import line plus 2 remaining usages.

### Task 8: Migrate `node:fs` in ledger.ts to Bun APIs

**Goal:** Replace `appendFile` and `mkdir` from `node:fs/promises` with Bun equivalents.

**File:** `packages/luca-framework/src/state/ledger.ts`

**Current (line 12):**

```typescript
import { appendFile, mkdir } from "node:fs/promises";
```

**Current (lines 189-190, inside `appendLedgerEntry`):**

```typescript
await mkdir(dirname(ledgerPath), { recursive: true });
await appendFile(ledgerPath, JSON.stringify(entry) + "\n", "utf-8");
```

**Target (remove line 12 import entirely, also remove `dirname` import from `node:path` on line 13 if no longer needed):**

Replace lines 189-190 with:

```typescript
const dir = ledgerPath.substring(0, ledgerPath.lastIndexOf("/"));
if (dir) {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(dir, { recursive: true });
}
const file = Bun.file(ledgerPath);
const existing = (await file.exists()) ? await file.text() : "";
await Bun.write(ledgerPath, existing + JSON.stringify(entry) + "\n");
```

Note: Bun does not have a native `appendFile` equivalent. The pattern above reads existing content and appends. For a ledger that appends infrequently, this is acceptable. Alternatively, keep `appendFile` from `node:fs/promises` since Bun supports it. The `mkdir` can stay as a dynamic import since `Bun.write` does not auto-create directories.

**Revised approach (simpler, keep appendFile):** Since Bun's `Bun.write()` does not support append mode, and the ledger is append-only, the simplest migration is:

- Keep `appendFile` (Bun supports `node:fs/promises` natively)
- Replace `mkdir` with `Bun.write` where possible, but `mkdir` is still needed for directory creation
- The real win here is removing the static import and using a lazy pattern, or simply documenting this as an acceptable exception

**Final approach:** Replace the static import with a lazy import pattern to keep the file Bun-idiomatic while maintaining `appendFile` for append semantics:

```typescript
// Remove line 12: import { appendFile, mkdir } from "node:fs/promises";
// Remove line 13: import { dirname } from "node:path";

// In appendLedgerEntry, replace lines 189-190 with:
const dir = ledgerPath.substring(0, ledgerPath.lastIndexOf("/"));
if (dir) {
  const { mkdirSync } = await import("node:fs");
  mkdirSync(dir, { recursive: true });
}
const { appendFile } = await import("node:fs/promises");
await appendFile(ledgerPath, JSON.stringify(entry) + "\n", "utf-8");
```

Actually, this adds complexity for no real gain. **Keep the current `node:fs/promises` imports** -- they are supported by Bun and the `appendFile` function has no Bun.file equivalent. Document this as an acceptable exception per the bun-preference rule.

**Revised Task 8:** Add a comment documenting why `node:fs/promises` is retained:

```typescript
// node:fs/promises retained: Bun.write() does not support append mode.
// appendFile is the correct API for the append-only ledger pattern.
import { appendFile, mkdir } from "node:fs/promises";
```

**Verification:** Comment present. No behavioral change.

### Task 9: Migrate `node:fs` in suspend-checkpoint.ts to Bun APIs

**Goal:** Replace `mkdirSync` from `node:fs` and dynamic `unlink` import with Bun equivalents.

**File:** `packages/luca-framework/src/state/suspend-checkpoint.ts`

**Current (line 13):**

```typescript
import { mkdirSync } from "node:fs";
```

**Current (line 75, inside `createSuspendCheckpoint`):**

```typescript
mkdirSync(CHECKPOINTS_DIR, { recursive: true });
```

**Current (lines 142-144, inside `clearSuspendCheckpoint`):**

```typescript
if (await file.exists()) {
  const { unlink } = await import("node:fs/promises");
  await unlink(filePath);
}
```

**Target:**

Remove line 13 import. Replace line 75:

```typescript
const { mkdirSync } = await import("node:fs");
mkdirSync(CHECKPOINTS_DIR, { recursive: true });
```

Wait -- `createSuspendCheckpoint` is async, so we can use `mkdir` from `node:fs/promises` instead. But more importantly, `Bun.write()` already creates the file; it just does not create intermediate directories. We need `mkdir` for directory creation only.

**Better approach:** Since `Bun.write` on line 77 already writes the file, and we only need `mkdirSync` for directory creation, the simplest Bun-idiomatic migration is:

Replace line 13 and the usages:

```typescript
// Remove: import { mkdirSync } from "node:fs";

// In createSuspendCheckpoint, replace mkdirSync call:
const { mkdir } = await import("node:fs/promises");
await mkdir(CHECKPOINTS_DIR, { recursive: true });

// In clearSuspendCheckpoint, replace unlink:
if (await file.exists()) {
  await Bun.$`rm ${filePath}`;
}
```

Actually the cleanest Bun-first approach for `unlink`:

```typescript
// Bun.file has no delete method, but we can use:
const { unlink } = await import("node:fs/promises");
await unlink(filePath);
```

This is already what the code does. The only real improvement is removing the static `mkdirSync` import (line 13) and using the async `mkdir` in the already-async function.

**Final target for suspend-checkpoint.ts:**

Remove line 13 (`import { mkdirSync } from "node:fs";`).

Replace line 75 (`mkdirSync(CHECKPOINTS_DIR, { recursive: true });`) with:

```typescript
const { mkdir } = await import("node:fs/promises");
await mkdir(CHECKPOINTS_DIR, { recursive: true });
```

The `unlink` pattern at line 143 is already a dynamic import and acceptable.

**Verification:** `grep -n "from \"node:fs\"" packages/luca-framework/src/state/suspend-checkpoint.ts` returns no matches (the static sync import is removed). The dynamic `node:fs/promises` import for `unlink` remains (acceptable).

### Task 10: Migrate `node:fs` in persistence.ts for consistency

**Goal:** The dynamic `unlink` import at persistence.ts line 244 is already acceptable (it is a dynamic import). No change needed -- just verify consistency.

**File:** `packages/luca-framework/src/state/persistence.ts`

**Verification:** No static `node:fs` imports exist. Dynamic `import("node:fs/promises")` for `unlink` at line 244 is acceptable.

## Success Criteria

- [ ] New `packages/luca-framework/src/state/__helpers/read-with-fallback.ts` file exists with `readWithFallback()` function
- [ ] All 5 read handlers in bridge.ts (`handleReadComplexity`, `handleReadOversight`, `handleReadPhase`, `handleReadStatus`, `handleReadField`) use `readWithFallback`
- [ ] Net line reduction in bridge.ts >= 80 lines (was ~320 lines for 5 handlers, target ~120 lines)
- [ ] Static `import { mkdirSync } from "node:fs"` removed from suspend-checkpoint.ts
- [ ] `node:fs/promises` usage in ledger.ts documented with comment explaining why retained
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `bun test` passes

## Verification

```bash
# Verify helper file exists
test -f packages/luca-framework/src/state/__helpers/read-with-fallback.ts && echo "PASS: helper exists" || echo "FAIL"

# Verify readWithFallback is used in bridge.ts
grep -c "readWithFallback" packages/luca-framework/src/state/bridge.ts | xargs -I{} test {} -ge 5 && echo "PASS: 5+ usages" || echo "FAIL"

# Verify no static node:fs import in suspend-checkpoint.ts
grep "^import.*from \"node:fs\"" packages/luca-framework/src/state/suspend-checkpoint.ts && echo "FAIL: static import remains" || echo "PASS: static import removed"

# No regressions
bunx --bun tsc --noEmit
bun test
```
