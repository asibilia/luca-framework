---
id: 18-01
title: Foundation Types & Defaults
phase: 18-usage-aware-sprint-planner
wave: 1
delivers: PLAN-01 (partial), PLAN-02 (partial), PLAN-03 (partial), PLAN-06 (partial)
depends_on: null
tasks: 4
---

# Plan 18-01: Foundation Types & Defaults

## Objective

Create the `src/planner/` module with foundational Zod schema definitions, inferred TypeScript types, default constants, and barrel exports for all planner-related data structures: quality zones, WSJF scoring, effort estimation, session plans, weekly plans, token cost tracking, and planner configuration. This plan establishes the type vocabulary that all subsequent Phase 18 plans import. No existing files are modified -- only new files are created.

## Context

- **Module pattern precedent:** `src/iteration/` (types.ts + defaults.ts + utility files + index.ts + co-located tests)
- **Result envelope precedent:** `src/context/result-envelope.ts` (Zod schemas with snake_case for API, `z.infer` for types)
- **Complexity type precedent:** `src/complexity/types.ts` (COMPLEXITY_LEVELS as const -> type, COMPLEXITY_ORDER record)
- **Existing ComplexityLevel:** `src/complexity/types.ts` (TRIVIAL, SIMPLE, MODERATE, COMPLEX, CRITICAL)
- **Phase 18 locked decisions:** 18-CONTEXT.md (12 decisions)
- **Phase 18 research:** 18-RESEARCH.md (module patterns, schema conventions, todo file format)
- **API snake_case rule:** `.claude/rules/api-snake-case.md` -- all data schemas use snake_case properties
- **Zod schema-first rule:** `.claude/rules/schema-first-parsing.md` -- all types derived via `z.infer`

## Design Decisions Applied

1. **Zod schemas as single source of truth** (project convention): All types derived via `z.infer`, no separate interfaces that could drift
2. **snake_case for data schemas** (API convention rule): All planner schemas use snake_case property names
3. **Functional patterns only** (no-classes rule): Type definitions only, no classes
4. **Constants-first enums** (codebase convention): `const array as const` -> `z.enum` -> `z.infer`
5. **Effort as complexity proxy** (18-CONTEXT.md Decision 2): TRIVIAL=1, SIMPLE=2, MODERATE=3, COMPLEX=5, CRITICAL=8
6. **Quality zones are advisory** (18-CONTEXT.md Decision 6): Labels only, not enforced
7. **Import ComplexityLevel from existing module** (functional-api-reuse rule): Reuse `src/complexity/types.ts`

## Files

### Create

- `src/planner/types.ts` -- All Zod schemas and inferred types for the planner module
- `src/planner/defaults.ts` -- Effort mappings, zone boundaries, weekly ratios, default config
- `src/planner/index.ts` -- Public API barrel export (initially re-exports types and defaults only)
- `src/planner/types.test.ts` -- Schema validation tests
- `src/planner/defaults.test.ts` -- Default value tests

## Tasks

### Task 1: Create src/planner/types.ts -- Core Type Definitions

**Goal:** Define all Zod schemas and derived types for the planner module. These types are consumed by scoring.ts, scheduler.ts, weekly.ts, and the lu-pm-planner agent.

**File:** `src/planner/types.ts` (new)

Define the following schemas and types in order:

**1. Quality Zones:**

```typescript
import { z } from "zod";

/**
 * Quality zones based on context usage percentage.
 *
 * Zones are advisory labels that inform scheduling decisions.
 * They correspond to the quality degradation curve:
 * - peak: 0-30% context -- best for complex work
 * - good: 30-50% context -- solid for moderate work
 * - degrading: 50-70% context -- simple/quick tasks only
 * - stop: 70%+ context -- halt, quality too low
 */
export const QUALITY_ZONES = ["peak", "good", "degrading", "stop"] as const;
export const qualityZoneSchema = z.enum(QUALITY_ZONES);
export type QualityZone = z.infer<typeof qualityZoneSchema>;
```

**2. Quality Zone Boundary:**

```typescript
/**
 * Defines the context percentage boundaries for a quality zone.
 *
 * Uses snake_case for data schema compatibility.
 */
export const zoneBoundarySchema = z.object({
  /** Zone name */
  zone: qualityZoneSchema,
  /** Start percentage (inclusive) */
  start_percent: z.number().min(0).max(100),
  /** End percentage (exclusive, except for 'stop' which has no end) */
  end_percent: z.number().min(0).max(100),
  /** Human-readable description of zone suitability */
  description: z.string(),
});
export type ZoneBoundary = z.infer<typeof zoneBoundarySchema>;
```

