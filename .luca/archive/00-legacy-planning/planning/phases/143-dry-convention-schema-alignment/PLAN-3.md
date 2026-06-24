---
phase: 143
plan: 3
type: improvement
autonomous: true
wave: 1
depends_on: []
---

# Phase 143 Plan 3: Convention Sweep — safeParse, Bun Migration, orderBy, Stale EXCEPTIONS

## Objective

Apply convention compliance fixes across 6 files: convert 3 `.parse()` calls to `.safeParse()` at public API boundaries, replace `node:fs` with Bun APIs in 2 files, replace `.sort()` with lodash `orderBy` in 1 file, remove stale EXCEPTIONS in the domain boundary checker, and add a migration-path comment to recall-cache.ts for its dual representation.

> Audit refs: HIGH #4, MEDIUM #1-4, MEDIUM #8, LOW #1

## Context

@src/shared/**helpers/memory-feedback.ts
@src/shared/**helpers/consensus-resolver.ts
@src/shared/**helpers/memory-context-builder.ts
@src/shared/**helpers/recall-cache.ts
@scripts/check-domain-boundaries.ts
@packages/luca-observer/app/api/todos/route.ts

## Tasks

### 1. Convert .parse() to .safeParse() in memory-feedback.ts (2 call sites)

**Type:** auto
**TDD:** false
**Depends on:** none

In `src/shared/__helpers/memory-feedback.ts`, two public API functions use `.parse()` which can throw on invalid input. Convert to `.safeParse()` with graceful error handling.

**Call site 1 — `determineFeedback()` line 151:**

```typescript
// BEFORE (line 151):
const config = DetermineFeedbackConfigSchema.parse(rawConfig);

// AFTER:
const parseResult = DetermineFeedbackConfigSchema.safeParse(rawConfig);
if (!parseResult.success) {
  console.error(
    "[MEMORY] determineFeedback: invalid config:",
    parseResult.error.message,
  );
  return [];
}
const config = parseResult.data;
```

**Call site 2 — `computeMemoryPhaseMetrics()` line 216:**

```typescript
// BEFORE (line 216):
const config = ComputeMetricsConfigSchema.parse(rawConfig);

// AFTER:
const parseResult = ComputeMetricsConfigSchema.safeParse(rawConfig);
if (!parseResult.success) {
  console.error(
    "[MEMORY] computeMemoryPhaseMetrics: invalid config:",
    parseResult.error.message,
  );
  return MemoryPhaseMetricsSchema.parse({
    phase: 0,
    milestone: "",
    total_recalled: 0,
    total_applied: 0,
    total_ignored: 0,
    recall_precision: 0,
    hit_rate: 0,
    memory_tokens_injected: 0,
    stale_engram_pct: 0,
    confidence_calibration: 0,
    computed_at: new Date().toISOString(),
  });
}
const config = parseResult.data;
```

**Files to create/edit:**

- `src/shared/__helpers/memory-feedback.ts`

**Verification:**

- Both functions return graceful defaults on invalid input instead of throwing
- `bunx --bun tsc --noEmit` passes

### 2. Convert .parse() to .safeParse() in consensus-resolver.ts (1 call site)

**Type:** auto
**TDD:** false
**Depends on:** none

In `src/shared/__helpers/consensus-resolver.ts`, `resolveConsensus()` line 82 uses `.parse()` at a public API boundary.

```typescript
// BEFORE (line 82):
const config = ConsensusConfigSchema.parse(rawConfig ?? {}) as ConsensusConfig;

// AFTER:
const parseResult = ConsensusConfigSchema.safeParse(rawConfig ?? {});
if (!parseResult.success) {
  console.error(
    "[CONSENSUS] resolveConsensus: invalid config:",
    parseResult.error.message,
  );
  // Fall back to default config
  const config = ConsensusConfigSchema.parse({}) as ConsensusConfig;
  // Use default config (continues below)
}
const config = (
  parseResult.success ? parseResult.data : ConsensusConfigSchema.parse({})
) as ConsensusConfig;
```

Note: The implementation should be clean — use a single variable assignment pattern:

```typescript
const parseResult = ConsensusConfigSchema.safeParse(rawConfig ?? {});
if (!parseResult.success) {
  console.error(
    "[CONSENSUS] resolveConsensus: invalid config:",
    parseResult.error.message,
  );
}
const config = (
  parseResult.success ? parseResult.data : ConsensusConfigSchema.parse({})
) as ConsensusConfig;
```

**Files to create/edit:**

- `src/shared/__helpers/consensus-resolver.ts`

**Verification:**

- `resolveConsensus()` does not throw on invalid config, falls back to defaults
- `bunx --bun tsc --noEmit` passes

### 3. Replace .sort() with lodash orderBy in memory-context-builder.ts

**Type:** auto
**TDD:** false
**Depends on:** none

In `src/shared/__helpers/memory-context-builder.ts`, line 115 uses the built-in `.sort()` method which mutates the array:

```typescript
// BEFORE (line 115):
.sort((a, b) => b.priority - a.priority);

// The full expression (lines 113-115):
const sorted = [...sections]
  .filter((s) => s.items.length > 0)
  .sort((a, b) => b.priority - a.priority);

// AFTER:
const sorted = orderBy(
  sections.filter((s) => s.items.length > 0),
  (s) => s.priority,
  "desc",
);
```

Also add the lodash import at the top of the file (after the existing imports, before the schema section):

```typescript
import orderBy from "lodash/orderBy";
```

The spread `[...sections]` is no longer needed since `orderBy` returns a new array.

**Files to create/edit:**

- `src/shared/__helpers/memory-context-builder.ts`

**Verification:**

- No `.sort()` calls remain in the file
- `orderBy` import is present
- `bunx --bun tsc --noEmit` passes

### 4. Remove stale EXCEPTIONS in check-domain-boundaries.ts

**Type:** auto
**TDD:** false
**Depends on:** none

In `scripts/check-domain-boundaries.ts`, the EXCEPTIONS array (lines 46-62) contains 3 exceptions for shared->agents, shared->skills, shared->rules that were resolved in Phase 13. Per the module-boundary rule: "There are currently no known cross-tier import exceptions."

```typescript
// BEFORE (lines 46-62):
const EXCEPTIONS: Array<{ source: string; target: string; reason: string }> = [
  {
    source: "shared",
    target: "agents",
    reason: "validation-utils references agent schemas",
  },
  {
    source: "shared",
    target: "skills",
    reason: "validation-utils references skill schemas",
  },
  {
    source: "shared",
    target: "rules",
    reason: "validation-utils references rule schemas",
  },
];

// AFTER:
const EXCEPTIONS: Array<{ source: string; target: string; reason: string }> =
  [];
```

Keep the `EXCEPTIONS` type and `isException()` function intact (the infrastructure is useful if future exceptions arise). Just empty the array.

**Files to create/edit:**

- `scripts/check-domain-boundaries.ts`

**Verification:**

- EXCEPTIONS array is empty
- `isException()` function still exists
- `bun run scripts/check-domain-boundaries.ts` still runs (exits 0 if no violations, or reports real violations if any exist)
- `bunx --bun tsc --noEmit` passes

### 5. Migrate node:fs to Bun APIs in check-domain-boundaries.ts

**Type:** auto
**TDD:** false
**Depends on:** 4

In `scripts/check-domain-boundaries.ts`:

**Import change (line 17):**

```typescript
// BEFORE:
import { readFileSync } from "node:fs";

// AFTER: Remove this import entirely. Bun.file().text() replaces readFileSync.
```

**Usage change (line 179):**

```typescript
// BEFORE:
const content = readFileSync(fullPath, "utf-8");

// AFTER:
const content = await Bun.file(fullPath).text();
```

Note: The `main()` function is already `async` and the loop already uses `for await`, so the `await` on `Bun.file().text()` is compatible.

**Files to create/edit:**

- `scripts/check-domain-boundaries.ts`

**Verification:**

- No `node:fs` imports remain in the file (`node:path` is acceptable — Bun does not have a path replacement)
- `bun run scripts/check-domain-boundaries.ts` runs successfully
- `bunx --bun tsc --noEmit` passes

### 6. Migrate node:fs to Bun APIs in todos/route.ts

**Type:** auto
**TDD:** false
**Depends on:** none

In `packages/luca-observer/app/api/todos/route.ts`:

**Import change (line 2):**

```typescript
// BEFORE:
import { readdir, stat } from "node:fs/promises";

// AFTER: Remove this import entirely.
```

**Change 1 — `findProjectRoot()` stat check (line 73):**

```typescript
// BEFORE:
const s = await stat(todosDir);
if (s.isDirectory()) return current;

// AFTER:
const exists = await Bun.file(join(todosDir, ".")).exists();
// Better approach: use Glob to check directory existence
if (await Bun.file(todosDir).exists()) return current;
```

Actually, the most reliable Bun-native approach for directory existence is to try reading it. Since `Bun.file()` works on files not directories, use a simple try/catch with `Bun.file(join(todosDir, "dummy")).exists()` or better, keep the pattern simple:

```typescript
// Use a readdir-equivalent check. Since the readdir in readTodosFromDir
// also needs migration, use Glob.scan for both:
const glob = new Glob("*.md");
const entries = [];
for await (const entry of glob.scan({ cwd: todosDir })) {
  entries.push(entry);
  break; // Just need to know if directory exists and has files
}
if (entries.length > 0 || /* directory exists */) return current;
```

Simpler approach: Import `Glob` from `"bun"` and use it for directory scanning. For `findProjectRoot`, check directory existence with a try/catch around `Glob.scan`:

```typescript
async function findProjectRoot(startDir: string): Promise<string | null> {
  let current = resolve(startDir);
  const root = resolve("/");
  while (current !== root) {
    try {
      const todosDir = join(current, ".planning", "todos");
      // Check directory existence by attempting to scan it
      const glob = new Glob("*");
      for await (const _ of glob.scan({ cwd: todosDir })) {
        return current; // Directory exists and is scannable
      }
      // Empty directory also counts
      return current;
    } catch {
      /* not found at this level, keep walking up */
    }
    current = resolve(current, "..");
  }
  return null;
}
```

**Change 2 — `readTodosFromDir()` readdir (line 98):**

```typescript
// BEFORE:
const files = await readdir(dirPath);
const mdFiles = files.filter((f) => f.endsWith(".md"));

