---
phase: 10
plan: 1
type: improvement
autonomous: true
wave: 1
depends_on: []
---

# Phase 10 Plan 1: Runtime Compatibility and Dead Code Closure

## Objective

Close 7 audit findings spanning runtime compatibility (Bun-only APIs in a Next.js/Node context), dead code, import boundary violations, code duplication, and minor hygiene issues in `packages/luca-studio/`. All fixes are independent and can execute in parallel as a single wave.

## Context

@packages/luca-studio/lib/entity-route-helpers.ts
@packages/luca-studio/lib/etag.ts
@packages/luca-studio/lib/config-section-handler.ts
@packages/luca-studio/lib/ts-round-trip.ts
@packages/luca-studio/lib/shared-constant-registry.ts
@packages/luca-studio/lib/config-section-schemas.ts
@packages/luca-studio/app/api/state/route.ts
@packages/luca-studio/app/api/ledger/route.ts
@packages/luca-studio/app/api/config/route.ts
@packages/luca-studio/sidecar/compiler.ts
@packages/luca-studio/stores/pipeline-atoms.ts
@src/compilers/index.ts

## Tasks

### 1. CRIT-1: Replace Bun-only APIs with node:fs/node:crypto equivalents

**Type:** auto
**TDD:** false
**Depends on:** none

Replace all `Bun.file()`, `Bun.write()`, `Bun.CryptoHasher`, and `Glob` from `"bun"` with Node.js standard library equivalents across 6 files. The luca-studio package runs inside Next.js (Node runtime for API routes), so Bun globals are not available at request time.

**Replacement mapping:**

| Bun API                          | Node.js replacement                          | Import                                         |
| -------------------------------- | -------------------------------------------- | ---------------------------------------------- |
| `Bun.file(path).text()`          | `readFile(path, "utf-8")`                    | `import { readFile } from "node:fs/promises"`  |
| `Bun.file(path).exists()`        | `access(path).then(() => true, () => false)` | `import { access } from "node:fs/promises"`    |
| `Bun.write(path, content)`       | `writeFile(path, content, "utf-8")`          | `import { writeFile } from "node:fs/promises"` |
| `new Bun.CryptoHasher("sha256")` | `createHash("sha256")`                       | `import { createHash } from "node:crypto"`     |
| `new Glob(pattern)` + `.scan()`  | `readdir()` + manual filter                  | `import { readdir } from "node:fs/promises"`   |

**Files to edit:**

1. **`lib/etag.ts`** -- Replace `Bun.CryptoHasher` with `createHash` from `node:crypto`. The hashing interface changes from `new Bun.CryptoHasher("sha256") -> hasher.update(content) -> hasher.digest("hex")` to `createHash("sha256").update(content).digest("hex")`.

2. **`lib/entity-route-helpers.ts`** -- Remove `import { Glob } from "bun"`. Replace `Bun.file(path).exists()` calls in `resolveEntityPath()` with `access()`. Replace `Bun.file(path).text()` calls in GET/PUT handlers with `readFile()`. Replace `new Glob(pattern).scan()` in both `resolveEntityPath()` and `createEntityListHandler()` with `readdir()` plus manual extension/pattern matching. Add `import { access, readFile, readdir } from "node:fs/promises"`.

3. **`lib/config-section-handler.ts`** -- Replace `Bun.file(configPath)` + `.exists()` + `.text()` in the factory function with `access()` and `readFile()`. Add `import { access, readFile } from "node:fs/promises"`.

4. **`app/api/state/route.ts`** -- Replace `Bun.file(statePath)` + `.exists()` + `.text()` with `access()` and `readFile()`. Add `import { access, readFile } from "node:fs/promises"`.

5. **`app/api/ledger/route.ts`** -- Replace `Bun.file(ledgerPath)` + `.exists()` + `.text()` with `access()` and `readFile()`. Add `import { access, readFile } from "node:fs/promises"`.