**3. Effort Points (complexity-level proxy):**

```typescript
/**
 * Effort point values mapped from complexity levels.
 *
 * Uses the Fibonacci-like proxy from 18-CONTEXT.md Decision 2:
 * TRIVIAL=1, SIMPLE=2, MODERATE=3, COMPLEX=5, CRITICAL=8
 */
export const EFFORT_POINTS = [1, 2, 3, 5, 8] as const;
export const effortPointsSchema = z.number().int().positive();
export type EffortPoints = z.infer<typeof effortPointsSchema>;
```

**4. WSJF Input Scores:**

```typescript
/**
 * WSJF (Weighted Shortest Job First) input components.
 *
 * Each factor is scored 1-10 by the PM agent.
 * Final WSJF = (business_value + time_criticality + risk_reduction) / effort_points.
 *
 * Uses snake_case for data schema compatibility.
 */
export const wsjfInputSchema = z.object({
  /** Business value if completed (1-10) */
  business_value: z.number().int().min(1).max(10),
  /** Time sensitivity -- how much value decays with delay (1-10) */
  time_criticality: z.number().int().min(1).max(10),
  /** Risk or opportunity cost if not done (1-10) */
  risk_reduction: z.number().int().min(1).max(10),
  /** Effort proxy derived from complexity level */
  effort_points: effortPointsSchema,
});
export type WSJFInput = z.infer<typeof wsjfInputSchema>;
```

**5. WSJF Scored Item:**

```typescript
/**
 * A todo item with computed WSJF score and metadata.
 *
 * Uses snake_case for data schema compatibility.
 */
export const wsjfScoredItemSchema = z.object({
  /** Path to the todo markdown file */
  todo_path: z.string(),
  /** Title extracted from YAML frontmatter */
  title: z.string(),
  /** Area/category from YAML frontmatter */
  area: z.string(),
  /** WSJF input scores */
  wsjf_inputs: wsjfInputSchema,
  /** Computed WSJF score: (BV + TC + RR) / effort */
  wsjf_score: z.number().nonnegative(),
  /** Inferred complexity level */
  complexity: z.string(),
  /** Whether this item has no unresolved dependencies */
  dependency_free: z.boolean(),
  /** Advisory quality zone assignment */
  assigned_zone: qualityZoneSchema.optional(),
});
export type WSJFScoredItem = z.infer<typeof wsjfScoredItemSchema>;
```

**6. Session Plan:**

```typescript
/**
 * A session plan: ordered list of todos for a single 3-hour window.
 *
 * The plan includes a Big Rock first item, WSJF-ordered tail,
 * quality zone assignments, and a Mermaid gantt chart.
 *
 * Uses snake_case for data schema compatibility.
 */
export const sessionPlanSchema = z.object({
  /** ISO 8601 timestamp when the plan was generated */
  generated_at: z.string(),
  /** Session duration cap in minutes (default 180) */
  session_cap_minutes: z.number().int().positive().default(180),
  /** Total estimated effort points in this session */
  total_effort_points: z.number().int().nonnegative(),
  /** Ordered list of items to execute */
  items: z.array(wsjfScoredItemSchema),
  /** Index of the Big Rock item (always 0 if present) */
  big_rock_index: z.number().int().nonnegative().optional(),
  /** Mermaid gantt chart source */
  mermaid_gantt: z.string().optional(),
  /** Human-readable rationale for the ordering */
  rationale: z.string(),
});
export type SessionPlan = z.infer<typeof sessionPlanSchema>;
```

**7. Weekly Allocation Bucket:**

```typescript
/**
 * Weekly allocation buckets for distributing work across sessions.
 *
 * From 18-CONTEXT.md Decision 5:
 * - needle_movers: 60% (high-impact, dependency-free)
 * - quick_wins: 25% (small, fast to complete)
 * - maintenance: 10% (tech debt, docs, cleanup)
 * - reserve: 5% (buffer for unexpected work)
 */
export const ALLOCATION_BUCKETS = [
  "needle_movers",
  "quick_wins",
  "maintenance",
  "reserve",
] as const;
export const allocationBucketSchema = z.enum(ALLOCATION_BUCKETS);
export type AllocationBucket = z.infer<typeof allocationBucketSchema>;
```

