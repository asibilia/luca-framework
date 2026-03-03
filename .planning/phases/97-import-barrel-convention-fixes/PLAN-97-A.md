---
id: PLAN-97-A
title: "Fix Barrel Import Violations & Dual-Export Cleanup"
phase: 97
wave: 1
depends_on: []
---

# PLAN-97-A: Fix Barrel Import Violations & Dual-Export Cleanup

## Objective

Fix Rule 4 barrel violations where files import from `~/complexity/__helpers/` or `~/complexity/__schemas/` directly instead of the `~/complexity` barrel. Remove dual-export of tribunal symbols from `agents/index.ts` that duplicate what `shared/index.ts` already exports.

Source: `.planning/v2.6.1-MILESTONE-AUDIT.md` — 3 HIGH issues, 3 LOW issues.

## Context

@file src/complexity/index.ts — Barrel already exports `isDebateComplexity`, `COMPLEXITY_ORDER`, `COMPLEXITY_LEVELS`, and `ComplexityLevel`.

@file src/shared/index.ts — Barrel already exports all tribunal schemas, detection, rebuttal, and consensus symbols.

@file src/agents/index.ts — Also exports the same tribunal schemas, detection, and rebuttal symbols (dual-export with shared).

@file src/shared/**helpers/tribunal-detector.ts — Imports `isDebateComplexity` from `~/complexity/**helpers/complexity-gate`(line 3). Should use`~/complexity`.

@file src/agents/\_\_helpers/verification-tribunal.ts — Same pattern (line 1). Should use `~/complexity`.

@file src/agents/\_\_helpers/root-cause-tribunal.ts — Same pattern (line 1). Should use `~/complexity`.

@file src/skills/**helpers/milestone-debate.ts — Imports `COMPLEXITY_ORDER` and `ComplexityLevel` from `~/complexity/**schemas/complexity.schemas`(line 29-31). Should use`~/complexity`.

@file src/skills/**schemas/milestone-debate.schemas.ts — Imports `COMPLEXITY_LEVELS` from `~/complexity/**schemas/complexity.schemas`(line 13). Should use`~/complexity`.

## Tasks

### Task 1: Fix `~/complexity/__helpers/` imports in tribunal-detector.ts

**Goal:** Replace direct `__helpers/` import with barrel import per Rule 4.

**File:** `src/shared/__helpers/tribunal-detector.ts`

**Current (line 3):**

```typescript
import { isDebateComplexity } from "~/complexity/__helpers/complexity-gate";
```

**Target:**

```typescript
import { isDebateComplexity } from "~/complexity";
```

**Verification:** `grep -n "complexity/__helpers" src/shared/__helpers/tribunal-detector.ts` returns no matches.

### Task 2: Fix `~/complexity/__helpers/` import in verification-tribunal.ts

**Goal:** Replace direct `__helpers/` import with barrel import per Rule 4.

**File:** `src/agents/__helpers/verification-tribunal.ts`

**Current (line 1):**

```typescript
import { isDebateComplexity } from "~/complexity/__helpers/complexity-gate";
```

**Target:**

```typescript
import { isDebateComplexity } from "~/complexity";
```

**Verification:** `grep -n "complexity/__helpers" src/agents/__helpers/verification-tribunal.ts` returns no matches.

### Task 3: Fix `~/complexity/__helpers/` import in root-cause-tribunal.ts

**Goal:** Replace direct `__helpers/` import with barrel import per Rule 4.

**File:** `src/agents/__helpers/root-cause-tribunal.ts`

**Current (line 1):**

```typescript
import { isDebateComplexity } from "~/complexity/__helpers/complexity-gate";
```

**Target:**

```typescript
import { isDebateComplexity } from "~/complexity";
```

**Verification:** `grep -n "complexity/__helpers" src/agents/__helpers/root-cause-tribunal.ts` returns no matches.

### Task 4: Fix `~/complexity/__schemas/` import in milestone-debate.ts

**Goal:** Replace direct `__schemas/` import with barrel import per Rule 4.

**File:** `src/skills/__helpers/milestone-debate.ts`

**Current (lines 29-31):**

```typescript
import {
  COMPLEXITY_ORDER,
  type ComplexityLevel,
} from "~/complexity/__schemas/complexity.schemas";
```

**Target:**

```typescript
import { COMPLEXITY_ORDER, type ComplexityLevel } from "~/complexity";
```

**Verification:** `grep -n "complexity/__schemas" src/skills/__helpers/milestone-debate.ts` returns no matches.

### Task 5: Fix `~/complexity/__schemas/` import in milestone-debate.schemas.ts

**Goal:** Replace direct `__schemas/` import with barrel import per Rule 4.

**File:** `src/skills/__schemas/milestone-debate.schemas.ts`

**Current (line 13):**

```typescript
import { COMPLEXITY_LEVELS } from "~/complexity/__schemas/complexity.schemas";
```

**Target:**

```typescript
import { COMPLEXITY_LEVELS } from "~/complexity";
```

**Verification:** `grep -n "complexity/__schemas" src/skills/__schemas/milestone-debate.schemas.ts` returns no matches.

### Task 6: Remove dual-export of tribunal symbols from agents/index.ts

**Goal:** Remove tribunal schema/detection/rebuttal exports from `agents/index.ts` that duplicate `shared/index.ts` exports. The canonical home for these symbols is `shared/`, and `agents/index.ts` should only re-export agent-specific symbols (agent registry, factory, model resolution, verification tribunal, root cause tribunal).

**File:** `src/agents/index.ts`

**Remove these export blocks (lines 31-68):**

```typescript
// Tribunal schemas
export {
  reviewFindingSchema,
  CONFLICT_TYPES,
  conflictTypeSchema,
  disagreementSchema,
  REBUTTAL_RESOLUTIONS,
  rebuttalResolutionSchema,
  rebuttalSchema,
  unifiedRecommendationSchema,
  tribunalResultSchema,
} from "./__schemas/tribunal.schemas";

export type {
  ReviewFinding,
  ConflictType,
  Disagreement,
  RebuttalResolution,
  Rebuttal,
  UnifiedRecommendation,
  TribunalResult,
} from "./__schemas/tribunal.schemas";

// Tribunal detection
export {
  normalizeFindings,
  detectDisagreements,
  shouldRunTribunal,
} from "./__helpers/tribunal-detector";

// Tribunal rebuttals
export {
  buildRebuttalPrompts,
  resolveRebuttals,
  buildTribunalResult,
} from "./__helpers/tribunal-rebuttals";

export type { RebuttalPromptPair } from "./__helpers/tribunal-rebuttals";
```

**Keep** the verification-tribunal and root-cause-tribunal exports (lines 70-129) since those schemas and helpers are unique to agents domain.

**Verification:**

- `grep -n "tribunal.schemas" src/agents/index.ts` returns only verification-tribunal and root-cause-tribunal schema lines (no generic tribunal schemas).
- `grep -n "tribunal-detector\|tribunal-rebuttals" src/agents/index.ts` returns no matches.
- Any imports currently using `from "~/agents"` for tribunal schemas need to be updated to `from "~/shared"`. Check: `grep -rn "from.*~/agents.*tribunal" src/` to find consumers that need updating.

## Success Criteria

- [ ] Zero `~/complexity/__helpers/` imports in `src/` (was 3)
- [ ] Zero `~/complexity/__schemas/` imports outside `src/complexity/` (was 2)
- [ ] Generic tribunal schemas, detection, and rebuttal symbols exported from `shared/index.ts` only (not dual-exported from `agents/index.ts`)
- [ ] `bunx --bun tsc --noEmit` passes (no broken imports)
- [ ] `bun test` passes (no regressions)

## Verification

```bash
# Verify no direct __helpers/ or __schemas/ imports from complexity
grep -rn "~/complexity/__helpers/" src/ && echo "FAIL: __helpers/ imports remain" || echo "PASS"
grep -rn "~/complexity/__schemas/" src/ --include="*.ts" | grep -v "src/complexity/" && echo "FAIL: __schemas/ imports remain outside complexity/" || echo "PASS"

# Verify no dual-export of generic tribunal symbols from agents barrel
grep -n "tribunal.schemas\|tribunal-detector\|tribunal-rebuttals" src/agents/index.ts | grep -v verification | grep -v root-cause && echo "FAIL: dual-export remains" || echo "PASS"

# No regressions
bunx --bun tsc --noEmit
bun test
```