6. **`lib/ts-round-trip.ts`** -- Replace `Bun.file(path).text()` in `readEntityFile()` and `roundTripEntityFile()` with `readFile()`. Replace `Bun.write(tmpPath, source)` in `writeEntityFile()` with `writeFile()`. Convert the dynamic `await import("node:fs/promises")` for `rename` to a top-level static import. Add `import { readFile, writeFile, rename } from "node:fs/promises"`.

**Verification:**

- `bunx --bun tsc --noEmit` passes with zero errors in luca-studio
- No remaining references to `Bun.file`, `Bun.write`, `Bun.CryptoHasher`, or `Glob from "bun"` in the 6 files
- Grep for `from "bun"` in `packages/luca-studio/` returns zero matches (excluding `sidecar/` which legitimately runs under Bun)

### 2. CRIT-2: Delete dead shared-constant-registry

**Type:** auto
**TDD:** false
**Depends on:** none

Delete `packages/luca-studio/lib/shared-constant-registry.ts`. This file imports from `~/agents/__helpers/cold-isolation-block` and `~/agents/__helpers/research-reviewer-shared-sections` -- paths that do not exist in the luca-studio package (they reference the main `src/` tree). The file has zero consumers.

**Files to delete:**

- `packages/luca-studio/lib/shared-constant-registry.ts`

**Verification:**

- File is deleted
- Grep for `shared-constant-registry` across the entire repo returns zero import references
- `bunx --bun tsc --noEmit` passes

### 3. CRIT-3: Fix sidecar barrel import violation

**Type:** auto
**TDD:** false
**Depends on:** none

Update `packages/luca-studio/sidecar/compiler.ts` to import from the compilers barrel (`src/compilers/index.ts`) instead of reaching into `__helpers/compile.ts` directly. The barrel already exports all needed symbols: `compileAgent`, `compileSkill`, `compileRule`, and `SupportedFormat`.

**Files to edit:**

- `packages/luca-studio/sidecar/compiler.ts`

**Current (violates module-boundary rule 4):**

```typescript
import {
  compileAgent,
  compileSkill,
  compileRule,
} from "../../../src/compilers/__helpers/compile.ts";
import type { SupportedFormat } from "../../../src/compilers/__helpers/compile.ts";
```

**Target:**

```typescript
import {
  compileAgent,
  compileSkill,
  compileRule,
} from "../../../src/compilers/index.ts";
import type { SupportedFormat } from "../../../src/compilers/index.ts";
```

**Verification:**

- No remaining `__helpers/compile` imports in `sidecar/compiler.ts`
- `bunx --bun tsc --noEmit` passes

### 4. HIGH-5: Deduplicate ETag computation in config route

**Type:** auto
**TDD:** false
**Depends on:** none

Remove the inline `computeETag()` function from `app/api/config/route.ts` and import from `~/lib/etag` instead. The inline copy was originally added because the shared `etag.ts` used `Bun.CryptoHasher` (unavailable in Node). After Task 1 fixes `etag.ts` to use `node:crypto`, the shared version works and the inline copy is dead weight.

Note: If executing in parallel with Task 1, the executor should apply Task 1's etag.ts fix first (or recognize that both converge on `node:crypto`).

**Files to edit:**

- `packages/luca-studio/app/api/config/route.ts`

**Changes:**

- Remove the inline `computeETag` function (lines 19-31)
- Remove the `import { createHash } from "node:crypto"` (now unused)
- Add `import { computeETag } from "~/lib/etag"`

**Verification:**

- No `function computeETag` definition in `app/api/config/route.ts`
- Single `computeETag` import from `~/lib/etag`
- `bunx --bun tsc --noEmit` passes

### 5. HIGH-6: Fix dynamic import in ts-round-trip writeEntityFile

**Type:** auto
**TDD:** false
**Depends on:** none