**8. Weekly Plan:**

```typescript
/**
 * A weekly plan distributing work across multiple sessions.
 *
 * Uses snake_case for data schema compatibility.
 */
export const weeklyPlanSchema = z.object({
  /** ISO 8601 timestamp when the plan was generated */
  generated_at: z.string(),
  /** Number of sessions planned for this week */
  sessions_planned: z.number().int().positive(),
  /** Per-bucket allocation as percentage */
  allocation: z.object({
    needle_movers: z.number().min(0).max(100),
    quick_wins: z.number().min(0).max(100),
    maintenance: z.number().min(0).max(100),
    reserve: z.number().min(0).max(100),
  }),
  /** Per-session plans (ordered by priority) */
  sessions: z.array(sessionPlanSchema),
  /** Items deferred beyond this week */
  deferred: z.array(wsjfScoredItemSchema),
  /** Total effort points across all sessions */
  total_effort_points: z.number().int().nonnegative(),
});
export type WeeklyPlan = z.infer<typeof weeklyPlanSchema>;
```

**9. Token Cost Estimate:**

```typescript
/**
 * Token cost estimation entry for a task type.
 *
 * Tracks estimated vs actual context percentage consumed,
 * allowing calibration over time via MEMORY.md entries.
 *
 * Uses snake_case for data schema compatibility.
 */
export const tokenCostEstimateSchema = z.object({
  /** Complexity level this estimate applies to */
  complexity: z.string(),
  /** Estimated context percentage consumed */
  estimated_context_percent: z.number().min(0).max(100),
  /** Actual context percentage consumed (filled after execution) */
  actual_context_percent: z.number().min(0).max(100).optional(),
  /** Number of observations for this complexity level */
  sample_count: z.number().int().nonnegative().default(0),
  /** Source of the estimate: "cold_start" for defaults, "calibrated" for learned values */
  source: z.enum(["cold_start", "calibrated"]).default("cold_start"),
});
export type TokenCostEstimate = z.infer<typeof tokenCostEstimateSchema>;
```

**10. Planner Config Schema:**

```typescript
/**
 * Configuration section for planner behavior in .planning/config.json.
 *
 * Uses snake_case for config file compatibility.
 */
export const plannerConfigSchema = z.object({
  /** Session duration cap in minutes */
  session_cap_minutes: z.number().int().positive().default(180),
  /** Weekly allocation percentages */
  weekly_allocation: z
    .object({
      needle_movers: z.number().min(0).max(100).default(60),
      quick_wins: z.number().min(0).max(100).default(25),
      maintenance: z.number().min(0).max(100).default(10),
      reserve: z.number().min(0).max(100).default(5),
    })
    .default({}),
  /** Quality zone boundaries (context percentage thresholds) */
  zone_boundaries: z
    .object({
      peak_end: z.number().min(0).max(100).default(30),
      good_end: z.number().min(0).max(100).default(50),
      degrading_end: z.number().min(0).max(100).default(70),
    })
    .default({}),
  /** Cold-start token cost estimates (context percentage per complexity level) */
  cold_start_costs: z
    .object({
      TRIVIAL: z.number().min(0).max(100).default(5),
      SIMPLE: z.number().min(0).max(100).default(10),
      MODERATE: z.number().min(0).max(100).default(20),
      COMPLEX: z.number().min(0).max(100).default(35),
      CRITICAL: z.number().min(0).max(100).default(50),
    })
    .default({}),
});
export type PlannerConfig = z.infer<typeof plannerConfigSchema>;
```

**11. Todo File Metadata:**

```typescript
/**
 * Parsed metadata from a todo markdown file's YAML frontmatter.
 *
 * Todo files have 4 YAML frontmatter fields:
 * title, area, created, source.
 *
 * Uses snake_case for data schema compatibility.
 */
export const todoMetadataSchema = z.object({
  /** Title of the todo item */
  title: z.string(),
  /** Area/category (e.g., "workflow", "performance", "security") */
  area: z.string(),
  /** ISO date when the todo was created */
  created: z.string(),
  /** Origin of the todo (e.g., "conversation", "retrospective") */
  source: z.string(),
  /** File path of the todo markdown file */
  file_path: z.string(),
  /** Raw body content of the todo (below frontmatter) */
  body: z.string().optional(),
});
export type TodoMetadata = z.infer<typeof todoMetadataSchema>;
```

