---
id: "100-01"
title: "Observer data hooks and API routes for deep pages"
phase: 100
wave: 1
complexity: MODERATE
depends_on: []
tasks:
  - id: "100-01-1"
    title: "Add iteration, planning, tribunal, and agent snapshot schemas to observer types"
    goal: "Define observer-local Zod schemas mirroring framework iteration records, WSJF scored items, tribunal results, and agent activity — no cross-package imports"
    verify: "bunx --bun tsc --noEmit passes within packages/luca-observer; all new schemas exported from ~/lib/types.ts"
  - id: "100-01-2"
    title: "Create iteration data file reader utility"
    goal: "Add readIterationHistory() to ~/lib/file-watcher.ts that reads .planning/checkpoints/*.json and returns parsed iteration records"
    verify: "readIterationHistory() exported from ~/lib/file-watcher.ts; handles missing directory and invalid JSON gracefully"
  - id: "100-01-3"
    title: "Create GET /api/iterations route"
    goal: "New API route that reads iteration checkpoint files and returns parsed iteration history with convergence data"
    verify: "GET /api/iterations returns JSON with iterations array; handles empty/missing checkpoints directory"
  - id: "100-01-4"
    title: "Create GET /api/planning route"
    goal: "New API route that reads .planning/session-plan.json and returns the current session plan with WSJF scores"
    verify: "GET /api/planning returns JSON session plan; handles missing file with null default"
  - id: "100-01-5"
    title: "Create GET /api/tribunal route"
    goal: "New API route that reads .planning/tribunal-result.json and returns the latest tribunal result"
    verify: "GET /api/tribunal returns JSON tribunal result; handles missing file with null default"
  - id: "100-01-6"
    title: "Create GET /api/agents route"
    goal: "New API route that aggregates agent activity from ledger entries filtered by agent_name event data"
    verify: "GET /api/agents returns JSON with agent activity summary; derives data from existing ledger entries"
  - id: "100-01-7"
    title: "Create React polling hooks for iterations, planning, tribunal, and agents"
    goal: "Add useIterationHistory, usePlanning, useTribunal, and useAgentActivity hooks following the established polling pattern"
    verify: "All four hooks exported from ~/hooks/; each polls its respective API route; follows safeParse pattern from existing hooks"
---

# 100-01: Observer Data Hooks and API Routes for Deep Pages

## Goal

Build the data layer connecting the observer to framework state for the five remaining deep pages (iterations, planning, memory, tribunal, agents). This plan creates observer-local Zod schemas mirroring framework shapes, file-reading utilities, API routes, and React polling hooks. The memory page already has an API route (`/api/memory`) and file reader (`readMemoryFiles`), so it only needs a hook and UI components (handled in Plan 100-04). The observer MUST NOT import from luca-framework directly -- all types are locally defined.

## Context

@packages/luca-observer/src/lib/types.ts -- Existing observer Zod schemas (ObserverEventSchema, WorkflowSnapshotSchema, LedgerEntrySchema, HarnessResultSnapshotSchema)
@packages/luca-observer/src/lib/file-watcher.ts -- Existing file readers (readWorkflowState, readMemoryFiles, readMetrics, readLedgerEntries, readHarnessResult)
@packages/luca-observer/src/hooks/use-harness-result.ts -- Example polling hook pattern (safeParse, loading state, error state)
@packages/luca-observer/src/app/api/harness/route.ts -- Example API route pattern (dynamic = "force-dynamic", snake_case response)
@packages/luca-observer/src/app/api/memory/route.ts -- Existing memory API route (already reads BRAIN.md, MEMORY.md, WORKING.md)
@src/iteration/**schemas/iteration.schemas.ts -- Framework iteration schemas (iterationRecordSchema, convergenceResultSchema, budgetStateSchema)
@src/planner/**schemas/planner.schemas.ts -- Framework planner schemas (wsjfScoredItemSchema, sessionPlanSchema, qualityZoneSchema)
@src/shared/**schemas/tribunal.schemas.ts -- Framework tribunal schemas (tribunalResultSchema, reviewFindingSchema, disagreementSchema, rebuttalSchema)
@src/agents/**schemas/agent.schemas.ts -- Framework agent schemas

**Architecture constraints:**

- Observer types are locally defined (no imports from luca-framework)
- API schemas use snake_case per project conventions
- Use node:fs/promises for file reading (Next.js API route context)
- Functional patterns only (no classes)
- Use safeParse for external data validation
- Follow established polling hook pattern from use-harness-result.ts

**Key data sources:**

- `.planning/checkpoints/*.json` -- Iteration checkpoint files (one per iteration)
- `.planning/session-plan.json` -- Current session plan with WSJF scores (may not exist yet)
- `.planning/tribunal-result.json` -- Latest tribunal result (may not exist yet)
- `.planning/session-ledger.jsonl` -- Already available; agent activity derived by filtering event_data.agent_name
- `.planning/BRAIN.md`, `.planning/MEMORY.md`, `.planning/WORKING.md` -- Already served by /api/memory

## Tasks

### Task 100-01-1: Add iteration, planning, tribunal, and agent snapshot schemas to observer types

Add observer-local schemas to `packages/luca-observer/src/lib/types.ts` that mirror the framework shapes. These are independent definitions -- they do not import from the framework.

**Add iteration schemas:**

```typescript
// ─── Iteration Snapshot Schemas ──────────────────────────────────────────────

/**
 * Observer-local mirror of luca-framework's ConvergenceSignals.
 *
 * Multi-signal convergence metrics for an iteration.
 * Uses snake_case for API compatibility.
 */
