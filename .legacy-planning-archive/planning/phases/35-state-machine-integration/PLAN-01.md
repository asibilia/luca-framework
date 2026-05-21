---
id: "35-01"
title: "CLI Bridge, STATE.md Snapshot Generator & Foundation Tests"
phase: 35
wave: 1
depends_on: []
tasks:
  - id: "T1"
    title: "Create bridge CLI module"
    description: "Create src/state-machine/bridge.ts that wraps state machine persistence + CLI as a high-level bridge for shell scripts and prompt templates. Exposes subcommands: read-field, write-state, snapshot, ensure-init. Each subcommand outputs JSON to stdout."
    files: ["src/state-machine/bridge.ts"]
    verification: "bun run src/state-machine/bridge.ts read-field --field=complexity returns JSON with the current complexity. bun run src/state-machine/bridge.ts snapshot generates a valid STATE.md-format markdown snapshot."
  - id: "T2"
    title: "Create STATE.md snapshot generator"
    description: "Create src/state-machine/snapshot.ts that reads the persisted state machine context and generates a human-readable STATE.md-format markdown string. Renders all fields currently found in STATE.md: project name, ticket, issue, branch, status, complexity, milestone, phase, plan IDs, wave count, harness results, verification attempts, phase results table."
    files: ["src/state-machine/snapshot.ts"]
    verification: "generateSnapshot() produces markdown with all STATE.md sections. Rendered markdown is structurally compatible with existing STATE.md format. Missing optional fields are omitted gracefully."
  - id: "T3"
    title: "Add snapshot subcommand to existing CLI"
    description: "Extend src/state-machine/cli.ts with a new 'snapshot' subcommand that calls generateSnapshot() and writes the result to .planning/STATE.md. This provides INTEG-06 backward-compatible STATE.md snapshots from the state machine."
    files: ["src/state-machine/cli.ts"]
    verification: "bun run src/state-machine/cli.ts snapshot writes .planning/STATE.md. Content matches the machine's current context. Existing subcommands (init, get, send, status, resume, reset) are unchanged."
  - id: "T4"
    title: "Add high-level convenience commands to bridge"
    description: "Implement bridge subcommands for common skill/agent operations: read-complexity, read-phase, read-oversight, read-status, transition (send event + persist + snapshot). Each returns JSON and optionally updates STATE.md snapshot."
    files: ["src/state-machine/bridge.ts"]
    verification: "bun run src/state-machine/bridge.ts read-complexity returns JSON with complexity level. bun run src/state-machine/bridge.ts transition --event=START --ticket_id=PROJ-1 initializes state and writes STATE.md snapshot."
  - id: "T5"
    title: "Update barrel exports for bridge and snapshot"
    description: "Update src/state-machine/index.ts to export generateSnapshot and key bridge types. Ensure the public API remains clean."
    files: ["src/state-machine/index.ts"]
    verification: "import { generateSnapshot } from '../state-machine' resolves correctly. No internal implementation details leak through the barrel."
  - id: "T6"
    title: "Write bridge CLI tests"
    description: "Create src/state-machine/__tests__/bridge.test.ts covering all bridge subcommands: read-field, read-complexity, read-phase, read-oversight, read-status, transition, snapshot, ensure-init. Tests run actual CLI via Bun.$ subprocess."
    files: ["src/state-machine/__tests__/bridge.test.ts"]
    verification: "bun test src/state-machine/__tests__/bridge.test.ts passes all tests. At least 12 test cases covering all subcommands plus error cases."
  - id: "T7"
    title: "Write snapshot generator tests"
    description: "Create src/state-machine/__tests__/snapshot.test.ts covering markdown generation for all context field combinations: full context, minimal context, missing optional fields, phase results table rendering, harness status rendering."
    files: ["src/state-machine/__tests__/snapshot.test.ts"]
    verification: "bun test src/state-machine/__tests__/snapshot.test.ts passes all tests. At least 10 test cases covering all snapshot sections."
  - id: "T8"
    title: "Write integration test for bridge-to-snapshot pipeline"
    description: "Create src/state-machine/__tests__/bridge-integration.test.ts that tests the full pipeline: init state via bridge -> send events via bridge -> generate snapshot -> verify STATE.md content matches machine state. Validates INTEG-01, INTEG-02, INTEG-06 end-to-end."
    files: ["src/state-machine/__tests__/bridge-integration.test.ts"]
    verification: "bun test src/state-machine/__tests__/bridge-integration.test.ts passes. Tests exercise init -> transition -> snapshot -> read-field round-trip."
