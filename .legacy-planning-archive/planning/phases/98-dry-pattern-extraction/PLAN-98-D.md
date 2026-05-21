---
id: PLAN-98-D
title: "Replace Manual Group-Into-Map Idiom with lodash groupBy"
phase: 98
wave: 1
depends_on: []
---

# PLAN-98-D: Replace Manual Group-Into-Map Idiom with lodash groupBy

## Objective

Replace the manual "iterate, get-or-create array in Map, push" grouping idiom with `lodash/groupBy` in 4 files. The project already uses lodash (individual imports) as a dependency, but `groupBy` is not yet imported anywhere. Each replacement reduces 6-8 lines of boilerplate to a single function call.

Source: `.planning/v2.6.1-MILESTONE-AUDIT.md` — LOW DRY issue.

## Context

The manual idiom appears in these 4 locations:

### Location 1: `src/shared/__helpers/tribunal-rebuttals.ts` (lines 200-209)

```typescript
const rebuttalsByFinding = new Map<string, Rebuttal[]>();

for (const rebuttal of rebuttals) {
  const existing = rebuttalsByFinding.get(rebuttal.finding_id);
  if (existing) {
    existing.push(rebuttal);
  } else {
    rebuttalsByFinding.set(rebuttal.finding_id, [rebuttal]);
  }
}
```

### Location 2: `src/shared/__helpers/tribunal-detector.ts` (lines 139-148)

```typescript
const groups = new Map<string, ReviewFinding[]>();
for (const finding of findings) {
  const key = `${finding.file}:${finding.line}`;
  const group = groups.get(key);
  if (group) {
    group.push(finding);
  } else {
    groups.set(key, [finding]);
  }
}
```

### Location 3: `src/skills/__helpers/pr-verdict-debate.ts` (lines 58-66)

```typescript
const byComment = new Map<string, ValidatorVerdict[]>();
for (const verdict of verdicts) {
  const existing = byComment.get(verdict.comment_id);
  if (existing) {
    existing.push(verdict);
  } else {
    byComment.set(verdict.comment_id, [verdict]);
  }
}
```

### Location 4: `src/memory/__helpers/compression.ts` (lines 219-228)

```typescript
const groups = new Map<string, string[]>();

for (const entry of entries) {
  const normalized = normalizeTitle(entry.title);
  const existing = groups.get(normalized) ?? [];
  existing.push(entry.id);
  groups.set(normalized, existing);
}
```

**Important note:** `lodash/groupBy` returns `Record<string, T[]>` (a plain object), not a `Map`. Each consumer iterates with `for...of` over Map entries. Replacements must account for this by using `Object.entries()` instead of Map iteration, OR by converting the result to a Map. The simplest approach is to use `Record<string, T[]>` directly since all consumers can work with it.

## Tasks

### Task 1: Replace grouping in `tribunal-rebuttals.ts`

**Goal:** Replace manual Map-building with `lodash/groupBy` in `resolveRebuttals`.

**File:** `src/shared/__helpers/tribunal-rebuttals.ts`

**Add import (at top of file, with other lodash imports):**

```typescript
import groupBy from "lodash/groupBy";
```

Note: If PLAN-98-A has already removed `import filter from "lodash/filter"`, this replaces it. If not, add alongside it.

**Current (lines 200-209 in `resolveRebuttals`):**

```typescript
const rebuttalsByFinding = new Map<string, Rebuttal[]>();

for (const rebuttal of rebuttals) {
  const existing = rebuttalsByFinding.get(rebuttal.finding_id);
  if (existing) {
    existing.push(rebuttal);
  } else {
    rebuttalsByFinding.set(rebuttal.finding_id, [rebuttal]);
  }
}
```

**Target:**

```typescript
const rebuttalsByFinding = groupBy(rebuttals, (r) => r.finding_id);
```

**Downstream impact:** The variable changes from `Map<string, Rebuttal[]>` to `Record<string, Rebuttal[]>`. The only consumers are:

- Line 212: `const findingRebuttals = rebuttalsByFinding.get(finding.id) ?? [];` -> Change to `const findingRebuttals = rebuttalsByFinding[finding.id] ?? [];`

So also replace line 212:

**Current (line 212):**

```typescript
const findingRebuttals = rebuttalsByFinding.get(finding.id) ?? [];
```

**Target:**

```typescript
const findingRebuttals = rebuttalsByFinding[finding.id] ?? [];
```

**Verification:** No `new Map` in `resolveRebuttals`. `grep -n "new Map" src/shared/__helpers/tribunal-rebuttals.ts` returns no matches.

### Task 2: Replace grouping in `tribunal-detector.ts`

**Goal:** Replace manual Map-building with `lodash/groupBy` in `detectDisagreements`.

**File:** `src/shared/__helpers/tribunal-detector.ts`

**Add import (at top of file):**

```typescript
import groupBy from "lodash/groupBy";
```

**Current (lines 139-148 in `detectDisagreements`):**

```typescript
const groups = new Map<string, ReviewFinding[]>();
for (const finding of findings) {
  const key = `${finding.file}:${finding.line}`;
  const group = groups.get(key);
  if (group) {
    group.push(finding);
  } else {
    groups.set(key, [finding]);
  }
}
```

**Target:**

```typescript
const groups = groupBy(findings, (f) => `${f.file}:${f.line}`);
```

**Downstream impact:** The iteration changes from Map to Object.entries:

**Current (line 151):**

```typescript
  for (const [, group] of groups) {
```

**Target:**

