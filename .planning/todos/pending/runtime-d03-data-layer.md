---
title: "Runtime D03: Data extraction layer for Studio views"
area: tooling
created: 2026-03-24
source: docs/runtime-architecture/research/dev-studio.md
depends_on: [D01, D02]
phase: runtime-d
estimated_files: 5
---

## Context

The data layer is the bridge between Luca's source files (`src/`, `.planning/`, `.claude/`) and the Studio UI. Each data module reads filesystem state and returns typed JSON that the API endpoints serve to the browser. These functions are pure data extraction -- no compilation, no side effects.

## Task

### 1. Create `packages/luca-studio/src/data/agents.ts`

Reads agent definitions from `src/agents/` and compiled output from `.claude/agents/`.

```typescript
/**
 * Agent data extraction for Luca Studio.
 *
 * Scans src/agents/ for .agent.ts files, groups them by directory (luca/, general/),
 * and reads corresponding compiled markdown from .claude/agents/.
 *
 * @module studio-data-agents
 */
import { resolve, basename, dirname, relative } from "path";
import { readdirSync, existsSync } from "node:fs";

import type { AgentSummary, AgentDetail } from "../__schemas/studio.schemas";

// ---------------------------------------------------------------------------
// Path constants — resolved relative to monorepo root
// ---------------------------------------------------------------------------

const MONOREPO_ROOT = resolve(import.meta.dir, "..", "..", "..", "..");
const AGENTS_SRC_DIR = resolve(MONOREPO_ROOT, "src", "agents");
const AGENTS_COMPILED_DIR = resolve(MONOREPO_ROOT, ".claude", "agents");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Recursively find all .agent.ts files under a directory.
 *
 * @param dir - Directory to scan
 * @returns Array of absolute file paths
 */
function findAgentFiles(dir: string): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith("__")) {
      results.push(...findAgentFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".agent.ts")) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Derive the compiled .md filename for an agent source file.
 *
 * Agent source: src/agents/luca/lu-router.agent.ts
 * Compiled:     .claude/agents/lu-router.md
 *
 * @param agentFilePath - Absolute path to .agent.ts file
 * @returns Expected absolute path of compiled .md file
 */
function compiledPathFor(agentFilePath: string): string {
  const name = basename(agentFilePath, ".agent.ts");
  return resolve(AGENTS_COMPILED_DIR, `${name}.md`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get a list of all agent definitions with summary data.
 *
 * Reads the filesystem on every call (no caching) to ensure freshness.
 *
 * @returns Array of AgentSummary objects
 */
export async function getAgentList(): Promise<AgentSummary[]> {
  const agentFiles = findAgentFiles(AGENTS_SRC_DIR);
  const agents: AgentSummary[] = [];

  for (const filePath of agentFiles) {
    const name = basename(filePath, ".agent.ts");
    const relDir = relative(AGENTS_SRC_DIR, dirname(filePath));
    const group = relDir.split("/")[0] ?? "ungrouped";
    const compiledPath = compiledPathFor(filePath);
    const hasCompiled = existsSync(compiledPath);

    // Read first JSDoc comment line for description
    const content = await Bun.file(filePath).text();
    const descMatch = content.match(/description:\s*["'`]([^"'`]+)["'`]/);
    const description = descMatch ? descMatch[1]! : name;

    agents.push({
      name,
      description,
      group,
      file_path: filePath,
      has_compiled_output: hasCompiled,
    });
  }

  return agents;
}

/**
 * Get full detail for a single agent including source and compiled content.
 *
 * @param agentName - Name of the agent (without .agent.ts suffix)
 * @returns AgentDetail or null if not found
 */