// AFTER: Use Glob.scan for directory listing
const glob = new Glob("*.md");
const mdFiles: string[] = [];
for await (const file of glob.scan({ cwd: dirPath })) {
  mdFiles.push(file);
}
```

Also add the Glob import at the top:

```typescript
import { Glob } from "bun";
```

**Files to create/edit:**

- `packages/luca-observer/app/api/todos/route.ts`

**Verification:**

- No `node:fs` or `node:fs/promises` imports remain
- `Glob` import from `"bun"` is present
- Directory scanning uses `Glob.scan()` instead of `readdir`
- `bunx --bun tsc --noEmit` passes (for the observer package)

### 7. Add migration-path comment to recall-cache.ts for dual representation

**Type:** auto
**TDD:** false
**Depends on:** none

In `src/shared/__helpers/recall-cache.ts`, the `RecallCacheEntrySchema` (lines 83-98) maintains dual representation: string arrays (patterns, decisions, pitfalls, findings) alongside structured `recalledEngrams`. The JSDoc already mentions backward compatibility (lines 59-61), but there is no explicit migration path comment.

Add a NOTE comment inside the schema definition or above it indicating the consolidation plan:

```typescript
/**
 * ...existing JSDoc...
 *
 * NOTE: The string arrays (patterns, decisions, pitfalls, findings) and the
 * structured recalledEngrams array are a dual representation for backward
 * compatibility. Once all consumers of buildMemoryContextBlock() migrate to
 * use recalledEngrams directly, the string arrays can be removed. Track
 * consolidation in the next gap-closure phase.
 */