```typescript
  for (const group of Object.values(groups)) {
```

**Verification:** No `new Map` in `detectDisagreements`. `grep -n "new Map" src/shared/__helpers/tribunal-detector.ts` returns no matches.

### Task 3: Replace grouping in `pr-verdict-debate.ts`

**Goal:** Replace manual Map-building with `lodash/groupBy` in `detectVerdictSplits`.

**File:** `src/skills/__helpers/pr-verdict-debate.ts`

**Add import (at top of file, with other lodash imports):**

```typescript
import groupBy from "lodash/groupBy";
```

**Current (lines 58-66 in `detectVerdictSplits`):**

```typescript
const byComment = new Map<string, ValidatorVerdict[]>();
for (const verdict of verdicts) {
  const existing = byComment.get(verdict.comment_id);
  if (existing) {
    existing.push(verdict);
  } else {
    byComment.set(verdict.comment_id, [verdict]);
  }
}
```

**Target:**

```typescript
const byComment = groupBy(verdicts, (v) => v.comment_id);
```

**Downstream impact:** The iteration changes from Map to Object.entries:

**Current (line 70):**

```typescript
  for (const [commentId, commentVerdicts] of byComment) {
```

**Target:**

```typescript
  for (const [commentId, commentVerdicts] of Object.entries(byComment)) {
```

**Verification:** No `new Map` in `detectVerdictSplits`. Function still returns correct splits.

### Task 4: Replace grouping in `compression.ts`

**Goal:** Replace manual Map-building with `lodash/groupBy` in `detectDuplicates`.

**File:** `src/memory/__helpers/compression.ts`

**Add import (at top of file):**

```typescript
import groupBy from "lodash/groupBy";
```

**Current (lines 218-229 in `detectDuplicates`):**

```typescript
function detectDuplicates(entries: MemoryEntry[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();

  for (const entry of entries) {
    const normalized = normalizeTitle(entry.title);
    const existing = groups.get(normalized) ?? [];
    existing.push(entry.id);
    groups.set(normalized, existing);
  }

  return groups;
}
```

**Important:** This function's return type is `Map<string, string[]>` and it groups entries but extracts only the `id` field (not the full entry). `lodash/groupBy` would group full entries, so we need a slightly different approach. We can use `groupBy` to group by normalized title, then `mapValues` to extract IDs, OR we can use a simpler pattern.

The simplest equivalent using groupBy:

**Target:**

```typescript
function detectDuplicates(entries: MemoryEntry[]): Record<string, string[]> {
  const grouped = groupBy(entries, (e) => normalizeTitle(e.title));
  const result: Record<string, string[]> = {};
  for (const [key, group] of Object.entries(grouped)) {
    result[key] = group.map((e) => e.id);
  }
  return result;
}
```

**Downstream impact:** The return type changes from `Map<string, string[]>` to `Record<string, string[]>`. Check consumers of `detectDuplicates`:

Let me check what uses the return value. The function is private (no `export`), so only used within compression.ts. Need to find the consumer and update Map access patterns to Record access patterns.

**Consumer update:** Find all `.get()`, `.entries()`, `.size` calls on the return value and update to Object equivalents.

**Verification:** `grep -n "new Map" src/memory/__helpers/compression.ts` returns no matches for the `detectDuplicates` function. The `policyMap` on line 172 is a different use case and should NOT be changed (it's a lookup map, not a groupBy).

### Task 5: Update `detectDuplicates` consumers in compression.ts

**Goal:** Update the two consumers of the `detectDuplicates` return value to use `Record` instead of `Map`.

**File:** `src/memory/__helpers/compression.ts`

**Consumer 1 — line 100 (iteration over duplicateMap):**

Current:

```typescript
  for (const [, ids] of duplicateMap) {
```

Target:

```typescript
  for (const ids of Object.values(duplicateMap)) {
```

**Consumer 2 — line 115 (lookup by normalized title):**

Current:

```typescript
const groupIds = duplicateMap.get(normalizedTitle) ?? [];
```

Target:

```typescript
const groupIds = duplicateMap[normalizedTitle] ?? [];
```

**Verification:** No `.get(`, `.entries()`, `.has(` calls remain on `duplicateMap`.

## Success Criteria

- [ ] Zero manual "iterate, get-or-create array, push, set" Map-building patterns in the 4 target files
- [ ] `lodash/groupBy` imported in all 4 files
- [ ] All downstream consumers updated from Map API to Record/Object API
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `bun test` passes

## Verification

```bash
# Verify groupBy is imported in all 4 files
for f in src/shared/__helpers/tribunal-rebuttals.ts src/shared/__helpers/tribunal-detector.ts src/skills/__helpers/pr-verdict-debate.ts src/memory/__helpers/compression.ts; do
  grep -q "lodash/groupBy" "$f" && echo "PASS: groupBy in $f" || echo "FAIL: no groupBy in $f"
done

# Verify no manual Map-grouping remains in target functions
grep -n "new Map<string," src/shared/__helpers/tribunal-rebuttals.ts src/shared/__helpers/tribunal-detector.ts src/skills/__helpers/pr-verdict-debate.ts && echo "FAIL: manual Map remains" || echo "PASS: all replaced"

# Verify detectDuplicates no longer returns Map (compression.ts)
grep -n "new Map<string" src/memory/__helpers/compression.ts | grep -v "policyMap" && echo "FAIL: Map in detectDuplicates" || echo "PASS"

# No regressions
bunx --bun tsc --noEmit
bun test
```
