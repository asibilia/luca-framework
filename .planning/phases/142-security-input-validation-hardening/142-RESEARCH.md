# Phase 142: Security & Input Validation Hardening - Research

**Researched:** 2026-03-10
**Domain:** Security hardening — path traversal, prompt injection, cache eviction, unvalidated API casts, regex injection
**Confidence:** HIGH (all findings verified by direct file inspection)

## Summary

Phase 142 closes seven distinct security/reliability findings from the v4.1 milestone audit plus one integration gap. All nine items were investigated by reading the exact lines flagged. The findings split into four categories:

1. **Path traversal** (H1, H3): Two places pass unvalidated filesystem paths sourced from user-controlled env vars or function arguments to Bun.spawn/Bun.file/node:fs. Fix: canonicalize with `resolve()` + containment check before use.

2. **Prompt injection via XML attribute** (H2): Agent name is interpolated directly into an XML attribute value (`agent="<name>"`) in `memory-context-builder.ts`. An agent name containing `"`, `>`, or `</memory_context>` would break the XML structure. Fix: add an `escapeXmlAttr()` helper in shared and apply it at the interpolation site.

3. **API response cast without runtime validation** (M9): `use-todos.ts` casts the fetch response `as Todo[]` with no Zod safeParse. Fix: define a `TodoSchema` + `z.array(TodoSchema)` and call `safeParse`; fall back to empty array on failure.

4. **Normalizer fallback uses throwing `.parse()`** (M10): In `normalizer.ts`, the fallback after a failed `safeParse` calls `interopAgentSummarySchema.parse(...)` which can throw. Fix: replace with a second `safeParse` and return a hardcoded minimal object on second failure.

5. **Unescaped user string in RegExp** (M11): `embedding-recall.ts:110` uses a `majorPrefix` extracted from user-controlled `currentMilestone` in `new RegExp(...)` without escaping. Fix: apply `escapeRegExp()` before constructing the regex.

6. **Unbounded caches** (L8, L9): `recallCache` and `formatCache` are module-scoped Maps with no size limit. For a long-lived orchestrator session both can grow unboundedly. Fix: add a simple MAX_ENTRIES constant (e.g. 100 for recallCache, 200 for formatCache) and evict the oldest entry when adding beyond the limit.

