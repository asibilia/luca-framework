---
id: 70-C
title: "Tool rendering, session resilience, rich footer, and audit logging"
phase: 70
wave: 2
depends_on: ["70-A"]
---

# Plan 70-C: Tool Rendering + Session Resilience + Footer

## Objective

Add six Pi API capabilities that improve tool output presentation and session robustness: custom tool rendering for key tools (H5), streaming progress via `onUpdate` (M1), role enforcement via `setActiveTools` (M5), rich multi-line footer (M3), session reconstruction for switch/fork/tree events (M2), and persistent audit logging via `appendEntry` (L1).

## Context

**Dependency on 70-A:** The `onComplete` callback pattern from 70-A establishes how extensions interact with subagent lifecycle events. This plan extends tool definitions (renderCall/renderResult) and adds session resilience features that operate independently of the spawning changes.

**Why these items together:** They all improve the user's visual experience (rendering, footer) or session durability (reconstruction, audit persistence). They touch different extensions with minimal overlap.

**Pitfalls:**

- `execute()` param order: `(toolCallId, params, signal, onUpdate, ctx)` -- signal is 3rd, onUpdate is 4th
- `setActiveTools` resets on session switch -- must re-apply in session_switch handler
- `appendEntry` is on `pi`, not `ctx` -- use `pi.appendEntry(type, data)`
- `setFooter` replaces `setStatus` -- ensure no extensions call both for the same status

---

## Task 1: Add `renderCall`/`renderResult` to key tools

**Goal**: Custom display for the 3 most-used extension tools to improve readability in the Pi TUI.

**Files**:

- `src/hooks/pi-extensions/luca-harness.ts` (luca_verify)
- `src/hooks/pi-extensions/luca-subagents.ts` (luca_subagent_create, luca_subagent_result)

**Changes for luca_verify**:

Add `renderCall` and `renderResult` to the tool definition:

```typescript
pi.registerTool({
  name: "luca_verify",
  label: "Run Verification",
  description: "...",
  parameters: { ... },

  renderCall(args: { checks?: string }, theme: any) {
    const checks = args.checks ?? "all enabled";
    return `Running verification: ${checks}`;
  },

  renderResult(result: any, _opts: any, theme: any) {
    try {
      const data = JSON.parse(result.content?.[0]?.text ?? "{}");
      const icon = data.status === "passed" ? "PASS" : "FAIL";
      const checks = (data.checks ?? [])
        .map((c: any) => `  ${c.status === "passed" ? "+" : "x"} ${c.name} (${c.duration}ms)`)
        .join("\n");
      return `${icon} Verification ${data.status}\n${checks}\nTotal: ${data.total_duration}ms`;
    } catch {
      return "Verification complete";
    }
  },

  async execute(...) { ... },
});
```

**Changes for luca_subagent_create**:

```typescript
renderCall(args: { agent: string; task: string }, theme: any) {
  return `Spawning subagent: ${args.agent}\nTask: ${args.task.slice(0, 100)}`;
},
```

**Changes for luca_subagent_result**:

```typescript
renderResult(result: any, _opts: any, theme: any) {
  try {
    const data = JSON.parse(result.content?.[0]?.text ?? "{}");
    const icon = data.status === "completed" ? "DONE" : data.status === "running" ? "..." : "FAIL";
    return `${icon} ${data.id} (${data.agent}) — ${data.status}\n${(data.output ?? "").slice(0, 200)}`;
  } catch {
    return "Subagent result";
  }
},
```

**Note**: `renderCall` and `renderResult` are synchronous functions on the tool definition object. They receive the theme for color access but we keep rendering plain text for simplicity (no TUI component imports needed).

**Verification**:

- `bunx --bun tsc --noEmit` -- no type errors
- `bun test __tests__/src/hooks/` -- existing tests pass
- Visual: luca_verify shows check-by-check results in TUI instead of raw JSON

---

## Task 2: Accept `onUpdate` callback for streaming progress

**Goal**: Long-running tools (`luca_verify`, `luca_tilldone`) stream progress updates during execution.

**Files**:

- `src/hooks/pi-extensions/luca-harness.ts`
- `src/hooks/pi-extensions/luca-tilldone.ts`

**Changes for luca-harness.ts**:

Update `execute` signature to accept all 5 params:

```typescript
async execute(
  toolCallId: string,
  params: { checks?: string },
  signal: AbortSignal,
  onUpdate: (update: { content: Array<{ type: "text"; text: string }> }) => void,
  ctx: any,
) {
  // ... existing setup ...

  const results = [];
  for (const check of checksToRun) {
    // Stream progress before each check
    onUpdate?.({
      content: [{ type: "text", text: `Running check: ${check.name}...` }],
    });

    const result = runCheck(check.name, check.command, check.timeout);
    results.push(result);

    // Stream result after each check
    onUpdate?.({
      content: [{ type: "text", text: `${check.name}: ${result.status} (${result.duration}ms)` }],
    });
  }

  // ... existing result aggregation ...
}
```

