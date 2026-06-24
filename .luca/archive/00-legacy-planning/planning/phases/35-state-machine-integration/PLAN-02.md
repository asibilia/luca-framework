---
id: "35-02"
title: "Hook Integration: Session, Context Monitor & Snapshot Sync"
phase: 35
wave: 2
depends_on: ["35-01"]
tasks:
  - id: "T1"
    title: "Update session-start.sh to initialize state machine alongside STATE.md"
    description: "Extend .claude/hooks/session-start.sh to call bun run src/state-machine/bridge.ts ensure-init after creating STATE.md, so the state machine is initialized on session start. Add a state.json freshness check: if state.json already exists and is less than 24 hours old, skip re-init (resume session)."
    files: ["src/hooks/scripts/session-start.sh"]
    verification: "Session start creates both .planning/STATE.md and .planning/state.json. If state.json already exists and is recent, session resumes without re-init. Existing hook behavior (BRAIN.md, MEMORY.md, WORKING.md, config.json creation) is unchanged."
  - id: "T2"
    title: "Update context-monitor.sh to read state.json for enhanced breakdown"
    description: "Extend .claude/hooks/context-monitor.sh to include state.json size in the context breakdown and to read machine state for richer status messages. Add state.json byte count to TOTAL_CONTEXT_BYTES and context_breakdown JSON output."
    files: ["src/hooks/scripts/context-monitor.sh"]
    verification: "Context monitor includes state_json_bytes in context_breakdown. TOTAL_CONTEXT_BYTES accounts for state.json. Existing severity levels, thresholds, and dual-platform output are unchanged."
  - id: "T3"
    title: "Create snapshot-sync hook for PostToolUse"
    description: "Create src/hooks/scripts/snapshot-sync.sh that regenerates STATE.md from the state machine on a throttled basis (skip if last sync was <120 seconds ago). This ensures STATE.md stays in sync with state.json for any consumers still reading STATE.md directly. Register as async PostToolUse hook."
    files: ["src/hooks/scripts/snapshot-sync.sh", ".claude/settings.json"]
    verification: "Hook runs after tool use. Skips if last sync was within 120 seconds. When it runs, calls bun run src/state-machine/bridge.ts snapshot. STATE.md is updated to match state.json. Hook is async (does not block tool use)."
  - id: "T4"
    title: "Add pre-commit snapshot sync to pre-commit-gate"
    description: "Update the pre-commit hook chain to regenerate STATE.md from state machine before committing, ensuring commits always contain a STATE.md that reflects the machine state. Add a single line to the pre-commit flow that calls bun run src/state-machine/bridge.ts snapshot."
    files: ["src/hooks/scripts/pre-commit-gate.sh"]
    verification: "Pre-commit gate regenerates STATE.md before test and typecheck. Existing pre-commit checks (test, typecheck) are unchanged. If state machine is not initialized, snapshot step is skipped (does not block commit)."
  - id: "T5"
    title: "Write hook integration tests"
    description: "Create src/state-machine/__tests__/hook-integration.test.ts covering the session-start -> state init -> snapshot sync pipeline. Tests verify state.json and STATE.md are created, snapshot-sync updates STATE.md, and pre-commit snapshot works."
    files: ["src/state-machine/__tests__/hook-integration.test.ts"]
    verification: "bun test src/state-machine/__tests__/hook-integration.test.ts passes all tests. At least 8 test cases covering session init, resume, snapshot sync throttling, and pre-commit sync."
---

# Plan 35-02: Hook Integration: Session, Context Monitor & Snapshot Sync

## Objective

Wire the state machine into the hook lifecycle so that session start initializes the machine, context monitoring accounts for machine state, and STATE.md snapshots are automatically regenerated to stay in sync with the state machine. This plan addresses **INTEG-05** (hooks integrate with state machine) and reinforces **INTEG-06** (backward-compatible snapshots) by ensuring STATE.md is always current.

The key insight is that hooks are the system's heartbeat -- they fire automatically at session boundaries, tool use events, and pre-commit gates. Wiring the state machine into these hooks means every session benefits from typed state without any skill/agent needing explicit migration yet.

## Context

Read these files to understand existing hook infrastructure and Wave 1 outputs:

