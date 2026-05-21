# Phase 70 Research: Pi API Learnings Integration

## Domain

Pi Extension API ([@mariozechner/pi-coding-agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent))

## Sources

- [Official Pi Extensions Docs](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md)
- [Pi SDK Documentation](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/sdk.md)
- [Pi Example Extensions](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent/examples/extensions)
- [disler/pi-vs-claude-code](https://github.com/disler/pi-vs-claude-code/blob/main/extensions/) — reference implementations
- [Pi CHANGELOG](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/CHANGELOG.md)

---

## Current State: What We Use

| Pi API                   | Extensions Using It                                               |
| ------------------------ | ----------------------------------------------------------------- |
| `pi.registerTool()`      | All 15 extensions (50+ tools total)                               |
| `pi.on(event, handler)`  | luca-state, luca-subagents, luca-widgets, luca-roles, luca-memory |
| `ctx.ui.setWidget()`     | luca-widgets (4 widgets)                                          |
| `ctx.ui.setStatus()`     | luca-state, luca-widgets                                          |
| `ctx.ui.notify()`        | luca-widgets (context threshold warnings only)                    |
| `ctx.getContextUsage()`  | luca-widgets (turn_end polling)                                   |
| `ctx.addSystemContext()` | luca-memory (BRAIN.md injection on session_start)                 |
| `ctx.ui.theme.*`         | luca-state, luca-widgets                                          |

### Events We Listen To

`session_start`, `agent_start`, `tool_call`, `tool_result`, `tool_execution_end`, `turn_start`, `turn_end`

### How We Spawn Subagents

```bash
pi --mode json -p --continue --session-dir <dir> --model <model> --tools <tools> --append-system-prompt <file> "Task: ..."
```

**Missing:** `--no-extensions` flag. Subagents inherit all parent extensions, causing lock file contention.

---

## Pi API Surface: What's Available

### Core Extension API (`pi.*`)

| Method                                 | Purpose                                       | We Use? |
| -------------------------------------- | --------------------------------------------- | :-----: |
| `pi.registerTool(def)`                 | Register LLM-callable tool                    |   Yes   |
| `pi.registerCommand(name, opts)`       | Register slash command (user-facing, not LLM) | **No**  |
| `pi.registerShortcut(key, opts)`       | Register keyboard shortcut                    | **No**  |
| `pi.registerFlag(name, opts)`          | Register CLI flag                             | **No**  |
| `pi.on(event, handler)`                | Subscribe to lifecycle events                 |   Yes   |
| `pi.sendMessage(msg, opts?)`           | Send custom message into session              | **No**  |
| `pi.sendUserMessage(content, opts?)`   | Send as-if-typed-by-user message              | **No**  |
| `pi.appendEntry(type, data?)`          | Persist custom data in session history        | **No**  |
| `pi.getActiveTools()`                  | Get active tool names                         | **No**  |
| `pi.getAllTools()`                     | Get all ToolInfo objects                      | **No**  |
| `pi.setActiveTools(names[])`           | Switch active tools (mode switching)          | **No**  |
| `pi.setModel(model)`                   | Change active model                           | **No**  |
| `pi.setThinkingLevel(level)`           | Set thinking level                            | **No**  |
| `pi.registerMessageRenderer(type, fn)` | Custom rendering for message types            | **No**  |
| `pi.exec(cmd, args, opts?)`            | Execute shell commands                        | **No**  |

### UI APIs (`ctx.ui.*`)

| Method                                 | Purpose                                |        We Use?         |
| -------------------------------------- | -------------------------------------- | :--------------------: |
| `ctx.ui.setStatus(id, text)`           | Footer status line                     |          Yes           |
| `ctx.ui.setWidget(id, factory, opts?)` | Above-editor widget                    |          Yes           |
| `ctx.ui.notify(msg, level)`            | Toast notification                     | Partial (context only) |
| `ctx.ui.confirm(title, msg, opts?)`    | Confirmation dialog, returns boolean   |         **No**         |
| `ctx.ui.input(prompt)`                 | Text input dialog                      |         **No**         |
| `ctx.ui.select(title, options[])`      | Selection dialog                       |         **No**         |
| `ctx.ui.setFooter(renderer)`           | Multi-line footer (replaces setStatus) |         **No**         |
| `ctx.ui.custom(factory)`               | Full-screen interactive TUI            |         **No**         |
| `ctx.ui.theme.*`                       | Theme colors                           |          Yes           |

### Context APIs (`ctx.*`)

| Method                           | Purpose                         | We Use? |
| -------------------------------- | ------------------------------- | :-----: |
| `ctx.getContextUsage()`          | Token usage info                |   Yes   |
| `ctx.addSystemContext(id, text)` | Inject into system prompt       |   Yes   |
| `ctx.abort()`                    | Cancel current operation        | **No**  |
| `ctx.isIdle()`                   | Check if agent is idle          | **No**  |
| `ctx.compact()`                  | Trigger conversation compaction | **No**  |
| `ctx.shutdown()`                 | Exit session                    | **No**  |
| `ctx.waitForIdle()`              | Wait for agent to finish        | **No**  |
| `ctx.getSystemPrompt()`          | Get current system prompt       | **No**  |
| `ctx.cwd`                        | Current working directory       | **No**  |
| `ctx.hasUI`                      | UI available?                   | **No**  |
| `ctx.model`                      | Current model                   | **No**  |

### Tool Definition Extras

| Feature                             | Purpose                             | We Use? |
| ----------------------------------- | ----------------------------------- | :-----: |
| `renderCall(args, theme)`           | Custom display when tool is invoked | **No**  |
| `renderResult(result, opts, theme)` | Custom display after tool completes | **No**  |
| `onUpdate` callback                 | Stream progress during execution    | **No**  |
| `signal: AbortSignal`               | Cancellation support                | **No**  |
| `details` in return value           | Metadata persisted in session       | **No**  |

### Full Event List

| Event                  | We Listen? | Notes                                      |
| ---------------------- | :--------: | ------------------------------------------ |
| `session_start`        |    Yes     | 3 extensions                               |
| `session_switch`       |   **No**   | `/new` or `/resume` — state reconstruction |
| `session_fork`         |   **No**   | `/fork` — state reconstruction             |
| `session_tree`         |   **No**   | Tree navigation                            |
| `session_compact`      |   **No**   | Compaction hook                            |
| `session_shutdown`     |   **No**   | Cleanup on exit                            |
| `before_agent_start`   |   **No**   | Inject messages/modify system prompt       |
| `agent_start`          |    Yes     | 1 extension                                |
| `agent_end`            |   **No**   |                                            |
| `turn_start`           |    Yes     | 2 extensions                               |
| `turn_end`             |    Yes     | 1 extension                                |
| `tool_call`            |    Yes     | 3 extensions                               |
| `tool_result`          |    Yes     | 1 extension                                |
| `tool_execution_start` |   **No**   |                                            |
| `tool_execution_end`   |    Yes     | 2 extensions                               |
| `context`              |   **No**   | Rewrite/filter messages before LLM call    |
| `input`                |   **No**   | Intercept user input                       |
| `model_select`         |   **No**   |                                            |

---

## sendMessage API Detail

```typescript
pi.sendMessage({
  customType: "subagent-result",
  content: "Result text",
  display: true,
  details: { ... },
}, {
  triggerTurn: true,        // Triggers new LLM turn after delivery
  deliverAs: "followUp",   // "steer" interrupts streaming; "followUp" waits
});
```

- When agent is **idle**: direct delivery, no `deliverAs` needed
- When agent is **streaming**: must specify `deliverAs` or it throws
- `sendUserMessage()` always triggers a turn when idle

---

## execute() Signature (Full)

```typescript
async execute(
  toolCallId: string,
  params: object,
  signal: AbortSignal,    // Cancellation
  onUpdate: (update) => void,  // Stream progress
  ctx: ExtensionContext
)
```

Return value supports `details` for session persistence:

```typescript
return {
  content: [{ type: "text", text: "..." }],
  details: { key: "value" }, // Available in renderResult and session history
};
```

---

## Validated Prioritized Items

Cross-referencing the todo findings against confirmed Pi APIs:

### Critical (C1, C2) — CONFIRMED

| Item                            | API                               | Validated? | Notes                                                                                 |
| ------------------------------- | --------------------------------- | :--------: | ------------------------------------------------------------------------------------- |
| C1: `sendMessage` auto-delivery | `pi.sendMessage({ triggerTurn })` |    Yes     | Requires access to `pi` in spawn helper. Need to pass `pi` ref or use event callback. |
| C2: `--no-extensions` flag      | CLI flag                          |    Yes     | All reference subagent patterns use it. One-line fix in spawn.ts.                     |

### High (H1-H5) — CONFIRMED

| Item                               | API                                | Validated? | Notes                                                                                        |
| ---------------------------------- | ---------------------------------- | :--------: | -------------------------------------------------------------------------------------------- |
| H1: Toast notifications            | `ctx.ui.notify(msg, level)`        |    Yes     | Already used for context warnings. Extend to subagent completion, safety violations.         |
| H2: Confirm dialogs                | `ctx.ui.confirm(title, msg)`       |    Yes     | Returns boolean. Supports timeout for auto-dismiss.                                          |
| H3: Slash commands                 | `pi.registerCommand(name, opts)`   |    Yes     | User-facing only, not LLM-visible. Handler receives `(args, ctx)`.                           |
| H4: `before_agent_start` injection | `pi.on("before_agent_start", ...)` |    Yes     | Can inject messages or modify system prompt. Better than session_start for per-turn context. |
| H5: Custom tool rendering          | `renderCall()` / `renderResult()`  |    Yes     | On tool definition. Uses `Text` from `@mariozechner/pi-tui`.                                 |

### Medium (M1-M8) — CONFIRMED

| Item                        | API                                               | Validated? | Notes                                                                    |
| --------------------------- | ------------------------------------------------- | :--------: | ------------------------------------------------------------------------ |
| M1: `onUpdate` streaming    | 4th param in `execute()`                          |    Yes     | Signal is 3rd, onUpdate is 4th (recently reordered).                     |
| M2: Session reconstruction  | `ctx.sessionManager.getBranch()` + session events |    Yes     | Handle session_switch, session_fork, session_tree.                       |
| M3: Rich footer             | `ctx.ui.setFooter(renderer)`                      |    Yes     | Multi-line, themed, replaces setStatus for richer output.                |
| M4: `ctx.getContextUsage()` | Already partially used                            |    Yes     | We already use it. No gap here beyond expanding field usage.             |
| M5: `setActiveTools()`      | `pi.setActiveTools(names[])`                      |    Yes     | Better than event-based blocking in luca-roles.                          |
| M6: `details` in results    | Return value field                                |    Yes     | Persisted in session. Available in renderResult.                         |
| M7: Widget placement        | `ctx.ui.setWidget(id, factory, opts)`             | Partially  | Check if `opts.placement` is supported (may be reference-repo specific). |
| M8: `ctx.abort()`           | `ctx.abort()`                                     |    Yes     | Cancels current operation.                                               |

### Low (L1-L6) — CONFIRMED

| Item                         | API                                 | Validated? | Notes                                                       |
| ---------------------------- | ----------------------------------- | :--------: | ----------------------------------------------------------- |
| L1: `appendEntry()`          | `pi.appendEntry(type, data)`        |    Yes     | Session-persistent. Survives restarts/forks.                |
| L2: `ctx.ui.custom()`        | `ctx.ui.custom(factory)`            |    Yes     | Full-screen TUI. Factory receives `(tui, theme, kb, done)`. |
| L3: `registerShortcut()`     | `pi.registerShortcut(key, opts)`    |    Yes     | Uses `Key.ctrlAlt("p")` etc.                                |
| L4: `sendUserMessage()`      | `pi.sendUserMessage(content, opts)` |    Yes     | Always triggers a turn when idle.                           |
| L5: External YAML config     | File I/O (not Pi API)               |    N/A     | Architectural choice, not API-dependent.                    |
| L6: Session lifecycle events | 6 events confirmed                  |    Yes     | session_switch, session_fork, session_tree, etc.            |

---

## Architecture Considerations

### Passing `pi` Reference to Shared Helpers

For C1 (sendMessage auto-delivery), `spawn.ts` needs access to `pi` to call `pi.sendMessage()`. Options:

1. **Pass `pi` in SpawnOptions** — simplest, but couples helper to extension API
2. **Callback pattern** — spawn.ts accepts `onComplete(id, output)` callback, extension calls sendMessage
3. **Event emitter** — spawn.ts emits events, extensions subscribe

Recommendation: **Option 2 (callback)** — keeps spawn.ts decoupled, lets each extension decide how to deliver results.

### TypeBox vs Plain JSON Schema

Pi idiomatically uses `@sinclair/typebox` for parameter schemas. Our extensions use plain JSON Schema objects. Both work. Migration is optional but improves type safety. **Defer to future phase** — not worth the churn for this phase.

### `pi: any` Typing

All our extensions type the pi parameter as `any`. Should import `ExtensionAPI` from `@mariozechner/pi-coding-agent` for type safety. **Include in this phase** as a low-effort improvement.

---

## Pitfalls

1. **sendMessage during streaming**: Must use `deliverAs: "followUp"` or `"steer"`. Calling without when agent is streaming throws an error.
2. **execute() parameter order changed**: Signal is now 3rd param, onUpdate is 4th. Must match current Pi version.
3. **setActiveTools resets on session switch**: Need to re-apply in session_switch handler.
4. **appendEntry not available in all contexts**: Only available on `pi` object, not `ctx`.
5. **registerCommand handlers block the agent**: Long-running commands should be async and use `ctx.waitForIdle()`.
6. **--no-extensions prevents extension tools in subagents**: Subagents spawned with this flag cannot use extension-registered tools. This is correct for our use case (subagents should use built-in tools only).

---

## Recommended Plan Structure

Based on research, the 19 items naturally group into 3 plans:

**Plan 70-A: Critical Fixes + Core Infrastructure**

- C2: `--no-extensions` flag (one-line fix)
- C1: `sendMessage` auto-delivery with callback pattern
- Type the `pi` parameter as `ExtensionAPI`
- Update spawn.ts to accept `onComplete` callback

**Plan 70-B: Slash Commands + Notifications + Confirmations**

- H3: Register 6 slash commands
- H1: Expand `ctx.ui.notify()` usage
- H2: Add `ctx.ui.confirm()` for destructive actions
- H4: `before_agent_start` for cognitive context injection
- M8: `ctx.abort()` for hard blocking

**Plan 70-C: Tool Rendering + Session Resilience + Footer**

- H5: `renderCall()` / `renderResult()` on key tools
- M1: `onUpdate` streaming for long-running tools
- M5: `setActiveTools()` for role restriction
- M3: Rich footer via `ctx.ui.setFooter()`
- M2: Session reconstruction via `getBranch()` + session events
- L1: `appendEntry()` for persistent audit logging

_Roadmap updated: 2026-02-28_