---

# Plan 35-01: CLI Bridge, STATE.md Snapshot Generator & Foundation Tests

## Objective

Create the foundation layer that enables skills, agents, and hooks to interact with the XState machine through a simple CLI bridge instead of directly reading/writing STATE.md. The bridge provides high-level convenience commands (read-complexity, read-phase, transition) that shells and prompt templates can call via `bun run src/state-machine/bridge.ts <command>`. A companion snapshot generator produces backward-compatible STATE.md files from machine state, ensuring INTEG-06 (human-readable snapshots) is satisfied from day one.

This plan addresses **INTEG-01** (STATE.md reads via machine queries), **INTEG-02** (STATE.md writes via machine transitions), and **INTEG-06** (backward-compatible STATE.md snapshots).

## Context

Read these files to understand existing infrastructure:

- @src/state-machine/cli.ts -- Existing CLI with init, get, send, status, resume, reset subcommands (352 lines). Outputs JSON to stdout, errors to stderr with exit code 2. This is the foundation the bridge builds on.
- @src/state-machine/persistence.ts -- persistActor, loadPersistedActor, createFreshActor, clearPersistedState, stateExists. Manages `.planning/state.json`.
- @src/state-machine/types.ts -- workflowContextSchema (all context fields), workflowEventSchema (all events), WORKFLOW_STATES, complexityLevelSchema, oversightLevelSchema, phaseResultSchema
- @src/state-machine/events.ts -- buildTransitionRecord, extractContextSummary, describeTransition. Event-driven architecture utilities.
- @src/state-machine/machine.ts -- workflowMachine definition with states, guards, actions. WorkflowMachineInput type.
- @src/state-machine/guards.ts -- Workflow guards for complexity gating and configuration
- @src/state-machine/index.ts -- Current barrel exports for the state-machine module
- @src/state-machine/**tests**/cli.test.ts -- Existing CLI test patterns using Bun.$ subprocess (runCli helper function)
- @src/shared/types.ts -- Result<T> type used across the codebase
- @.planning/STATE.md -- Current STATE.md format (the target output format for snapshot generation)

## Tasks

### T1: Create bridge CLI module

**Goal:** Provide a high-level CLI entry point that skill prompts and hook scripts can call to read from and write to the state machine. The bridge wraps the lower-level `cli.ts` operations into task-oriented commands that match the patterns currently used in skill prompts (e.g., "read complexity", "update phase status").

**Files:** `src/state-machine/bridge.ts`

**Implementation:**

The bridge is a CLI script invoked as `bun run src/state-machine/bridge.ts <subcommand> [options]`. It outputs JSON to stdout and errors to stderr with exit code 2 (matching the existing cli.ts convention).

```typescript
/**
 * High-level CLI bridge for the Luca workflow state machine.
 *
 * Wraps state machine persistence and query operations into
 * task-oriented commands that shell scripts and prompt templates
 * can call directly.
 *
 * Usage:
 *   bun run src/state-machine/bridge.ts read-field --field=<path>
 *   bun run src/state-machine/bridge.ts read-complexity
 *   bun run src/state-machine/bridge.ts read-phase
 *   bun run src/state-machine/bridge.ts read-oversight
 *   bun run src/state-machine/bridge.ts read-status
 *   bun run src/state-machine/bridge.ts transition --event=<TYPE> [--data=<json>]
 *   bun run src/state-machine/bridge.ts snapshot [--output=<path>]
 *   bun run src/state-machine/bridge.ts ensure-init [--force]
 *
 * @module state-machine/bridge
 */
```

**Subcommand specifications:**

1. **`read-field --field=<lodash.get.path>`**
   - Load persisted actor, extract field from context via lodash `get()`
   - Output: `{ "field": "<path>", "value": <value> }`
   - Error if state not initialized: `{ "error": "State not initialized" }`, exit 2

