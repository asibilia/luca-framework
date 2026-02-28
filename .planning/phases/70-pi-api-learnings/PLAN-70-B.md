---
id: 70-B
title: "Slash commands, notifications, confirmations, cognitive injection, and abort"
phase: 70
wave: 2
depends_on: ["70-A"]
---

# Plan 70-B: Slash Commands + Notifications + Confirmations

## Objective

Add five user-facing Pi API capabilities: slash commands for quick Luca status access (H3), expanded toast notifications for subagent/harness events (H1), confirmation dialogs for destructive actions (H2), per-turn BRAIN.md injection via `before_agent_start` (H4), and hard abort for critical safety violations (M8).

## Context

**Dependency on 70-A:** The sendMessage auto-delivery from 70-A provides the infrastructure for notification-worthy events. The slash commands surface status from the same registries. This plan extends the notification surface without modifying spawn.ts.

**Why slash commands:** Pi's `registerCommand()` creates user-facing `/command` entries visible in the command palette but NOT visible to the LLM. This is ideal for quick status checks that the user triggers manually.

**Why before_agent_start:** Currently luca-memory.ts injects BRAIN.md only on `session_start`. If the session is long-running and the context is compacted, BRAIN.md may be lost. Using `before_agent_start` re-injects on every turn, ensuring project identity is always present.

**Pitfalls:**

- `registerCommand` handlers block the agent -- keep them lightweight (just read state and display)
- `ctx.ui.confirm()` is async and returns a boolean -- must `await` it
- `ctx.abort()` cancels the current operation immediately -- use only after critical safety violations

---

## Task 1: Create `luca-commands.ts` extension with 6 slash commands

**Goal**: Register user-facing slash commands for quick Luca workflow status access.

**File**: `src/hooks/pi-extensions/luca-commands.ts` (NEW)

**Commands to register**:

| Command      | Description                                           | Implementation                            |
| ------------ | ----------------------------------------------------- | ----------------------------------------- |
| `/status`    | Show current phase, complexity, and memory indicators | Read .planning/STATE.md, format as notify |
| `/track`     | Show active subagent count and status summary         | Read from subagentRegistry                |
| `/verify`    | Quick verification status (last harness result)       | Read cached harness state                 |
| `/todos`     | Show current phase todos from .planning/              | Read .planning/todos/pending/\*.md        |
| `/subagents` | Detailed subagent table (id, agent, status, duration) | Read from subagentRegistry, format table  |
| `/safety`    | Show safety gate mode and recent audit entries        | Read from safety rules state              |

**Pattern** (each command follows this structure):

```typescript
pi.registerCommand("status", {
  description: "Show Luca workflow status (phase, complexity, memory)",
  handler: async (args, ctx) => {
    // Read STATE.md
    const statePath = join(cwd, ".planning", "STATE.md");
    if (!existsSync(statePath)) {
      ctx.ui.notify("No STATE.md found — run /lu to initialize", "warn");
      return;
    }
    const content = readFileSync(statePath, "utf-8");
    // Extract key fields and display as notification
    ctx.ui.notify(formatStatusSummary(content), "info");
  },
});
```

**Architecture**: This is a standalone extension that imports only from `__helpers/` (sanitize, subagent-registry) and reads planning files. It does NOT import from other extensions -- it reads shared registries directly.

**Helper function**: Add `formatStatusSummary(stateMdContent: string): string` as a local helper within the file. Extracts Phase, Plan, Complexity, and Oversight fields.

**Verification**:

- `bunx --bun tsc --noEmit` -- no type errors
- New tests verify each command handler calls `ctx.ui.notify()` with expected content
- Commands are lightweight (< 50ms execution, no shell commands)

---

## Task 2: Expand `ctx.ui.notify()` usage for subagent events

**Goal**: Add toast notifications when subagents complete, fail, or hit the concurrency limit.

**File**: `src/hooks/pi-extensions/luca-subagents.ts`

**Changes**:

1. In the `onComplete` callback (added in 70-A), after `pi.sendMessage()`, also fire a toast:

```typescript
onComplete: (info) => {
  // ... sendMessage (from 70-A) ...

  // Toast notification for user awareness
  try {
    if (ctx?.ui?.notify) {
      const level = info.status === "completed" ? "info" : "error";
      ctx.ui.notify(
        `Subagent "${info.id}" (${info.agent}) ${info.status} in ${(info.elapsed / 1000).toFixed(1)}s`,
        level,
      );
    }
  } catch { /* non-fatal */ }
},
```

**Note**: The `ctx` reference must be captured from the `execute()` function's scope. Update execute signature to accept `ctx` as the 5th parameter: `execute(toolCallId, params, signal, onUpdate, ctx)`.

2. In `spawnPiSubprocess()` catch block (when MAX_SUBAGENTS is hit), add notification:

```typescript
} catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  // Notify user of limit hit
  try {
    if (ctx?.ui?.notify) {
      ctx.ui.notify(msg, "warn");
    }
  } catch { /* non-fatal */ }
  return createTextResponse(msg);
}
```

**Verification**:

- `bunx --bun tsc --noEmit` -- no type errors
- `bun test __tests__/src/hooks/` -- existing tests pass
- Mock `ctx.ui.notify` is called with correct level ("info" for success, "error" for failure, "warn" for limit)

---

## Task 3: Expand `ctx.ui.notify()` in luca-harness.ts

**Goal**: Toast notification when verification passes or fails.

**File**: `src/hooks/pi-extensions/luca-harness.ts`

**Changes**: In `luca_verify` execute, after computing results, add notification:

```typescript
// After: const allPassed = results.every(r => r.status === "passed");
if (ctx?.ui?.notify) {
  const level = allPassed ? "info" : "error";
  const msg = allPassed
    ? `Verification passed (${results.length} checks, ${summary.total_duration}ms)`
    : `Verification FAILED: ${results
        .filter((r) => r.status !== "passed")
        .map((r) => r.name)
        .join(", ")}`;
  ctx.ui.notify(msg, level);
}
```

**Note**: Update execute signature to accept `ctx` as 5th parameter.

**Verification**:

- `bunx --bun tsc --noEmit` -- no type errors
- `bun test __tests__/src/hooks/` -- existing tests pass

---

## Task 4: Add `ctx.ui.confirm()` for destructive safety actions

**Goal**: When safety gate mode is "block" and a critical violation is detected, show a confirmation dialog before proceeding.

**File**: `src/hooks/pi-extensions/luca-safety-rules.ts`

**Changes**:

1. In the `tool_call` event handler, when a critical violation is found and gate mode is "warn" (not "block"), add an interactive confirmation:

```typescript
// In tool_call handler, after detecting critical violation in warn mode:
if (gateMode === "warn" && rule.severity === "critical") {
  if (ctx?.ui?.confirm) {
    const proceed = await ctx.ui.confirm(
      `Safety: ${rule.name}`,
      `Critical violation detected: ${rule.mitigation}\n\nProceed anyway?`,
    );
    if (!proceed) {
      return {
        block: true,
        reason: `User declined after safety warning: ${rule.name}`,
      };
    }
  }
}
```

2. Also add confirmation in `luca_set_safety_mode` when downgrading from "block" to "warn" or "log":

```typescript
// Before changing gate mode
if (gateMode === "block" && params.mode !== "block") {
  if (ctx?.ui?.confirm) {
    const proceed = await ctx.ui.confirm(
      "Downgrade Safety Mode",
      `Changing from "block" to "${params.mode}" will reduce safety enforcement. Continue?`,
    );
    if (!proceed) {
      return createTextResponse("Safety mode change cancelled by user.");
    }
  }
}
```

**Verification**:

- `bunx --bun tsc --noEmit` -- no type errors
- `bun test __tests__/src/hooks/` -- existing tests pass (ctx.ui.confirm mocked)
- Test: mock confirm returning false blocks the operation
- Test: mock confirm returning true allows the operation

---

## Task 5: Upgrade luca-memory.ts to use `before_agent_start`

**Goal**: Inject BRAIN.md context on every agent turn (not just session_start), ensuring project identity survives context compaction.

**File**: `src/hooks/pi-extensions/luca-memory.ts`

**Changes**:

1. Keep the existing `session_start` handler for backward compatibility.

2. Add a `before_agent_start` handler that re-injects BRAIN.md:

```typescript
// Re-inject BRAIN.md before every agent turn (survives compaction)
pi.on("before_agent_start", async (_event: any, ctx: any) => {
  if (!existsSync(brainPath)) return;

  const brain = readFileSync(brainPath, "utf-8");

  if (ctx?.addSystemContext) {
    ctx.addSystemContext("luca-brain", brain);
  }
});
```

3. The `session_start` handler remains as-is for initial load. The `before_agent_start` handler ensures re-injection on every subsequent turn.

**Note**: `addSystemContext` with the same ID (`"luca-brain"`) replaces the previous injection, so there is no duplication.

**Verification**:

- `bunx --bun tsc --noEmit` -- no type errors
- `bun test __tests__/src/hooks/` -- existing tests pass
- New test: mock `before_agent_start` event fires and calls `addSystemContext`
- Verify same ID used in both handlers (no duplicate context)

---

## Task 6: Add `ctx.abort()` for critical safety violations

**Goal**: When safety gate mode is "block" and a critical violation is detected, use `ctx.abort()` to hard-stop the current operation.

**File**: `src/hooks/pi-extensions/luca-safety-rules.ts`

**Changes**: In the `tool_call` event handler, after recording the audit entry for a blocked critical violation, call `ctx.abort()`:

```typescript
if (gateMode === "block") {
  // Record in audit log
  auditLog.push({ ... });

  // Notify user
  if (ctx?.ui?.notify) {
    ctx.ui.notify(
      `BLOCKED: ${rule.name} — ${rule.mitigation}`,
      "error",
    );
  }

  // Hard abort for critical violations in block mode
  if (rule.severity === "critical" && ctx?.abort) {
    ctx.abort();
  }

  return {
    block: true,
    reason: `Safety rule "${rule.name}" (${rule.severity}): ${rule.mitigation}`,
  };
}
```

**Note**: `ctx.abort()` is only called for CRITICAL violations in BLOCK mode. This is the most severe combination. For high/medium/low violations, the existing `return { block: true }` pattern is sufficient.

**Verification**:

- `bunx --bun tsc --noEmit` -- no type errors
- `bun test __tests__/src/hooks/` -- existing tests pass
- Test: mock ctx.abort() is called when gate=block AND severity=critical
- Test: ctx.abort() is NOT called for non-critical violations

---

## Task 7: Register luca-commands.ts in build pipeline

**Goal**: Add the new extension to the build system so it deploys to `.pi/extensions/`.

**File**: `scripts/build-shared.ts`

**Changes**: Add `"luca-commands"` to the `PI_EXTENSION_FILES` array.

**File**: `.pi/settings.json`

**Changes**: Add `"extensions/luca-commands.ts"` to the extensions array.

**Verification**:

- `bun run build:all` -- builds successfully including luca-commands
- `bun run check:drift` -- no drift

---

## Task 8: Write tests for new functionality

**Goal**: Comprehensive test coverage for slash commands, confirm dialogs, and before_agent_start.

**Files**:

- `__tests__/src/hooks/pi-extensions/luca-commands.test.ts` (NEW)
- Updates to `__tests__/src/hooks/pi-extension-e2e.test.ts`
- Updates to `__tests__/src/hooks/pi-workflow-extensions.test.ts`

**Tests for luca-commands.test.ts**:

- Extension exports default function
- Registers 6 commands via pi.registerCommand
- `/status` handler reads STATE.md and calls ctx.ui.notify
- `/track` handler reads subagentRegistry and formats summary
- `/subagents` handler formats detailed table
- `/safety` handler reads gate mode and audit entries
- Commands handle missing files gracefully (notify "not found")

**Tests for E2E/workflow updates**:

- before_agent_start handler fires addSystemContext with BRAIN.md
- ctx.ui.confirm blocks operation when user declines
- ctx.abort() fires on critical block-mode violations
- ctx.ui.notify fires on harness pass/fail

**Verification**:

- `bun test __tests__/src/hooks/` -- all tests pass

---

## Task 9: Build and drift check

**Goal**: Final verification that all changes build and deploy correctly.

**Commands**:

- `bun run build:all`
- `bun run check:drift`

**Verification**:

- Build succeeds without errors
- Drift check reports no differences

---

## Files Modified/Created (Summary)

| File                                                      | Change                                                                                                     |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/hooks/pi-extensions/luca-commands.ts`                | **NEW**: 6 slash commands (/status, /track, /verify, /todos, /subagents, /safety)                          |
| `src/hooks/pi-extensions/luca-subagents.ts`               | Add ctx.ui.notify() in onComplete callback and error paths                                                 |
| `src/hooks/pi-extensions/luca-harness.ts`                 | Add ctx.ui.notify() after verification results; accept ctx param                                           |
| `src/hooks/pi-extensions/luca-safety-rules.ts`            | Add ctx.ui.confirm() for critical warn-mode violations; add ctx.abort() for critical block-mode violations |
| `src/hooks/pi-extensions/luca-memory.ts`                  | Add before_agent_start handler for per-turn BRAIN.md injection                                             |
| `scripts/build-shared.ts`                                 | Add luca-commands to PI_EXTENSION_FILES                                                                    |
| `.pi/settings.json`                                       | Add luca-commands.ts to extensions list                                                                    |
| `__tests__/src/hooks/pi-extensions/luca-commands.test.ts` | **NEW**: Slash command tests                                                                               |
| `__tests__/src/hooks/pi-extension-e2e.test.ts`            | Extended: before_agent_start, confirm, abort, notify tests                                                 |
| `__tests__/src/hooks/pi-workflow-extensions.test.ts`      | Extended: safety confirm/abort workflow tests                                                              |

## Verification Criteria

1. `bunx --bun tsc --noEmit` -- no type errors
2. `bun test __tests__/src/hooks/` -- all tests pass
3. `bun run build:all` -- build succeeds
4. `bun run check:drift` -- no drift
5. 6 slash commands registered and functional
6. ctx.ui.notify() fires for subagent completion, harness results, safety violations
7. ctx.ui.confirm() prompts for critical warn-mode violations
8. ctx.abort() fires for critical block-mode violations only
9. before_agent_start re-injects BRAIN.md every turn (same ID, no duplication)
10. All command handlers are lightweight (< 50ms, no shell commands)
