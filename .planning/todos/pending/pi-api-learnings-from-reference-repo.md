---
title: Incorporate Pi API learnings from disler/pi-vs-claude-code extensions
area: pi-extensions
created: 2026-02-28T07:55:00-05:00
source: conversation — analysis of https://github.com/disler/pi-vs-claude-code/blob/main/extensions/
---

## Context

Comprehensive analysis of 16 extensions in the `disler/pi-vs-claude-code` repo revealed significant Pi API capabilities we're not using. These range from critical UX improvements (auto-delivery of subagent results) to quality-of-life features (slash commands, notifications, confirmations).

## Findings by Impact

### 🔴 CRITICAL — Immediate UX wins

#### C1: `pi.sendMessage()` with `triggerTurn: true` for subagent auto-delivery
**Reference**: `subagent-widget.ts` (lines in spawnAgent close handler)
**Current gap**: Our subagents complete silently — the LLM must manually poll with `luca_subagent_result`. The reference repo auto-injects results back into the conversation and triggers a new LLM turn.
**Fix**: In `spawn.ts` `spawnPiSubprocess()`, on process close, call `pi.sendMessage()` to deliver the result automatically.
```ts
pi.sendMessage({
  customType: "subagent-result",
  content: `Subagent #${id} finished in ${elapsed}s.\n\nResult:\n${output}`,
  display: true,
}, { deliverAs: "followUp", triggerTurn: true });
```
**Impact**: Eliminates manual polling loops. Subagent results appear automatically.

#### C2: `--no-extensions` flag for subagent spawning
**Reference**: ALL subagent-spawning extensions use this flag
**Current gap**: Our subagents load ALL extensions recursively, causing lock file contention (we saw this fail during our review). The reference repo always passes `--no-extensions` to prevent recursive loading.
**Fix**: Add `"--no-extensions"` to the args array in `spawnPiSubprocess()`.
**Impact**: Fixes the lock file contention that crashed 3 of 4 subagents during our review session.

### 🟡 HIGH — Significant improvements

#### H1: `ctx.ui.notify()` for toast notifications
**Reference**: Used by every extension in the reference repo
**Current gap**: We never use notifications. Events like subagent completion, verification results, safety violations, and tracking warnings are only communicated through tool return values.
**Files to update**: `luca-subagents.ts`, `luca-harness.ts`, `luca-work-tracking.ts`, `luca-safety-rules.ts`
**Example**: `ctx.ui.notify("✓ Subagent lu-executor completed in 12s", "success")`

#### H2: `ctx.ui.confirm()` for destructive action gating
**Reference**: `damage-control.ts`, `tilldone.ts`
**Current gap**: Our safety rules return `{ block: true, reason: "..." }` but never ask the user. Damage-control asks for confirmation on "ask" rules and uses `ctx.abort()` for hard blocks.
**Fix**: In `luca-safety-rules.ts`, for high-severity violations, use `ctx.ui.confirm()` before blocking. In `luca-work-tracking.ts` block mode, confirm before preventing changes.

#### H3: `pi.registerCommand()` for slash commands
**Reference**: tilldone (`/tilldone`), agent-chain (`/chain`, `/chain-list`), agent-team (`/agents-team`, `/agents-list`), theme-cycler (`/theme`), session-replay (`/replay`), pi-pi (`/experts`)
**Current gap**: We register zero slash commands. Users must invoke our tools through the LLM.
**Suggested commands**:
- `/status` — show current workflow state (like luca_work_status + luca_read_state)
- `/track` — start tracking work (like luca_track_work interactive)
- `/verify` — run verification harness
- `/todos` — show pending todos
- `/subagents` — list background subagents
- `/safety` — show safety audit log

#### H4: `before_agent_start` event for auto-injecting cognitive context
**Reference**: `agent-chain.ts`, `system-select.ts`, `pi-pi.ts` — all use this to prepend context to the system prompt
**Current gap**: BRAIN.md/MEMORY.md context is only loaded when the LLM calls `luca_read_brain`/`luca_read_memory`. The reference repo injects context automatically before the agent starts.
**Fix**: In `luca-memory.ts`, add a `before_agent_start` handler that reads BRAIN.md and prepends a summary to the system prompt. This ensures cognitive context is always available.

#### H5: `renderCall()` / `renderResult()` for custom tool rendering
**Reference**: `tilldone.ts` (every action has custom rendering), `agent-chain.ts`, `agent-team.ts`, `pi-pi.ts`
**Current gap**: Our tools return plain text/JSON. The reference repo uses rich themed rendering with icons, colors, and progressive disclosure (collapsed vs expanded views).
**Fix**: Add `renderCall` and `renderResult` to key tools: `luca_verify`, `luca_subagent_create`, `luca_subagent_result`, `luca_track_work`.

### 🟢 MEDIUM — Nice-to-have improvements

#### M1: `onUpdate` streaming callback for long-running tools
**Reference**: `agent-chain.ts`, `agent-team.ts`, `pi-pi.ts` — use `onUpdate()` to show progress during chain/dispatch execution
**Current gap**: Our `luca_verify` and `luca_tilldone` tools block until completion with no progress indication.
**Fix**: Accept `onUpdate` parameter in tool execute functions and emit progress updates.

#### M2: `ctx.sessionManager.getBranch()` for state reconstruction
**Reference**: `tilldone.ts` — reconstructs task state from session history on session_start/switch/fork; `tool-counter.ts` — accumulates token/cost stats from history
**Current gap**: We clear state on session_start. If a session is resumed or forked, we lose tracking state.
**Fix**: Reconstruct work tracking state and widget state from session history using `getBranch()`. Also handle `session_switch`, `session_fork`, `session_tree` events.

#### M3: `ctx.ui.setFooter()` for rich footer
**Reference**: `tool-counter.ts` (two-line footer with model, context bar, tokens, cost, tool tally), `minimal.ts`, `agent-chain.ts`
**Current gap**: We use `ctx.ui.setStatus()` for a simple status line. The footer API supports multi-line, themed, live-updating content.
**Fix**: Replace our status line with a footer showing: tracking status, complexity, phase, memory indicators, context meter.

#### M4: `ctx.getContextUsage()` built-in API
**Reference**: `minimal.ts`, `tool-counter.ts`, `pi-pi.ts`
**Current gap**: Our luca-widgets context meter calculates usage from event data. Pi has a built-in `ctx.getContextUsage()` that returns `{ percent }`.
**Fix**: Use the built-in API instead of manual calculation.

#### M5: `pi.setActiveTools()` for dynamic tool restriction
**Reference**: `system-select.ts` — uses this to restrict tools when switching agent roles
**Current gap**: Our `luca-roles.ts` tries to enforce tool restrictions at the tool_call event level, which is fragile. Pi has a native API for this.
**Fix**: In `luca_activate_role`, call `pi.setActiveTools(roleTools)`. In `luca_deactivate_role`, restore with `pi.setActiveTools(defaultTools)`.

#### M6: `details` field in tool results for state persistence
**Reference**: `tilldone.ts` — every tool result includes `details` with full task state, enabling session history reconstruction and custom rendering
**Current gap**: Our tool results only have `content`. No structured details for history playback.
**Fix**: Include `details` in key tool results (verify, subagent, chain) for reconstruction.

#### M7: Widget `placement` option
**Reference**: `tilldone.ts`, `subagent-widget.ts` use `{ placement: "belowEditor" }`
**Current gap**: Our widgets don't specify placement — they go wherever Pi puts them.
**Fix**: Set `placement: "belowEditor"` for subagent and workflow widgets.

#### M8: `ctx.abort()` for hard blocking
**Reference**: `damage-control.ts` — calls `ctx.abort()` after blocking, which stops the agent entirely
**Current gap**: Our `luca-work-tracking.ts` block mode returns `{ block: true }` but the agent continues processing.
**Fix**: Call `ctx.abort()` after critical blocks.

### 🔵 LOW — Future considerations

#### L1: `pi.appendEntry()` for persistent audit logging
**Reference**: `damage-control.ts` uses `pi.appendEntry("damage-control-log", { ... })` to persist violation records
**Impact**: Could replace our in-memory safety audit log with persistent session-level storage.

#### L2: `ctx.ui.custom()` for interactive overlays
**Reference**: `tilldone.ts` (`/tilldone` overlay), `session-replay.ts` (`/replay` scrollable timeline)
**Impact**: Could enable interactive todo management, session replay, verification result browsing.

#### L3: `pi.registerShortcut()` for keyboard shortcuts
**Reference**: `theme-cycler.ts` uses `ctrl+x` and `ctrl+q`
**Impact**: Could enable quick actions like ctrl+v for verify, ctrl+s for status.

#### L4: `pi.sendUserMessage()` for command execution
**Reference**: `cross-agent.ts` uses this to inject user messages from loaded commands
**Impact**: Could enable our slash commands to programmatically inject prompts.

#### L5: External YAML rule configuration
**Reference**: `damage-control.ts` loads rules from `.pi/damage-control-rules.yaml`
**Impact**: Our safety rules are code-defined. External config would let users customize without editing extension source.

#### L6: `session_switch`, `session_fork`, `session_tree` event handling
**Reference**: `tilldone.ts` handles all session lifecycle events for state reconstruction
**Impact**: We only handle `session_start`. Missing events means state loss on branch/fork.

## Recommended Implementation Order

1. **C2** (`--no-extensions`) — One-line fix, immediately solves subagent lock file contention
2. **C1** (`sendMessage` auto-delivery) — Major UX improvement, moderate effort
3. **H3** (slash commands) — Quick wins, each command is ~10 lines
4. **H1** (notifications) — Sprinkle `ctx.ui.notify()` into existing extensions
5. **H4** (auto-inject BRAIN.md) — Eliminates need for manual cognitive pre-flight
6. **H2** (confirm dialogs) — Safety improvement for destructive actions
7. **M5** (`setActiveTools`) — Fixes role restriction properly
8. **M3** (rich footer) — Replace status line with proper footer
9. **H5** (custom rendering) — Polish, can do incrementally per tool
10. **M2** (state reconstruction) — Resilience, moderate effort

## Notes

- The reference repo uses `@sinclair/typebox` for parameter schemas (Type.Object/Type.String). We use plain JSON Schema objects. Both are valid Pi approaches.
- The reference repo uses `applyExtensionDefaults(import.meta.url, ctx)` from a shared `themeMap.ts` on every session_start. This sets theme defaults. We don't have an equivalent.
- The reference repo's `tilldone.ts` is the most sophisticated extension (~800 lines) with tool blocking, auto-nudge, session reconstruction, rich TUI, and slash commands. It's a good model for our work-tracking extension.
- All subagent patterns in the reference repo use `--no-extensions` and `--no-session` (or explicit `--session` files). Our subagents currently load all extensions, which is why we hit lock file issues.