**Note**: The existing `checksToRun.map()` must be refactored to a `for...of` loop to allow streaming between checks. The `signal` param should be checked between iterations for abort support.

**Changes for luca-tilldone.ts**:

Similar pattern -- stream progress between iteration cycles:

```typescript
onUpdate?.({
  content: [
    {
      type: "text",
      text: `Iteration ${iteration}/${maxIterations}: running checks...`,
    },
  ],
});
```

**Verification**:

- `bunx --bun tsc --noEmit` -- no type errors
- `bun test __tests__/src/hooks/` -- existing tests pass
- Test: mock onUpdate is called with progress messages during execution

---

## Task 3: Replace event-based tool blocking with `pi.setActiveTools()`

**Goal**: Use Pi's native `setActiveTools()` API for role enforcement instead of the fragile `tool_call` event blocking pattern.

**File**: `src/hooks/pi-extensions/luca-roles.ts`

**Changes**:

1. Store the original tools list when a role is activated:

```typescript
/** Original active tools before role was applied (for restoration). */
let originalTools: string[] | null = null;
```

2. In `luca_activate_role` execute, use `setActiveTools()`:

```typescript
async execute(_toolCallId: string, params: { role: string }, _signal: any, _onUpdate: any, ctx: any) {
  const roles = loadRoles();
  const normalizedRoleName = params.role.trim().toLowerCase();
  const role = roles.find(r => r.name.trim().toLowerCase() === normalizedRoleName);

  if (!role) {
    const available = roles.map(r => r.name).join(", ");
    return createTextResponse(`Role "${params.role}" not found. Available: ${available}`);
  }

  // Store original tools for restoration
  if (!originalTools) {
    originalTools = pi.getActiveTools?.() ?? null;
  }

  activeRole = role;

  // Use setActiveTools to enforce restrictions natively
  if (pi.setActiveTools && role.tools.length > 0) {
    // Always include luca role management tools so the agent can deactivate
    const allowedTools = [
      ...role.tools,
      "luca_list_roles",
      "luca_activate_role",
      "luca_deactivate_role",
      "luca_active_role",
    ];
    pi.setActiveTools(allowedTools);
  }

  return createTextResponse(
    `Activated role "${role.name}" — allowed tools: ${role.tools.join(", ")}`,
  );
},
```

3. In `luca_deactivate_role`, restore original tools:

```typescript
async execute() {
  const previous = activeRole?.name ?? "none";
  activeRole = null;

  // Restore original tools
  if (pi.setActiveTools && originalTools) {
    pi.setActiveTools(originalTools);
    originalTools = null;
  }

  return createTextResponse(
    `Deactivated role "${previous}" — all tools now unrestricted`,
  );
},
```

4. Keep the `tool_call` event handler as a **fallback** for when `setActiveTools` is not available (older Pi versions). Add a check:

```typescript
pi.on("tool_call", async (event: any, _ctx: any) => {
  if (!activeRole) return;
  if (activeRole.tools.length === 0) return;

  // If setActiveTools is available, it handles enforcement -- skip event-based blocking
  if (pi.setActiveTools) return;

  // Fallback: event-based blocking for older Pi versions
  const toolName = normalizeToolName(event.toolName || "");
  const allowed = activeRole.tools.some((t) => t === toolName);
  if (!allowed) {
    return {
      block: true,
      reason: `Role "${activeRole.name}" does not allow tool "${event.toolName}".`,
    };
  }
});
```