export const ConvergenceSignalsSnapshotSchema = z.object({
  error_count_delta: z.number().int(),
  fingerprint_overlap: z.number().min(0).max(1),
  artifact_change_delta: z.number().int().nonnegative(),
  semantic_overlap: z.number().min(0).max(1).optional(),
});

export type ConvergenceSignalsSnapshot = z.infer<
  typeof ConvergenceSignalsSnapshotSchema
>;

/**
 * Observer-local mirror of luca-framework's IterationRecord.
 *
 * A single iteration checkpoint with error counts, convergence status,
 * and classification breakdown.
 * Uses snake_case for API compatibility.
 */
export const IterationRecordSnapshotSchema = z.object({
  tag: z.string(),
  phase: z.number().int().positive(),
  loop: z.enum(["harness", "verify"]),
  iteration: z.number().int().positive(),
  error_count: z.number().int().nonnegative(),
  error_delta: z.number().int(),
  convergence_status: z.enum(["improved", "stalled", "regressed"]),
  stale_count: z.number().int().nonnegative(),
  permanent_errors: z.array(z.string()).default([]),
  correctable_errors: z.array(z.string()).default([]),
  transient_errors: z.array(z.string()).default([]),
  artifacts_delta: z.number().int().nonnegative(),
  agent_invoked: z.string(),
  duration_ms: z.number().int().nonnegative(),
  timestamp: z.string(),
});

export type IterationRecordSnapshot = z.infer<
  typeof IterationRecordSnapshotSchema
>;

/**
 * Observer-local mirror of luca-framework's BudgetState.
 *
 * Budget tracking for an iteration loop.
 * Uses snake_case for API compatibility.
 */
export const BudgetStateSnapshotSchema = z.object({
  max_iterations: z.number().int().positive(),
  current_iteration: z.number().int().nonnegative(),
  soft_stop_percent: z.number().min(0).max(100).default(80),
  status: z.enum(["under_budget", "soft_stop", "exceeded"]),
});

export type BudgetStateSnapshot = z.infer<typeof BudgetStateSnapshotSchema>;
```

**Add planning schemas:**

```typescript
// ─── Planning Snapshot Schemas ───────────────────────────────────────────────

/**
 * Observer-local mirror of luca-framework's WSJFScoredItem.
 *
 * A todo item with computed WSJF score.
 * Uses snake_case for API compatibility.
 */
export const WSJFScoredItemSnapshotSchema = z.object({
  todo_path: z.string(),
  title: z.string(),
  area: z.string(),
  wsjf_score: z.number().nonnegative(),
  complexity: z.string(),
  dependency_free: z.boolean(),
  assigned_zone: z.enum(["peak", "good", "degrading", "stop"]).optional(),
});

export type WSJFScoredItemSnapshot = z.infer<
  typeof WSJFScoredItemSnapshotSchema
>;