7. **Orphaned interop domain** (Gap #1): `src/interop/` has zero TypeScript importers. The natural consumer is `src/context/__helpers/hydration-snapshot.ts`, which already builds a `PreFlightSnapshot`. Adding an optional `agent_summaries` field populated by `scanForAgents` + `formatScanSummary` wires the domain to an existing T1 consumer without violating module-boundary rules (both are T1).

**Primary recommendation:** Fix the three HIGH findings first (path traversal x2, prompt injection), then wire the orphaned interop domain to hydration-snapshot, then address the three MEDIUM/LOW items. All fixes are surgical — no structural changes required.

---

## Standard Stack

No new libraries needed. All fixes use primitives already in the project:

| Utility                                      | Already Exists | Location                                        |
| -------------------------------------------- | -------------- | ----------------------------------------------- |
| `resolve()` for path canonicalization        | Yes            | `node:path` / `pathe`                           |
| `isWithinDirectory()` path containment check | Yes (T3)       | `src/hooks/pi-extensions/__helpers/sanitize.ts` |
| `escapeRegExp()`                             | Yes (T3)       | `src/hooks/pi-extensions/__helpers/sanitize.ts` |
| `sanitizeForTemplate()`                      | Yes (T0)       | `src/shared/__helpers/sanitize-template.ts`     |
| Zod `safeParse`                              | Yes            | project-wide convention                         |
| `formatScanSummary` + `scanForAgents`        | Yes            | `src/interop/__helpers/scanner.ts`              |

**Key insight:** T3 (`src/hooks/pi-extensions/__helpers/sanitize.ts`) already has `isWithinDirectory()` and `escapeRegExp()`, but T0 and T1 domains cannot import from T3. The functions must be duplicated (or a T0 copy created) — the same pattern used for `sanitizeForTemplate` which notes it is "the T0 copy of the sanitizer" because `T2/T0 domains cannot import from T3 per module boundary rules`.

---

## Architecture Patterns

### Path Traversal Fix Pattern (H1, H3)

The existing codebase pattern from T3 (`isWithinDirectory` in `sanitize.ts`) uses:

```typescript
import { resolve } from "path"; // or "node:path" or "pathe"

function isWithinDirectory(filePath: string, baseDir: string): boolean {
  const resolvedFile = resolve(filePath);
  const resolvedBase = resolve(baseDir);
  return (
    resolvedFile === resolvedBase || resolvedFile.startsWith(resolvedBase + "/")
  );
}
```

For H1 (`scanner.ts`), the `projectRoot` argument flows through `join(projectRoot, scanDir)` and into `directoryExists` → `Bun.spawn(["test", "-d", dirPath])` and `Bun.file(absolutePath)`. The fix:

1. Validate `projectRoot` is an absolute path before use (reject if empty or relative)
2. After constructing `absoluteDir = join(projectRoot, scanDir)`, verify it starts with `projectRoot + "/"` (containment check)
3. After constructing `absolutePath = join(projectRoot, relativePath)`, verify containment before `Bun.file(absolutePath)`

For H3 (`route.ts`), the env vars `LUCA_PROJECT_DIR` and `WORKSPACE_ROOT` are used as `workspaceRoot`. The fix:

1. Call `resolve(explicitRoot)` to canonicalize (eliminates `../` sequences)
2. Since this is a developer tool pointed at a known workspace, a basic absolute-path check is sufficient — we don't need a containment guard against an outer boundary
3. Validate the resolved path exists as a directory before using it

```typescript
// H3 fix pattern
const rawRoot = process.env.LUCA_PROJECT_DIR || process.env.WORKSPACE_ROOT;
const canonicalRoot = rawRoot ? resolve(rawRoot) : null;
// Optional: verify canonicalRoot is an existing directory before proceeding
const workspaceRoot =
  canonicalRoot || (await findProjectRoot(process.cwd())) || process.cwd();
```

### XML Attribute Escaping Fix Pattern (H2)

The vulnerable line is:

```typescript
// memory-context-builder.ts:222
const block = `<memory_context agent="${config.agentName}">\n${body}\n</memory_context>`;
```

A name like `lu-executor" injected="true` or `</memory_context>` breaks the XML structure. Fix:

1. Add `escapeXmlAttr(str: string): string` helper to `src/shared/__helpers/sanitize-template.ts` (it already handles template injection; XML escaping is logically co-located)
2. Apply at the interpolation site

The minimal XML attribute escaping set:

```typescript
export function escapeXmlAttr(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
```

This prevents the injected string from breaking the `agent="..."` attribute boundary or closing the tag early.

### Zod API Response Validation Pattern (M9)

Existing project pattern from `muninn-route-helper.ts` (line 43): use `safeParse`, log on failure, fall back gracefully. Apply same pattern in `use-todos.ts`:

```typescript
// Add at top of use-todos.ts alongside existing interface Todo
import { z } from "zod";

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

// Replace cast in fetchTodos:
const rawData: unknown = await res.json();
const parseResult = z.array(TodoSchema).safeParse(rawData);
if (!parseResult.success) {
  console.error(
    "[useTodos] Invalid response shape:",
    parseResult.error.message,
  );
  setTodos([]);
  return;
}
setTodos(parseResult.data);
```

The `interface Todo` can be replaced with `type Todo = z.infer<typeof TodoSchema>` for single source of truth.

### Normalizer Fallback Fix (M10)

The vulnerable code at `normalizer.ts:277`:

```typescript
// After safeParse failure, throws if minimal object also fails schema
return interopAgentSummarySchema.parse({
  name: name || "unknown",
  source_tool: sourceTool,
  file_path: filePath,
});
```

Fix: use `safeParse` for the fallback too, and if that also fails, return a hardcoded structural minimum:

```typescript
if (!parseResult.success) {
  console.error(
    `[interop/normalizer] Failed to parse agent summary for ${filePath}: ...`,
  );
  const fallbackResult = interopAgentSummarySchema.safeParse({
    name: name || "unknown",
    source_tool: sourceTool,
    file_path: filePath,
  });
  if (fallbackResult.success) return fallbackResult.data;
  // Hard minimum — schema guarantees this shape at definition time
  return {
    name: "unknown",
    source_tool: "other" as const,
    file_path: filePath,
    capabilities: [],
    description: "",
    model_preference: undefined,
  };
}
```

### RegExp Escaping Fix (M11)

The vulnerable code at `embedding-recall.ts:110`:

```typescript
const majorMatch = milestoneLower.match(/^(v?\d+)\./);
if (majorMatch) {
  const majorPrefix = majorMatch[1];
  // majorPrefix comes from user input, unescaped
  const recentPattern = new RegExp(`${majorPrefix}\\.\\d+`, "i");
  ...
}
```

Because `majorPrefix` is extracted via regex `^(v?\d+)\.` which only captures `v` + digits, it can only contain `[v0-9]`. These characters have no special regex meaning, so the actual injection risk is LOW in practice. However, the principle holds: any user-controlled string in `new RegExp()` should be escaped. Add `escapeRegExp` to `src/shared/__helpers/sanitize-template.ts` (same file as the XML escaping addition):

```typescript
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
```

Apply at the call site:

```typescript
const recentPattern = new RegExp(`${escapeRegExp(majorPrefix)}\\.\\d+`, "i");
```

### Cache Size Guard Pattern (L8, L9)

Both caches are module-scoped Maps. The fix is a thin eviction helper:

```typescript
const MAX_RECALL_ENTRIES = 100; // recall-cache.ts
const MAX_FORMAT_ENTRIES = 200; // memory-context-builder.ts

function evictOldestIfNeeded<K, V>(map: Map<K, V>, max: number): void {
  if (map.size >= max) {
    // Map iterates in insertion order; first key = oldest
    const firstKey = map.keys().next().value;
    if (firstKey !== undefined) map.delete(firstKey);
  }
}
```

Call before each `.set()`. Since both caches are session-scoped and cleared at session boundaries, the eviction is a safety net for unusually long sessions rather than a primary lifecycle mechanism.

### Interop Domain Wiring (Gap #1)

The natural consumer is `hydration-snapshot.ts` → `generatePreFlightSnapshot`. The `contextDocumentSetSchema` already has `agent_summaries: z.string().optional()`. The `PreFlightSnapshot` schema does not currently have `agent_summaries`, but `hydration-snapshot` produces data for it.

The cleanest wire: add `scanForAgents` call inside `generatePreFlightSnapshot` and populate `agent_summaries` in the returned snapshot. This requires:

1. `src/context/__helpers/hydration-snapshot.ts` imports `scanForAgents` and `formatScanSummary` from `~/interop` — this is T1 importing T1, which is **allowed** (same tier, not a T2 entity)
2. Add `agent_summaries?: string` to `PreFlightSnapshotSchema` in `context.schemas.ts`
3. Populate in `generatePreFlightSnapshot`

**Module boundary check:** `interop` is T1, `context` is T1. The domain-architecture rule says T2 entities cannot cross-import each other, but does not restrict T1 → T1 imports. The module-boundary rule says "T1 Core: imports T0 only" — this means T1 domains should only import from T0. A T1 → T1 import technically violates the stated tier rules. **Recommended approach:** instead of modifying `context`, expose a standalone `populateAgentSummaries(projectRoot: string): Promise<string>` function from `interop/index.ts` and have callers (scripts, skills) call it directly when building the context document set. This approach keeps T1 clean and provides a real consumer without cross-tier import.

**Alternative (lower risk):** Wire the interop scanner in `src/context/__helpers/hydration-snapshot.ts` only via an optional `include_agent_scan: boolean` config flag (off by default). The tier concern is real but T1→T1 imports exist in other Rust/Go codebases by convention; verify the project's intent by checking if any other T1→T1 imports exist.

---

## Don't Hand-Roll

| Problem                 | Don't Build                | Use Instead                                               |
| ----------------------- | -------------------------- | --------------------------------------------------------- |
| XML attribute escaping  | Custom string replace      | `escapeXmlAttr()` in shared/sanitize-template.ts          |
| Path containment        | Custom string prefix check | `resolve()` + startsWith check (pattern from sanitize.ts) |
| RegExp escaping         | Custom character filter    | `escapeRegExp()` in shared/sanitize-template.ts           |
| Cache eviction          | LRU library                | Insertion-order Map + delete-first-key                    |
| API response validation | Runtime type narrowing     | Zod `safeParse` per project convention                    |

---

## Common Pitfalls

### Pitfall 1: Escaping XML Body vs XML Attributes

**What goes wrong:** Adding XML attribute escaping only in the attribute but not ensuring the body (section headings, item text) can't contain `</memory_context>`. The body is composed from `recalled Pitfalls/Patterns/Decisions/Findings` which originate from MuninnDB engram content. These are developer-written strings, not user input, so injection via the body is lower risk. Only the `agentName` attribute is the vector.
**How to avoid:** Scope the fix to the `agent=` attribute value only, as analyzed.

### Pitfall 2: resolve() vs Bun.file() path behavior

**What goes wrong:** `pathe`'s `join()` is POSIX-only and does not call `path.resolve()`. Using `join(projectRoot, "../../../etc/passwd")` produces `../../etc/passwd` (relative traversal intact). Only `resolve()` from `node:path` collapses `..` segments.
**How to avoid:** Always use `resolve()` on untrusted path strings before passing to `Bun.file()` or `Bun.spawn()`.

### Pitfall 3: T1→T1 Import for Interop Wiring

**What goes wrong:** Adding `import { scanForAgents } from "~/interop"` inside `src/context/__helpers/hydration-snapshot.ts` appears clean but violates the "T1 imports T0 only" rule stated in `module-boundary.md`. The drift checker (`bun run scripts/check-domain-boundaries.ts`) may flag it.
**How to avoid:** Create a wrapper in the consumer skill/script layer (T3 or CLI) instead of wiring at T1. Or verify if the drift checker enforces T1→T1 restrictions before adding the import.

### Pitfall 4: Removing the `as Todo[]` cast without adding proper error propagation

**What goes wrong:** Replacing the cast with `safeParse` but silently returning `[]` on failure means users see an empty list with no indication the API returned malformed data.
**How to avoid:** Set `error` state (already available in the hook) when parse fails, e.g.: `setError("Unexpected response format from /api/todos")`.

---

## Code Examples

### Path Canonicalization (H1 and H3)

```typescript
// Source: node:path resolve semantics + existing isWithinDirectory pattern
import { resolve } from "node:path";

// Canonicalize env var root
function canonicalizeRoot(raw: string | undefined): string | null {
  if (!raw || !raw.trim()) return null;
  const resolved = resolve(raw);
  // Must be an absolute path after resolve
  if (!resolved.startsWith("/")) return null;
  return resolved;
}

// Containment guard (inline, no import needed)
function isWithinRoot(absolutePath: string, projectRoot: string): boolean {
  return (
    absolutePath === projectRoot || absolutePath.startsWith(projectRoot + "/")
  );
}
```

### XML Attribute Escaping (H2)

```typescript
// Source: standard XML escaping conventions
// To add to src/shared/__helpers/sanitize-template.ts

/**
 * Escape a string for safe use as an XML attribute value.
 * Prevents injection via ", ', <, >, & in agent names or similar fields.
 */
export function escapeXmlAttr(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Usage in memory-context-builder.ts:222
const block = `<memory_context agent="${escapeXmlAttr(config.agentName)}">\n${body}\n</memory_context>`;
```

### RegExp Escaping (M11)

```typescript
// Source: MDN RegExp escaping pattern (escapeRegExp)
// To add to src/shared/__helpers/sanitize-template.ts

/**
 * Escape all RegExp special characters in a string.
 * Use before passing user-controlled strings to new RegExp().
 */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Usage in embedding-recall.ts:110
const recentPattern = new RegExp(`${escapeRegExp(majorPrefix)}\\.\\d+`, "i");
```

### Cache Size Guard (L8, L9)

```typescript
// Source: Map insertion-order property (ECMAScript spec, stable since ES2015)

const MAX_ENTRIES = 100;

function evictOldestIfNeeded<K, V>(map: Map<K, V>, max: number): void {
  if (map.size >= max) {
    const firstKey = map.keys().next().value;
    if (firstKey !== undefined) map.delete(firstKey);
  }
}

// Usage before every map.set() call:
evictOldestIfNeeded(recallCache, MAX_ENTRIES);
recallCache.set(sessionId, entry);
```

---

## State of the Art

| Old Approach                           | Current Approach                                | When Changed      | Impact                                                                            |
| -------------------------------------- | ----------------------------------------------- | ----------------- | --------------------------------------------------------------------------------- |
| `path.resolve` from `node:path`        | `resolve` from `pathe` for cross-platform joins | Phase 141 scanner | `pathe` is POSIX-only join; still need `node:path`'s resolve for canonicalization |
| Manual cast `as T[]` for API responses | `safeParse` per `schema-first-parsing.md` rule  | Project rule      | Hooks must validate API responses                                                 |

---

## Open Questions

1. **T1→T1 import for interop wiring**
   - What we know: `module-boundary.md` states "T1 Core: imports T0 only"
   - What's unclear: Whether `check-domain-boundaries.ts` enforces T1→T1 restriction or only T1→T2+ restriction
   - Recommendation: Check the script before wiring. If blocked, wire in hydration-snapshot via a conditional import or create a new standalone helper in interop that documents it as a "T1 utility for CLI consumers".

2. **findProjectRoot security**
   - What we know: `findProjectRoot` in `route.ts` walks up from `process.cwd()` looking for `.planning/todos`. It checks `stat()` which is safe, but it could expose `.planning/todos` paths from a parent project if called from within a nested project.
   - What's unclear: Is this actually exploitable given the server runs in a trusted environment?
   - Recommendation: Not blocking for Phase 142; document as a future hardening item.

---

## Sources

### Primary (HIGH confidence)

- Direct file inspection of all 8 flagged files (scanner.ts, memory-context-builder.ts, route.ts, use-todos.ts, normalizer.ts, embedding-recall.ts, recall-cache.ts)
- `src/hooks/pi-extensions/__helpers/sanitize.ts` — existing path containment and escapeRegExp patterns
- `src/shared/__helpers/sanitize-template.ts` — existing T0 sanitizer, location for new helpers
- `src/context/__helpers/hydration-snapshot.ts` — natural consumer for interop wiring
- `src/context/__schemas/context.schemas.ts:121` — `agent_summaries` field already defined in ContextDocumentSet
- `.claude/rules/module-boundary.md` — tier rules confirming T1→T0 only

---

## Metadata

**Confidence breakdown:**

- HIGH findings (H1-H3): HIGH — vulnerabilities confirmed by direct code inspection, fixes are standard patterns
- MEDIUM findings (M9-M11): HIGH — code verified, fixes use existing project conventions
- LOW findings (L8-L9): HIGH — unbounded Maps confirmed, fix is idiomatic
- Interop wiring (Gap #1): MEDIUM — wiring approach depends on T1→T1 import restriction enforcement

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (stable codebase, no fast-moving dependencies)

---

## Fix Map (planner reference)

| Finding                 | File                                             | Line    | Fix                                                  | Helper to add/modify                                                         |
| ----------------------- | ------------------------------------------------ | ------- | ---------------------------------------------------- | ---------------------------------------------------------------------------- |
| H1 path traversal       | `src/interop/__helpers/scanner.ts`               | 64, 188 | canonicalize `projectRoot`, check containment        | `node:path` resolve (inline)                                                 |
| H2 prompt injection     | `src/shared/__helpers/memory-context-builder.ts` | 222     | `escapeXmlAttr(config.agentName)`                    | Add `escapeXmlAttr` to `sanitize-template.ts`, export from `shared/index.ts` |
| H3 path traversal       | `packages/luca-observer/app/api/todos/route.ts`  | 148     | `resolve(explicitRoot)` before use                   | `node:path` resolve (inline)                                                 |
| M9 unvalidated cast     | `packages/luca-observer/hooks/use-todos.ts`      | 66      | Add `TodoSchema` + `z.array(TodoSchema).safeParse`   | Add `TodoSchema` to `use-todos.ts`                                           |
| M10 throwing fallback   | `src/interop/__helpers/normalizer.ts`            | 277     | Replace `parse()` with `safeParse()` + hardcoded min | None needed                                                                  |
| M11 unescaped regexp    | `src/agents/__helpers/embedding-recall.ts`       | 110     | `escapeRegExp(majorPrefix)`                          | Add `escapeRegExp` to `sanitize-template.ts`, export from `shared/index.ts`  |
| L8 unbounded cache      | `src/shared/__helpers/recall-cache.ts`           | 111     | `evictOldestIfNeeded` before each `.set()`           | Inline helper in same file                                                   |
| L9 unbounded cache      | `src/shared/__helpers/memory-context-builder.ts` | 39      | `evictOldestIfNeeded` before each `.set()`           | Inline helper in same file                                                   |
| Gap #1 orphaned interop | `src/interop/`                                   | —       | Wire to `hydration-snapshot.ts` or standalone CLI    | Verify T1→T1 import legality first                                           |