In `lib/ts-round-trip.ts`, `writeEntityFile()` uses a dynamic `await import("node:fs/promises")` to get `rename`. This should be a static top-level import for clarity and performance.

Note: This is addressed as part of Task 1's changes to `ts-round-trip.ts`. If tasks execute independently, the executor should ensure the dynamic import line `const { rename } = await import("node:fs/promises")` is removed and `rename` is included in the top-level static import.

**Files to edit:**

- `packages/luca-studio/lib/ts-round-trip.ts`

**Changes:**

- Add `rename` to the top-level `import { readFile, writeFile, rename } from "node:fs/promises"` (added by Task 1)
- Remove the `const { rename } = await import("node:fs/promises")` line from `writeEntityFile()`

**Verification:**

- No `await import(` in `ts-round-trip.ts`
- `rename` included in the static import at the top of the file
- `bunx --bun tsc --noEmit` passes

### 6. MED-3: Remove unnecessary "use client" directive

**Type:** auto
**TDD:** false
**Depends on:** none

Remove the `"use client"` directive from `stores/pipeline-atoms.ts`. Jotai atoms are plain JavaScript objects (no hooks, no DOM, no React context). They do not require a client boundary. Consumer components that call `useAtom()` already have their own `"use client"` directives.

**Files to edit:**

- `packages/luca-studio/stores/pipeline-atoms.ts`

**Changes:**

- Remove line 1: `"use client";`

**Verification:**

- No `"use client"` in `pipeline-atoms.ts`
- `bunx --bun tsc --noEmit` passes

### 7. MED-5: Document camelCase exception in HarnessSectionSchema

**Type:** auto
**TDD:** false
**Depends on:** none

Add a JSDoc comment to `HarnessSectionSchema` in `lib/config-section-schemas.ts` explaining that `maxFixIterations` and `failFast` use camelCase (instead of the project's snake_case API convention) because they mirror the `src/harness/__schemas/` schema shape. This is intentional -- the config.json file uses camelCase for these fields, and the Studio schema must match.

**Files to edit:**

- `packages/luca-studio/lib/config-section-schemas.ts`

**Changes:**

- Add a JSDoc note to `HarnessSectionSchema` explaining the camelCase exception:
  ```
  * NOTE: `maxFixIterations` and `failFast` use camelCase to match the
  * canonical schema in `src/harness/__schemas/harness.schemas.ts` and the
  * existing `config.json` shape. This is an intentional exception to the
  * project's snake_case API convention.
  ```

**Verification:**

- JSDoc comment is present on `HarnessSectionSchema`
- `bunx --bun tsc --noEmit` passes

## Verification

1. Run `bunx --bun tsc --noEmit` from the repo root -- zero errors
2. Grep `packages/luca-studio/` for `from "bun"` -- only `sidecar/compiler.ts` should match (sidecar runs under Bun intentionally)
3. Grep `packages/luca-studio/` for `Bun.file\|Bun.write\|Bun.CryptoHasher` -- zero matches outside `sidecar/`
4. Grep for `shared-constant-registry` imports -- zero matches
5. Grep `sidecar/compiler.ts` for `__helpers/compile` -- zero matches
6. Grep `app/api/config/route.ts` for `function computeETag` -- zero matches
7. Grep `ts-round-trip.ts` for `await import(` -- zero matches
8. Grep `stores/pipeline-atoms.ts` for `"use client"` -- zero matches

## Success Criteria

- All 7 audit findings are resolved
- luca-studio compiles cleanly under `bunx --bun tsc --noEmit`
- No Bun-only APIs remain in Next.js API routes or lib/ utilities
- Dead code is removed, import boundaries are respected, code duplication is eliminated
- No functional behavior changes -- all fixes are mechanical/hygiene

## Output Specification

- 8 files modified (6 for CRIT-1, plus config/route.ts, sidecar/compiler.ts, pipeline-atoms.ts, config-section-schemas.ts)
- 1 file deleted (shared-constant-registry.ts)
- Zero new files created