/**
 * Observer-local mirror of luca-framework's SessionPlan.
 *
 * A session plan with WSJF-ordered items.
 * Uses snake_case for API compatibility.
 */
export const SessionPlanSnapshotSchema = z.object({
  generated_at: z.string(),
  session_cap_minutes: z.number().int().positive().default(180),
  total_effort_points: z.number().int().nonnegative(),
  items: z.array(WSJFScoredItemSnapshotSchema),
  big_rock_index: z.number().int().nonnegative().optional(),
  rationale: z.string(),
});

export type SessionPlanSnapshot = z.infer<typeof SessionPlanSnapshotSchema>;
```

**Add tribunal schemas:**

```typescript
// ─── Tribunal Snapshot Schemas ───────────────────────────────────────────────

/**
 * Observer-local mirror of luca-framework's ReviewFinding.
 *
 * A single finding from a code reviewer agent.
 * Uses snake_case for API compatibility.
 */
export const ReviewFindingSnapshotSchema = z.object({
  id: z.string(),
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
  file: z.string(),
  line: z.number().int().nonnegative().default(0),
  issue: z.string(),
  suggestion: z.string().default(""),
  source_agent: z.string(),
});

export type ReviewFindingSnapshot = z.infer<typeof ReviewFindingSnapshotSchema>;

/**
 * Observer-local mirror of luca-framework's Disagreement.
 *
 * A detected conflict between reviewer findings.
 * Uses snake_case for API compatibility.
 */
export const DisagreementSnapshotSchema = z.object({
  id: z.string(),
  file: z.string(),
  line: z.number().int().nonnegative(),
  conflicting_findings: z.array(ReviewFindingSnapshotSchema).min(2),
  conflict_type: z.enum([
    "contradictory",
    "severity_mismatch",
    "scope_overlap",
  ]),
});

export type DisagreementSnapshot = z.infer<typeof DisagreementSnapshotSchema>;

/**
 * Observer-local mirror of luca-framework's Rebuttal.
 *
 * A rebuttal record from a debate round.
 * Uses snake_case for API compatibility.
 */
export const RebuttalSnapshotSchema = z.object({
  finding_id: z.string(),
  challenger_agent: z.string(),
  challenge: z.string(),
  defender_response: z.string(),
  resolution: z.enum(["upheld", "withdrawn", "modified"]),
});

export type RebuttalSnapshot = z.infer<typeof RebuttalSnapshotSchema>;

/**
 * Observer-local mirror of luca-framework's TribunalResult.
 *
 * Complete result of a Design Tribunal session.
 * Uses snake_case for API compatibility.
 */
export const TribunalResultSnapshotSchema = z.object({
  phase: z.number().int().positive(),
  total_findings: z.number().int().nonnegative(),
  disagreements_detected: z.number().int().nonnegative(),
  rebuttals_conducted: z.number().int().nonnegative(),
  findings_withdrawn: z.number().int().nonnegative(),
  findings_modified: z.number().int().nonnegative(),
  debate_token_cost: z.number().int().nonnegative().default(0),
  timestamp: z.string(),
});

export type TribunalResultSnapshot = z.infer<
  typeof TribunalResultSnapshotSchema
>;
```

**Add agent activity schemas:**

```typescript
// ─── Agent Activity Snapshot Schemas ─────────────────────────────────────────

/**
 * Observer-local schema for agent activity summary.
 *
 * Derived from ledger entries filtered by agent-related event data.
 * Uses snake_case for API compatibility.
 */
export const AgentActivitySnapshotSchema = z.object({
  agent_name: z.string(),
  invocation_count: z.number().int().nonnegative(),
  last_invoked_at: z.string().optional(),
  total_duration_ms: z.number().int().nonnegative().default(0),
  events: z
    .array(
      z.object({
        event_type: z.string(),
        timestamp: z.string(),
        duration_ms: z.number().int().nonnegative().optional(),
        status: z.string().optional(),
      }),
    )
    .default([]),
});