```

**Files to create/edit:**

- `src/shared/__helpers/recall-cache.ts`

**Verification:**

- Migration-path NOTE comment is present in the RecallCacheEntrySchema JSDoc
- No code changes (documentation only)
- `bunx --bun tsc --noEmit` passes

## Verification

1. TypeScript compilation: `bunx --bun tsc --noEmit` passes for entire project
2. No `.parse()` calls at public API boundaries in memory-feedback.ts or consensus-resolver.ts (all converted to `.safeParse()`)
3. No `.sort()` calls in memory-context-builder.ts (replaced with `orderBy`)
4. No stale EXCEPTIONS in check-domain-boundaries.ts (array is empty)
5. No `node:fs` imports in check-domain-boundaries.ts or todos/route.ts
6. Migration-path comment present in recall-cache.ts
7. `bun run scripts/check-domain-boundaries.ts` runs clean (no false violations from stale exceptions)

## Success Criteria

- All 7 convention findings from the audit are resolved
- No runtime behavior changes (safeParse returns same data on valid input; orderBy produces same sort order; Bun APIs read same files)
- Codebase convention compliance improved across .parse/.safeParse, lodash/sort, Bun/node:fs dimensions

## Output Specification

- Modified: `src/shared/__helpers/memory-feedback.ts` (2x .parse -> .safeParse)
- Modified: `src/shared/__helpers/consensus-resolver.ts` (1x .parse -> .safeParse)
- Modified: `src/shared/__helpers/memory-context-builder.ts` (.sort -> orderBy)
- Modified: `src/shared/__helpers/recall-cache.ts` (migration-path comment)
- Modified: `scripts/check-domain-boundaries.ts` (empty EXCEPTIONS, node:fs -> Bun)
- Modified: `packages/luca-observer/app/api/todos/route.ts` (node:fs -> Bun Glob)