**Import requirements at the top of the file:**

```typescript
import { z } from "zod";
```

Note: This file does NOT import from `src/complexity/types.ts`. The complexity level string is used as a plain `z.string()` in schemas to avoid coupling the planner types to the complexity module at the type level. The mapping from ComplexityLevel to effort points lives in defaults.ts.

### Task 2: Create src/planner/defaults.ts -- Default Constants

**Goal:** Create default values for effort mappings, zone boundaries, weekly allocation ratios, cold-start token cost estimates, and the full default planner config.

**File:** `src/planner/defaults.ts` (new)

Define the following constants:

```typescript
import type { ComplexityLevel } from "../complexity/types";
import type {
  EffortPoints,
  PlannerConfig,
  QualityZone,
  ZoneBoundary,
} from "./types";
import { plannerConfigSchema } from "./types";

/**
 * Maps each complexity level to its effort point value.
 *
 * Uses Fibonacci-like proxy per 18-CONTEXT.md Decision 2:
 * TRIVIAL=1, SIMPLE=2, MODERATE=3, COMPLEX=5, CRITICAL=8
 */
export const EFFORT_MAP: Record<ComplexityLevel, EffortPoints> = {
  TRIVIAL: 1,
  SIMPLE: 2,
  MODERATE: 3,
  COMPLEX: 5,
  CRITICAL: 8,
};

/**
 * Quality zone boundaries defining context percentage ranges.
 *
 * Zones are advisory labels per 18-CONTEXT.md Decision 6.
 */
export const DEFAULT_ZONE_BOUNDARIES: ZoneBoundary[] = [
  {
    zone: "peak",
    start_percent: 0,
    end_percent: 30,
    description: "Best for complex, high-impact work",
  },
  {
    zone: "good",
    start_percent: 30,
    end_percent: 50,
    description: "Solid for moderate complexity work",
  },
  {
    zone: "degrading",
    start_percent: 50,
    end_percent: 70,
    description: "Simple and quick tasks only",
  },
  {
    zone: "stop",
    start_percent: 70,
    end_percent: 100,
    description: "Quality too low -- halt work",
  },
];

/**
 * Maps complexity levels to their recommended quality zone.
 *
 * Complex and critical work should be scheduled in the peak zone.
 * Simple and trivial work can be scheduled in the degrading zone.
 */
export const COMPLEXITY_ZONE_MAP: Record<ComplexityLevel, QualityZone> = {
  TRIVIAL: "degrading",
  SIMPLE: "good",
  MODERATE: "good",
  COMPLEX: "peak",
  CRITICAL: "peak",
};

/**
 * Default weekly allocation percentages.
 *
 * Per 18-CONTEXT.md Decision 5:
 * - 60% needle movers (high-impact, dependency-free)
 * - 25% quick wins (small, fast to complete)
 * - 10% maintenance (tech debt, docs, cleanup)
 * -  5% reserve (buffer for unexpected work)
 */
export const DEFAULT_WEEKLY_ALLOCATION = {
  needle_movers: 60,
  quick_wins: 25,
  maintenance: 10,
  reserve: 5,
} as const;

/**
 * Cold-start token cost estimates as context percentage per complexity level.
 *
 * These are initial guesses, calibrated over time via MEMORY.md entries.
 * Per 18-CONTEXT.md Decision 8.
 */
export const COLD_START_COSTS: Record<ComplexityLevel, number> = {
  TRIVIAL: 5,
  SIMPLE: 10,
  MODERATE: 20,
  COMPLEX: 35,
  CRITICAL: 50,
};

/**
 * Default planner configuration.
 *
 * Parsed through plannerConfigSchema to apply all Zod defaults.
 */
export const DEFAULT_PLANNER_CONFIG: PlannerConfig = plannerConfigSchema.parse(
  {},
);

/**
 * Session duration cap in minutes (3-hour rolling window).
 *
 * Per 18-CONTEXT.md Decision 1.
 */
export const DEFAULT_SESSION_CAP_MINUTES = 180;

/**
 * Maximum context percentage before recommending session stop.
 */
export const MAX_CONTEXT_PERCENT = 70;
```

### Task 3: Create src/planner/index.ts -- Barrel Export