export type AgentActivitySnapshot = z.infer<typeof AgentActivitySnapshotSchema>;
```

**Verify:**

- [ ] All schemas defined with proper JSDoc
- [ ] `z.infer<>` types exported for each schema
- [ ] No imports from luca-framework
- [ ] `bunx --bun tsc --noEmit` passes in packages/luca-observer
- [ ] Schemas use snake_case for API fields

### Task 100-01-2: Create iteration data file reader utility

Add `readIterationHistory()` to `packages/luca-observer/src/lib/file-watcher.ts`.

```typescript
/**
 * Read iteration checkpoint files from .planning/checkpoints/.
 *
 * Reads all JSON files in the checkpoints directory, validates each
 * with safeParse, and returns them sorted by iteration number.
 *
 * @param projectDir - The root project directory (defaults to cwd)
 * @returns Array of validated IterationRecordSnapshot objects
 */
export async function readIterationHistory(
  projectDir?: string,
): Promise<IterationRecordSnapshot[]> {
  const dir = resolveProjectDir(projectDir);
  const checkpointsDir = join(dir, ".planning", "checkpoints");

  try {
    const { readdir } = await import("node:fs/promises");
    const files = await readdir(checkpointsDir);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));

    const records: IterationRecordSnapshot[] = [];
    for (const file of jsonFiles) {
      try {
        const content = await readFile(join(checkpointsDir, file), "utf-8");
        const parsed = IterationRecordSnapshotSchema.safeParse(
          JSON.parse(content),
        );
        if (parsed.success) {
          records.push(parsed.data);
        }
      } catch {
        // Skip malformed checkpoint files
      }
    }

    // Sort by iteration number ascending
    return records.sort((a, b) => a.iteration - b.iteration);
  } catch {
    return [];
  }
}
```

Also add readers for session plan and tribunal result:

```typescript
/**
 * Read the current session plan from .planning/session-plan.json.
 *
 * @param projectDir - The root project directory (defaults to cwd)
 * @returns Parsed SessionPlanSnapshot or null if file does not exist
 */