2. **`read-complexity`**
   - Shortcut for `read-field --field=complexity`
   - Output: `{ "complexity": "MODERATE" }`
   - Falls back to `"TRIVIAL"` if state not initialized (does NOT error)

3. **`read-phase`**
   - Load actor, extract current_phase, current_plan_ids, current_wave_count
   - Output: `{ "phase": 35, "plan_ids": ["35-01"], "wave_count": 3 }`
   - Falls back to `{ "phase": null, "plan_ids": [], "wave_count": 0 }` if not initialized

4. **`read-oversight`**
   - Shortcut for `read-field --field=oversight`
   - Output: `{ "oversight": "milestone" }`
   - Falls back to `"milestone"` if state not initialized

5. **`read-status`**
   - Load actor, return workflow state + key context fields
   - Output: `{ "initialized": true, "state": "executing", "complexity": "COMPLEX", "phase": 35, "oversight": "milestone", "session_id": "abc-123" }`
   - If not initialized: `{ "initialized": false }`

6. **`transition --event=<TYPE> [--data=<json>]`**
   - Load actor, send event, persist, then regenerate STATE.md snapshot
   - Validate event via `workflowEventSchema`
   - Output: transition record (same format as `cli.ts send`)
   - Side effect: writes `.planning/STATE.md` via snapshot generator
   - If `--snapshot=false` passed, skip the STATE.md write

7. **`snapshot [--output=<path>]`**
   - Load actor, generate STATE.md-format markdown, write to path
   - Default output path: `.planning/STATE.md`
   - Output: `{ "snapshot_written": true, "path": ".planning/STATE.md" }`

8. **`ensure-init [--force]`**
   - If state exists and no `--force`: output current status (no-op)
   - If state does not exist or `--force`: create fresh actor, persist, generate snapshot
   - Output: `{ "initialized": true, "created": true|false, "session_id": "..." }`

Use the same helper patterns as `cli.ts` (`getArg`, `hasFlag`). Import from persistence module directly. Follow the functional pattern (no classes).

**Acceptance Criteria:**

- All 8 subcommands produce valid JSON on stdout
- Error cases (missing args, invalid state) produce error JSON on stderr with exit code 2
- Read commands do NOT mutate state (idempotent)
- `transition` command persists state AND regenerates STATE.md snapshot
- `ensure-init` is idempotent (safe to call multiple times)
- Full JSDoc on the module and all handler functions

### T2: Create STATE.md snapshot generator

**Goal:** Generate human-readable STATE.md markdown from the state machine's context, ensuring backward compatibility with the existing STATE.md format that skills and agents currently read.

**Files:** `src/state-machine/snapshot.ts`

**Implementation:**

```typescript
/**
 * STATE.md snapshot generator for the Luca workflow state machine.
 *
 * Reads the persisted state machine context and produces a
 * human-readable markdown snapshot that is structurally compatible
 * with the existing STATE.md format.
 *
 * This ensures backward compatibility (INTEG-06): skills and agents
 * that still read STATE.md directly will see correct data, while
 * new integrations use the bridge CLI for typed access.
 *
 * @module state-machine/snapshot
 */
import type { WorkflowContext, PhaseResult } from "./types";

/**
 * Generate a STATE.md-format markdown string from workflow context.
 *
 * Renders all fields that STATE.md currently contains:
 * - Project header with name and description
 * - Git context (ticket, issue, branch)
 * - Workflow status (state, complexity, oversight)
 * - Current position (milestone, phase, plans, waves)
 * - Harness results (if available)
 * - Phase results table (if any phases completed)
 * - Timestamps
 *
 * @param context - The workflow context to render
 * @param state - The current machine state value (e.g., "executing")
 * @returns Formatted markdown string
 */
export function generateSnapshot(
  context: WorkflowContext,
  state: string,
): string {
  // Build markdown sections:
  // 1. Title: "# Project State"
  // 2. Git Context section (ticket, issue, branch)
  // 3. Workflow Status section (state, complexity, oversight)
  // 4. Current Position section (milestone, phase, plans, waves)
  // 5. Harness Results section (if harness_result exists)
  // 6. Phase History table (if phase_results non-empty)
  // 7. Session Info (session_id, started_at, last_transition_at)
}
```

