---
id: 13-01
title: Types, Defaults, and Complexity Matrix
phase: 13-complexity-gates
wave: 1
delivers: CPLX-01, CPLX-02, CPLX-05
depends_on: null
tasks: 7
---

# Plan 13-01: Types, Defaults, and Complexity Matrix

## Objective

Create the core complexity module (`src/complexity/`) with TypeScript type definitions, default configuration, and the complexity matrix reference document. Add the `complexity` section to both the live project config and the template config. Update the STATE.md template to support 5 complexity levels. This plan produces the foundational data structures and configuration that all subsequent plans depend on.

## Context

- **Harness module pattern:** `src/harness/types.ts` (interface-first, DEFAULT_HARNESS_CONFIG in types.ts), `src/harness/index.ts` (public API exports)
- **Config structure:** `.planning/config.json` (existing sections: cognitive, workflow, planning, parallelization, gates, safety, harness)
- **Template config:** `packages/luca-framework/templates/framework/templates/config.json` (same structure + hooks section)
- **State template:** `packages/luca-framework/templates/framework/templates/state.md` (line 31: `Task Complexity: [TRIVIAL / MODERATE / COMPLEX]`)
- **Root index.ts:** `index.ts` (lines 59-61: harness exports pattern to follow)
- **Research:** `.planning/phases/13-complexity-gates/RESEARCH.md` (Section 8: CPLX-01, Section 12: 3 vs 5 levels)
- **References directory:** `packages/luca-framework/templates/framework/references/` (10 existing reference files)
- **Pre-existing test failures:** 6 tests fail. Do not fix these. New tests should not introduce regressions.

## Tasks

### Task 1: Create Complexity Type Definitions

**Goal:** Define all TypeScript interfaces and constants for the complexity system.
**Files:** `src/complexity/types.ts`
**Pattern:** Follow `src/harness/types.ts` (interfaces + DEFAULT constant exported from types.ts)

Create `src/complexity/types.ts` with the following:

```typescript
/**
 * Type definitions for the Luca complexity gating system.
 *
 * Complexity levels control which workflow steps activate, how many
 * agents are spawned, iteration limits, and verification depth.
 * Five levels exist but behavior groups into three tiers:
 * - Group A (lightweight): TRIVIAL, SIMPLE
 * - Group B (standard): MODERATE
 * - Group C (thorough): COMPLEX, CRITICAL
 */

/** The five complexity levels, ordered from least to most complex */
export const COMPLEXITY_LEVELS = ['TRIVIAL', 'SIMPLE', 'MODERATE', 'COMPLEX', 'CRITICAL'] as const;
export type ComplexityLevel = (typeof COMPLEXITY_LEVELS)[number];

/** Numeric index for comparison (TRIVIAL=0, CRITICAL=4) */
export const COMPLEXITY_ORDER: Record<ComplexityLevel, number> = {
  TRIVIAL: 0,
  SIMPLE: 1,
  MODERATE: 2,
  COMPLEX: 3,
  CRITICAL: 4,
};

/** Behavioral tier grouping */
export type ComplexityTier = 'lightweight' | 'standard' | 'thorough';

export const COMPLEXITY_TIER: Record<ComplexityLevel, ComplexityTier> = {
  TRIVIAL: 'lightweight',
  SIMPLE: 'lightweight',
  MODERATE: 'standard',
  COMPLEX: 'thorough',
  CRITICAL: 'thorough',
};

/** Classification criteria for a complexity level */
export interface ComplexityClassification {
  level: ComplexityLevel;
  fileCount: string;         // e.g., "1", "2-3", "3-5", "5-10", "10+"
  scope: string;             // e.g., "single component", "feature-scoped"
  risk: string;              // e.g., "low", "medium", "high", "very high"
  estimatedTime: string;     // e.g., "< 15 min", "15-30 min"
  examples: string[];
}

/** Verification mode mapped from complexity */
export type VerificationMode = 'quick' | 'standard' | 'full' | 'full+human';

/** Step activation status */
export type StepActivation = 'skip' | 'optional' | 'run' | 'required' | 'required+thorough';

/** Per-level workflow gating configuration */
export interface ComplexityGate {
  /** Cognitive pre-flight depth */
  cognitivePreflight: 'lite' | 'full';
  /** Whether research (lu-phase-researcher) runs */
  research: StepActivation;
  /** Whether discussion (lu-discuss-phase) runs */
  discussion: StepActivation;
  /** Plan verification iterations (lu-plan-checker loop count) */
  planVerificationIterations: number;
  /** Harness fix iterations (failure-to-fix loop max) */
  harnessFixIterations: number;
  /** Verification mode for lu-verifier */
  verificationMode: VerificationMode;
  /** Code review agents to spawn (by agent name) */
  codeReviewAgents: string[];
  /** UAT step activation */
  uat: StepActivation;
  /** Learning capture depth */
  learningCapture: 'skip' | 'brief' | 'standard' | 'full' | 'full+debrief';
}

/** The complete complexity matrix: maps each level to its gate configuration */
export type ComplexityMatrix = Record<ComplexityLevel, ComplexityGate>;

/** Top-level complexity configuration (maps to config.json "complexity" section) */
export interface ComplexityConfig {
  /** Default level when no override is set. "auto" means lu-router infers. */
  defaultLevel: ComplexityLevel | 'auto';
  /** The full gating matrix */
  matrix: ComplexityMatrix;
}

/** Utility: check if a level meets or exceeds a threshold */
export function meetsThreshold(level: ComplexityLevel, threshold: ComplexityLevel): boolean {
  return COMPLEXITY_ORDER[level] >= COMPLEXITY_ORDER[threshold];
}

/** Utility: get the behavioral tier for a level */
export function getTier(level: ComplexityLevel): ComplexityTier {
  return COMPLEXITY_TIER[level];
}
```