export async function readSessionPlan(
  projectDir?: string,
): Promise<SessionPlanSnapshot | null> {
  const dir = resolveProjectDir(projectDir);
  const planPath = join(dir, ".planning", "session-plan.json");

  try {
    const content = await readFile(planPath, "utf-8");
    const parsed = SessionPlanSnapshotSchema.safeParse(JSON.parse(content));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Read the latest tribunal result from .planning/tribunal-result.json.
 *
 * @param projectDir - The root project directory (defaults to cwd)
 * @returns Parsed TribunalResultSnapshot or null if file does not exist
 */
export async function readTribunalResult(
  projectDir?: string,
): Promise<TribunalResultSnapshot | null> {
  const dir = resolveProjectDir(projectDir);
  const resultPath = join(dir, ".planning", "tribunal-result.json");

  try {
    const content = await readFile(resultPath, "utf-8");
    const parsed = TribunalResultSnapshotSchema.safeParse(JSON.parse(content));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
```

**Steps:**

1. Import new schemas from `./types` at the top of file-watcher.ts
2. Add all three reader functions after the existing `readHarnessResult` function
3. Reuse the existing `resolveProjectDir` helper

**Verify:**

- [ ] `readIterationHistory()`, `readSessionPlan()`, `readTribunalResult()` exported from `~/lib/file-watcher.ts`
- [ ] All handle missing files/directories gracefully (return empty array or null)
- [ ] All use safeParse for validation
- [ ] `bunx --bun tsc --noEmit` passes

### Task 100-01-3: Create GET /api/iterations route

Create `packages/luca-observer/src/app/api/iterations/route.ts`.

```typescript
import { NextResponse } from "next/server";

import { readIterationHistory } from "~/lib/file-watcher";

export const dynamic = "force-dynamic";

/**
 * GET /api/iterations -- Read iteration checkpoint history.
 *
 * Reads .planning/checkpoints/*.json and returns parsed iteration
 * records sorted by iteration number.
 *
 * Uses snake_case for API compatibility.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectDir = searchParams.get("dir") ?? undefined;

  try {
    const iterations = await readIterationHistory(projectDir);

    return NextResponse.json({
      iterations,
      total_count: iterations.length,
    });
  } catch {
    return NextResponse.json(
      { error: "failed_to_read_iterations" },
      { status: 500 },
    );
  }
}
```

**Steps:**

1. Create directory: `mkdir -p packages/luca-observer/src/app/api/iterations`
2. Create `route.ts` with the above implementation
3. Follow exact pattern of existing API routes

**Verify:**

- [ ] File exists at `packages/luca-observer/src/app/api/iterations/route.ts`
- [ ] Returns JSON with `iterations` array and `total_count`
- [ ] Uses snake_case for all response fields
- [ ] `bunx --bun tsc --noEmit` passes

### Task 100-01-4: Create GET /api/planning route

Create `packages/luca-observer/src/app/api/planning/route.ts`.

```typescript
import { NextResponse } from "next/server";

import { readSessionPlan } from "~/lib/file-watcher";

export const dynamic = "force-dynamic";

/**
 * GET /api/planning -- Read current session plan with WSJF scores.
 *
 * Reads .planning/session-plan.json and returns the parsed plan.
 * Returns null fields if no session plan exists yet.
 *
 * Uses snake_case for API compatibility.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectDir = searchParams.get("dir") ?? undefined;

  try {
    const plan = await readSessionPlan(projectDir);

    return NextResponse.json({
      plan,
      has_plan: plan !== null,
    });
  } catch {
    return NextResponse.json(
      { error: "failed_to_read_planning" },
      { status: 500 },
    );
  }
}
```

**Steps:**

1. Create directory: `mkdir -p packages/luca-observer/src/app/api/planning`
2. Create `route.ts` with the above implementation

**Verify:**

- [ ] File exists at `packages/luca-observer/src/app/api/planning/route.ts`
- [ ] Returns JSON with `plan` and `has_plan` fields
- [ ] Handles missing session-plan.json gracefully
- [ ] `bunx --bun tsc --noEmit` passes

### Task 100-01-5: Create GET /api/tribunal route

Create `packages/luca-observer/src/app/api/tribunal/route.ts`.

```typescript
import { NextResponse } from "next/server";

import { readTribunalResult } from "~/lib/file-watcher";

export const dynamic = "force-dynamic";

/**
 * GET /api/tribunal -- Read latest tribunal/debate result.
 *
 * Reads .planning/tribunal-result.json and returns the parsed result.
 * Returns null fields if no tribunal result exists yet.
 *
 * Uses snake_case for API compatibility.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectDir = searchParams.get("dir") ?? undefined;

  try {
    const result = await readTribunalResult(projectDir);

    return NextResponse.json({
      result,
      has_result: result !== null,
    });
  } catch {
    return NextResponse.json(
      { error: "failed_to_read_tribunal" },
      { status: 500 },
    );
  }
}
```

**Steps:**

1. Create directory: `mkdir -p packages/luca-observer/src/app/api/tribunal`
2. Create `route.ts` with the above implementation

**Verify:**

- [ ] File exists at `packages/luca-observer/src/app/api/tribunal/route.ts`
- [ ] Returns JSON with `result` and `has_result` fields
- [ ] `bunx --bun tsc --noEmit` passes

### Task 100-01-6: Create GET /api/agents route

Create `packages/luca-observer/src/app/api/agents/route.ts`.

This route derives agent activity data from the existing ledger entries and SSE events, aggregating by agent name.

```typescript
import { NextResponse } from "next/server";

import { readLedgerEntries } from "~/lib/file-watcher";
import { queryEvents } from "~/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/agents -- Read agent activity summary.
 *
 * Aggregates agent activity from:
 * 1. Ledger entries (agent_invoked field in iteration records)
 * 2. SSE events (agent_name field in event payloads)
 *
 * Returns a per-agent summary with invocation counts and timestamps.
 *
 * Uses snake_case for API compatibility.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectDir = searchParams.get("dir") ?? undefined;

  try {
    // Get agent activity from SSE events
    const events = queryEvents({ event_type: undefined });
    const agentEvents = events.filter(
      (e) => e.agent_name && e.agent_name.length > 0,
    );

    // Aggregate by agent name
    const agentMap = new Map<
      string,
      {
        invocation_count: number;
        last_invoked_at: string;
        total_duration_ms: number;
        events: Array<{
          event_type: string;
          timestamp: string;
          duration_ms?: number;
          status?: string;
        }>;
      }
    >();

    for (const event of agentEvents) {
      const name = event.agent_name!;
      const existing = agentMap.get(name) ?? {
        invocation_count: 0,
        last_invoked_at: "",
        total_duration_ms: 0,
        events: [],
      };

      existing.invocation_count += 1;
      existing.total_duration_ms += event.duration_ms ?? 0;

      const ts = event.timestamp ?? new Date(event.timestamp_ms).toISOString();
      if (!existing.last_invoked_at || ts > existing.last_invoked_at) {
        existing.last_invoked_at = ts;
      }

      existing.events.push({
        event_type: event.event_type,
        timestamp: ts,
        duration_ms: event.duration_ms ?? undefined,
        status: event.status ?? undefined,
      });

      agentMap.set(name, existing);
    }

    const agents = Array.from(agentMap.entries()).map(([name, data]) => ({
      agent_name: name,
      ...data,
    }));

    return NextResponse.json({
      agents,
      total_count: agents.length,
    });
  } catch {
    return NextResponse.json(
      { error: "failed_to_read_agents" },
      { status: 500 },
    );
  }
}
```

**Verify:**

- [ ] File exists at `packages/luca-observer/src/app/api/agents/route.ts`
- [ ] Returns JSON with `agents` array and `total_count`
- [ ] Handles empty events gracefully
- [ ] `bunx --bun tsc --noEmit` passes

### Task 100-01-7: Create React polling hooks for iterations, planning, tribunal, and agents

Create four new hooks following the established pattern from `use-harness-result.ts`.

**Create `packages/luca-observer/src/hooks/use-iteration-history.ts`:**

```typescript
"use client";

import { useEffect, useState, useCallback } from "react";

import { z } from "zod";

import type { IterationRecordSnapshot } from "~/lib/types";
import { IterationRecordSnapshotSchema } from "~/lib/types";

const IterationsResponseSchema = z.object({
  iterations: z.array(IterationRecordSnapshotSchema).default([]),
  total_count: z.number().default(0),
});

/**
 * React hook for polling iteration history from the API.
 *
 * @param intervalMs - Polling interval in milliseconds (default 15000)
 */
export function useIterationHistory(intervalMs = 15000) {
  const [iterations, setIterations] = useState<IterationRecordSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchIterations = useCallback(async () => {
    try {
      const res = await fetch("/api/iterations");
      if (!res.ok) throw new Error("Failed to fetch iterations");
      const json = await res.json();
      const parsed = IterationsResponseSchema.safeParse(json);
      if (parsed.success) {
        setIterations(parsed.data.iterations);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIterations();
    const interval = setInterval(fetchIterations, intervalMs);
    return () => clearInterval(interval);
  }, [fetchIterations, intervalMs]);

  return { iterations, loading, error };
}
```

**Create `packages/luca-observer/src/hooks/use-planning.ts`:**

```typescript
"use client";

import { useEffect, useState, useCallback } from "react";

import { z } from "zod";

import type { SessionPlanSnapshot } from "~/lib/types";
import { SessionPlanSnapshotSchema } from "~/lib/types";

const PlanningResponseSchema = z.object({
  plan: SessionPlanSnapshotSchema.nullable().default(null),
  has_plan: z.boolean().default(false),
});

/**
 * React hook for polling session plan from the API.
 *
 * @param intervalMs - Polling interval in milliseconds (default 15000)
 */
export function usePlanning(intervalMs = 15000) {
  const [plan, setPlan] = useState<SessionPlanSnapshot | null>(null);
  const [hasPlan, setHasPlan] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPlan = useCallback(async () => {
    try {
      const res = await fetch("/api/planning");
      if (!res.ok) throw new Error("Failed to fetch planning");
      const json = await res.json();
      const parsed = PlanningResponseSchema.safeParse(json);
      if (parsed.success) {
        setPlan(parsed.data.plan);
        setHasPlan(parsed.data.has_plan);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlan();
    const interval = setInterval(fetchPlan, intervalMs);
    return () => clearInterval(interval);
  }, [fetchPlan, intervalMs]);

  return { plan, hasPlan, loading, error };
}
```

**Create `packages/luca-observer/src/hooks/use-tribunal.ts`:**

```typescript
"use client";

import { useEffect, useState, useCallback } from "react";

import { z } from "zod";

import type { TribunalResultSnapshot } from "~/lib/types";
import { TribunalResultSnapshotSchema } from "~/lib/types";

const TribunalResponseSchema = z.object({
  result: TribunalResultSnapshotSchema.nullable().default(null),
  has_result: z.boolean().default(false),
});

/**
 * React hook for polling tribunal result from the API.
 *
 * @param intervalMs - Polling interval in milliseconds (default 15000)
 */
export function useTribunal(intervalMs = 15000) {
  const [result, setResult] = useState<TribunalResultSnapshot | null>(null);
  const [hasResult, setHasResult] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTribunal = useCallback(async () => {
    try {
      const res = await fetch("/api/tribunal");
      if (!res.ok) throw new Error("Failed to fetch tribunal");
      const json = await res.json();
      const parsed = TribunalResponseSchema.safeParse(json);
      if (parsed.success) {
        setResult(parsed.data.result);
        setHasResult(parsed.data.has_result);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTribunal();
    const interval = setInterval(fetchTribunal, intervalMs);
    return () => clearInterval(interval);
  }, [fetchTribunal, intervalMs]);

  return { result, hasResult, loading, error };
}
```

**Create `packages/luca-observer/src/hooks/use-agent-activity.ts`:**

```typescript
"use client";

import { useEffect, useState, useCallback } from "react";

import { z } from "zod";

import type { AgentActivitySnapshot } from "~/lib/types";
import { AgentActivitySnapshotSchema } from "~/lib/types";

const AgentsResponseSchema = z.object({
  agents: z.array(AgentActivitySnapshotSchema).default([]),
  total_count: z.number().default(0),
});

/**
 * React hook for polling agent activity from the API.
 *
 * @param intervalMs - Polling interval in milliseconds (default 15000)
 */
export function useAgentActivity(intervalMs = 15000) {
  const [agents, setAgents] = useState<AgentActivitySnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/agents");
      if (!res.ok) throw new Error("Failed to fetch agents");
      const json = await res.json();
      const parsed = AgentsResponseSchema.safeParse(json);
      if (parsed.success) {
        setAgents(parsed.data.agents);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
    const interval = setInterval(fetchAgents, intervalMs);
    return () => clearInterval(interval);
  }, [fetchAgents, intervalMs]);

  return { agents, loading, error };
}
```

Also create `packages/luca-observer/src/hooks/use-memory.ts` for the memory page:

```typescript
"use client";

import { useEffect, useState, useCallback } from "react";

import { z } from "zod";

const MemoryResponseSchema = z.object({
  brain: z.string().default(""),
  memory: z.string().default(""),
  working: z.string().default(""),
});

export type MemoryFiles = z.infer<typeof MemoryResponseSchema>;

/**
 * React hook for polling memory files from the API.
 *
 * @param intervalMs - Polling interval in milliseconds (default 10000)
 */
export function useMemory(intervalMs = 10000) {
  const [data, setData] = useState<MemoryFiles | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMemory = useCallback(async () => {
    try {
      const res = await fetch("/api/memory");
      if (!res.ok) throw new Error("Failed to fetch memory");
      const json = await res.json();
      const parsed = MemoryResponseSchema.safeParse(json);
      if (parsed.success) {
        setData(parsed.data);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMemory();
    const interval = setInterval(fetchMemory, intervalMs);
    return () => clearInterval(interval);
  }, [fetchMemory, intervalMs]);

  return { data, loading, error };
}
```

**Verify:**

- [ ] All hooks exist in `packages/luca-observer/src/hooks/`
- [ ] Each hook follows the safeParse + polling pattern
- [ ] Each hook has loading, error, and data states
- [ ] `bunx --bun tsc --noEmit` passes

## Success Criteria

- [ ] Observer-local schemas defined for iterations, planning, tribunal, and agent activity
- [ ] File readers for iteration history, session plan, and tribunal result
- [ ] Five new API routes: /api/iterations, /api/planning, /api/tribunal, /api/agents (memory already exists)
- [ ] Six new React hooks: useIterationHistory, usePlanning, useTribunal, useAgentActivity, useMemory
- [ ] All API responses use snake_case field names
- [ ] All file readers handle missing data gracefully
- [ ] `bunx --bun tsc --noEmit` passes for observer package