export async function getAgentDetail(
  agentName: string,
): Promise<AgentDetail | null> {
  const agentFiles = findAgentFiles(AGENTS_SRC_DIR);
  const matchFile = agentFiles.find(
    (f) => basename(f, ".agent.ts") === agentName,
  );

  if (!matchFile) return null;

  const name = basename(matchFile, ".agent.ts");
  const relDir = relative(AGENTS_SRC_DIR, dirname(matchFile));
  const group = relDir.split("/")[0] ?? "ungrouped";

  const sourceContent = await Bun.file(matchFile).text();
  const compiledPath = compiledPathFor(matchFile);
  const hasCompiled = existsSync(compiledPath);
  const compiledContent = hasCompiled
    ? await Bun.file(compiledPath).text()
    : null;

  // Extract description
  const descMatch = sourceContent.match(/description:\s*["'`]([^"'`]+)["'`]/);
  const description = descMatch ? descMatch[1]! : name;

  // Extract model_routing if present
  const routingMatch = sourceContent.match(/model_routing:\s*\{([^}]+)\}/s);
  const modelRouting = routingMatch
    ? parseSimpleObject(routingMatch[1]!)
    : null;

  // Extract tool_strategy if present
  const toolMatch = sourceContent.match(/tool_strategy:\s*["'`]([^"'`]+)["'`]/);
  const toolStrategy = toolMatch ? toolMatch[1]! : null;

  return {
    name,
    description,
    group,
    file_path: matchFile,
    has_compiled_output: hasCompiled,
    source_content: sourceContent,
    compiled_content: compiledContent,
    model_routing: modelRouting,
    tool_strategy: toolStrategy,
    custom_sections: [],
  };
}

/**
 * Naive key-value parser for simple object literals in source code.
 * Only handles string values. Used for extracting model_routing.
 *
 * @param objContent - Content between { and } of an object literal
 * @returns Record of string key-value pairs
 */
function parseSimpleObject(objContent: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = objContent.split("\n");
  for (const line of lines) {
    const match = line.match(/(\w+)\s*:\s*["'`]([^"'`]+)["'`]/);
    if (match) {
      result[match[1]!] = match[2]!;
    }
  }
  return result;
}
```

### 2. Create `packages/luca-studio/src/data/dag.ts`

Extracts the workflow DAG from the XState machine definition.

```typescript
/**
 * DAG data extraction for Luca Studio.
 *
 * Reads the state machine configuration and converts it into a graph structure
 * suitable for Elk.js layout computation. Also reads current state from
 * .planning/state.json for active state highlighting.
 *
 * @module studio-data-dag
 */
import { resolve } from "path";
import { existsSync } from "node:fs";

import type { DagNode, DagEdge, DagGraph } from "../__schemas/studio.schemas";

// ---------------------------------------------------------------------------
// Path constants
// ---------------------------------------------------------------------------

const MONOREPO_ROOT = resolve(import.meta.dir, "..", "..", "..", "..");
const STATE_JSON_PATH = resolve(MONOREPO_ROOT, ".planning", "state.json");

// ---------------------------------------------------------------------------
// State machine graph extraction
// ---------------------------------------------------------------------------

/**
 * Extract the workflow DAG from the XState machine config.
 *
 * Dynamically imports the machine module from src/state/ or reads state.json
 * as a fallback. The machine.config.states object contains all states and
 * their transitions.
 *
 * IMPORTANT: This uses dynamic import of the machine module. The machine
 * definition is a pure data structure — no side effects at import time
 * (XState v5 setup().createMachine() returns a config object).
 *
 * @returns DagGraph with nodes, edges, and current_state
 */
export async function getDagGraph(): Promise<DagGraph> {
  const nodes: DagNode[] = [];
  const edges: DagEdge[] = [];
  let currentState: string | null = null;

  // Try to read current state from state.json
  try {
    if (existsSync(STATE_JSON_PATH)) {
      const stateData = JSON.parse(await Bun.file(STATE_JSON_PATH).text());
      currentState = stateData?.state ?? stateData?.value ?? null;
    }
  } catch {
    // state.json might not exist or be malformed
  }

  // Try to import the machine definition dynamically
  try {
    const machinePath = resolve(
      MONOREPO_ROOT,
      "packages",
      "luca-framework",
      "src",
      "state",
      "machine.ts",
    );
    if (!existsSync(machinePath)) {
      // Fallback: return minimal graph from state.json
      return buildFallbackGraph(currentState);
    }

    const machineModule = await import(machinePath);
    const machine = machineModule.workflowMachine ?? machineModule.default;

    if (!machine?.config?.states) {
      return buildFallbackGraph(currentState);
    }

    // Extract states
    const states = machine.config.states as Record<
      string,
      Record<string, unknown>
    >;
    let edgeId = 0;

    for (const [stateName, stateConfig] of Object.entries(states)) {
      const isFinal = stateConfig.type === "final";
      nodes.push({
        id: stateName,
        label: stateName,
        is_active: stateName === currentState,
        is_final: isFinal,
        node_type: "state",
      });

      // Extract transitions from `on` property
      const onConfig = stateConfig.on as Record<string, unknown> | undefined;
      if (onConfig) {
        for (const [eventName, transitionDef] of Object.entries(onConfig)) {
          const targets = extractTransitionTargets(transitionDef);
          for (const target of targets) {
            edgeId++;
            edges.push({
              id: `e${edgeId}`,
              source: stateName,
              target,
              event_name: eventName,
              guard: null,
            });
          }
        }
      }

      // Extract transitions from `always` property (eventless transitions)
      const alwaysDef = stateConfig.always as unknown;
      if (alwaysDef) {
        const targets = extractTransitionTargets(alwaysDef);
        for (const target of targets) {
          edgeId++;
          edges.push({
            id: `e${edgeId}`,
            source: stateName,
            target,
            event_name: "(always)",
            guard: null,
          });
        }
      }
    }
  } catch (err) {
    console.warn("Failed to extract machine config:", err);
    return buildFallbackGraph(currentState);
  }

  return { nodes, edges, current_state: currentState };
}

/**
 * Extract target state names from an XState transition definition.
 *
 * Handles multiple XState v5 transition formats:
 * - String: "nextState"
 * - Object: { target: "nextState" }
 * - Array: [{ target: "stateA" }, { target: "stateB" }]
 *
 * @param transitionDef - XState transition definition (any format)
 * @returns Array of target state name strings
 */
function extractTransitionTargets(transitionDef: unknown): string[] {
  if (typeof transitionDef === "string") {
    return [transitionDef.replace(/^\./, "")];
  }

  if (Array.isArray(transitionDef)) {
    return transitionDef.flatMap((t) => extractTransitionTargets(t));
  }

  if (transitionDef && typeof transitionDef === "object") {
    const obj = transitionDef as Record<string, unknown>;
    if (typeof obj.target === "string") {
      return [obj.target.replace(/^\./, "")];
    }
  }

  return [];
}

/**
 * Build a minimal fallback graph when machine config is unavailable.
 *
 * Uses known Luca workflow states as a static fallback.
 *
 * @param currentState - Current state name if known
 * @returns DagGraph with hardcoded workflow states
 */
function buildFallbackGraph(currentState: string | null): DagGraph {
  const stateNames = [
    "idle",
    "preflight",
    "routing",
    "discussing",
    "planning",
    "executing",
    "reviewing",
    "verifying",
    "learning",
    "committing",
    "suspended",
    "complete",
    "failed",
  ];

  const nodes: DagNode[] = stateNames.map((name) => ({
    id: name,
    label: name,
    is_active: name === currentState,
    is_final: name === "complete" || name === "failed",
    node_type: "state" as const,
  }));

  const edges: DagEdge[] = [
    {
      id: "e1",
      source: "idle",
      target: "preflight",
      event_name: "START",
      guard: null,
    },
    {
      id: "e2",
      source: "preflight",
      target: "routing",
      event_name: "PREFLIGHT_DONE",
      guard: null,
    },
    {
      id: "e3",
      source: "routing",
      target: "discussing",
      event_name: "ROUTE_COMPLETE",
      guard: null,
    },
    {
      id: "e4",
      source: "discussing",
      target: "planning",
      event_name: "DISCUSS_DONE",
      guard: null,
    },
    {
      id: "e5",
      source: "planning",
      target: "executing",
      event_name: "PLAN_APPROVED",
      guard: null,
    },
    {
      id: "e6",
      source: "executing",
      target: "reviewing",
      event_name: "EXECUTE_DONE",
      guard: null,
    },
    {
      id: "e7",
      source: "reviewing",
      target: "verifying",
      event_name: "REVIEW_DONE",
      guard: null,
    },
    {
      id: "e8",
      source: "verifying",
      target: "learning",
      event_name: "VERIFY_PASS",
      guard: null,
    },
    {
      id: "e9",
      source: "learning",
      target: "committing",
      event_name: "LEARN_DONE",
      guard: null,
    },
    {
      id: "e10",
      source: "committing",
      target: "complete",
      event_name: "COMMIT_DONE",
      guard: null,
    },
    {
      id: "e11",
      source: "verifying",
      target: "executing",
      event_name: "VERIFY_FAIL",
      guard: null,
    },
    {
      id: "e12",
      source: "executing",
      target: "suspended",
      event_name: "SUSPEND",
      guard: null,
    },
    {
      id: "e13",
      source: "suspended",
      target: "executing",
      event_name: "RESUME",
      guard: null,
    },
  ];

  return { nodes, edges, current_state: currentState };
}
```

### 3. Create `packages/luca-studio/src/data/state.ts`

Reads state machine snapshot and event ledger.

```typescript
/**
 * State machine data extraction for Luca Studio.
 *
 * Reads state from .planning/state.json, .planning/STATE.md,
 * and .planning/session-ledger.jsonl for the state inspector view.
 *
 * @module studio-data-state
 */
import { resolve } from "path";
import { existsSync } from "node:fs";

import type { StateSnapshot } from "../__schemas/studio.schemas";

// ---------------------------------------------------------------------------
// Path constants
// ---------------------------------------------------------------------------

const MONOREPO_ROOT = resolve(import.meta.dir, "..", "..", "..", "..");
const STATE_JSON_PATH = resolve(MONOREPO_ROOT, ".planning", "state.json");
const LEDGER_PATH = resolve(MONOREPO_ROOT, ".planning", "session-ledger.jsonl");

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the current state machine snapshot.
 *
 * Priority: state.json (primary) > STATE.md grep (fallback).
 *
 * @returns StateSnapshot with current state, context, and event log
 */
export async function getStateSnapshot(): Promise<StateSnapshot> {
  let currentState = "unknown";
  let context: Record<string, unknown> = {};
  const eventLog: StateSnapshot["event_log"] = [];

  // Read state.json
  try {
    if (existsSync(STATE_JSON_PATH)) {
      const raw = JSON.parse(await Bun.file(STATE_JSON_PATH).text());
      currentState = raw?.state ?? raw?.value ?? "unknown";
      context = raw?.context ?? raw ?? {};
    }
  } catch {
    // Malformed state.json
  }

  // Read ledger entries (last 50)
  try {
    if (existsSync(LEDGER_PATH)) {
      const ledgerText = await Bun.file(LEDGER_PATH).text();
      const lines = ledgerText.trim().split("\n").filter(Boolean);
      const recentLines = lines.slice(-50);

      for (const line of recentLines) {
        try {
          const entry = JSON.parse(line);
          eventLog.push({
            timestamp: entry.timestamp ?? entry.ts ?? new Date().toISOString(),
            event_type: entry.event ?? entry.type ?? "unknown",
            from_state: entry.from ?? null,
            to_state: entry.to ?? null,
            data_summary:
              (entry.summary ?? entry.data)
                ? JSON.stringify(entry.data ?? {}).slice(0, 100)
                : "",
          });
        } catch {
          // Skip malformed ledger lines
        }
      }
    }
  } catch {
    // Ledger might not exist
  }

  return { current_state: currentState, context, event_log: eventLog };
}
```

### 4. Create `packages/luca-studio/src/data/evals.ts`

Reads harness results from `.planning/`.

```typescript
/**
 * Eval results data extraction for Luca Studio.
 *
 * Reads harness output from .planning/ directory for the eval results view.
 * Looks for JSON files with harness result structure.
 *
 * @module studio-data-evals
 */
import { resolve } from "path";
import { readdirSync, existsSync } from "node:fs";

import type {
  EvalResultsSummary,
  EvalCheckResult,
} from "../__schemas/studio.schemas";

// ---------------------------------------------------------------------------
// Path constants
// ---------------------------------------------------------------------------

const MONOREPO_ROOT = resolve(import.meta.dir, "..", "..", "..", "..");
const PLANNING_DIR = resolve(MONOREPO_ROOT, ".planning");

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the latest eval/harness results summary.
 *
 * Scans .planning/ for JSON files matching harness result patterns.
 * Falls back to empty results if no harness output found.
 *
 * @returns EvalResultsSummary with check results
 */
export async function getEvalResults(): Promise<EvalResultsSummary> {
  const results: EvalCheckResult[] = [];
  let lastRunAt: string | null = null;

  if (!existsSync(PLANNING_DIR)) {
    return {
      total_checks: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      results: [],
      last_run_at: null,
    };
  }

  // Look for harness result files
  try {
    const files = readdirSync(PLANNING_DIR);
    const harnessFiles = files.filter(
      (f) => f.includes("harness") && f.endsWith(".json"),
    );

    for (const file of harnessFiles) {
      try {
        const filePath = resolve(PLANNING_DIR, file);
        const raw = JSON.parse(await Bun.file(filePath).text());

        // Handle array of results or single result
        const checks = Array.isArray(raw) ? raw : (raw.results ?? [raw]);

        for (const check of checks) {
          const checkType = check.check_type ?? check.type ?? "unknown";
          if (!["test", "typecheck", "lint", "build"].includes(checkType))
            continue;

          results.push({
            check_type: checkType,
            status: check.status ?? (check.passed ? "pass" : "fail"),
            duration_ms: check.duration_ms ?? check.duration ?? 0,
            error_count: check.error_count ?? check.errors?.length ?? 0,
            errors: (check.errors ?? []).map((e: Record<string, unknown>) => ({
              file_path: String(e.file_path ?? e.file ?? ""),
              line: typeof e.line === "number" ? e.line : null,
              message: String(e.message ?? e.error ?? ""),
            })),
          });
        }

        // Track latest run timestamp
        const stat = Bun.file(filePath);
        const mtime = (await stat.exists()) ? new Date().toISOString() : null;
        if (mtime && (!lastRunAt || mtime > lastRunAt)) {
          lastRunAt = mtime;
        }
      } catch {
        // Skip malformed harness files
      }
    }
  } catch {
    // Planning dir read failure
  }

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const skipped = results.filter((r) => r.status === "skip").length;

  return {
    total_checks: results.length,
    passed,
    failed,
    skipped,
    results,
    last_run_at: lastRunAt,
  };
}
```

### 5. Wire data layer into server API handlers

Update `packages/luca-studio/src/server.ts` — replace the stub `handleApi` function body to call the real data functions:

```typescript
// Add these imports at the top of server.ts:
import { getAgentList, getAgentDetail } from "./data/agents";
import { getDagGraph } from "./data/dag";
import { getStateSnapshot } from "./data/state";
import { getEvalResults } from "./data/evals";

// Replace the handleApi function body:
async function handleApi(pathname: string): Promise<Response | null> {
  if (pathname === "/api/agents") {
    const agents = await getAgentList();
    return Response.json({ agents });
  }
  if (pathname.startsWith("/api/agents/")) {
    const name = decodeURIComponent(pathname.slice("/api/agents/".length));
    const detail = await getAgentDetail(name);
    if (!detail)
      return Response.json({ error: "agent_not_found" }, { status: 404 });
    return Response.json(detail);
  }
  if (pathname === "/api/dag") {
    const graph = await getDagGraph();
    return Response.json(graph);
  }
  if (pathname === "/api/state") {
    const snapshot = await getStateSnapshot();
    return Response.json(snapshot);
  }
  if (pathname === "/api/evals") {
    const results = await getEvalResults();
    return Response.json(results);
  }
  return null;
}
```

## Verification

```bash
# TypeScript compiles
cd packages/luca-studio && bunx --bun tsc --noEmit

# Start server and test API endpoints manually:
# curl http://localhost:4040/api/agents | jq '.agents | length'
#   -> Should return count > 0 (number of .agent.ts files in src/agents/)
# curl http://localhost:4040/api/dag | jq '.nodes | length'
#   -> Should return count > 0 (workflow states)
# curl http://localhost:4040/api/state | jq '.current_state'
#   -> Should return a state string
# curl http://localhost:4040/api/evals | jq '.total_checks'
#   -> Should return a number >= 0
```

## Notes

- Data functions read the filesystem on every call. There is no caching layer. For a dev tool with low request volume, this is fine and guarantees freshness.
- The DAG extractor tries dynamic import of the machine module first, with a static fallback graph. The fallback ensures the DAG view works even if the machine module has import errors.
- Agent detail extraction uses regex to parse exported fields from TypeScript source. This is intentionally simple -- not a full AST parser. It extracts description, model_routing, and tool_strategy from string literals in the source.
- The `MONOREPO_ROOT` is resolved as 4 levels up from `data/` (`data -> src -> luca-studio -> packages -> root`).