**Goal:** Create the public API barrel export for the planner module. Initially re-exports all schemas, types, and defaults. Subsequent plans (18-02, 18-03) will add function exports here.

**File:** `src/planner/index.ts` (new)

```typescript
/**
 * Planner module for the Luca usage-aware sprint planning system.
 *
 * Provides session and weekly planning utilities that optimize todo
 * backlog execution within Claude Code's usage constraints.
 * The PM agent produces plans; it cannot execute changes (read-only).
 *
 * Sub-modules:
 * - types: Zod schemas and TypeScript types
 * - defaults: Effort mappings, zone boundaries, weekly ratios
 * - scoring: WSJF scoring engine (added in Plan 18-02)
 * - scheduler: Session scheduling (added in Plan 18-03)
 * - weekly: Weekly planner (added in Plan 18-05)
 */

// Types and schemas
export {
  // Quality zones
  QUALITY_ZONES,
  qualityZoneSchema,
  zoneBoundarySchema,
  // Effort
  EFFORT_POINTS,
  effortPointsSchema,
  // WSJF
  wsjfInputSchema,
  wsjfScoredItemSchema,
  // Session plan
  sessionPlanSchema,
  // Weekly plan
  ALLOCATION_BUCKETS,
  allocationBucketSchema,
  weeklyPlanSchema,
  // Token cost
  tokenCostEstimateSchema,
  // Configuration
  plannerConfigSchema,
  // Todo metadata
  todoMetadataSchema,
} from "./types";

export type {
  QualityZone,
  ZoneBoundary,
  EffortPoints,
  WSJFInput,
  WSJFScoredItem,
  SessionPlan,
  AllocationBucket,
  WeeklyPlan,
  TokenCostEstimate,
  PlannerConfig,
  TodoMetadata,
} from "./types";

// Defaults
export {
  EFFORT_MAP,
  DEFAULT_ZONE_BOUNDARIES,
  COMPLEXITY_ZONE_MAP,
  DEFAULT_WEEKLY_ALLOCATION,
  COLD_START_COSTS,
  DEFAULT_PLANNER_CONFIG,
  DEFAULT_SESSION_CAP_MINUTES,
  MAX_CONTEXT_PERCENT,
} from "./defaults";
```

### Task 4: Write tests for types and defaults

**Goal:** Ensure schemas parse correctly and defaults have expected values.

**File:** `src/planner/types.test.ts` (new)

Create tests validating:

