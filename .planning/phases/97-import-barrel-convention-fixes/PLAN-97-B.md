---
id: PLAN-97-B
title: "Convention Alignment: Lodash, SafeParse, Sanitization, Node Prefix"
phase: 97
wave: 1
depends_on: []
---

# PLAN-97-B: Convention Alignment Fixes

## Objective

Fix 7 convention violations from the v2.6.1 milestone audit: 1 lodash preference, 2 safeParse migrations, 2 unsanitized prompt interpolations, 2 bare Node.js module imports, and 2 sanitize-template hardening gaps.

Source: `.planning/v2.6.1-MILESTONE-AUDIT.md` — 5 MEDIUM issues, 2 LOW issues.

## Context

@file src/shared/\_\_helpers/tribunal-consensus.ts — Line 106 uses native `.sort()` instead of lodash `orderBy` per lodash-preference rule.

@file src/context/\_\_helpers/hydration-snapshot.ts — Lines 308 and 372 use `.parse()` instead of `.safeParse()` per schema-first-parsing rule.

@file src/shared/\_\_helpers/tribunal-rebuttals.ts — Lines 121-122 interpolate `defendedFinding.file` and `defendedFinding.source_agent` / `challengerFinding.source_agent` into prompt templates without `sanitizeForTemplate()`. These are reviewer-agent-produced strings that should be sanitized.

@file src/skills/\_\_helpers/milestone-debate.ts — Lines 153-154 interpolate `milestoneVersion` into prompt templates without `sanitizeForTemplate()`.

@file src/shared/\_\_helpers/tribunal-detector.ts — Line 1 uses bare `"crypto"` import instead of `"node:crypto"`.

@file src/iteration/\_\_helpers/convergence.ts — Line 1 uses bare `"crypto"` import instead of `"node:crypto"`.

@file src/shared/\_\_helpers/sanitize-template.ts — Two hardening gaps: (1) `${` removal leaves trailing `}` in output, (2) no defense against Unicode bidi control characters (U+202A-202E, U+2066-2069).

## Tasks

### Task 1: Replace `.sort()` with lodash `orderBy` in tribunal-consensus.ts

**Goal:** Follow lodash-preference convention. Native `.sort()` mutates in place and is less explicit than `orderBy`.

**File:** `src/shared/__helpers/tribunal-consensus.ts`

**Current (lines 106-108):**

```typescript
const sorted = [...perspectives].sort((a, b) => b.confidence - a.confidence);
```

**Target:**

```typescript
const sorted = orderBy([...perspectives], (p) => p.confidence, "desc");
```

Also add the lodash import at the top of the file (after the module JSDoc comment, before existing code):

```typescript
import orderBy from "lodash/orderBy";
```

**Verification:** `grep -n "\.sort(" src/shared/__helpers/tribunal-consensus.ts` returns no matches. `grep -n "orderBy" src/shared/__helpers/tribunal-consensus.ts` returns the import and usage.

### Task 2: Convert `.parse()` to `.safeParse()` in hydration-snapshot.ts (complexityToHydrationConfig)

**Goal:** Follow schema-first-parsing rule. `.parse()` throws on invalid data; `.safeParse()` returns a result object.

**File:** `src/context/__helpers/hydration-snapshot.ts`

**Current (lines 303-337) — `complexityToHydrationConfig` function:**
Uses `hydrationConfigSchema.parse(...)` in each switch case (4 occurrences at lines 308, 315, 322, 330).

**Target:** Replace with safeParse pattern. Return a fallback on failure:

```typescript
export function complexityToHydrationConfig(
  complexity: ComplexityLevel,
): HydrationConfig {
  let raw: Record<string, unknown>;

  switch (complexity) {
    case "TRIVIAL":
      raw = {
        file_tree_depth: 2,
        include_tests: false,
        git_history_count: 5,
        include_imports: false,
      };
      break;
    case "SIMPLE":
      raw = {
        file_tree_depth: 2,
        include_tests: true,
        git_history_count: 5,
        include_imports: false,
      };
      break;
    case "MODERATE":
      raw = {
        file_tree_depth: 3,
        include_tests: true,
        git_history_count: 10,
        include_imports: true,
      };
      break;
    case "COMPLEX":
    case "CRITICAL":
      raw = {
        file_tree_depth: 4,
        include_tests: true,
        git_history_count: 15,
        include_imports: true,
      };
      break;
  }

  const result = hydrationConfigSchema.safeParse(raw);
  if (!result.success) {
    console.error(
      `[hydration-snapshot] Invalid hydration config for ${complexity}: ${result.error.message}`,
    );
    // Fallback to MODERATE defaults
    return hydrationConfigSchema.parse({
      file_tree_depth: 3,
      include_tests: true,
      git_history_count: 10,
      include_imports: true,
    });
  }
  return result.data;
}
```

