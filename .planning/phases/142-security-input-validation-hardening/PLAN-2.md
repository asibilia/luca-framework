---
phase: 142
plan: 2
type: improvement
autonomous: true
wave: 2
depends_on: [1]
---

# Phase 142 Plan 2: Apply Security Fixes Across 8 Files

## Objective

Apply all nine security and reliability fixes identified in the milestone audit (H1-H3, M9-M11, L8-L9) to their respective files. This plan depends on Plan 1 (Wave 1) which provides the shared `escapeXmlAttr` and `escapeRegExp` helpers.

> Appetite: Medium (100000 tokens remaining of 100000 ceiling)

## Context

@142-RESEARCH.md — full fix map with line numbers and patterns
@src/interop/**helpers/scanner.ts — H1 path traversal (lines 64, 170, 188)
@src/shared/**helpers/memory-context-builder.ts — H2 prompt injection (line 222), L9 unbounded cache (line 39)
@packages/luca-observer/app/api/todos/route.ts — H3 path traversal (line 148)
@packages/luca-observer/hooks/use-todos.ts — M9 unvalidated cast (line 66)
@src/interop/**helpers/normalizer.ts — M10 throwing fallback (line 277)
@src/agents/**helpers/embedding-recall.ts — M11 unescaped regexp (line 110)
@src/shared/\_\_helpers/recall-cache.ts — L8 unbounded cache (line 111)

## Tasks

### 1. H1: Path traversal guard in interop scanner

**Type:** auto
**TDD:** false
**Depends on:** none

Fix path traversal vulnerability in `src/interop/__helpers/scanner.ts`. The `projectRoot` argument flows into `join()` and then to `Bun.spawn` and `Bun.file` without canonicalization or containment checks.

Changes to make in `scanForAgents()`:

1. Add `import { resolve } from "node:path";` at the top of the file (alongside existing `import { join } from "pathe"`)
2. At the start of `scanForAgents()`, canonicalize and validate `projectRoot`:
   ```typescript
   const canonicalRoot = resolve(projectRoot);
   if (!canonicalRoot.startsWith("/")) {
     // Non-absolute path after resolve -- reject
     return interopScanResultSchema.parse({
       agents: [],
       scan_paths: [],
       scan_duration_ms: 0,
       tool_counts: {},
     });
   }
   ```
3. After `const absoluteDir = join(projectRoot, scanDir)` on line ~170, add a containment check:
   ```typescript
   const resolvedDir = resolve(absoluteDir);
   if (
     resolvedDir !== canonicalRoot &&
     !resolvedDir.startsWith(canonicalRoot + "/")
   )
     continue;
   ```
4. After `const absolutePath = join(projectRoot, relativePath)` on line ~188, add:
   ```typescript
   const resolvedPath = resolve(absolutePath);
   if (!resolvedPath.startsWith(canonicalRoot + "/")) continue;
   ```
5. Use `canonicalRoot` instead of `projectRoot` throughout the function body (replace in `join()` calls)

**Files to create/edit:**

- `src/interop/__helpers/scanner.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- All `join()` calls now use the canonicalized root
- Every path passed to `Bun.spawn` or `Bun.file` has a containment check

### 2. H2: XML attribute escaping in memory-context-builder

**Type:** auto
**TDD:** false
**Depends on:** Plan 1 Task 3 (shared barrel exports)

Fix prompt injection via `agentName` in `src/shared/__helpers/memory-context-builder.ts` line 222.

Changes:

1. Add import: `import { escapeXmlAttr } from "./sanitize-template";`
2. On line 222, change:
   ```typescript
   // Before:
   const block = `<memory_context agent="${config.agentName}">\n${body}\n</memory_context>`;
   // After:
   const block = `<memory_context agent="${escapeXmlAttr(config.agentName)}">\n${body}\n</memory_context>`;
   ```

**Files to create/edit:**

- `src/shared/__helpers/memory-context-builder.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- The `agentName` interpolation site uses `escapeXmlAttr()`

### 3. H3: Path canonicalization in observer todos route

**Type:** auto
**TDD:** false
**Depends on:** none

Fix path traversal via env vars in `packages/luca-observer/app/api/todos/route.ts` line 148.

Changes:

1. **Skip import step** — `resolve` is already imported at line 3: `import { join, resolve } from "node:path"`.
2. Replace lines 147-150:

   ```typescript
   // Before:
   const explicitRoot =
     process.env.LUCA_PROJECT_DIR || process.env.WORKSPACE_ROOT;
   const workspaceRoot =
     explicitRoot || (await findProjectRoot(process.cwd())) || process.cwd();

   // After:
   const rawRoot = process.env.LUCA_PROJECT_DIR || process.env.WORKSPACE_ROOT;
   const explicitRoot = rawRoot ? resolve(rawRoot) : null;
   const workspaceRoot =
     explicitRoot || (await findProjectRoot(process.cwd())) || process.cwd();
   ```

The `resolve()` call canonicalizes the env var value, collapsing `../` sequences and producing an absolute path. Since this is a developer tool pointed at a known workspace, a containment guard against an outer boundary is not needed -- just canonicalization.

**Files to create/edit:**

- `packages/luca-observer/app/api/todos/route.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- The env var value is resolved before use

### 4. M9: Zod safeParse for API response in use-todos hook

**Type:** auto
**TDD:** false
**Depends on:** none

Replace the unsafe `as Todo[]` cast in `packages/luca-observer/hooks/use-todos.ts` line 66 with Zod safeParse validation.

Changes:

1. Add `import { z } from "zod";` at the top
2. Add a `TodoSchema` Zod object after the imports section (before the `useTodos` function):
   ```typescript
   const TodoSchema = z.object({
     filename: z.string(),
     title: z.string(),
     area: z.string(),
     created: z.string(),
     source: z.string(),
     tier: z.number(),
     complexity: z.string(),
     priority: z.string(),
     milestone: z.string(),
     state: z.enum(["pending", "done", "completed"]),
   });
   ```
3. Replace the `interface Todo` with `type Todo = z.infer<typeof TodoSchema>` for single source of truth
4. Replace line 66:

   ```typescript
   // Before:
   const data: Todo[] = await res.json();
   setTodos(data);

   // After:
   const rawData: unknown = await res.json();
   const parseResult = z.array(TodoSchema).safeParse(rawData);
   if (!parseResult.success) {
     setError("Unexpected response format from /api/todos");
     console.error(
       "[useTodos] Invalid response shape:",
       parseResult.error.message,
     );
     setTodos([]);
     return;
   }
   setTodos(parseResult.data);
   ```

Note: Keep the `export` on the `Todo` type since it is used by consumer components.

**Files to create/edit:**

- `packages/luca-observer/hooks/use-todos.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- No `as Todo[]` cast remains in the file
- Error state is set on parse failure (not silently swallowed)

### 5. M10: Non-throwing fallback in interop normalizer

**Type:** auto
**TDD:** false
**Depends on:** none

Replace the throwing `.parse()` fallback in `src/interop/__helpers/normalizer.ts` line 277 with `safeParse()` and a hardcoded structural minimum.

Changes to the block starting at line 272 (inside `normalizeAgent`):

```typescript
// Before:
if (!parseResult.success) {
  console.error(
    `[interop/normalizer] Failed to parse agent summary for ${filePath}: ${parseResult.error.message}`,
  );
  // Return a minimal valid summary
  return interopAgentSummarySchema.parse({
    name: name || "unknown",
    source_tool: sourceTool,
    file_path: filePath,
  });
}

// After:
if (!parseResult.success) {
  console.error(
    `[interop/normalizer] Failed to parse agent summary for ${filePath}: ${parseResult.error.message}`,
  );
  // Attempt minimal fallback with safeParse (non-throwing)
  const fallbackResult = interopAgentSummarySchema.safeParse({
    name: name || "unknown",
    source_tool: sourceTool,
    file_path: filePath,
  });
  if (fallbackResult.success) return fallbackResult.data;
  // Hard minimum -- matches schema shape at definition time
  return {
    name: "unknown",
    source_tool: sourceTool,
    file_path: filePath,
    capabilities: [],
    description: "",
    model_preference: undefined,
  };
}
```

**Files to create/edit:**

- `src/interop/__helpers/normalizer.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- No `.parse()` calls remain after `safeParse` failure branches
- The hardcoded return matches `InteropAgentSummary` shape

### 6. M11: RegExp escaping in embedding-recall

**Type:** auto
**TDD:** false
**Depends on:** Plan 1 Task 3 (shared barrel exports)

Escape `majorPrefix` before use in `new RegExp()` in `src/agents/__helpers/embedding-recall.ts` line 110.

Changes:

1. Add import: `import { escapeRegExp } from "~/shared";` (or `from "~/shared/__helpers/sanitize-template"`)
2. On line 110, change:
   ```typescript
   // Before:
   const recentPattern = new RegExp(`${majorPrefix}\\.\\d+`, "i");
   // After:
   const recentPattern = new RegExp(`${escapeRegExp(majorPrefix)}\\.\\d+`, "i");
   ```

Prefer the barrel import `from "~/shared"` unless there is already a direct import from sanitize-template in this file.

**Files to create/edit:**

- `src/agents/__helpers/embedding-recall.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `majorPrefix` is escaped before regex construction
- `bun run scripts/check-domain-boundaries.ts` passes (T2 importing T0 is valid)

### 7. L8: Cache size guard in recall-cache

**Type:** auto
**TDD:** false
**Depends on:** none

Add a maximum entry limit and eviction helper to `src/shared/__helpers/recall-cache.ts`.

Changes:

1. Add a `MAX_RECALL_ENTRIES` constant (value: 100) after the cache schemas section
2. Add an inline `evictOldestIfNeeded` helper:

   ```typescript
   const MAX_RECALL_ENTRIES = 100;

   /**
    * Evict the oldest entry from a Map if it has reached the maximum size.
    * Maps iterate in insertion order, so the first key is the oldest.
    */
   function evictOldestIfNeeded<K, V>(map: Map<K, V>, max: number): void {
     if (map.size >= max) {
       const firstKey = map.keys().next().value;
       if (firstKey !== undefined) map.delete(firstKey);
     }
   }
   ```

3. In `setCachedRecall()`, add `evictOldestIfNeeded(recallCache, MAX_RECALL_ENTRIES);` before the `recallCache.set()` call

**Files to create/edit:**

- `src/shared/__helpers/recall-cache.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `MAX_RECALL_ENTRIES` constant exists
- Every `.set()` call on `recallCache` is preceded by an eviction check

