---
id: 18-03
title: Session Scheduler
phase: 18-usage-aware-sprint-planner
wave: 2
delivers: PLAN-01, PLAN-02, PLAN-04
depends_on:
  - 18-01
tasks: 3
---

# Plan 18-03: Session Scheduler

## Objective

Implement the session scheduling engine in `src/planner/scheduler.ts`. This module selects the Big Rock (highest-impact dependency-free task), schedules remaining items using WSJF order, assigns advisory quality zones based on cumulative effort, generates a Mermaid gantt chart for the session plan, and fits everything within the 3-hour rolling window. It includes a CLI entry point via `import.meta.main`.

## Context

- **Types from Plan 18-01:** `src/planner/types.ts` (WSJFScoredItem, SessionPlan, QualityZone, ZoneBoundary)
- **Defaults from Plan 18-01:** `src/planner/defaults.ts` (DEFAULT_ZONE_BOUNDARIES, COMPLEXITY_ZONE_MAP, COLD_START_COSTS, DEFAULT_SESSION_CAP_MINUTES, MAX_CONTEXT_PERCENT)
- **Scoring from Plan 18-02:** `src/planner/scoring.ts` (rankByWSJF, computeWSJF) -- parallel dependency, only types needed from 18-01
- **18-CONTEXT.md Decision 1:** Session cap is 3-hour rolling window
- **18-CONTEXT.md Decision 6:** Quality zones are advisory labels, not enforced
- **18-CONTEXT.md Decision 7:** Big Rock First is slot 1, then WSJF tail
- **18-CONTEXT.md Decision 8:** Token cost model v1 uses context % with relative ordering
- **Module pattern precedent:** `src/iteration/convergence.ts` (pure functions, CLI entry point)

## Design Decisions Applied

1. **Big Rock First** (18-CONTEXT.md Decision 7): Session always starts with highest-impact dependency-free task
2. **WSJF tail** (18-CONTEXT.md Decision 7): After Big Rock, remaining items ordered by WSJF descending
3. **Quality zones are advisory** (18-CONTEXT.md Decision 6): assignQualityZones labels items but does not reject scheduling
4. **Context percentage as session budget** (18-CONTEXT.md Decision 8): Cumulative cold-start costs estimate context consumption
5. **Session cap enforced by effort** (18-CONTEXT.md Decision 1): Items added until cumulative estimated context exceeds MAX_CONTEXT_PERCENT
6. **Mermaid gantt for visual planning** (todo design consideration): Optional gantt chart string in session plan output
7. **Pure functions** (no-classes rule): All scheduler functions are stateless
8. **Lodash for sorting** (lodash preference): Use orderBy for stable sort operations

## Files

### Create

- `src/planner/scheduler.ts` -- Session scheduling functions
- `src/planner/scheduler.test.ts` -- Tests for scheduler module

### Modify

- `src/planner/index.ts` -- Add scheduler function exports

## Tasks

### Task 1: Create src/planner/scheduler.ts -- Session Scheduling Engine

**Goal:** Implement Big Rock selection, session scheduling, quality zone assignment, and Mermaid gantt generation.

**File:** `src/planner/scheduler.ts` (new)

**Functions to implement:**

**1. `selectBigRock(items: WSJFScoredItem[]): WSJFScoredItem | null`**

Select the Big Rock -- highest WSJF-scored dependency-free item:

```typescript
import orderBy from "lodash/orderBy";

import type {
  WSJFScoredItem,
  SessionPlan,
  QualityZone,
  ZoneBoundary,
  PlannerConfig,
} from "./types";
import {
  DEFAULT_ZONE_BOUNDARIES,
  COLD_START_COSTS,
  DEFAULT_SESSION_CAP_MINUTES,
  MAX_CONTEXT_PERCENT,
  DEFAULT_PLANNER_CONFIG,
} from "./defaults";
import type { ComplexityLevel } from "../complexity/types";

/**
 * Select the Big Rock: highest WSJF-scored dependency-free item.
 *
 * The Big Rock is the first task in every session -- scheduled during
 * peak quality zone (0-30% context) when AI performance is at its best.
 * Only dependency-free items are eligible (no blocking prerequisites).
 *
 * @param items - Array of WSJF-scored items
 * @returns The Big Rock item, or null if no dependency-free items exist
 */
export function selectBigRock(items: WSJFScoredItem[]): WSJFScoredItem | null {
  const candidates = items.filter((item) => item.dependency_free);
  if (candidates.length === 0) return null;

  const sorted = orderBy(candidates, [(c) => c.wsjf_score], ["desc"]);
  return sorted[0];
}
```