**Verification:** The function body uses `safeParse` as primary path. `grep -n "\.parse(" src/context/__helpers/hydration-snapshot.ts` should show only the fallback `.parse()` call and the one in `generatePreFlightSnapshot` (Task 3 handles that one).

### Task 3: Convert `.parse()` to `.safeParse()` in hydration-snapshot.ts (generatePreFlightSnapshot)

**Goal:** Follow schema-first-parsing rule for the orchestrator function.

**File:** `src/context/__helpers/hydration-snapshot.ts`

**Current (lines 372-378):**

```typescript
return preFlightSnapshotSchema.parse({
  file_tree: fileTree,
  test_files: testFiles,
  git_history: gitHistory,
  import_graph: importGraph,
  created_at: new Date().toISOString(),
});
```

**Target:**

```typescript
const result = preFlightSnapshotSchema.safeParse({
  file_tree: fileTree,
  test_files: testFiles,
  git_history: gitHistory,
  import_graph: importGraph,
  created_at: new Date().toISOString(),
});

if (!result.success) {
  console.error(
    `[hydration-snapshot] Failed to parse pre-flight snapshot: ${result.error.message}`,
  );
  // Return minimal valid snapshot
  return {
    file_tree: fileTree,
    test_files: testFiles,
    git_history: gitHistory,
    import_graph: importGraph,
    created_at: new Date().toISOString(),
  } as PreFlightSnapshot;
}

return result.data;
```

**Verification:** `grep -n "\.parse(" src/context/__helpers/hydration-snapshot.ts` should return only the single fallback `.parse()` in the `complexityToHydrationConfig` error path.

### Task 4: Sanitize `source_agent` and `file` in tribunal-rebuttals.ts prompt interpolation

**Goal:** Apply `sanitizeForTemplate()` to all AI-generated fields before prompt interpolation.

**File:** `src/shared/__helpers/tribunal-rebuttals.ts`

**Current `buildChallengerPrompt` (lines 119-139):**
Lines 121-122 interpolate `defendedFinding.file` and `defendedFinding.source_agent` unsanitized:

```typescript
**File:** ${defendedFinding.file}:${defendedFinding.line}
**Original Finding (${defendedFinding.source_agent}):**
```

Line 127 interpolates `challengerFinding.source_agent` unsanitized:

```typescript
**Your Assessment (${challengerFinding.source_agent}):**
```

**Target:** Wrap with `sanitizeForTemplate()`:

```typescript
**File:** ${sanitizeForTemplate(defendedFinding.file)}:${defendedFinding.line}
**Original Finding (${sanitizeForTemplate(defendedFinding.source_agent)}):**
```

```typescript
**Your Assessment (${sanitizeForTemplate(challengerFinding.source_agent)}):**
```

**Also apply to `buildDefenderPrompt` (lines 145-172):**
Line 152-153 — same pattern for `defendedFinding.source_agent`, `defendedFinding.file`:

```typescript
**Your Finding (${sanitizeForTemplate(defendedFinding.source_agent)}):**
- File: ${sanitizeForTemplate(defendedFinding.file)}:${defendedFinding.line}
```

Line 158 — `challengerFinding.source_agent`:

```typescript
**Challenger (${sanitizeForTemplate(challengerFinding.source_agent)}) Assessment:**
```

**Verification:** `grep -n "source_agent\|\.file}" src/shared/__helpers/tribunal-rebuttals.ts` should show all interpolations wrapped in `sanitizeForTemplate()`.

### Task 5: Sanitize `milestoneVersion` in milestone-debate.ts prompt interpolation

**Goal:** Apply `sanitizeForTemplate()` to `milestoneVersion` before prompt interpolation.

**File:** `src/skills/__helpers/milestone-debate.ts`

**Current (lines 151-154):**

```typescript
return basePairs.map((pair) => ({
  ...pair,
  challenger_prompt: `[Milestone ${milestoneVersion} Audit Context]\n\n...${pair.challenger_prompt}`,
  defender_prompt: `[Milestone ${milestoneVersion} Audit Context]\n\n...${pair.defender_prompt}`,
}));
```

**Target:**

```typescript
const safeMilestoneVersion = sanitizeForTemplate(milestoneVersion);

return basePairs.map((pair) => ({
  ...pair,
  challenger_prompt: `[Milestone ${safeMilestoneVersion} Audit Context]\n\n...${pair.challenger_prompt}`,
  defender_prompt: `[Milestone ${safeMilestoneVersion} Audit Context]\n\n...${pair.defender_prompt}`,
}));
```

Also add import at top of file:

```typescript
import { sanitizeForTemplate } from "~/shared/__helpers/sanitize-template";
```