**Markdown format specification:**

The generated STATE.md must contain these fields in a format parseable by `grep "Field:" STATE.md | awk '{print $NF}'`:

```markdown
# Project State

## Git Context

- **Ticket:** PROJ-1234
- **GitHub Issue:** #42
- **Branch:** feat/PROJ-1234-feature-name
- **Base Branch:** main

## Workflow Status

- **Current State:** executing
- **Task Complexity:** COMPLEX
- **Oversight Level:** milestone
- **Session ID:** abc-12345-def-67890

## Current Position

- **Current Milestone:** v1.3.2
- **Current Phase:** 35
- **Active Plans:** 35-01, 35-02
- **Wave Count:** 3

## Harness Results

- **Status:** passed
- **Total Errors:** 0
- **Total Warnings:** 2
- **Verification Attempts:** 1 / 3

## Phase History

| Phase | Status | Summary            | Duration |
| ----- | ------ | ------------------ | -------- |
| 34    | passed | State machine core | 45000ms  |
| 35    | passed | Integration layer  | 32000ms  |

## Session Info

- **Started:** 2026-02-14T10:00:00Z
- **Last Transition:** 2026-02-14T12:30:00Z

## Quick Tasks Completed

_No quick tasks recorded._
```

**Key requirements:**

- Fields that are `undefined` or empty should be omitted (not rendered as "undefined")
- The `Task Complexity:` line must be parseable by `grep "Task Complexity:" STATE.md | awk '{print $NF}'` (used by phase-execute and lu-cognition)
- The `GitHub Issue:` line must be parseable by `grep "GitHub Issue:" STATE.md` (used by autopilot)
- The `Current Phase:` line must be parseable by `grep "Current Phase:" STATE.md | awk '{print $NF}'`
- Phase results table uses markdown pipe syntax
- Empty phase results omit the table section entirely
- Include a "Quick Tasks Completed" section stub for compatibility with the `/quick` skill
- **Preserve existing content:** When overwriting STATE.md, first read the current STATE.md and extract any "Quick Tasks Completed" section content. Inject the preserved content back into the generated snapshot. This prevents data loss when the `/quick` skill appends tasks directly to STATE.md.
- **Non-reproduced sections:** The snapshot generator does NOT reproduce the following STATE.md sections that exist in the current manually-maintained format: "Previous Milestones", "Pending Todos", "Next Actions", "Project Reference". These sections contain static reference data maintained by the autopilot/milestone skills and are NOT part of the machine context. When these sections exist in the current STATE.md, they should be preserved by reading them from the existing file and appending them to the generated snapshot.
- Accept an optional `existingContent?: string` parameter that, when provided, extracts preservable sections from the existing STATE.md and merges them into the generated output.

**Acceptance Criteria:**

- `generateSnapshot()` produces valid markdown for a full context (all fields populated)
- `generateSnapshot()` produces valid markdown for a minimal context (only defaults)
- Key fields are grep-parseable: `Task Complexity:`, `GitHub Issue:`, `Current Phase:`, `Current State:`
- Optional fields (ticket, issue, harness) are omitted when undefined, not rendered as "undefined"
- Phase history table renders correctly with 0, 1, and multiple phase results
- Output is deterministic (same context produces identical markdown)

### T3: Add snapshot subcommand to existing CLI

**Goal:** Extend the existing `cli.ts` with a `snapshot` subcommand that generates and writes a STATE.md file from the current machine state, providing a direct CLI path for INTEG-06.

**Files:** `src/state-machine/cli.ts`

**Implementation:**

Add a new handler function and wire it into the main switch:

```typescript
import { generateSnapshot } from "./snapshot";

/**
 * Generate a STATE.md snapshot from the persisted state machine.
 *
 * Loads the actor, calls generateSnapshot(), and writes the result
 * to the specified output path (default: .planning/STATE.md).
 *
 * @param args - CLI arguments (checks for --output=path)
 */
async function handleSnapshot(args: string[]): Promise<void> {
  const outputPath = getArg(args, "output", ".planning/STATE.md");

  const result = await loadPersistedActor();
  if (!result.success) {
    console.error(result.error);
    process.exit(2);
  }

  const actor = result.data;
  const snapshot = actor.getSnapshot();
  const markdown = generateSnapshot(snapshot.context, String(snapshot.value));

  await Bun.write(outputPath, markdown);
  console.log(JSON.stringify({ snapshot_written: true, path: outputPath }));
}
```

