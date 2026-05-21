---
id: "111-01"
title: "DRY Extractions — process.cwd, statusColors, formatTimestamp, formatChars/formatSize, readMetrics"
phase: 111
wave: 1
depends_on: []
complexity: SIMPLE
---

# Plan 111-01: DRY Extractions

## Objective

Five discrete DRY violations exist in the `luca-observer` package: a stray `process.cwd()` call that bypasses the validated `resolveProjectDir()` helper; two independent `statusColors` maps that are identical in `convergence-chart.tsx` and `iteration-timeline.tsx`; two independent `formatTimestamp` functions that differ only in time-format options, shared between `session-plan-overview.tsx` and `transition-log.tsx`; two independent `formatChars`/`formatSize` character-count formatters in `context-usage-bar.tsx` and `working-sections.tsx`; and the `readMetrics` function in `lib/file-watcher.ts` that duplicates the JSON-read-and-parse pattern already abstracted by the private `readJsonSnapshot` helper in the same file. Closing these violations removes duplication, centralises defaults, and eliminates the security bypass introduced by the raw `process.cwd()` call.

## Context

@packages/luca-observer/app/api/notes/route.ts — POST handler uses `process.cwd()` at line 210 instead of `resolveProjectDir()`
@packages/luca-observer/lib/resolve-project-dir.ts — `resolveProjectDir()` helper (validated, symlink-safe)
@packages/luca-observer/components/iteration/convergence-chart.tsx — defines `statusColors` locally at line 31
@packages/luca-observer/components/iteration/iteration-timeline.tsx — defines identical `statusColors` locally at line 61
@packages/luca-observer/components/planning/session-plan-overview.tsx — defines `formatTimestamp` (locale full date-time) at line 8
@packages/luca-observer/components/workflow/transition-log.tsx — defines `formatTimestamp` (locale time-only, with options) at line 26
@packages/luca-observer/components/memory/context-usage-bar.tsx — defines `formatChars` (compact k suffix) at line 43
@packages/luca-observer/components/memory/working-sections.tsx — defines `formatSize` (chars label with k suffix) at line 55
@packages/luca-observer/lib/file-watcher.ts — `readMetrics` re-implements JSON file read instead of calling the private `readJsonSnapshot` helper (lines 119-131 vs lines 45-59)

## Tasks

### Task 1: Replace `process.cwd()` with `resolveProjectDir()` in notes/route.ts POST handler

**Goal:** The POST handler in `app/api/notes/route.ts` resolves the notes directory with a raw `process.cwd()` call (line 210) rather than using `resolveProjectDir()`. This bypasses the validated, symlink-safe lookup and is inconsistent with the GET handler in the same file, which already uses `resolveProjectDir()`.

**Files:**

- `packages/luca-observer/app/api/notes/route.ts` — replace `process.cwd()` with `resolveProjectDir()` call

**Steps:**

1. Locate the POST handler body. At line 210, `const notesDir = join(process.cwd(), ".planning", "notes");` constructs the path with a raw `process.cwd()` call.
2. Replace that line with:
   ```typescript
   const notesDir = join(resolveProjectDir(), ".planning", "notes");
   ```
3. `resolveProjectDir` is already imported at line 12 — no new import is needed.
4. Verify the POST handler still accepts an optional `dir` query parameter. The GET handler accepts one; check if the POST handler should too. Given the POST handler takes a body (not query params) and creates the note in the project root, using `resolveProjectDir()` (no argument, falls back to `LUCA_PROJECT_DIR` env var or `process.cwd()`) is the correct and secure default. Do not add a query-param `dir` to the POST handler.

**Verification:**

- [ ] `process.cwd()` no longer appears in the POST handler body
- [ ] `resolveProjectDir()` is called (with no argument) where `process.cwd()` was
- [ ] The `resolveProjectDir` import at line 12 is the only import (no duplicate)
- [ ] `bunx --bun tsc --noEmit` passes

### Task 2: Extract `statusColors` to a shared constant

**Goal:** The `statusColors` map (`{ improved: "success", stalled: "warning", regressed: "destructive" }`) is defined identically in two files: `convergence-chart.tsx` (line 31) and `iteration-timeline.tsx` (line 61). Extract it to `lib/constants.ts` as an exported constant so both components import it from a single source of truth.

