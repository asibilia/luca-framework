---
id: 70-A
title: "Critical fixes + core infrastructure (--no-extensions, onComplete callback, sendMessage)"
phase: 70
wave: 1
depends_on: ["69-A"]
---

# Plan 70-A: Critical Fixes + Core Infrastructure

## Objective

Fix the two most impactful Pi API gaps: subagent extension isolation (`--no-extensions`) and auto-delivery of subagent results (`sendMessage`). Also add the `onComplete` callback pattern to `spawn.ts` so extensions can react to subagent completion without coupling the shared helper to the Pi API.

## Context

**Problem 1 (C2):** Subagents inherit all parent extensions, causing lock file contention and unnecessary tool pollution. Every reference Pi implementation uses `--no-extensions` for spawned subagents. This is a one-line fix in `spawn.ts`.

**Problem 2 (C1):** When a subagent completes, the parent agent has no automatic notification. The user must manually poll via `luca_subagent_result`. Pi provides `pi.sendMessage()` for injecting messages into the session, which can trigger a new LLM turn to process the result.

**Architecture decision:** Use a callback pattern. `spawn.ts` accepts an optional `onComplete(id, output, elapsed)` callback in `SpawnOptions`. Each extension that calls `spawnPiSubprocess` wires its own Pi-specific delivery logic (e.g., `pi.sendMessage()`) in that callback. This keeps `spawn.ts` Pi-API-free.

**Pitfall:** `sendMessage` during active streaming requires `deliverAs: "followUp"` or throws. Always use `deliverAs: "followUp"` since we cannot know if the agent is idle when a subagent finishes.

---

## Task 1: Add `--no-extensions` flag to subagent spawning

**Goal**: Prevent subagents from loading parent extensions (eliminates lock file contention and tool pollution).

**File**: `src/hooks/pi-extensions/__helpers/spawn.ts`

**Change**: In `spawnPiSubprocess()`, add `--no-extensions` to the `args` array after the `--mode json -p` flags. This is unconditional — subagents should never load extensions.

```typescript
// Current (line ~178):
const args: string[] = ["--mode", "json", "-p"];

// After:
const args: string[] = ["--mode", "json", "-p", "--no-extensions"];
```

**Impact**: One line added. All subagent spawning (luca-subagents, luca-teams, luca-purpose-gating) automatically benefits since they all use `spawnPiSubprocess()`.

**Verification**:

- `bunx --bun tsc --noEmit` -- no type errors
- `bun test __tests__/src/hooks/` -- existing tests pass
- Manual: spawned subagents no longer register extension tools

---

## Task 2: Add `onComplete` callback to SpawnOptions interface

**Goal**: Allow callers of `spawnPiSubprocess()` to react when a subagent finishes, without coupling spawn.ts to any Pi API.

**File**: `src/hooks/pi-extensions/__helpers/spawn.ts`

**Changes**:

1. Extend `SpawnOptions` interface:

```typescript
export interface SpawnOptions {
  // ... existing fields ...
  /** Callback invoked when the subagent process exits. */
  onComplete?: (info: {
    id: string;
    agent: string;
    status: "completed" | "failed";
    output: string;
    elapsed: number;
    exitCode: number;
  }) => void;
}
```

2. In the `proc.on("close", ...)` handler (after setting `state.status`, `state.completedAt`, and cleaning up the prompt file), invoke the callback:

```typescript
proc.on("close", (code) => {
  if (buffer.trim()) processLine(buffer);
  state.exitCode = code ?? 1;
  state.status = code === 0 ? "completed" : "failed";
  state.completedAt = Date.now();
  state.process = undefined;

  // Clean up temp prompt file
  if (promptFile) {
    try {
      rmSync(join(promptFile, ".."), { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  // Invoke completion callback (if provided)
  if (opts.onComplete) {
    try {
      opts.onComplete({
        id: state.id,
        agent: state.agent,
        status: state.status as "completed" | "failed",
        output: state.output,
        elapsed: state.completedAt - state.createdAt,
        exitCode: state.exitCode,
      });
    } catch {
      /* never let callback errors crash the process handler */
    }
  }
});
```

3. Also invoke `onComplete` in the `proc.on("error", ...)` handler with `status: "failed"`.

**Verification**:

- `bunx --bun tsc --noEmit` -- no type errors
- `bun test __tests__/src/hooks/` -- existing tests pass (onComplete is optional, no existing callers pass it yet)
- New unit test: spawn with onComplete callback fires on process exit

---

## Task 3: Wire `sendMessage` auto-delivery in luca-subagents.ts

**Goal**: When a subagent completes, automatically inject its result summary into the parent session via `pi.sendMessage()`, optionally triggering a new LLM turn.

**File**: `src/hooks/pi-extensions/luca-subagents.ts`

**Changes**:

1. In `luca_subagent_create`'s `execute()`, pass an `onComplete` callback to `spawnPiSubprocess()`:

```typescript
state = spawnPiSubprocess({
  id,
  agentName: params.agent,
  task: params.task,
  cwd,
  model: params.model ?? agentDef.model,
  tools: agentDef.tools,
  systemPrompt: agentDef.systemPrompt,
  source: "luca-subagents",
  onComplete: (info) => {
    const summary = [
      `Subagent "${info.id}" (${info.agent}) ${info.status}.`,
      `Duration: ${(info.elapsed / 1000).toFixed(1)}s`,
      info.output
        ? `Output preview: ${info.output.slice(0, 500)}`
        : "(no output)",
    ].join("\n");

    try {
      pi.sendMessage(
        {
          customType: "subagent-result",
          content: summary,
          display: true,
          details: {
            subagent_id: info.id,
            agent: info.agent,
            status: info.status,
            exit_code: info.exitCode,
            elapsed_ms: info.elapsed,
          },
        },
        { deliverAs: "followUp" },
      );
    } catch {
      // sendMessage may fail if session ended — non-fatal
    }
  },
});
```

2. Apply the same pattern to `luca_subagent_continue`.

**Verification**:

- `bunx --bun tsc --noEmit` -- no type errors
- `bun test __tests__/src/hooks/` -- existing tests pass
- E2E validation: subagent completion injects followUp message into session

---

## Task 4: Wire `sendMessage` auto-delivery in luca-teams.ts

**Goal**: When a team member subagent completes, notify the parent session.

**File**: `src/hooks/pi-extensions/luca-teams.ts`

**Changes**: In `dispatch_team` tool's spawn loop, pass `onComplete` callback with the same `pi.sendMessage()` pattern as Task 3. Include team context in the message:

```typescript
onComplete: (info) => {
  const summary = `Team "${teamName}" member "${info.agent}" ${info.status} (${(info.elapsed / 1000).toFixed(1)}s).`;
  try {
    pi.sendMessage(
      {
        customType: "team-result",
        content: summary,
        display: true,
        details: { team: teamName, ...info },
      },
      { deliverAs: "followUp" },
    );
  } catch { /* non-fatal */ }
},
```

**Verification**:

- `bunx --bun tsc --noEmit` -- no type errors
- `bun test __tests__/src/hooks/` -- existing tests pass

---

## Task 5: Wire `sendMessage` auto-delivery in luca-purpose-gating.ts

**Goal**: When a deferred/background subagent completes, notify the parent session.

**File**: `src/hooks/pi-extensions/luca-purpose-gating.ts`

**Changes**: Same `onComplete` callback pattern in `spawn_background_agent` tool's `spawnPiSubprocess` call. Include purpose context in message.

**Verification**:

- `bunx --bun tsc --noEmit` -- no type errors
- `bun test __tests__/src/hooks/` -- existing tests pass

---

## Task 6: Add unit tests for onComplete callback

**Goal**: Verify the callback fires correctly in spawn.ts.

**File**: `__tests__/src/hooks/pi-extensions/__helpers/spawn-callback.test.ts`

**Tests**:

- `spawnPiSubprocess` with `onComplete` callback fires on process close
- Callback receives correct `id`, `agent`, `status`, `elapsed` fields
- Callback errors do not crash the process handler (try/catch verified)
- Without `onComplete`, process close works as before (backward compat)

**Verification**:

- `bun test __tests__/src/hooks/pi-extensions/__helpers/spawn-callback.test.ts` -- all pass

---

## Task 7: Update E2E tests

**Goal**: Extend the E2E test suite to cover the new `--no-extensions` flag and `onComplete` callback.

**File**: `__tests__/src/hooks/pi-extension-e2e.test.ts`

**Tests to add**:

- Verify spawn args include `--no-extensions` flag
- Verify `sendMessage` is called when mock subagent process exits
- Verify `deliverAs: "followUp"` is always used

**Verification**:

- `bun test __tests__/src/hooks/pi-extension-e2e.test.ts` -- all pass

---

## Task 8: Build and drift check

**Goal**: Ensure deployed `.pi/extensions/` files reflect source changes.

**Commands**:

- `bun run build:all`
- `bun run check:drift`

**Verification**:

- Build succeeds without errors
- Drift check reports no differences between source and deployed files

---

## Files Modified (Summary)

| File                                                                 | Change                                                                                              |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `src/hooks/pi-extensions/__helpers/spawn.ts`                         | Add `--no-extensions` flag; add `onComplete` to SpawnOptions; fire callback in close/error handlers |
| `src/hooks/pi-extensions/luca-subagents.ts`                          | Wire `onComplete` with `pi.sendMessage()` in create and continue tools                              |
| `src/hooks/pi-extensions/luca-teams.ts`                              | Wire `onComplete` with `pi.sendMessage()` in dispatch_team tool                                     |
| `src/hooks/pi-extensions/luca-purpose-gating.ts`                     | Wire `onComplete` with `pi.sendMessage()` in spawn_background_agent tool                            |
| `__tests__/src/hooks/pi-extensions/__helpers/spawn-callback.test.ts` | New: onComplete callback unit tests                                                                 |
| `__tests__/src/hooks/pi-extension-e2e.test.ts`                       | Extended: --no-extensions and sendMessage coverage                                                  |

## Verification Criteria

1. `bunx --bun tsc --noEmit` -- no type errors
2. `bun test __tests__/src/hooks/` -- all tests pass
3. `bun run build:all` -- build succeeds
4. `bun run check:drift` -- no drift
5. Spawned subagent args always include `--no-extensions`
6. `onComplete` callback fires on process exit with correct payload
7. `pi.sendMessage()` always uses `deliverAs: "followUp"` (pitfall #1)