**2. `estimateContextCost(complexity: string, config?: PlannerConfig): number`**

Estimate context percentage cost for a task based on complexity:

```typescript
/**
 * Estimate context percentage cost for a task based on complexity.
 *
 * Uses cold-start cost estimates from config. If complexity is unknown,
 * defaults to MODERATE cost (20%).
 *
 * @param complexity - Complexity level string
 * @param config - Planner configuration (defaults to DEFAULT_PLANNER_CONFIG)
 * @returns Estimated context percentage consumed by this task
 */
export function estimateContextCost(
  complexity: string,
  config: PlannerConfig = DEFAULT_PLANNER_CONFIG,
): number {
  return (
    config.cold_start_costs[
      complexity as keyof typeof config.cold_start_costs
    ] ?? config.cold_start_costs.MODERATE
  );
}
```

**3. `assignQualityZone(cumulativePercent: number, boundaries?: ZoneBoundary[]): QualityZone`**

Determine which quality zone a task falls into based on cumulative context usage:

```typescript
/**
 * Determine quality zone based on cumulative context percentage.
 *
 * Quality zones are advisory labels that help schedule complex work
 * early (peak zone) and simple work later (degrading zone).
 *
 * @param cumulativePercent - Cumulative context percentage at this point
 * @param boundaries - Zone boundary definitions (defaults to DEFAULT_ZONE_BOUNDARIES)
 * @returns The quality zone for this context percentage
 */
export function assignQualityZone(
  cumulativePercent: number,
  boundaries: ZoneBoundary[] = DEFAULT_ZONE_BOUNDARIES,
): QualityZone {
  for (const boundary of boundaries) {
    if (
      cumulativePercent >= boundary.start_percent &&
      cumulativePercent < boundary.end_percent
    ) {
      return boundary.zone;
    }
  }
  return "stop"; // Default to stop if beyond all boundaries
}
```

**4. `scheduleSession(items: WSJFScoredItem[], config?: PlannerConfig): SessionPlan`**

Schedule a session plan with Big Rock First + WSJF tail + quality zones:

```typescript
/**
 * Schedule a session plan with Big Rock First + WSJF tail.
 *
 * Algorithm:
 * 1. Select Big Rock (highest WSJF dependency-free item)
 * 2. Remove Big Rock from remaining pool
 * 3. Sort remaining by WSJF descending
 * 4. Greedily add items until cumulative context cost exceeds MAX_CONTEXT_PERCENT
 * 5. Assign quality zones based on cumulative position
 * 6. Generate Mermaid gantt chart
 *
 * @param items - Array of WSJF-scored items (typically all pending todos)
 * @param config - Planner configuration (defaults to DEFAULT_PLANNER_CONFIG)
 * @returns A complete session plan with ordered items and metadata
 */
export function scheduleSession(
  items: WSJFScoredItem[],
  config: PlannerConfig = DEFAULT_PLANNER_CONFIG,
): SessionPlan {
  const bigRock = selectBigRock(items);

  // Build the ordered queue: Big Rock first, then WSJF tail
  const remaining = bigRock
    ? items.filter((i) => i.todo_path !== bigRock.todo_path)
    : [...items];
  const wsjfTail = orderBy(remaining, [(i) => i.wsjf_score], ["desc"]);

  const queue: WSJFScoredItem[] = bigRock ? [bigRock, ...wsjfTail] : wsjfTail;

  // Greedily fill session until context budget exhausted
  const scheduled: WSJFScoredItem[] = [];
  let cumulativeContextPercent = 0;
  let totalEffort = 0;

  for (const item of queue) {
    const cost = estimateContextCost(item.complexity, config);
    if (
      cumulativeContextPercent + cost > MAX_CONTEXT_PERCENT &&
      scheduled.length > 0
    ) {
      break; // Would exceed budget, stop (but always include at least 1 item)
    }

    // Assign quality zone based on current cumulative position
    const zone = assignQualityZone(cumulativeContextPercent);
    const scheduledItem: WSJFScoredItem = { ...item, assigned_zone: zone };

    scheduled.push(scheduledItem);
    cumulativeContextPercent += cost;
    totalEffort += item.wsjf_inputs.effort_points;
  }

  const mermaidGantt = generateMermaidGantt(scheduled);

  return {
    generated_at: new Date().toISOString(),
    session_cap_minutes: config.session_cap_minutes,
    total_effort_points: totalEffort,
    items: scheduled,
    big_rock_index: bigRock && scheduled.length > 0 ? 0 : undefined,
    mermaid_gantt: mermaidGantt,
    rationale: buildRationale(scheduled, bigRock),
  };
}
```