**Files:**

- `packages/luca-observer/lib/constants.ts` — add exported `CONVERGENCE_STATUS_COLORS` constant
- `packages/luca-observer/components/iteration/convergence-chart.tsx` — import and use `CONVERGENCE_STATUS_COLORS`
- `packages/luca-observer/components/iteration/iteration-timeline.tsx` — import and use `CONVERGENCE_STATUS_COLORS`

**Steps:**

1. In `lib/constants.ts`, append after the existing constants:
   ```typescript
   /**
    * Maps convergence status strings to design-system color token names.
    *
    * Used by ConvergenceChart and IterationTimeline to resolve bar and badge colors.
    */
   export const CONVERGENCE_STATUS_COLORS: Record<string, string> = {
     improved: "success",
     stalled: "warning",
     regressed: "destructive",
   };
   ```
2. In `convergence-chart.tsx`, remove the local `statusColors` declaration (lines 31-35) and add an import:
   ```typescript
   import { CONVERGENCE_STATUS_COLORS } from "~/lib/constants";
   ```
   Replace all references to `statusColors` with `CONVERGENCE_STATUS_COLORS`.
3. In `iteration-timeline.tsx`, remove the local `statusColors` declaration inside `IterationCard` (lines 61-65) and add an import:
   ```typescript
   import { CONVERGENCE_STATUS_COLORS } from "~/lib/constants";
   ```
   Replace all references to `statusColors` with `CONVERGENCE_STATUS_COLORS`.

**Verification:**

- [ ] `CONVERGENCE_STATUS_COLORS` exported from `lib/constants.ts`
- [ ] No local `statusColors` declaration remains in either component file
- [ ] Both components import `CONVERGENCE_STATUS_COLORS` from `~/lib/constants`
- [ ] Visual behavior unchanged (same color token names used)
- [ ] `bunx --bun tsc --noEmit` passes

### Task 3: Extract `formatTimestamp` to a shared utility

**Goal:** `formatTimestamp(ts: string): string` is defined in both `session-plan-overview.tsx` (returns full locale date-time) and `transition-log.tsx` (returns locale time-only with `hour/minute/second` options). These are different formatting presets that share the same guard logic (`if (!ts) return "--"; try { ... } catch { return ts; }`). Extract two named utilities — `formatDateTime` and `formatTime` — to `lib/format.ts`.

**Files:**

- `packages/luca-observer/lib/format.ts` — create new file with `formatDateTime` and `formatTime`
- `packages/luca-observer/components/planning/session-plan-overview.tsx` — remove local function, import `formatDateTime`
- `packages/luca-observer/components/workflow/transition-log.tsx` — remove local function, import `formatTime`

**Steps:**