**Verification:** `grep -n "milestoneVersion" src/skills/__helpers/milestone-debate.ts` shows the variable is sanitized before interpolation. `grep -n "sanitizeForTemplate" src/skills/__helpers/milestone-debate.ts` returns the import and usage.

### Task 6: Fix bare `"crypto"` imports to `"node:crypto"`

**Goal:** Use Node.js module prefix per convention. Bare specifiers are deprecated in favor of `"node:"` prefix.

**File 1:** `src/shared/__helpers/tribunal-detector.ts`

**Current (line 1):**

```typescript
import { createHash } from "crypto";
```

**Target:**

```typescript
import { createHash } from "node:crypto";
```

**File 2:** `src/iteration/__helpers/convergence.ts`

**Current (line 1):**

```typescript
import { createHash } from "crypto";
```

**Target:**

```typescript
import { createHash } from "node:crypto";
```

**Verification:** `grep -rn 'from "crypto"' src/` returns no matches. `grep -rn 'from "node:crypto"' src/` returns matches for both files.

### Task 7: Harden sanitizeForTemplate — fix trailing `}` and add bidi defense

**Goal:** Fix two sanitization gaps: (1) `${` removal via `.replace(/\$\{/g, "")` leaves orphaned `}` in output, (2) no defense against Unicode bidirectional control characters that can visually reorder prompt text.

**File:** `src/shared/__helpers/sanitize-template.ts`

**Current (lines 37-43):**

```typescript
export function sanitizeForTemplate(str: string): string {
  return str
    .replace(/`/g, "")
    .replace(/\$\{/g, "")
    .replace(/[\n\r]/g, " ")
    .replace(/[\x00-\x1f\x7f]/g, "");
}
```

**Target:**

```typescript
export function sanitizeForTemplate(str: string): string {
  return str
    .replace(/`/g, "")
    .replace(/\$\{[^}]*\}/g, "") // Remove complete ${...} sequences
    .replace(/\$\{/g, "") // Remove any remaining unclosed ${
    .replace(/[\u202A-\u202E\u2066-\u2069]/g, "") // Strip bidi control chars
    .replace(/[\n\r]/g, " ")
    .replace(/[\x00-\x1f\x7f]/g, "");
}
```

**Also update the JSDoc `@example` block (lines 26-34)** to reflect the improved behavior:

````typescript
 * @example
 * ```typescript
 * sanitizeForTemplate("hello `world` ${injected}")
 * // "hello world "
 *
 * sanitizeForTemplate("line1\nline2\rline3")
 * // "line1 line2 line3"
 *
 * sanitizeForTemplate("normal text")
 * // "normal text"
 *
 * sanitizeForTemplate("text \u202Ewith bidi\u202C chars")
 * // "text with bidi chars"
 * ```
````

**Verification:**

- `sanitizeForTemplate("a]${b}c")` returns `"a]c"` (no orphaned `}`)
- `sanitizeForTemplate("${open")` returns `""` (unclosed `${` still removed)
- `sanitizeForTemplate("x\u202Ey\u2069z")` returns `"xyz"` (bidi chars stripped)

## Success Criteria

- [ ] Zero native `.sort()` calls in tribunal-consensus.ts
- [ ] Zero `.parse()` calls in hydration-snapshot.ts (except fallback paths)
- [ ] All prompt-interpolated fields in tribunal-rebuttals.ts wrapped in `sanitizeForTemplate()`
- [ ] `milestoneVersion` sanitized before prompt interpolation in milestone-debate.ts
- [ ] Zero bare `"crypto"` imports in `src/` (all use `"node:crypto"`)
- [ ] `sanitizeForTemplate` removes complete `${...}` sequences (no orphaned `}`)
- [ ] `sanitizeForTemplate` strips Unicode bidi control characters
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `bun test` passes

## Verification

```bash
# Verify lodash migration
grep -n "\.sort(" src/shared/__helpers/tribunal-consensus.ts && echo "FAIL" || echo "PASS: no .sort()"

# Verify safeParse migration
grep -c "\.parse(" src/context/__helpers/hydration-snapshot.ts  # Expect <= 1 (fallback only)

# Verify sanitization coverage
grep -n "source_agent\|\.file}" src/shared/__helpers/tribunal-rebuttals.ts | grep -v sanitizeForTemplate && echo "FAIL" || echo "PASS"

# Verify node:crypto prefix
grep -rn 'from "crypto"' src/ && echo "FAIL" || echo "PASS"

# Verify bidi defense
grep -n "u202" src/shared/__helpers/sanitize-template.ts && echo "PASS" || echo "FAIL: no bidi defense"

# No regressions
bunx --bun tsc --noEmit
bun test
```