- @.claude/hooks/session-start.sh -- SessionStart hook (422 lines). Creates .planning/ directory with BRAIN.md, MEMORY.md, WORKING.md, STATE.md, ROADMAP.md, config.json. Creates session lock file. Uses bun -e for JSON parsing.
- @.claude/hooks/context-monitor.sh -- Stop-event hook (209 lines). Checks transcript and WORKING.md sizes. Enhanced breakdown with BRAIN, MEMORY, STATE sizes. Dual-platform output (systemMessage / followup_message).
- @src/hooks/scripts/pre-commit-gate.sh -- Pre-commit hook that runs test and typecheck before commits.
- @src/state-machine/bridge.ts -- (from PLAN-01) CLI bridge with ensure-init, snapshot, read-status, transition subcommands.
- @src/state-machine/snapshot.ts -- (from PLAN-01) generateSnapshot() that produces STATE.md-format markdown from machine context.
- @src/state-machine/persistence.ts -- persistActor, loadPersistedActor, stateExists. STATE_FILE_PATH = ".planning/state.json".
- @.claude/settings.json -- Hook registrations for Claude Code (SessionStart, Stop, PostToolUse, PreToolUse).

## Tasks

### T1: Update session-start.sh to initialize state machine alongside STATE.md

**Goal:** Make session start the entry point for state machine initialization. When a session begins, the hook creates both the traditional STATE.md (for backward compatibility) AND initializes the state machine (state.json). For subsequent sessions, the hook detects existing state.json and resumes instead of reinitializing.

**Files:** `.claude/hooks/session-start.sh`

**Implementation:**

Add a new step after Step 3c (STATE.md creation) and before Step 4 (runtime detection). This step handles state machine initialization:

```bash
# Step 3e: Initialize state machine if needed
# The state machine (state.json) is the source of truth for workflow state.
# STATE.md is regenerated from it for backward compatibility.

STATE_JSON="$PLANNING_DIR/state.json"
STATE_MACHINE_BRIDGE="src/state-machine/bridge.ts"

if [ -f "$STATE_MACHINE_BRIDGE" ]; then
  if [ -f "$STATE_JSON" ]; then
    # Check if state.json is fresh (< 24 hours old)
    # If fresh, resume session. If stale, reinitialize.
    STATE_AGE=$(( $(date +%s) - $(stat -f "%m" "$STATE_JSON" 2>/dev/null || stat -c "%Y" "$STATE_JSON" 2>/dev/null || echo "0") ))
    if [ "$STATE_AGE" -lt 86400 ]; then
      # State is fresh -- resume session
      # Regenerate STATE.md snapshot to ensure it's current
      bun run "$STATE_MACHINE_BRIDGE" snapshot 2>/dev/null || true
    else
      # State is stale -- reinitialize
      bun run "$STATE_MACHINE_BRIDGE" ensure-init --force 2>/dev/null || true
      CREATED="${CREATED}state.json "
    fi
  else
    # No state.json -- initialize fresh
    bun run "$STATE_MACHINE_BRIDGE" ensure-init 2>/dev/null || true
    CREATED="${CREATED}state.json "
  fi
fi
```

**Key requirements:**

1. **Graceful degradation**: If the bridge script does not exist (e.g., framework not built yet), skip state machine initialization silently. The `|| true` prevents hook failure.
2. **Freshness check**: Use `stat` to check file modification time. On macOS use `-f "%m"`, on Linux use `-c "%Y"`. Check both variants for cross-platform support.
3. **Resume vs reinitialize**: If state.json exists and is < 24 hours old, just regenerate the STATE.md snapshot. If stale or missing, run `ensure-init`.
4. **STATE.md backward compatibility**: The existing STATE.md creation block (Step 3c) remains unchanged. The state machine init happens after it, and the `snapshot` call overwrites STATE.md with machine-derived content. If STATE.md was just created from the template AND state machine was just initialized, the snapshot overwrites the template with the machine's initial state.
5. **Session lock**: The existing session lock step (Step 8) is unchanged.

**Do NOT modify:**

- Steps 3a-3d (MEMORY.md, WORKING.md, STATE.md, ROADMAP.md creation)
- Steps 4-8 (runtime detection, config.json, BRAIN.md, env vars, session lock)
- The overall hook structure and output format

**Acceptance Criteria:**

- Session start creates `.planning/state.json` alongside existing `.planning/STATE.md`
- If state.json already exists and is recent, session resumes (no reinit)
- If state.json is stale (>24h), it is reinitialized
- If bridge script does not exist, step is silently skipped
- Existing hook behavior (all other files, output format) is unchanged
- Hook still completes within 15 second timeout
- Cross-platform `stat` works on both macOS and Linux

### T2: Update context-monitor.sh to read state.json for enhanced breakdown

**Goal:** Include state.json in the context breakdown calculation so users get accurate total context usage. The state.json file can grow significantly (especially with phase_results history), so it should be accounted for in context monitoring.