### 8. L9: Cache size guard in memory-context-builder

**Type:** auto
**TDD:** false
**Depends on:** none

Add a maximum entry limit and eviction helper to `src/shared/__helpers/memory-context-builder.ts`.

Changes:

1. Add a `MAX_FORMAT_ENTRIES` constant (value: 200) near the `formatCache` declaration (line ~39)
2. Add the same `evictOldestIfNeeded` inline helper (same pattern as Task 7)
3. Add `evictOldestIfNeeded(formatCache, MAX_FORMAT_ENTRIES);` before every `formatCache.set()` call in `buildMemoryContextBlock()` (there are three `.set()` calls: lines ~210, ~217, ~224)

**Files to create/edit:**

- `src/shared/__helpers/memory-context-builder.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `MAX_FORMAT_ENTRIES` constant exists
- Every `.set()` call on `formatCache` is preceded by an eviction check

## Verification

1. `bunx --bun tsc --noEmit` — all modified files type-check cleanly
2. `bun run scripts/check-domain-boundaries.ts` — no new tier violations
3. Grep for remaining vulnerabilities:
   - No `as Todo[]` cast in use-todos.ts
   - No bare `.parse()` after `safeParse` failure in normalizer.ts
   - No unescaped `config.agentName` in XML attribute in memory-context-builder.ts
   - No unescaped `majorPrefix` in `new RegExp()` in embedding-recall.ts
   - All `Bun.spawn`/`Bun.file` calls in scanner.ts use canonicalized, containment-checked paths

## Success Criteria

- All 3 HIGH findings (H1, H2, H3) are resolved
- All 3 MEDIUM findings (M9, M10, M11) are resolved
- All 2 LOW findings (L8, L9) are resolved
- No regressions in type checking or domain boundary compliance
- 8 files modified with surgical, focused changes

## Output Specification

- Modified: `src/interop/__helpers/scanner.ts` (path canonicalization + containment)
- Modified: `src/shared/__helpers/memory-context-builder.ts` (XML escaping + cache guard)
- Modified: `packages/luca-observer/app/api/todos/route.ts` (path canonicalization)
- Modified: `packages/luca-observer/hooks/use-todos.ts` (Zod safeParse)
- Modified: `src/interop/__helpers/normalizer.ts` (non-throwing fallback)
- Modified: `src/agents/__helpers/embedding-recall.ts` (RegExp escaping)
- Modified: `src/shared/__helpers/recall-cache.ts` (cache size guard)