**5. `generateMermaidGantt(items: WSJFScoredItem[]): string`**

Generate a Mermaid gantt chart string from scheduled items:

```typescript
/**
 * Generate a Mermaid gantt chart string from scheduled items.
 *
 * Each item becomes a task in the gantt chart, sized proportionally
 * to its effort points. Quality zones are shown as section headers.
 *
 * @param items - Ordered array of scheduled items with assigned zones
 * @returns Mermaid gantt chart markdown string
 */
export function generateMermaidGantt(items: WSJFScoredItem[]): string {
  if (items.length === 0) return "";

  const lines: string[] = [
    "gantt",
    "  title Session Plan",
    "  dateFormat X",
    "  axisFormat %s",
  ];

  let currentZone = "";
  let position = 0;

  for (const item of items) {
    const zone = item.assigned_zone ?? "peak";
    if (zone !== currentZone) {
      lines.push(
        `  section ${zone.charAt(0).toUpperCase() + zone.slice(1)} Zone`,
      );
      currentZone = zone;
    }

    const duration = item.wsjf_inputs.effort_points;
    const sanitizedTitle = item.title.replace(/:/g, " -");
    lines.push(
      `  ${sanitizedTitle} :t${position}, ${position}, ${position + duration}`,
    );
    position += duration;
  }

  return lines.join("\n");
}
```

**6. `buildRationale(items: WSJFScoredItem[], bigRock: WSJFScoredItem | null): string`**

Build a human-readable rationale for the session plan ordering:

```typescript
/**
 * Build a human-readable rationale for session plan ordering.
 *
 * @param items - Ordered scheduled items
 * @param bigRock - The Big Rock item (or null)
 * @returns Human-readable rationale string
 */
function buildRationale(
  items: WSJFScoredItem[],
  bigRock: WSJFScoredItem | null,
): string {
  const parts: string[] = [];

  if (bigRock) {
    parts.push(
      `Big Rock First: "${bigRock.title}" (WSJF ${bigRock.wsjf_score.toFixed(1)}, ${bigRock.complexity}) scheduled in peak zone.`,
    );
  }

  const tailCount = bigRock ? items.length - 1 : items.length;
  if (tailCount > 0) {
    parts.push(
      `${tailCount} additional item${tailCount > 1 ? "s" : ""} ordered by WSJF descending.`,
    );
  }

  const totalEffort = items.reduce(
    (sum, i) => sum + i.wsjf_inputs.effort_points,
    0,
  );
  parts.push(`Total effort: ${totalEffort} points.`);

  return parts.join(" ");
}
```

**CLI entry point:**

```typescript
/**
 * CLI entry point for session scheduling.
 *
 * Usage:
 *   bun run src/planner/scheduler.ts schedule \
 *     --items='[{ ... WSJFScoredItem JSON array ... }]'
 *
 *   bun run src/planner/scheduler.ts big-rock \
 *     --items='[{ ... WSJFScoredItem JSON array ... }]'
 *
 *   bun run src/planner/scheduler.ts zone \
 *     --percent=45
 *
 * Outputs JSON result to stdout.
 */
if (import.meta.main) {
  const subcommand = Bun.argv[2];

  const getArg = (name: string): string | undefined => {
    const prefix = `--${name}=`;
    const arg = Bun.argv.find((a) => a.startsWith(prefix));
    return arg ? arg.slice(prefix.length) : undefined;
  };

  if (subcommand === "schedule") {
    const itemsJson = getArg("items") ?? "[]";
    const items: WSJFScoredItem[] = JSON.parse(itemsJson);
    const plan = scheduleSession(items);
    console.log(JSON.stringify(plan, null, 2));
  } else if (subcommand === "big-rock") {
    const itemsJson = getArg("items") ?? "[]";
    const items: WSJFScoredItem[] = JSON.parse(itemsJson);
    const rock = selectBigRock(items);
    console.log(JSON.stringify(rock, null, 2));
  } else if (subcommand === "zone") {
    const percent = Number(getArg("percent") ?? "0");
    const zone = assignQualityZone(percent);
    console.log(JSON.stringify({ percent, zone }, null, 2));
  } else {
    console.error(
      "Usage: bun run scheduler.ts <schedule|big-rock|zone> [options]",
    );
    process.exit(1);
  }
}
```