Wire into the switch statement:

```typescript
case "snapshot":
  await handleSnapshot(args);
  break;
```

Update the `printUsage()` function to include the snapshot subcommand.

**Acceptance Criteria:**

- `bun run src/state-machine/cli.ts snapshot` writes `.planning/STATE.md`
- `bun run src/state-machine/cli.ts snapshot --output=/tmp/test-state.md` writes to custom path
- Errors (no state initialized) produce error message and exit code 2
- Existing subcommands are unchanged (no regressions)
- Usage text updated to include snapshot

### T4: Add high-level convenience commands to bridge

**Goal:** Implement the full set of convenience subcommands that skill and agent prompts will call, with graceful fallbacks for uninitialized state.

**Files:** `src/state-machine/bridge.ts`

**Implementation:**

This task adds the handler functions for all bridge subcommands defined in T1. Key patterns:

```typescript
/**
 * Read complexity from state machine with fallback.
 *
 * Unlike read-field, this command does NOT error if state is
 * not initialized -- it returns the default "TRIVIAL" instead.
 * This matches the current behavior where skills grep STATE.md
 * and get nothing (treated as TRIVIAL).
 */
async function handleReadComplexity(): Promise<void> {
  const exists = await stateExists();
  if (!exists) {
    console.log(JSON.stringify({ complexity: "TRIVIAL" }));
    return;
  }

  const result = await loadPersistedActor();
  if (!result.success) {
    console.log(JSON.stringify({ complexity: "TRIVIAL" }));
    return;
  }

  const actor = result.data;
  const snapshot = actor.getSnapshot();
  console.log(
    JSON.stringify({
      complexity: snapshot.context.complexity,
    }),
  );
}
```

**Fallback strategy** (critical for backward compatibility):

- `read-complexity`: Falls back to `"TRIVIAL"` (matches grep returning empty)
- `read-phase`: Falls back to `{ "phase": null, "plan_ids": [], "wave_count": 0 }`
- `read-oversight`: Falls back to `"milestone"` (matches default config)
- `read-status`: Returns `{ "initialized": false }` (caller decides what to do)
- `read-field`: Returns error (callers must handle explicitly)

**`transition` command implementation:**

```typescript
/**
 * Send an event, persist state, and regenerate STATE.md snapshot.
 *
 * This is the primary write command for the bridge. It combines
 * three operations atomically:
 * 1. Send event to state machine
 * 2. Persist updated state to state.json
 * 3. Regenerate STATE.md snapshot for backward compatibility
 */
async function handleTransition(args: string[]): Promise<void> {
  // 1. Parse event type and data from args
  // 2. Validate event via workflowEventSchema
  // 3. Load actor
  // 4. Send event
  // 5. Persist actor
  // 6. Generate snapshot (unless --snapshot=false)
  // 7. Output transition record
}
```

**Acceptance Criteria:**

- All read commands return valid JSON with correct fallback values
- `transition` atomically updates state.json AND STATE.md
- `ensure-init` is idempotent (calling twice produces same result)
- All subcommands handle the "state not initialized" case gracefully
- No read command mutates state
- Commands match the calling patterns documented for Wave 3 prompt updates

### T5: Update barrel exports for bridge and snapshot

**Goal:** Expose the snapshot generator through the `src/state-machine/index.ts` barrel so other TypeScript modules can use it directly.

**Files:** `src/state-machine/index.ts`

**Implementation:**

Add to existing barrel exports:

```typescript
// Snapshot generation
export { generateSnapshot } from "./snapshot";
```

The bridge module is NOT exported through the barrel -- it is a CLI entry point only, not a library. The bridge is invoked via `bun run src/state-machine/bridge.ts` in shell scripts.

**Acceptance Criteria:**

- `import { generateSnapshot } from '../state-machine'` resolves correctly
- No duplicate exports with existing state-machine module
- Bridge module intentionally excluded from barrel (CLI-only)
- TypeScript resolves all imports without errors

