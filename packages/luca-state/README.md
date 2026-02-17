# luca-state

Standalone XState v5 state machine for the Luca agentic workflow. Zero framework dependencies.

## Overview

`luca-state` encapsulates the 13-state deterministic workflow machine that drives Luca's development lifecycle: idle, preflight, routing, discussing, planning, executing, verifying, learning, committing, complete, suspended, paused, and failed.

The package is fully self-contained with persistence, CLI tools, snapshot generation, complexity gating, and guard logic.

## Requirements

- Bun >= 1.x

## Installation

```bash
# Workspace (monorepo)
bun add luca-state

# Or reference directly
bun add ./packages/luca-state
```

## CLI Usage

The package provides a CLI binary (`luca-state`) for shell scripts, hooks, and agent prompts.

```bash
# Read commands (graceful fallback when state not initialized)
luca-state read-status
luca-state read-complexity
luca-state read-oversight
luca-state read-phase

# Read arbitrary context field
luca-state read-field --field=session_id

# Set allowlisted context fields
luca-state set-field --field=current_milestone --value="v2.0"
luca-state set-field --field=github_issue --value=42

# Send workflow events
luca-state transition --event=START
luca-state transition --event=ROUTE_COMPLETE --data='{"complexity":"COMPLEX"}'

# Generate STATE.md from current machine state
luca-state snapshot

# Initialize state (idempotent)
luca-state ensure-init
luca-state ensure-init --force

# Check gate configuration
luca-state gate-check --gate=confirm_plan
```

All output is JSON to stdout. Errors go to stderr with exit code 2.

## Programmatic API

```typescript
import {
  workflowMachine,
  getAllowedEvents,
  createFreshActor,
  persistActor,
  loadPersistedActor,
  generateSnapshot,
} from "luca-state";

// Create and start a fresh actor
const result = await createFreshActor();
if (result.success) {
  const actor = result.data;
  actor.send({ type: "START", ticket_id: "PROJ-1" });

  // Persist to .planning/state.json
  await persistActor(actor);

  // Get allowed events
  const snapshot = actor.getSnapshot();
  const allowed = getAllowedEvents(snapshot);
  // ["PREFLIGHT_COMPLETE", "SKIP", "ABORT"]
}

// Resume from persisted state
const loaded = await loadPersistedActor();
if (loaded.success) {
  const snapshot = loaded.data.getSnapshot();
  console.log(snapshot.value); // e.g., "preflight"
}
```

## Configuration

The machine reads `.planning/config.json` for:

- **gates** -- boolean flags controlling workflow branches
- **workflow_config** -- feature toggles (research, code_review, uat_required)
- **complexity_matrix** -- per-level gating overrides
- **autopilot_config** -- automation settings (max_phases_per_session, oversight)

## Complexity Levels

| Level    | Research | Discussion | Verification | Learning     |
| -------- | -------- | ---------- | ------------ | ------------ |
| TRIVIAL  | Skip     | Skip       | Quick        | Skip         |
| SIMPLE   | Skip     | Skip       | Quick        | Brief        |
| MODERATE | Optional | Optional   | Standard     | Standard     |
| COMPLEX  | Required | Run        | Full         | Full         |
| CRITICAL | Required | Required   | Full+Human   | Full+Debrief |

## Testing

```bash
bun test packages/luca-state/
bun test packages/luca-state/ --coverage
```

339 tests across 11 files, 88%+ line coverage.

## License

Apache-2.0