1. Create `packages/luca-observer/lib/format.ts`:

   ````typescript
   /**
    * Shared timestamp formatting utilities for the Luca Observer dashboard.
    *
    * Centralises the common pattern of converting ISO timestamp strings to
    * locale-formatted display strings with graceful fallbacks.
    */

   /**
    * Format an ISO timestamp string to a locale date-time string.
    *
    * Returns "--" for empty/falsy input, falls back to the raw string
    * if Date parsing fails.
    *
    * @param ts - ISO timestamp string (e.g. "2024-01-15T12:30:00.000Z")
    * @returns Locale-formatted date-time string, or "--" / raw string on failure
    *
    * @example
    * ```typescript
    * formatDateTime("2024-01-15T12:30:00.000Z")
    * // "1/15/2024, 12:30:00 PM" (locale-dependent)
    * ```
    */
   export function formatDateTime(ts: string): string {
     if (!ts) return "--";
     try {
       return new Date(ts).toLocaleString();
     } catch {
       return ts;
     }
   }

   /**
    * Format an ISO timestamp string to a compact locale time string (HH:MM:SS).
    *
    * Returns "--" for empty/falsy input, falls back to the raw string
    * if Date parsing fails.
    *
    * @param ts - ISO timestamp string
    * @returns Locale-formatted time string (hour, minute, second), or "--" / raw string on failure
    *
    * @example
    * ```typescript
    * formatTime("2024-01-15T12:30:45.000Z")
    * // "12:30:45 PM" (locale-dependent)
    * ```
    */
   export function formatTime(ts: string): string {
     if (!ts) return "--";
     try {
       return new Date(ts).toLocaleTimeString(undefined, {
         hour: "2-digit",
         minute: "2-digit",
         second: "2-digit",
       });
     } catch {
       return ts;
     }
   }

   /**
    * Format a character count for compact display.
    *
    * - 0 → "0"
    * - < 1000 → raw number string
    * - < 100k → "X.Xk"
    * - ≥ 100k → "Xk"
    *
    * @param chars - Character count (non-negative integer)
    * @returns Compact string representation
    *
    * @example
    * ```typescript
    * formatChars(0)     // "0"
    * formatChars(500)   // "500"
    * formatChars(1500)  // "1.5k"
    * formatChars(150000) // "150k"
    * ```
    */
   export function formatChars(chars: number): string {
     if (chars === 0) return "0";
     if (chars < 1000) return chars.toString();
     if (chars < 100_000) return `${(chars / 1000).toFixed(1)}k`;
     return `${(chars / 1000).toFixed(0)}k`;
   }

   /**
    * Format a character count with a "chars" label for display.
    *
    * Used in section size badges where the unit label aids readability.
    *
    * @param chars - Character count (non-negative integer)
    * @returns String with "chars" or "k chars" suffix
    *
    * @example
    * ```typescript
    * formatSize(0)     // "0 chars"
    * formatSize(500)   // "500 chars"
    * formatSize(1500)  // "1.5k chars"
    * ```
    */
   export function formatSize(chars: number): string {
     if (chars === 0) return "0 chars";
     if (chars < 1000) return `${chars} chars`;
     return `${(chars / 1000).toFixed(1)}k chars`;
   }
   ````

2. In `session-plan-overview.tsx`, remove the local `formatTimestamp` function (lines 8-15) and add:
   ```typescript
   import { formatDateTime } from "~/lib/format";
   ```
   Replace the single call `formatTimestamp(plan.generated_at)` with `formatDateTime(plan.generated_at)`.
3. In `transition-log.tsx`, remove the local `formatTimestamp` function (lines 26-37) and add:
   ```typescript
   import { formatTime } from "~/lib/format";
   ```
   Replace the single call `formatTimestamp(entry.timestamp)` with `formatTime(entry.timestamp)`.

**Verification:**

- [ ] `lib/format.ts` exists and exports `formatDateTime`, `formatTime`, `formatChars`, `formatSize`
- [ ] No local `formatTimestamp` function remains in `session-plan-overview.tsx` or `transition-log.tsx`
- [ ] `session-plan-overview.tsx` imports `formatDateTime` from `~/lib/format`
- [ ] `transition-log.tsx` imports `formatTime` from `~/lib/format`
- [ ] `bunx --bun tsc --noEmit` passes

### Task 4: Migrate `formatChars` and `formatSize` to shared utility

**Goal:** `formatChars` in `context-usage-bar.tsx` (line 43) and `formatSize` in `working-sections.tsx` (line 55) are separate utilities that format character counts for display. Both are already extracted into `lib/format.ts` in Task 3. Replace the local definitions with imports from the shared utility file.

**Files:**

- `packages/luca-observer/components/memory/context-usage-bar.tsx` — remove local `formatChars`, import from `~/lib/format`
- `packages/luca-observer/components/memory/working-sections.tsx` — remove local `formatSize`, import from `~/lib/format`

**Steps:**

1. In `context-usage-bar.tsx`, remove the local `formatChars` function (lines 43-48) and add:
   ```typescript
   import { formatChars } from "~/lib/format";
   ```
   The existing call sites (`formatChars(totalChars)`, `formatChars(seg.chars)`) are already correct and require no changes.
2. In `working-sections.tsx`, remove the local `formatSize` function (lines 55-59) and add:
   ```typescript
   import { formatSize } from "~/lib/format";
   ```
   The existing call site `formatSize(section.charCount)` is already correct.
3. Verify the shared `formatChars` and `formatSize` implementations in `lib/format.ts` (from Task 3) match the removed local implementations exactly:
   - `formatChars`: `0 → "0"`, `< 1000 → toString()`, `< 100k → "X.Xk"`, `≥ 100k → "Xk"` — matches `context-usage-bar.tsx` exactly.
   - `formatSize`: `0 → "0 chars"`, `< 1000 → "${chars} chars"`, `≥ 1000 → "${x.xk} chars"` — matches `working-sections.tsx` exactly.