### T6: Write bridge CLI tests

**Goal:** Comprehensive test coverage for the bridge CLI, testing all subcommands through actual subprocess invocation to match real usage patterns.

**Files:** `src/state-machine/__tests__/bridge.test.ts`

**Implementation:**

Follow the existing test pattern from `src/state-machine/__tests__/cli.test.ts`:

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { unlinkSync, mkdirSync } from "node:fs";
import { $ } from "bun";

const STATE_FILE = ".planning/state.json";
const SNAPSHOT_FILE = ".planning/STATE.md";
const BRIDGE = "src/state-machine/bridge.ts";

/**
 * Run a bridge subcommand and return parsed result.
 */
async function runBridge(
  ...args: string[]
): Promise<{ exitCode: number; stdout: string; stderr: string; json?: any }> {
  const result = await $`bun run ${BRIDGE} ${args}`.quiet().nothrow();
  const stdout = result.stdout.toString().trim();
  const stderr = result.stderr.toString().trim();
  let json: any;
  try {
    json = JSON.parse(stdout);
  } catch {
    // stdout may not be JSON
  }
  return { exitCode: result.exitCode, stdout, stderr, json };
}
```

**Test cases (minimum 12):**

1. **`ensure-init` -- creates fresh state:**
   - Exits 0, returns `{ initialized: true, created: true }`
   - State file exists after call
   - STATE.md snapshot exists after call

2. **`ensure-init` -- idempotent:**
   - Call twice, second returns `{ initialized: true, created: false }`
   - Session ID unchanged between calls

3. **`read-complexity` -- initialized state:**
   - Returns `{ complexity: "TRIVIAL" }` for fresh state

4. **`read-complexity` -- uninitialized state:**
   - Returns `{ complexity: "TRIVIAL" }` (fallback, no error)

5. **`read-phase` -- no phase set:**
   - Returns `{ phase: null, plan_ids: [], wave_count: 0 }`

6. **`read-oversight` -- default oversight:**
   - Returns `{ oversight: "milestone" }`

7. **`read-status` -- initialized state:**
   - Returns `{ initialized: true, state: "idle", ... }`

8. **`read-status` -- uninitialized state:**
   - Returns `{ initialized: false }`

9. **`read-field` -- valid field path:**
   - After init: `read-field --field=session_id` returns non-empty string

10. **`read-field` -- uninitialized state:**
    - Returns error JSON, exit code 2

11. **`transition` -- valid event:**
    - `transition --event=START` changes state from idle to preflight
    - STATE.md snapshot is updated

12. **`transition` -- invalid event:**
    - `transition --event=INVALID_EVENT` returns error, exit code 2

13. **`snapshot` -- generates STATE.md:**
    - After init: snapshot writes .planning/STATE.md
    - Content contains `Task Complexity:` line

**Acceptance Criteria:**

- All tests pass with `bun test src/state-machine/__tests__/bridge.test.ts`
- Tests use subprocess invocation (Bun.$) to match real usage
- State files are cleaned up between tests (beforeEach/afterEach)
- At least 12 test cases covering all subcommands

### T7: Write snapshot generator tests

**Goal:** Comprehensive test coverage for the STATE.md markdown generation, ensuring the output is grep-parseable and structurally compatible with existing skill/agent patterns.

**Files:** `src/state-machine/__tests__/snapshot.test.ts`

**Implementation:**

```typescript
import { describe, test, expect } from "bun:test";
import { generateSnapshot } from "../snapshot";
import { initializeContext } from "../types";
```

**Test cases (minimum 10):**

1. **Full context snapshot:**
   - Context with all fields populated produces valid markdown
   - Contains all expected section headers

2. **Minimal context snapshot:**
   - Context with only defaults produces valid markdown
   - No "undefined" strings appear in output

3. **`Task Complexity:` grep compatibility:**
   - Line matches pattern: `grep "Task Complexity:" output | awk '{print $NF}'`
   - Returns exact complexity level (e.g., "COMPLEX")

4. **`GitHub Issue:` grep compatibility:**
   - When github_issue is set, line contains `#42` format
   - When github_issue is undefined, section omits that line