```typescript
import { describe, test, expect } from "bun:test";
import {
  wsjfInputSchema,
  wsjfScoredItemSchema,
  sessionPlanSchema,
  weeklyPlanSchema,
  tokenCostEstimateSchema,
  plannerConfigSchema,
  todoMetadataSchema,
  zoneBoundarySchema,
  qualityZoneSchema,
} from "./types";

describe("planner types", () => {
  test("qualityZoneSchema accepts valid zones", () => {
    for (const zone of ["peak", "good", "degrading", "stop"]) {
      expect(qualityZoneSchema.safeParse(zone).success).toBe(true);
    }
  });

  test("qualityZoneSchema rejects invalid zone", () => {
    expect(qualityZoneSchema.safeParse("excellent").success).toBe(false);
  });

  test("zoneBoundarySchema parses valid boundary", () => {
    const result = zoneBoundarySchema.safeParse({
      zone: "peak",
      start_percent: 0,
      end_percent: 30,
      description: "Best for complex work",
    });
    expect(result.success).toBe(true);
  });

  test("wsjfInputSchema parses valid inputs", () => {
    const result = wsjfInputSchema.safeParse({
      business_value: 8,
      time_criticality: 5,
      risk_reduction: 3,
      effort_points: 5,
    });
    expect(result.success).toBe(true);
  });

  test("wsjfInputSchema rejects out-of-range values", () => {
    const result = wsjfInputSchema.safeParse({
      business_value: 11, // max 10
      time_criticality: 5,
      risk_reduction: 3,
      effort_points: 5,
    });
    expect(result.success).toBe(false);
  });

  test("wsjfInputSchema rejects zero effort_points", () => {
    const result = wsjfInputSchema.safeParse({
      business_value: 5,
      time_criticality: 5,
      risk_reduction: 5,
      effort_points: 0,
    });
    expect(result.success).toBe(false);
  });

  test("wsjfScoredItemSchema parses valid scored item", () => {
    const result = wsjfScoredItemSchema.safeParse({
      todo_path: ".planning/todos/pending/some-task.md",
      title: "Some task",
      area: "workflow",
      wsjf_inputs: {
        business_value: 8,
        time_criticality: 5,
        risk_reduction: 3,
        effort_points: 5,
      },
      wsjf_score: 3.2,
      complexity: "COMPLEX",
      dependency_free: true,
    });
    expect(result.success).toBe(true);
  });

  test("sessionPlanSchema applies default session_cap_minutes", () => {
    const result = sessionPlanSchema.parse({
      generated_at: "2026-02-11T12:00:00Z",
      total_effort_points: 10,
      items: [],
      rationale: "Test plan",
    });
    expect(result.session_cap_minutes).toBe(180);
  });

  test("weeklyPlanSchema parses valid weekly plan", () => {
    const result = weeklyPlanSchema.safeParse({
      generated_at: "2026-02-11T12:00:00Z",
      sessions_planned: 3,
      allocation: {
        needle_movers: 60,
        quick_wins: 25,
        maintenance: 10,
        reserve: 5,
      },
      sessions: [],
      deferred: [],
      total_effort_points: 30,
    });
    expect(result.success).toBe(true);
  });

  test("tokenCostEstimateSchema applies defaults", () => {
    const result = tokenCostEstimateSchema.parse({
      complexity: "MODERATE",
      estimated_context_percent: 20,
    });
    expect(result.sample_count).toBe(0);
    expect(result.source).toBe("cold_start");
  });

  test("plannerConfigSchema applies all defaults", () => {
    const result = plannerConfigSchema.parse({});
    expect(result.session_cap_minutes).toBe(180);
    expect(result.weekly_allocation.needle_movers).toBe(60);
    expect(result.weekly_allocation.quick_wins).toBe(25);
    expect(result.weekly_allocation.maintenance).toBe(10);
    expect(result.weekly_allocation.reserve).toBe(5);
    expect(result.zone_boundaries.peak_end).toBe(30);
    expect(result.zone_boundaries.good_end).toBe(50);
    expect(result.zone_boundaries.degrading_end).toBe(70);
    expect(result.cold_start_costs.TRIVIAL).toBe(5);
    expect(result.cold_start_costs.CRITICAL).toBe(50);
  });

  test("todoMetadataSchema parses valid todo metadata", () => {
    const result = todoMetadataSchema.safeParse({
      title: "Usage-aware sprint planner",
      area: "workflow",
      created: "2026-02-11",
      source: "conversation",
      file_path: ".planning/todos/pending/usage-aware-sprint-planner.md",
    });
    expect(result.success).toBe(true);
  });

  test("todoMetadataSchema rejects missing required fields", () => {
    const result = todoMetadataSchema.safeParse({
      title: "Missing fields",
    });
    expect(result.success).toBe(false);
  });
});
```

**File:** `src/planner/defaults.test.ts` (new)