5. Add `session_switch` handler to re-apply role after session switch (pitfall #3):

```typescript
pi.on("session_switch", async (_event: any, _ctx: any) => {
  // setActiveTools resets on session switch -- re-apply if role is active
  if (activeRole && pi.setActiveTools && activeRole.tools.length > 0) {
    const allowedTools = [
      ...activeRole.tools,
      "luca_list_roles",
      "luca_activate_role",
      "luca_deactivate_role",
      "luca_active_role",
    ];
    pi.setActiveTools(allowedTools);
  }
});
```

**Verification**:

- `bunx --bun tsc --noEmit` -- no type errors
- `bun test __tests__/src/hooks/` -- existing tests pass
- Test: setActiveTools called with correct tool list on activate
- Test: original tools restored on deactivate
- Test: session_switch re-applies active role
- Test: fallback event blocking still works when setActiveTools unavailable

---

## Task 4: Replace `setStatus` with `setFooter` for rich multi-line footer

**Goal**: Upgrade from single-line status text to multi-line rich footer showing phase, complexity, subagent count, and memory indicators.

**File**: `src/hooks/pi-extensions/luca-state.ts`

**Changes**:

1. Replace `ctx.ui.setStatus()` calls with `ctx.ui.setFooter()`:

```typescript
// In the turn_start or turn_end handler that updates status:
if (ctx?.ui?.setFooter) {
  ctx.ui.setFooter((theme: any) => {
    const lines: string[] = [];

    // Line 1: Phase and plan
    const phase = state.phase ?? "?";
    const plan = state.plan ?? "?";
    lines.push(`Phase ${phase} | Plan ${plan}`);

    // Line 2: Complexity and oversight
    const complexity = state.complexity ?? "MODERATE";
    const oversight = state.oversight ?? "standard";
    lines.push(`${complexity} | ${oversight}`);

    // Line 3: Subagent count (if any running)
    const running = subagentRegistry
      .values()
      .filter((s) => s.status === "running");
    if (running.length > 0) {
      lines.push(`Subagents: ${running.length} running`);
    }

    return lines.join("\n");
  });
} else if (ctx?.ui?.setStatus) {
  // Fallback: single-line status for older Pi versions
  ctx.ui.setStatus("luca-state", formatOneLiner(state));
}
```

2. Import `subagentRegistry` from `__helpers/subagent-registry`:

```typescript
import { subagentRegistry } from "./__helpers/subagent-registry";
```

3. Remove any existing `setStatus` calls that would conflict with `setFooter`. Pi does not support both simultaneously for the same extension.

**Verification**:

- `bunx --bun tsc --noEmit` -- no type errors
- `bun test __tests__/src/hooks/` -- existing tests pass
- Test: setFooter renderer returns multi-line string
- Test: fallback to setStatus when setFooter unavailable

---

## Task 5: Add session reconstruction for switch/fork/tree events

**Goal**: Reconstruct Luca state when the user switches sessions, forks, or navigates the session tree.

**File**: `src/hooks/pi-extensions/luca-state.ts`

**Changes**:

1. Add handlers for `session_switch`, `session_fork`, and `session_tree` events:

```typescript
// Reconstruct state when session changes
const sessionEvents = [
  "session_switch",
  "session_fork",
  "session_tree",
] as const;

for (const eventName of sessionEvents) {
  pi.on(eventName, async (_event: any, ctx: any) => {
    // Re-read STATE.md (may differ per session branch)
    const freshState = readStateMd();
    if (freshState.error) return;

    // Update footer with fresh state
    updateFooter(ctx, freshState);

    // Log session event for audit trail
    if (pi.appendEntry) {
      pi.appendEntry("luca-session-event", {
        event: eventName,
        timestamp: new Date().toISOString(),
        state: {
          phase: freshState.phase,
          plan: freshState.plan,
          complexity: freshState.complexity,
        },
      });
    }
  });
}
```

2. Extract `updateFooter(ctx, state)` as a local helper to avoid duplicating the footer rendering logic between `turn_start` and session event handlers.

**Verification**:

- `bunx --bun tsc --noEmit` -- no type errors
- `bun test __tests__/src/hooks/` -- existing tests pass
- Test: session_switch handler re-reads STATE.md and updates footer
- Test: session_fork handler calls appendEntry with event data

---

## Task 6: Add `pi.appendEntry()` for persistent safety audit logging

**Goal**: Persist safety audit log entries in the Pi session history so they survive compaction and are available across session switches.

**File**: `src/hooks/pi-extensions/luca-safety-rules.ts`

**Changes**:

1. In the `tool_call` event handler, after recording to the in-memory audit log, also persist via `appendEntry`:

```typescript
// After: auditLog.push({ ... });
if (pi.appendEntry) {
  pi.appendEntry("luca-safety-audit", {
    timestamp: new Date().toISOString(),
    rule_id: rule.id,
    rule_name: rule.name,
    severity: rule.severity,
    action: gateMode === "block" ? "blocked" : "warned",
    context: command.slice(0, 200),
  });
}
```

2. Also persist in `luca_safety_check` tool when violations are found:

```typescript
// After the violations loop, if any violations were found:
if (violations.length > 0 && pi.appendEntry) {
  pi.appendEntry("luca-safety-audit", {
    timestamp: new Date().toISOString(),
    check_type: "manual",
    violation_count: violations.length,
    severities: violations.map((v) => v.severity),
    gate_mode: gateMode,
  });
}
```

**Note**: `appendEntry` is on the `pi` object (not `ctx`). The `pi` reference is available in the extension closure. The data is persisted in the session history and survives compaction.

**Verification**:

- `bunx --bun tsc --noEmit` -- no type errors
- `bun test __tests__/src/hooks/` -- existing tests pass
- Test: pi.appendEntry called with correct type and data on violation
- Test: appendEntry not called when no violations found

---

## Task 7: Update luca-widgets.ts footer rendering

**Goal**: Ensure luca-widgets.ts does not conflict with luca-state.ts footer rendering.

**File**: `src/hooks/pi-extensions/luca-widgets.ts`

**Changes**: If luca-widgets.ts currently calls `setStatus()` for context usage display, migrate it to include that information in the footer rendered by luca-state.ts instead. Alternatively, widgets can continue using `setWidget()` for above-editor placement (no conflict with footer).

**Review**: Check if widgets currently call `setStatus()`. If yes, remove those calls and add context usage data to the luca-state.ts footer renderer. If widgets only use `setWidget()`, no changes needed.

**Verification**:

- `bunx --bun tsc --noEmit` -- no type errors
- No duplicate status/footer rendering between luca-state and luca-widgets

---

## Task 8: Write tests for new functionality

**Goal**: Comprehensive test coverage for rendering, session resilience, and audit persistence.

**Files**:

- Updates to `__tests__/src/hooks/pi-extension-e2e.test.ts`
- Updates to `__tests__/src/hooks/pi-workflow-extensions.test.ts`

**Tests to add**:

For renderCall/renderResult:

- luca_verify renderCall returns human-readable check description
- luca_verify renderResult formats pass/fail with check details
- luca_subagent_create renderCall shows agent and task preview
- luca_subagent_result renderResult formats status and output preview
- Renderers handle malformed/empty result gracefully

For onUpdate streaming:

- luca_verify calls onUpdate before/after each check
- onUpdate receives valid content structure

For setActiveTools:

- Activate role calls setActiveTools with correct tools + management tools
- Deactivate role restores original tools
- session_switch re-applies active role tools
- Fallback event blocking works when setActiveTools unavailable

For setFooter:

- Footer renderer returns multi-line string with phase/complexity/subagents
- Fallback to setStatus when setFooter unavailable

For session events:

- session_switch re-reads STATE.md
- session_fork calls appendEntry
- session_tree calls appendEntry

For appendEntry audit:

- Safety violation persists via appendEntry
- Manual safety check persists violation summary
- No appendEntry call when no violations

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

## Files Modified (Summary)

| File                                                 | Change                                                                                                    |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `src/hooks/pi-extensions/luca-harness.ts`            | Add renderCall/renderResult to luca_verify; accept onUpdate for streaming; accept ctx for notify          |
| `src/hooks/pi-extensions/luca-subagents.ts`          | Add renderCall to luca_subagent_create; add renderResult to luca_subagent_result                          |
| `src/hooks/pi-extensions/luca-tilldone.ts`           | Accept onUpdate for streaming progress between iterations                                                 |
| `src/hooks/pi-extensions/luca-roles.ts`              | Replace tool_call blocking with setActiveTools; add session_switch re-apply; store/restore original tools |
| `src/hooks/pi-extensions/luca-state.ts`              | Replace setStatus with setFooter; add session_switch/fork/tree handlers; extract updateFooter helper      |
| `src/hooks/pi-extensions/luca-safety-rules.ts`       | Add pi.appendEntry() for persistent audit logging                                                         |
| `src/hooks/pi-extensions/luca-widgets.ts`            | Review/remove setStatus calls if conflicting with footer                                                  |
| `__tests__/src/hooks/pi-extension-e2e.test.ts`       | Extended: renderCall/renderResult, onUpdate, setActiveTools, setFooter, session events, appendEntry tests |
| `__tests__/src/hooks/pi-workflow-extensions.test.ts` | Extended: role management with setActiveTools, session reconstruction workflows                           |

## Verification Criteria

1. `bunx --bun tsc --noEmit` -- no type errors
2. `bun test __tests__/src/hooks/` -- all tests pass
3. `bun run build:all` -- build succeeds
4. `bun run check:drift` -- no drift
5. luca_verify shows formatted check results via renderResult (not raw JSON)
6. luca_verify streams progress via onUpdate between checks
7. Role activation uses setActiveTools (with fallback to event blocking)
8. Role deactivation restores original tool set
9. session_switch re-applies active role and refreshes footer
10. Footer shows multi-line phase/complexity/subagent info
11. Safety audit entries persisted via appendEntry (survive compaction)
12. execute() param order follows Pi convention: (toolCallId, params, signal, onUpdate, ctx)