**Verification:**
- [ ] All interfaces exported and importable
- [ ] `COMPLEXITY_LEVELS` has exactly 5 entries in order
- [ ] `COMPLEXITY_ORDER` maps correctly (TRIVIAL=0, CRITICAL=4)
- [ ] `meetsThreshold('MODERATE', 'SIMPLE')` returns `true`
- [ ] `meetsThreshold('TRIVIAL', 'MODERATE')` returns `false`
- [ ] `getTier('SIMPLE')` returns `'lightweight'`
- [ ] Types compile with `bunx --bun tsc --noEmit`

### Task 2: Create Default Complexity Configuration

**Goal:** Define the default complexity matrix with sensible defaults matching the research recommendations.
**Files:** `src/complexity/defaults.ts`
**Pattern:** Follow harness pattern (types.ts has DEFAULT_HARNESS_CONFIG, but for complexity the defaults are large enough to warrant their own file)

Create `src/complexity/defaults.ts`:

```typescript
/**
 * Default complexity configuration.
 * Defines the standard gating matrix used when no custom config exists.
 *
 * Design principle: 5 levels, 3 behavioral tiers.
 * - Group A (lightweight): TRIVIAL, SIMPLE — skip most optional steps
 * - Group B (standard): MODERATE — standard workflow
 * - Group C (thorough): COMPLEX, CRITICAL — full workflow with scaling
 */
import type { ComplexityConfig, ComplexityLevel, ComplexityMatrix, ComplexityClassification } from './types';

/** Classification criteria for each level (used by lu-router) */
export const COMPLEXITY_CLASSIFICATIONS: Record<ComplexityLevel, ComplexityClassification> = {
  TRIVIAL: {
    level: 'TRIVIAL',
    fileCount: '1',
    scope: 'Single component',
    risk: 'Low',
    estimatedTime: '< 15 min',
    examples: ['Fix typo', 'Update config value', 'Add simple field', 'Rename variable'],
  },
  SIMPLE: {
    level: 'SIMPLE',
    fileCount: '2-3',
    scope: 'Related components',
    risk: 'Low-Medium',
    estimatedTime: '15-30 min',
    examples: ['Add utility function + tests', 'Update component + styles', 'Add new route handler'],
  },
  MODERATE: {
    level: 'MODERATE',
    fileCount: '3-5',
    scope: 'Feature-scoped',
    risk: 'Medium',
    estimatedTime: '30-60 min',
    examples: ['Add new component with API', 'Create new schema + migration', 'Implement feature flag'],
  },
  COMPLEX: {
    level: 'COMPLEX',
    fileCount: '5-10',
    scope: 'Cross-cutting',
    risk: 'High',
    estimatedTime: '1-3 hours',
    examples: ['Auth system changes', 'Multi-file refactor', 'New integration', 'Database redesign'],
  },
  CRITICAL: {
    level: 'CRITICAL',
    fileCount: '10+ OR architectural',
    scope: 'System-wide',
    risk: 'Very High',
    estimatedTime: '3+ hours',
    examples: ['Major architecture change', 'Payment integration', 'Security overhaul', 'Platform migration'],
  },
};

/** The default gating matrix */
export const DEFAULT_COMPLEXITY_MATRIX: ComplexityMatrix = {
  TRIVIAL: {
    cognitivePreflight: 'lite',
    research: 'skip',
    discussion: 'skip',
    planVerificationIterations: 0,
    harnessFixIterations: 1,
    verificationMode: 'quick',
    codeReviewAgents: [],
    uat: 'skip',
    learningCapture: 'skip',
  },
  SIMPLE: {
    cognitivePreflight: 'lite',
    research: 'skip',
    discussion: 'skip',
    planVerificationIterations: 0,
    harnessFixIterations: 2,
    verificationMode: 'quick',
    codeReviewAgents: [],
    uat: 'skip',
    learningCapture: 'brief',
  },
  MODERATE: {
    cognitivePreflight: 'full',
    research: 'optional',
    discussion: 'optional',
    planVerificationIterations: 1,
    harnessFixIterations: 3,
    verificationMode: 'standard',
    codeReviewAgents: ['dx-advocate', 'code-simplifier'],
    uat: 'optional',
    learningCapture: 'standard',
  },
  COMPLEX: {
    cognitivePreflight: 'full',
    research: 'required',
    discussion: 'run',
    planVerificationIterations: 2,
    harnessFixIterations: 3,
    verificationMode: 'full',
    codeReviewAgents: ['dx-advocate', 'code-simplifier', 'code-architect', 'tailwind-auditor'],
    uat: 'required',
    learningCapture: 'full',
  },
  CRITICAL: {
    cognitivePreflight: 'full',
    research: 'required',
    discussion: 'required',
    planVerificationIterations: 3,
    harnessFixIterations: 5,
    verificationMode: 'full+human',
    codeReviewAgents: ['dx-advocate', 'code-simplifier', 'code-architect', 'tailwind-auditor', 'security-auditor'],
    uat: 'required+thorough',
    learningCapture: 'full+debrief',
  },
};

/** Default complexity config used when no config.json complexity section exists */
export const DEFAULT_COMPLEXITY_CONFIG: ComplexityConfig = {
  defaultLevel: 'auto',
  matrix: DEFAULT_COMPLEXITY_MATRIX,
};
```