```typescript
import { describe, test, expect } from "bun:test";
import {
  EFFORT_MAP,
  DEFAULT_ZONE_BOUNDARIES,
  COMPLEXITY_ZONE_MAP,
  DEFAULT_WEEKLY_ALLOCATION,
  COLD_START_COSTS,
  DEFAULT_PLANNER_CONFIG,
  DEFAULT_SESSION_CAP_MINUTES,
  MAX_CONTEXT_PERCENT,
} from "./defaults";

describe("planner defaults", () => {
  test("EFFORT_MAP has correct Fibonacci-like values", () => {
    expect(EFFORT_MAP.TRIVIAL).toBe(1);
    expect(EFFORT_MAP.SIMPLE).toBe(2);
    expect(EFFORT_MAP.MODERATE).toBe(3);
    expect(EFFORT_MAP.COMPLEX).toBe(5);
    expect(EFFORT_MAP.CRITICAL).toBe(8);
  });

  test("EFFORT_MAP covers all 5 complexity levels", () => {
    expect(Object.keys(EFFORT_MAP)).toHaveLength(5);
  });

  test("DEFAULT_ZONE_BOUNDARIES covers 0-100%", () => {
    expect(DEFAULT_ZONE_BOUNDARIES).toHaveLength(4);
    expect(DEFAULT_ZONE_BOUNDARIES[0].start_percent).toBe(0);
    expect(DEFAULT_ZONE_BOUNDARIES[3].end_percent).toBe(100);
  });

  test("DEFAULT_ZONE_BOUNDARIES zones are contiguous", () => {
    for (let i = 1; i < DEFAULT_ZONE_BOUNDARIES.length; i++) {
      expect(DEFAULT_ZONE_BOUNDARIES[i].start_percent).toBe(
        DEFAULT_ZONE_BOUNDARIES[i - 1].end_percent,
      );
    }
  });

  test("COMPLEXITY_ZONE_MAP assigns complex/critical to peak", () => {
    expect(COMPLEXITY_ZONE_MAP.COMPLEX).toBe("peak");
    expect(COMPLEXITY_ZONE_MAP.CRITICAL).toBe("peak");
  });

  test("COMPLEXITY_ZONE_MAP assigns trivial to degrading", () => {
    expect(COMPLEXITY_ZONE_MAP.TRIVIAL).toBe("degrading");
  });

  test("DEFAULT_WEEKLY_ALLOCATION sums to 100%", () => {
    const total =
      DEFAULT_WEEKLY_ALLOCATION.needle_movers +
      DEFAULT_WEEKLY_ALLOCATION.quick_wins +
      DEFAULT_WEEKLY_ALLOCATION.maintenance +
      DEFAULT_WEEKLY_ALLOCATION.reserve;
    expect(total).toBe(100);
  });

  test("DEFAULT_WEEKLY_ALLOCATION matches 60/25/10/5 split", () => {
    expect(DEFAULT_WEEKLY_ALLOCATION.needle_movers).toBe(60);
    expect(DEFAULT_WEEKLY_ALLOCATION.quick_wins).toBe(25);
    expect(DEFAULT_WEEKLY_ALLOCATION.maintenance).toBe(10);
    expect(DEFAULT_WEEKLY_ALLOCATION.reserve).toBe(5);
  });

  test("COLD_START_COSTS increase with complexity", () => {
    expect(COLD_START_COSTS.TRIVIAL).toBeLessThan(COLD_START_COSTS.SIMPLE);
    expect(COLD_START_COSTS.SIMPLE).toBeLessThan(COLD_START_COSTS.MODERATE);
    expect(COLD_START_COSTS.MODERATE).toBeLessThan(COLD_START_COSTS.COMPLEX);
    expect(COLD_START_COSTS.COMPLEX).toBeLessThan(COLD_START_COSTS.CRITICAL);
  });

  test("DEFAULT_PLANNER_CONFIG is a valid PlannerConfig", () => {
    expect(DEFAULT_PLANNER_CONFIG.session_cap_minutes).toBe(180);
    expect(DEFAULT_PLANNER_CONFIG.weekly_allocation.needle_movers).toBe(60);
  });

  test("DEFAULT_SESSION_CAP_MINUTES is 180 (3 hours)", () => {
    expect(DEFAULT_SESSION_CAP_MINUTES).toBe(180);
  });

  test("MAX_CONTEXT_PERCENT is 70", () => {
    expect(MAX_CONTEXT_PERCENT).toBe(70);
  });
});
```

## Verification Criteria

- [ ] `src/planner/types.ts` exists and compiles with zero type errors (`bunx --bun tsc --noEmit`)
- [ ] `src/planner/defaults.ts` exists and compiles with zero type errors
- [ ] `src/planner/index.ts` exists and re-exports all public schemas, types, and defaults
- [ ] All 11 schema definitions are present in types.ts
- [ ] All schemas use snake_case for property names (data schema convention)
- [ ] All types derived via `z.infer<typeof schema>` (no manual interfaces)
- [ ] `bun test src/planner/types.test.ts` passes all tests
- [ ] `bun test src/planner/defaults.test.ts` passes all tests
- [ ] No imports from external modules other than `zod` in types.ts (types module is dependency-free)
- [ ] defaults.ts imports ComplexityLevel from `src/complexity/types.ts`
- [ ] Zod defaults work correctly for plannerConfigSchema, sessionPlanSchema, and tokenCostEstimateSchema
- [ ] EFFORT_MAP values match TRIVIAL=1, SIMPLE=2, MODERATE=3, COMPLEX=5, CRITICAL=8
- [ ] DEFAULT_WEEKLY_ALLOCATION sums to 100%
- [ ] DEFAULT_ZONE_BOUNDARIES covers contiguous 0-100% range