5. **`Current Phase:` grep compatibility:**
   - When current_phase is set, line parseable by awk
   - When current_phase is undefined, line omitted

6. **`Current State:` presence:**
   - Line contains the machine state (e.g., "executing")

7. **Phase results table -- empty:**
   - No phase_results: table section omitted entirely

8. **Phase results table -- multiple results:**
   - Renders correct pipe-separated table with header row
   - Each phase result on its own row

9. **Harness results section -- present:**
   - When harness_result set, renders status, errors, warnings
   - Verification attempts shown as `N / M`

10. **Harness results section -- absent:**
    - When harness_result undefined, section omitted

11. **Determinism:**
    - Same context and state produces identical markdown on two calls

**Acceptance Criteria:**

- All tests pass with `bun test src/state-machine/__tests__/snapshot.test.ts`
- At least 10 test cases
- Grep-parseable fields verified with actual string matching
- No "undefined" or "null" strings in generated markdown
- Tests construct context via `initializeContext()` for type safety

### T8: Write integration test for bridge-to-snapshot pipeline

**Goal:** End-to-end test validating that the bridge CLI can initialize state, send events, generate snapshots, and that the snapshot content matches the machine state. This validates INTEG-01, INTEG-02, and INTEG-06 together.

**Files:** `src/state-machine/__tests__/bridge-integration.test.ts`

**Implementation:**

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { unlinkSync, mkdirSync, readFileSync } from "node:fs";
import { $ } from "bun";

const BRIDGE = "src/state-machine/bridge.ts";
```

**Test cases:**

1. **Full lifecycle:**
   - `ensure-init` -> state initialized
   - `transition --event=START --data='{"ticket_id":"PROJ-42"}'`
   - `snapshot` -> writes STATE.md
   - Read STATE.md -> contains `Ticket: PROJ-42` and `Current State: preflight`
   - `read-complexity` -> matches complexity in STATE.md

2. **Multiple transitions:**
   - Init -> START -> PREFLIGHT_COMPLETE -> ROUTE_COMPLETE -> verify each step
   - STATE.md updated after each transition
   - `read-status` state matches latest transition

3. **Snapshot consistency:**
   - After transitions, `read-field --field=current_phase` returns value
   - Same value appears in STATE.md `Current Phase:` line

4. **Reset and re-init:**
   - Init -> START -> reset -> ensure-init -> fresh state
   - Old session_id replaced with new one

**Acceptance Criteria:**

- All tests pass with `bun test src/state-machine/__tests__/bridge-integration.test.ts`
- Tests exercise the full init -> transition -> snapshot -> read cycle
- STATE.md content verified against machine state
- Tests clean up state files between runs

## Success Criteria

1. All 3 source files compile without TypeScript errors (`bunx --bun tsc --noEmit`)
2. All 3 test files pass (`bun test src/state-machine/__tests__/bridge*.test.ts src/state-machine/__tests__/snapshot.test.ts`)
3. Existing CLI tests still pass (`bun test src/state-machine/__tests__/cli.test.ts`)
4. Bridge subcommands all produce valid JSON output
5. Snapshot generator produces grep-parseable STATE.md
6. `transition` command atomically updates state.json AND STATE.md
7. Read commands with graceful fallbacks for uninitialized state
8. Full JSDoc documentation on all exported functions
9. No "undefined" or "null" strings in generated STATE.md
10. Barrel exports updated without breaking existing imports

## Verification

**Automated checks:**

- `bunx --bun tsc --noEmit` -- all files type-check
- `bun test src/state-machine/__tests__/` -- all state machine tests pass (existing + new)
- `bun test` -- full test suite passes (no regressions)

**Manual verification:**

- Run `bun run src/state-machine/bridge.ts ensure-init` and confirm state.json and STATE.md created
- Run `bun run src/state-machine/bridge.ts transition --event=START` and verify STATE.md updated
- Run `grep "Task Complexity:" .planning/STATE.md | awk '{print $NF}'` and confirm parseable output
- Run `bun run src/state-machine/bridge.ts read-complexity` and confirm JSON matches STATE.md
- Diff generated STATE.md against the current STATE.md template for structural compatibility