**Verification:**
- [ ] All 5 levels have entries in both `COMPLEXITY_CLASSIFICATIONS` and `DEFAULT_COMPLEXITY_MATRIX`
- [ ] TRIVIAL/SIMPLE skip most optional steps (research, discussion, code review, UAT)
- [ ] MODERATE is the standard middle ground
- [ ] COMPLEX/CRITICAL enable everything with scaling differences
- [ ] `DEFAULT_COMPLEXITY_CONFIG.defaultLevel` is `'auto'`
- [ ] Types compile with `bunx --bun tsc --noEmit`

### Task 3: Create Complexity Module Public API

**Goal:** Export the complexity module public API from `src/complexity/index.ts` and add complexity exports to the root `index.ts`.
**Files:** `src/complexity/index.ts`, `index.ts` (update)
**Pattern:** Follow `src/harness/index.ts` (lines 1-10) and root `index.ts` (lines 59-61)

Create `src/complexity/index.ts`:

```typescript
/**
 * Public API for the complexity gating module.
 *
 * Exports types, defaults, classifications, and utility functions.
 */

// Types
export type {
  ComplexityLevel,
  ComplexityTier,
  ComplexityClassification,
  VerificationMode,
  StepActivation,
  ComplexityGate,
  ComplexityMatrix,
  ComplexityConfig,
} from './types';

// Constants
export {
  COMPLEXITY_LEVELS,
  COMPLEXITY_ORDER,
  COMPLEXITY_TIER,
  meetsThreshold,
  getTier,
} from './types';

// Defaults
export {
  COMPLEXITY_CLASSIFICATIONS,
  DEFAULT_COMPLEXITY_MATRIX,
  DEFAULT_COMPLEXITY_CONFIG,
} from './defaults';
```