**Files:** `.claude/hooks/context-monitor.sh`

**Implementation:**

Extend the "Enhanced breakdown" section (currently lines 123-151) to include state.json:

```bash
# --- Enhanced breakdown: All memory files ---
BRAIN_MD="$PROJECT_DIR/.planning/BRAIN.md"
MEMORY_MD="$PROJECT_DIR/.planning/MEMORY.md"
STATE_MD="$PROJECT_DIR/.planning/STATE.md"
STATE_JSON="$PROJECT_DIR/.planning/state.json"  # NEW: State machine file

BRAIN_SIZE=0
MEMORY_SIZE=0
STATE_SIZE=0
STATE_JSON_SIZE=0  # NEW

if [ -f "$BRAIN_MD" ]; then
  BRAIN_SIZE=$(wc -c < "$BRAIN_MD" | tr -d ' ')
fi
if [ -f "$MEMORY_MD" ]; then
  MEMORY_SIZE=$(wc -c < "$MEMORY_MD" | tr -d ' ')
fi
if [ -f "$STATE_MD" ]; then
  STATE_SIZE=$(wc -c < "$STATE_MD" | tr -d ' ')
fi
if [ -f "$STATE_JSON" ]; then  # NEW
  STATE_JSON_SIZE=$(wc -c < "$STATE_JSON" | tr -d ' ')
fi

# Include state.json in total (it's loaded for context but not displayed to user)
TOTAL_CONTEXT_BYTES=$((BRAIN_SIZE + MEMORY_SIZE + ${WMD_SIZE:-0} + STATE_SIZE + STATE_JSON_SIZE))
```

Update the context_breakdown JSON output to include the new field:

```bash
  msg.context_breakdown = {
    brain_bytes: parseInt(process.env.HOOK_BRAIN_SIZE || '0', 10),
    memory_bytes: parseInt(process.env.HOOK_MEMORY_SIZE || '0', 10),
    working_bytes: parseInt(process.env.HOOK_WORKING_SIZE || '0', 10),
    state_bytes: parseInt(process.env.HOOK_STATE_SIZE || '0', 10),
    state_json_bytes: parseInt(process.env.HOOK_STATE_JSON_SIZE || '0', 10),  // NEW
    total_bytes: parseInt(process.env.HOOK_TOTAL_SIZE || '0', 10),
  };
```

Add `HOOK_STATE_JSON_SIZE="$STATE_JSON_SIZE"` to the environment variable list passed to bun -e.

**Do NOT modify:**

- Severity level logic (NONE/MODERATE/HIGH/CRITICAL)
- Transcript check logic
- WORKING.md check logic
- SEC-01 transcript path validation
- Output format structure (systemMessage / followup_message)
- Compression recommendation thresholds

**Acceptance Criteria:**

- state.json size included in TOTAL_CONTEXT_BYTES
- context_breakdown JSON includes `state_json_bytes` field
- Existing severity levels and thresholds are unchanged
- Missing state.json file handled gracefully (size = 0)
- All existing behavior preserved (backward compatible)

### T3: Create snapshot-sync hook for PostToolUse

**Goal:** Keep STATE.md automatically in sync with the state machine during execution. This hook runs after tool use events (edits, bash commands) on a throttled basis, regenerating STATE.md from state.json. This ensures that if a skill or agent reads STATE.md directly (before being migrated to the bridge), they see current data.

**Files:** `src/hooks/scripts/snapshot-sync.sh`, `.claude/settings.json`

**Implementation:**

Create `src/hooks/scripts/snapshot-sync.sh`:

```bash
#!/usr/bin/env bash
# snapshot-sync.sh -- Sync STATE.md from state machine (throttled)
#
# Hook event: PostToolUse (async)
# Timeout: 10 seconds
#
# Regenerates .planning/STATE.md from .planning/state.json
# on a throttled basis (skip if last sync was within 120 seconds).
# This ensures STATE.md backward compatibility while the state
# machine is the source of truth.

set -euo pipefail

# Read stdin JSON (standard hook pattern)
INPUT=$(cat)

# Throttle: skip if last sync was recent
THROTTLE_FILE="/tmp/.luca-snapshot-sync-ts"
THROTTLE_SECONDS=120

if [ -f "$THROTTLE_FILE" ]; then
  LAST_SYNC=$(cat "$THROTTLE_FILE" 2>/dev/null || echo "0")
  NOW=$(date +%s)
  ELAPSED=$((NOW - LAST_SYNC))
  if [ "$ELAPSED" -lt "$THROTTLE_SECONDS" ]; then
    exit 0  # Skip -- too recent
  fi
fi

# Check if state machine bridge exists
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
BRIDGE="$PROJECT_DIR/src/state-machine/bridge.ts"

if [ ! -f "$BRIDGE" ]; then
  exit 0  # Bridge not available -- skip silently
fi

# Check if state.json exists
STATE_JSON="$PROJECT_DIR/.planning/state.json"
if [ ! -f "$STATE_JSON" ]; then
  exit 0  # State machine not initialized -- skip silently
fi

# Update throttle timestamp
date +%s > "$THROTTLE_FILE"

# Regenerate STATE.md snapshot from state machine
cd "$PROJECT_DIR"
bun run "$BRIDGE" snapshot 2>/dev/null || true

exit 0
```