**Verification:**

- [ ] No local `formatChars` function in `context-usage-bar.tsx`
- [ ] No local `formatSize` function in `working-sections.tsx`
- [ ] Both components import from `~/lib/format`
- [ ] Output of both formatters is unchanged (same format strings)
- [ ] `bunx --bun tsc --noEmit` passes

### Task 5: Refactor `readMetrics` to use `readJsonSnapshot`

**Goal:** `readMetrics` in `lib/file-watcher.ts` (lines 119-131) reads a JSON file using the same `Bun.file().text()` → `JSON.parse()` → `catch {}` pattern already abstracted by the private `readJsonSnapshot` helper in the same file (lines 45-59). The difference is that `readMetrics` returns a plain parsed object and `readJsonSnapshot` validates with a Zod schema. Introduce a permissive `z.record(z.unknown())` schema and delegate to `readJsonSnapshot`, eliminating the duplicate pattern. Additionally the JSDoc comment should be updated to reflect the implementation.

**Files:**

- `packages/luca-observer/lib/file-watcher.ts` — replace `readMetrics` body with `readJsonSnapshot` call; update JSDoc

**Steps:**

1. Add a file-local schema constant above `readMetrics`:
   ```typescript
   /** Permissive schema for metrics.json — free-form key-value map. */
   const MetricsSchema = z.record(z.unknown());
   ```
   Note: `z` is already imported at the top of the file (via `import type { z, ZodTypeDef } from "zod"` — verify; if only `type` imports exist, change to a value import `import { z } from "zod"` for the schema).
2. Replace the `readMetrics` body:
   ```typescript
   export async function readMetrics(
     projectDir?: string,
   ): Promise<Record<string, unknown>> {
     const result = await readJsonSnapshot(
       "metrics.json",
       MetricsSchema,
       projectDir,
     );
     return result ?? {};
   }
   ```
3. Update the JSDoc for `readMetrics` to reflect delegation to `readJsonSnapshot` and Zod validation:
   ```typescript
   /**
    * Read metrics.json from .planning/.
    *
    * Delegates to readJsonSnapshot with a permissive record schema.
    * Returns an empty object if the file does not exist, contains invalid
    * JSON, or fails schema validation.
    *
    * @param projectDir - The root project directory (defaults to cwd)
    * @returns Parsed metrics JSON or empty object
    */
   ```
4. Verify `z` import: The current import is `import type { z, ZodTypeDef } from "zod"`. The `MetricsSchema` constant requires a value import of `z`. Change the import to:
   ```typescript
   import { z } from "zod";
   import type { ZodTypeDef } from "zod";
   ```
   Or combine: `import { z, type ZodTypeDef } from "zod"` — use whichever matches project convention (check other files in `lib/` that use Zod).

**Verification:**

- [ ] `readMetrics` no longer contains a `try { Bun.file(...).text() } catch {}` block
- [ ] `readMetrics` delegates to `readJsonSnapshot("metrics.json", MetricsSchema, projectDir)`
- [ ] Return type `Promise<Record<string, unknown>>` is preserved
- [ ] `MetricsSchema = z.record(z.unknown())` defined as a file-local constant
- [ ] `z` imported as a value (not just a type) so `z.record()` can be called
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `bun test packages/luca-observer/` passes (no regressions in API route tests)

## Success Criteria

- [ ] `process.cwd()` removed from the POST handler in `app/api/notes/route.ts`; replaced with `resolveProjectDir()`
- [ ] `CONVERGENCE_STATUS_COLORS` exported from `lib/constants.ts`; local `statusColors` removed from both chart components
- [ ] `lib/format.ts` created with `formatDateTime`, `formatTime`, `formatChars`, `formatSize`
- [ ] Local `formatTimestamp` removed from `session-plan-overview.tsx` and `transition-log.tsx`
- [ ] Local `formatChars` removed from `context-usage-bar.tsx`; local `formatSize` removed from `working-sections.tsx`
- [ ] `readMetrics` delegates to `readJsonSnapshot`; duplicate JSON-read pattern eliminated
- [ ] `bunx --bun tsc --noEmit` passes with zero errors
- [ ] No change in visible behavior for any component or API route