Add to root `index.ts` after the harness exports block (after line 61). Insert before the validation utilities export (before the line starting with `// Validation utilities`):

```typescript
// Complexity API and types (for build scripts and consumers)
export {
  COMPLEXITY_LEVELS,
  COMPLEXITY_ORDER,
  COMPLEXITY_TIER,
  meetsThreshold,
  getTier,
  COMPLEXITY_CLASSIFICATIONS,
  DEFAULT_COMPLEXITY_MATRIX,
  DEFAULT_COMPLEXITY_CONFIG,
} from './src/complexity/index';
export type {
  ComplexityLevel,
  ComplexityTier,
  ComplexityClassification,
  VerificationMode,
  StepActivation,
  ComplexityGate,
  ComplexityMatrix,
  ComplexityConfig,
} from './src/complexity/index';
```

**Verification:**
- [ ] `import { COMPLEXITY_LEVELS, meetsThreshold } from './src/complexity'` works
- [ ] `import type { ComplexityLevel, ComplexityGate } from './src/complexity'` works
- [ ] Root `index.ts` exports all complexity symbols
- [ ] `bunx --bun tsc --noEmit` passes on all updated files

### Task 4: Add Complexity Section to Project Config

**Goal:** Add the `complexity` section to `.planning/config.json` for the live project.
**Files:** `.planning/config.json`
**Pattern:** Follow the `harness` section structure (top-level key with nested config). The existing config has sections: mode, depth, model_profile, cognitive, workflow, planning, parallelization, gates, safety, harness.

Add the following `complexity` section to `.planning/config.json`, after the `harness` section (after the closing `}` of `harness` on line 57, before the final `}`):

```json
  "complexity": {
    "defaultLevel": "auto",
    "matrix": {
      "TRIVIAL": {
        "cognitivePreflight": "lite",
        "research": "skip",
        "discussion": "skip",
        "planVerificationIterations": 0,
        "harnessFixIterations": 1,
        "verificationMode": "quick",
        "codeReviewAgents": [],
        "uat": "skip",
        "learningCapture": "skip"
      },
      "SIMPLE": {
        "cognitivePreflight": "lite",
        "research": "skip",
        "discussion": "skip",
        "planVerificationIterations": 0,
        "harnessFixIterations": 2,
        "verificationMode": "quick",
        "codeReviewAgents": [],
        "uat": "skip",
        "learningCapture": "brief"
      },
      "MODERATE": {
        "cognitivePreflight": "full",
        "research": "optional",
        "discussion": "optional",
        "planVerificationIterations": 1,
        "harnessFixIterations": 3,
        "verificationMode": "standard",
        "codeReviewAgents": ["dx-advocate", "code-simplifier"],
        "uat": "optional",
        "learningCapture": "standard"
      },
      "COMPLEX": {
        "cognitivePreflight": "full",
        "research": "required",
        "discussion": "run",
        "planVerificationIterations": 2,
        "harnessFixIterations": 3,
        "verificationMode": "full",
        "codeReviewAgents": ["dx-advocate", "code-simplifier", "code-architect", "tailwind-auditor"],
        "uat": "required",
        "learningCapture": "full"
      },
      "CRITICAL": {
        "cognitivePreflight": "full",
        "research": "required",
        "discussion": "required",
        "planVerificationIterations": 3,
        "harnessFixIterations": 5,
        "verificationMode": "full+human",
        "codeReviewAgents": ["dx-advocate", "code-simplifier", "code-architect", "tailwind-auditor", "security-auditor"],
        "uat": "required+thorough",
        "learningCapture": "full+debrief"
      }
    }
  }
```