Register in hook registry (`src/hooks/index.ts`) as a PostToolUse hook entry (no matcher — runs on all tool uses). The build pipeline will generate `.claude/settings.json` and `.cursor/hooks.json` from the registry. Follow the existing pattern for context-check-throttled:

```typescript
"snapshot-sync": {
  event: "PostToolUse",
  cursorEvent: "afterFileEdit",
  matcher: undefined,
  cursorMatcher: undefined,
  script: "snapshot-sync.sh",
  timeout: 10,
  async: true,
  statusMessage: "Syncing STATE.md...",
},
```

After adding to the registry, run `bun run build:all` to propagate the hook to `.claude/settings.json`, `.cursor/hooks.json`, and template directories. Update the template test count and hook registry test count accordingly.

**Key design decisions:**

1. **120-second throttle**: More conservative than the 60-second context monitor throttle because snapshot generation involves disk I/O (reading state.json, writing STATE.md). Prevents excessive writes during rapid editing.
2. **Async execution**: Does not block tool use. STATE.md may be briefly stale (up to 2 minutes) but this is acceptable for backward compatibility.
3. **Silent failures**: If bridge does not exist or state machine is not initialized, the hook exits silently. This prevents errors during early project setup or when the framework is not fully built.
4. **Throttle file location**: `/tmp/.luca-snapshot-sync-ts` (distinct from context monitor's throttle file).

**Acceptance Criteria:**

- Hook skips execution if last sync was within 120 seconds
- Hook skips silently if bridge.ts does not exist
- Hook skips silently if state.json does not exist
- When it runs, STATE.md is updated to match state.json content
- Registered as async PostToolUse hook in .claude/settings.json
- No output to stdout/stderr during normal operation
- Hook completes within 10 second timeout

### T4: Add pre-commit snapshot sync to pre-commit-gate

**Goal:** Ensure every git commit contains a STATE.md that reflects the current state machine state. This guarantees that state drift between state.json and STATE.md does not persist in version control.

**Files:** `src/hooks/scripts/pre-commit-gate.sh`

**Implementation:**

Add a snapshot sync step at the beginning of the pre-commit gate (before running tests and typecheck), so that STATE.md is always current in commits:

```bash
# Step 0: Sync STATE.md from state machine (if available)
# This ensures commits always contain a STATE.md matching machine state.
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
BRIDGE="$PROJECT_DIR/src/state-machine/bridge.ts"
STATE_JSON="$PROJECT_DIR/.planning/state.json"

if [ -f "$BRIDGE" ] && [ -f "$STATE_JSON" ]; then
  cd "$PROJECT_DIR"
  bun run "$BRIDGE" snapshot 2>/dev/null || true
  # Add the regenerated STATE.md to the commit staging area
  git add .planning/STATE.md 2>/dev/null || true
fi
```

**Key requirements:**

1. **Non-blocking**: The `|| true` ensures that snapshot failures do not block the commit. The existing pre-commit checks (test, typecheck) are the real gates.
2. **Auto-stage**: After generating the snapshot, `git add .planning/STATE.md` adds it to the staging area so it is included in the commit.
3. **Conditional**: Only runs if both bridge.ts and state.json exist. Skips gracefully otherwise.
4. **Placement**: Before existing checks (test, typecheck) so that any snapshot errors do not interfere with the quality gates.

**Do NOT modify:**

- Existing pre-commit checks (test, typecheck)
- Hook timeout settings
- Error handling for pre-commit failures
- The commit-blocking behavior (only test/typecheck should block)

**Acceptance Criteria:**

- Pre-commit gate regenerates STATE.md before running test and typecheck
- Regenerated STATE.md is auto-staged (`git add`)
- If bridge or state.json does not exist, step is skipped (no error)
- Existing pre-commit checks (test, typecheck) are unchanged
- Snapshot failure does not block the commit
- STATE.md in commits always matches machine state

### T5: Write hook integration tests

**Goal:** Verify the hook integration works end-to-end: session start initializes the state machine, snapshot sync keeps STATE.md current, and the pre-commit sync produces valid snapshots.

**Files:** `src/state-machine/__tests__/hook-integration.test.ts`

**Implementation:**

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { unlinkSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { $ } from "bun";
```

**Test cases (minimum 8):**

1. **Session init -- fresh state:**
   - Remove state.json if exists
   - Call `bun run src/state-machine/bridge.ts ensure-init`
   - Verify state.json created
   - Verify STATE.md created with matching content

2. **Session init -- resume:**
   - Initialize state machine
   - Send a START event to move state away from "idle"
   - Call `ensure-init` again (without --force)
   - Verify session_id is unchanged (resumed, not reinitiated)
   - Verify state is still "preflight" (not reset to "idle")

3. **Session init -- force reinit:**
   - Initialize and send events
   - Call `ensure-init --force`
   - Verify session_id changed (new session)
   - Verify state is "idle" (fresh start)

4. **Snapshot sync -- updates STATE.md:**
   - Initialize state machine
   - Send START event via bridge transition
   - Read STATE.md, verify it contains `Current State: preflight`
   - Send ROUTE_COMPLETE event with complexity COMPLEX
   - Run bridge snapshot manually
   - Read STATE.md, verify it contains `Task Complexity: COMPLEX`

5. **Snapshot sync -- throttle behavior:**
   - Create throttle file with recent timestamp
   - Run snapshot-sync.sh
   - Verify it exits without updating STATE.md
   - Remove throttle file
   - Run snapshot-sync.sh
   - Verify STATE.md is updated

6. **Snapshot sync -- missing bridge:**
   - Rename bridge.ts temporarily
   - Run snapshot-sync.sh
   - Verify it exits 0 (no error)
   - Restore bridge.ts

7. **Pre-commit snapshot -- valid state:**
   - Initialize and transition state machine
   - Call bridge snapshot
   - Verify STATE.md content matches machine state
   - Verify STATE.md is grep-parseable for complexity

8. **Context breakdown -- includes state.json:**
   - Initialize state machine (creates state.json)
   - Verify state.json exists and has content
   - Read state.json size, confirm it would be counted in context total

9. **STATE.md and state.json consistency:**
   - Initialize state machine
   - Read complexity from bridge: `read-complexity`
   - Read complexity from STATE.md via grep
   - Verify both return the same value

**Acceptance Criteria:**

- All tests pass with `bun test src/state-machine/__tests__/hook-integration.test.ts`
- At least 8 test cases
- Tests clean up state files between runs (beforeEach/afterEach)
- Tests verify both state.json and STATE.md correctness
- Throttle behavior tested (skip when recent, run when stale)
- Graceful degradation tested (missing files handled)

## Success Criteria

1. Session start hook creates state.json alongside existing planning files
2. Session resume detects existing state.json and skips reinitialization
3. Context monitor includes state.json in total context bytes
4. Snapshot sync hook keeps STATE.md in sync with state machine (throttled)
5. Pre-commit gate regenerates STATE.md before committing
6. All existing hook behavior is preserved (backward compatible)
7. All hooks handle missing bridge/state.json gracefully (silent skip)
8. All tests pass (`bun test src/state-machine/__tests__/hook-integration.test.ts`)
9. Existing tests still pass (`bun test`)
10. No hook exceeds its timeout (session-start: 15s, context-monitor: 5s, snapshot-sync: 10s, pre-commit-gate: existing timeout)

## Verification

**Automated checks:**

- `bun run build:all` -- regenerate all outputs from source (hooks, settings, templates)
- `bun run check:drift` -- verify no drift between source and output
- `bunx --bun tsc --noEmit` -- all files type-check
- `bun test src/state-machine/__tests__/` -- all state machine tests pass (Wave 1 + Wave 2)
- `bun test` -- full test suite passes (no regressions, including hook registry and template drift tests)

**Manual verification:**

- Start a new session (or simulate by running session-start.sh) and verify both state.json and STATE.md exist
- Run `bun run src/state-machine/bridge.ts transition --event=START` and verify STATE.md updates
- Wait 2+ minutes, edit a file, and verify snapshot-sync.sh runs (check STATE.md mtime)
- Run `git commit` (with changes) and verify STATE.md in the commit matches machine state
- Check context-monitor.sh output includes `state_json_bytes` in the breakdown