### Task 2: Create src/planner/scheduler.test.ts

**Goal:** Comprehensive tests for session scheduling functions.

**File:** `src/planner/scheduler.test.ts` (new)

Write tests covering:

1. **selectBigRock:**
   - Returns highest WSJF dependency-free item
   - Returns null when no dependency-free items exist
   - Ignores items with dependency_free=false even if higher WSJF
   - Handles single-item array
   - Handles empty array (returns null)

2. **estimateContextCost:**
   - Returns correct cost for each known complexity level
   - Returns MODERATE cost for unknown complexity string
   - Respects custom config cold_start_costs

3. **assignQualityZone:**
   - Returns "peak" for 0%, 15%, 29%
   - Returns "good" for 30%, 40%, 49%
   - Returns "degrading" for 50%, 60%, 69%
   - Returns "stop" for 70%, 85%, 100%
   - Returns "stop" for values beyond 100%

4. **scheduleSession:**
   - Big Rock is always first item (index 0)
   - Remaining items sorted by WSJF descending
   - Stops adding items when context budget exhausted
   - Always includes at least one item even if it exceeds budget
   - Items have assigned_zone populated
   - Returns valid SessionPlan schema
   - Empty items produces empty session plan
   - big_rock_index is 0 when Big Rock selected, undefined otherwise
   - mermaid_gantt is non-empty when items exist
   - rationale mentions Big Rock title

5. **generateMermaidGantt:**
   - Returns empty string for empty items
   - Contains "gantt" header
   - Contains section headers for each zone
   - Contains task entries with correct durations
   - Task titles have colons replaced with dashes

6. **Integration: schedule -> zone flow:**
   - Create 5 items of varying complexity and WSJF
   - Schedule session and verify Big Rock is COMPLEX/CRITICAL
   - Verify zone assignments progress from peak to good to degrading
   - Verify session stops before total exceeds 70% context

### Task 3: Update src/planner/index.ts -- Add scoring + scheduler exports

**Goal:** Add both scoring and scheduler function exports to the barrel export. This task is consolidated here (instead of split between 18-02 and 18-03) to avoid parallel modification conflicts on `src/planner/index.ts` within Wave 2.

**File:** `src/planner/index.ts` (modify)

Add these exports after the defaults exports:

```typescript
// Scoring engine
export {
  computeWSJF,
  effortFromComplexity,
  rankByWSJF,
  scoreItem,
} from "./scoring";

// Session scheduling
export {
  selectBigRock,
  estimateContextCost,
  assignQualityZone,
  scheduleSession,
  generateMermaidGantt,
} from "./scheduler";
```

## Verification Criteria

- [ ] `src/planner/scheduler.ts` compiles with zero type errors
- [ ] `bun test src/planner/scheduler.test.ts` passes all tests
- [ ] `bun run src/planner/scheduler.ts zone --percent=25` outputs `{ "percent": 25, "zone": "peak" }`
- [ ] `selectBigRock` returns highest WSJF dependency-free item
- [ ] `selectBigRock` returns null for empty/no-dependency-free arrays
- [ ] `scheduleSession` places Big Rock at index 0
- [ ] `scheduleSession` fills WSJF tail after Big Rock
- [ ] `scheduleSession` stops when cumulative context exceeds 70%
- [ ] `scheduleSession` always includes at least 1 item
- [ ] `assignQualityZone` returns correct zone for each boundary range
- [ ] `generateMermaidGantt` produces valid Mermaid syntax
- [ ] `generateMermaidGantt` returns empty string for empty items
- [ ] Session plan items have assigned_zone populated
- [ ] `src/planner/index.ts` exports all four scoring functions (computeWSJF, effortFromComplexity, rankByWSJF, scoreItem)
- [ ] `src/planner/index.ts` exports all five scheduler functions (selectBigRock, estimateContextCost, assignQualityZone, scheduleSession, generateMermaidGantt)