**Verification:**
- [ ] `.planning/config.json` is valid JSON (parse test)
- [ ] `complexity` section is present with `defaultLevel` and `matrix`
- [ ] All 5 levels present in the matrix
- [ ] Matrix values match `DEFAULT_COMPLEXITY_CONFIG` from `src/complexity/defaults.ts`

### Task 5: Add Complexity Section to Template Config

**Goal:** Add the `complexity` section to the template config used by `luca init`.
**Files:** `packages/luca-framework/templates/framework/templates/config.json`
**Pattern:** Follow the existing template config structure. The template has all the same sections as the project config.

Add the same `complexity` section as in Task 4 to the template config, after the `harness` section (after line 71, before the final `}`). The content is identical to Task 4.

**Verification:**
- [ ] Template `config.json` is valid JSON
- [ ] Template has `complexity` section identical to project config
- [ ] Both configs are structurally valid

### Task 6: Update STATE.md Template to Support 5 Levels

**Goal:** Expand the Task Complexity field in the STATE.md template from 3 levels to 5 levels.
**Files:** `packages/luca-framework/templates/framework/templates/state.md`
**Pattern:** The current template has `Task Complexity: [TRIVIAL / MODERATE / COMPLEX]` on line 31 of the file template section.

Make the following changes:

1. **Line 31 of the file template** (inside the markdown code block): Change:
   ```
   Task Complexity: [TRIVIAL / MODERATE / COMPLEX] (classified [YYYY-MM-DD HH:MM])
   ```
   To:
   ```
   Task Complexity: [TRIVIAL / SIMPLE / MODERATE / COMPLEX / CRITICAL] (classified [YYYY-MM-DD HH:MM])
   ```

2. **Line 175 of the Current Position section** (in the `<sections>` block): Change the reference from `(TRIVIAL/MODERATE/COMPLEX)` to `(TRIVIAL/SIMPLE/MODERATE/COMPLEX/CRITICAL)`:
   ```
   - Task Complexity — classification from cognitive pre-flight (TRIVIAL/SIMPLE/MODERATE/COMPLEX/CRITICAL)
   ```

**Verification:**
- [ ] File template shows 5 levels: TRIVIAL / SIMPLE / MODERATE / COMPLEX / CRITICAL
- [ ] Sections block references all 5 levels
- [ ] No other content is changed

### Task 7: Write Tests for Complexity Types and Defaults

**Goal:** Create tests validating the type definitions, default configuration structure, and utility functions.
**Files:** `__tests__/src/complexity/types.test.ts`, `__tests__/src/complexity/defaults.test.ts`
**Pattern:** Follow `__tests__/src/harness/parsers/tsc.test.ts` (import from bun:test, describe/test/expect style)

Create `__tests__/src/complexity/types.test.ts`:

```typescript
import { describe, test, expect } from 'bun:test';
import {
  COMPLEXITY_LEVELS,
  COMPLEXITY_ORDER,
  COMPLEXITY_TIER,
  meetsThreshold,
  getTier,
} from '../../../src/complexity';
import type { ComplexityLevel } from '../../../src/complexity';

describe('complexity levels', () => {
  test('has exactly 5 levels', () => {
    expect(COMPLEXITY_LEVELS).toHaveLength(5);
  });

  test('levels are in order from least to most complex', () => {
    expect(COMPLEXITY_LEVELS).toEqual(['TRIVIAL', 'SIMPLE', 'MODERATE', 'COMPLEX', 'CRITICAL']);
  });

  test('COMPLEXITY_ORDER maps each level to a numeric index', () => {
    expect(COMPLEXITY_ORDER.TRIVIAL).toBe(0);
    expect(COMPLEXITY_ORDER.SIMPLE).toBe(1);
    expect(COMPLEXITY_ORDER.MODERATE).toBe(2);
    expect(COMPLEXITY_ORDER.COMPLEX).toBe(3);
    expect(COMPLEXITY_ORDER.CRITICAL).toBe(4);
  });
});

describe('complexity tiers', () => {
  test('TRIVIAL and SIMPLE are lightweight', () => {
    expect(COMPLEXITY_TIER.TRIVIAL).toBe('lightweight');
    expect(COMPLEXITY_TIER.SIMPLE).toBe('lightweight');
  });

  test('MODERATE is standard', () => {
    expect(COMPLEXITY_TIER.MODERATE).toBe('standard');
  });

  test('COMPLEX and CRITICAL are thorough', () => {
    expect(COMPLEXITY_TIER.COMPLEX).toBe('thorough');
    expect(COMPLEXITY_TIER.CRITICAL).toBe('thorough');
  });

  test('getTier returns correct tier', () => {
    expect(getTier('TRIVIAL')).toBe('lightweight');
    expect(getTier('MODERATE')).toBe('standard');
    expect(getTier('CRITICAL')).toBe('thorough');
  });
});

describe('meetsThreshold', () => {
  test('same level meets its own threshold', () => {
    for (const level of COMPLEXITY_LEVELS) {
      expect(meetsThreshold(level, level)).toBe(true);
    }
  });

  test('higher level meets lower threshold', () => {
    expect(meetsThreshold('COMPLEX', 'SIMPLE')).toBe(true);
    expect(meetsThreshold('MODERATE', 'TRIVIAL')).toBe(true);
    expect(meetsThreshold('CRITICAL', 'MODERATE')).toBe(true);
  });

  test('lower level does not meet higher threshold', () => {
    expect(meetsThreshold('TRIVIAL', 'SIMPLE')).toBe(false);
    expect(meetsThreshold('SIMPLE', 'MODERATE')).toBe(false);
    expect(meetsThreshold('MODERATE', 'COMPLEX')).toBe(false);
    expect(meetsThreshold('COMPLEX', 'CRITICAL')).toBe(false);
  });
});
```

Create `__tests__/src/complexity/defaults.test.ts`:

```typescript
import { describe, test, expect } from 'bun:test';
import {
  COMPLEXITY_CLASSIFICATIONS,
  DEFAULT_COMPLEXITY_MATRIX,
  DEFAULT_COMPLEXITY_CONFIG,
  COMPLEXITY_LEVELS,
} from '../../../src/complexity';

describe('complexity classifications', () => {
  test('has classifications for all 5 levels', () => {
    for (const level of COMPLEXITY_LEVELS) {
      expect(COMPLEXITY_CLASSIFICATIONS).toHaveProperty(level);
    }
  });

  test('each classification has required fields', () => {
    for (const level of COMPLEXITY_LEVELS) {
      const c = COMPLEXITY_CLASSIFICATIONS[level];
      expect(c.level).toBe(level);
      expect(typeof c.fileCount).toBe('string');
      expect(typeof c.scope).toBe('string');
      expect(typeof c.risk).toBe('string');
      expect(typeof c.estimatedTime).toBe('string');
      expect(c.examples.length).toBeGreaterThan(0);
    }
  });
});

describe('default complexity matrix', () => {
  test('has entries for all 5 levels', () => {
    for (const level of COMPLEXITY_LEVELS) {
      expect(DEFAULT_COMPLEXITY_MATRIX).toHaveProperty(level);
    }
  });

  test('TRIVIAL skips most optional steps', () => {
    const gate = DEFAULT_COMPLEXITY_MATRIX.TRIVIAL;
    expect(gate.research).toBe('skip');
    expect(gate.discussion).toBe('skip');
    expect(gate.planVerificationIterations).toBe(0);
    expect(gate.codeReviewAgents).toEqual([]);
    expect(gate.uat).toBe('skip');
    expect(gate.learningCapture).toBe('skip');
    expect(gate.cognitivePreflight).toBe('lite');
  });

  test('MODERATE has standard settings', () => {
    const gate = DEFAULT_COMPLEXITY_MATRIX.MODERATE;
    expect(gate.research).toBe('optional');
    expect(gate.verificationMode).toBe('standard');
    expect(gate.planVerificationIterations).toBe(1);
    expect(gate.codeReviewAgents.length).toBeGreaterThan(0);
    expect(gate.cognitivePreflight).toBe('full');
  });

  test('CRITICAL enables everything with max settings', () => {
    const gate = DEFAULT_COMPLEXITY_MATRIX.CRITICAL;
    expect(gate.research).toBe('required');
    expect(gate.discussion).toBe('required');
    expect(gate.planVerificationIterations).toBe(3);
    expect(gate.harnessFixIterations).toBe(5);
    expect(gate.verificationMode).toBe('full+human');
    expect(gate.codeReviewAgents).toContain('security-auditor');
    expect(gate.uat).toBe('required+thorough');
    expect(gate.learningCapture).toBe('full+debrief');
  });

  test('harness fix iterations scale with complexity', () => {
    expect(DEFAULT_COMPLEXITY_MATRIX.TRIVIAL.harnessFixIterations).toBe(1);
    expect(DEFAULT_COMPLEXITY_MATRIX.SIMPLE.harnessFixIterations).toBe(2);
    expect(DEFAULT_COMPLEXITY_MATRIX.MODERATE.harnessFixIterations).toBe(3);
    expect(DEFAULT_COMPLEXITY_MATRIX.COMPLEX.harnessFixIterations).toBe(3);
    expect(DEFAULT_COMPLEXITY_MATRIX.CRITICAL.harnessFixIterations).toBe(5);
  });
});

describe('default complexity config', () => {
  test('defaultLevel is auto', () => {
    expect(DEFAULT_COMPLEXITY_CONFIG.defaultLevel).toBe('auto');
  });

  test('contains the full matrix', () => {
    expect(Object.keys(DEFAULT_COMPLEXITY_CONFIG.matrix)).toHaveLength(5);
  });
});
```

Run tests:

```bash
bun test __tests__/src/complexity/
```

**Verification:**
- [ ] All complexity type tests pass
- [ ] All complexity default tests pass
- [ ] No regressions in existing tests: `bun test` shows same 6 pre-existing failures
- [ ] TypeScript compilation clean: `bunx --bun tsc --noEmit`

## Exit Criteria

- [ ] `src/complexity/` directory exists with `types.ts`, `defaults.ts`, `index.ts`
- [ ] TypeScript types define 5 complexity levels with utility functions
- [ ] Default matrix maps all 5 levels to gating configuration
- [ ] Classification criteria defined for lu-router consumption
- [ ] `.planning/config.json` has `complexity` section
- [ ] Template `config.json` has `complexity` section
- [ ] STATE.md template supports 5 levels
- [ ] Root `index.ts` exports complexity API
- [ ] All new tests pass
- [ ] No regressions in existing tests

## Dependencies

- None (this is Wave 1, no prior plans needed)
- Requires: `bun` runtime, existing project structure
