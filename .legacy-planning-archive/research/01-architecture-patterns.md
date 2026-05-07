# Architecture Research: Channel-Driven Orchestrator

Research for replacing Skill()-based orchestration with a channel-driven state machine using Claude Code Channels (v2.1.80+).

## Problem Statement

Claude Code has a confirmed bug ([#17351](https://github.com/anthropics/claude-code/issues/17351), open since January 2026, 26 upvotes) where nested `Skill()` calls do not return control to the parent skill. After a child skill completes, execution returns to the **main session context** instead of the invoking skill. This fundamentally breaks Luca's multi-level orchestration:

```
/lu -> Skill("lu-route") -> Skill("lu-configure") -> Skill("lu-phase-loop")
                                                         -> Skill("phase-execute")
                                                              -> Skill("phase-execute-waves")
                                                              -> Skill("phase-execute-verify")
                                                              -> Skill("phase-execute-review")
```

The current workaround is prompt-based continuation directives that are unreliable. The channel architecture proposes an alternative: push step-execution events from a deterministic TypeScript process into the session so Claude never needs to chain Skill() calls.

---

## Architecture Patterns

### Recommended Pattern: Channel-Driven State Machine Orchestrator

**What:** An MCP server that declares the `claude/channel` capability, runs the XState state machine in-process, and pushes `notifications/claude/channel` events into the running Claude Code session. Each event carries the instructions for one workflow step. Claude executes the step, signals completion by calling a reply tool (`step_complete`), and the channel advances the state machine and pushes the next event.

**When to use:** When the orchestration logic is deterministic and the LLM's job is to execute each step, not decide what comes next.

**Structure:**

```
src/channel/
  __schemas/
    channel.schemas.ts          # Zod schemas for channel events, state, config
  __helpers/
    channel-server.ts           # MCP server factory with channel capability
    step-emitter.ts             # Maps state machine states to channel events
    completion-watcher.ts       # Timeout and stall detection
    step-instructions.ts        # Per-step instruction payloads (extracted from skills)
  index.ts                      # Barrel exports
```

**Example (channel server core):**

```typescript
// Source: Claude Code Channels Reference (https://code.claude.com/docs/en/channels-reference)
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const mcp = new Server(
  { name: "lu-orchestrator", version: "1.0.0" },
  {
    capabilities: {
      experimental: { "claude/channel": {} },
      tools: {}, // reply tool for step completion
    },
    instructions: `You are running under the Luca orchestrator channel.
Events arrive as <channel source="lu-orchestrator" step="..." state="...">.
Each event contains the instructions for one workflow step.
Execute the step fully, then call the step_complete tool with the result.
Do NOT skip steps or execute steps out of order.`,
  },
);
```

### Alternative Considered: Polling-Based MCP Tool

**What:** Instead of pushing events, expose an MCP tool like `get_next_step()` that Claude polls after each step.

**Why rejected:** Claude would need to remember to poll. The channel pattern inverts control -- the state machine pushes, Claude reacts. This is more reliable because the LLM cannot forget to ask for the next step.

### Alternative Considered: Hook-Only Enforcement (Current Approach)

**What:** Pre-step hooks validate ordering but don't drive execution. The LLM reads skill specs and chains Skill() calls itself.

**Why insufficient:** Hooks enforce ordering but cannot solve the #17351 bug. The LLM still must chain Skill() calls, and nested calls still break.

### Alternative Considered: Agent()-Based Flat Orchestration (Previous Research)

**What:** Replace all Skill() calls with Agent() calls, flattening the nesting to a single level.

**Why channels may be superior:** The Agent() approach requires a massive monolithic skill spec (the full orchestration flow inlined). The channel approach keeps step instructions modular (each step is a separate payload pushed at the right time) and moves control flow out of prompt-space into deterministic TypeScript. The LLM never needs to hold the full orchestration graph in context -- it only sees the current step.

---

## Component Boundaries

### Component 1: Channel MCP Server (`channel-server.ts`)

**Responsibility:** MCP server lifecycle, stdio transport, channel capability declaration, tool registration (step_start, step_complete, step_failed, abort).

**Tier:** T3 (Build/Infrastructure) -- spawned as subprocess by Claude Code, not imported by src/ runtime code.

**Dependencies:** `@modelcontextprotocol/sdk` (new dependency, external).

### Component 2: State Machine Driver

**Responsibility:** Runs the XState actor (reuses existing `luStateMachine` and `phaseExecuteStateMachine`), processes events, determines the next state.

**Tier:** Reuses T1 (workflow) infrastructure via the existing `createSkillStateMachine` factory.

**Key insight:** The state machines already exist. The channel server instantiates them and sends events. No new state machine definitions needed.

### Component 3: Step Instruction Registry (`step-instructions.ts`)

**Responsibility:** Maps each state machine state to the instruction payload that Claude should receive. This is the content of the `<channel>` event body.

**Tier:** T3 (internal to channel server process). Instructions are extracted from existing skill spec content.

### Component 4: Timeout / Stall Detector (`completion-watcher.ts`)

**Responsibility:** Detects when Claude has not called `step_complete` within a configured timeout. Pushes reminder events, then aborts if unresolved.

**Tier:** T3 (internal to channel server process).

### Component 5: Enforcement Hooks (Modified)

**Responsibility:** Pre-step hooks change from validating Skill() calls to detecting channel-active mode and deferring to the channel server.

**Tier:** Remains T3 (hooks).

---

## Data Flow

### Flow 1: Session Startup

```
User runs: claude --dangerously-load-development-channels server:lu-orchestrator
                    |
                    v
Claude Code reads .mcp.json, spawns lu-orchestrator as subprocess
                    |
                    v
Server connects via StdioServerTransport
Server declares capabilities: { experimental: { 'claude/channel': {} }, tools: {} }
Claude Code registers notification listener for notifications/claude/channel
                    |
                    v
Server is idle -- no events pushed yet
Claude session is interactive (user can type normally)
```

### Flow 2: User Invokes /lu

```
User types: /lu implement anti-skip enforcement
                    |
                    v
Claude reads the /lu skill spec (still exists as SKILL.md)
The skill spec says: "Call the step_start tool to begin orchestration"
                    |
                    v
Claude calls MCP tool: step_start({ task: "implement anti-skip enforcement", flags: {...} })
                    |
                    v
Channel server receives tool call:
  1. Initializes context file (/tmp/lu-context.json)
  2. Creates XState actor with initial context
  3. Starts the actor (state = "idle")
  4. Returns tool result: { status: "orchestration_started", first_step: "route" }
  5. Pushes first channel event:

     <channel source="lu-orchestrator" step="route" state="idle">
     [Full lu-route instructions + task description]
     When done, call step_complete with your result.
     </channel>
                    |
                    v
Claude receives <channel> event with route step instructions
Claude executes: parse request, git context, cognition, classify complexity
                    |
                    v
Claude calls MCP tool: step_complete({
  step: "route",
  output: { complexity: "MODERATE", routing: "phase-execute" }
})
                    |
                    v
Channel server receives completion:
  1. Validates step name matches current expected step
  2. Writes output to context file
  3. Sends ROUTE_COMPLETE to XState actor
  4. Actor transitions: idle -> routed
  5. Pushes next event:

     <channel source="lu-orchestrator" step="configure" state="routed">
     [Full lu-configure instructions]
     When done, call step_complete with your result.
     </channel>
```

### Flow 3: Step Completion Mechanism (Critical Design Decision)

Three options were evaluated for how Claude signals step completion:

#### Option A: Reply Tool (RECOMMENDED)

Claude calls a `step_complete` MCP tool exposed by the channel server.

```typescript
// Channel server exposes these tools:
tools: [
  {
    name: "step_start",
    description: "Begin a Luca orchestration workflow",
    inputSchema: {
      type: "object",
      properties: {
        task: { type: "string", description: "Task description" },
        flags: { type: "object", description: "CLI flags" },
      },
      required: ["task"],
    },
  },
  {
    name: "step_complete",
    description: "Signal that the current orchestration step has completed",
    inputSchema: {
      type: "object",
      properties: {
        step: { type: "string", description: "The step that completed" },
        output: { type: "object", description: "Step output data" },
      },
      required: ["step"],
    },
  },
  {
    name: "step_failed",
    description: "Signal that the current step failed and cannot be retried",
    inputSchema: {
      type: "object",
      properties: {
        step: { type: "string" },
        error: { type: "string" },
      },
      required: ["step", "error"],
    },
  },
];
```

**Pros:**

- Explicit, typed, synchronous acknowledgment
- Channel server knows IMMEDIATELY when a step finishes
- Can validate step name matches expected state
- Output data flows directly to the server

**Cons:**

- Claude must remember to call the tool (but channel instructions say so)
- If Claude forgets, orchestration stalls (needs timeout mechanism)

#### Option B: Context File Watcher

Channel server watches `/tmp/lu-context.json` via `fs.watch()`. When `current_state` changes, the server advances.

**Why rejected:** Race conditions with file I/O, cannot carry structured output data, fs.watch() is unreliable cross-platform, introduces polling/debouncing complexity.

#### Option C: Hybrid (Reply Tool + Context File Validation)

Claude calls `step_complete` AND writes to context file. Server validates both agree.

**Why rejected:** Over-engineered. Option A alone is sufficient. Context file remains a side-channel for hooks and debugging.

**Recommendation: Option A (Reply Tool).** Simplest, most reliable, aligns with the two-way channel pattern documented in the official reference.

### Flow 4: Phase Loop (Nested State Machine)

The lu state machine reaches `executing` state, which means phase execution should begin. The channel server handles this by managing a second state machine internally:

```
lu state machine: scanned -> EXECUTE_START -> executing
                    |
                    v
Channel server reads ROADMAP.md to determine execution order
(server has filesystem access -- it runs as a subprocess in the project directory)
                    |
                    v
For each phase, server creates a phaseExecuteStateMachine actor:
  1. Pushes: <channel step="phase-setup" phase="99" state="idle">
  2. Waits for step_complete
  3. Pushes: <channel step="phase-waves" phase="99" state="setup">
  4. Waits for step_complete
  5. Pushes: <channel step="phase-verify" phase="99" state="executed">
  6. Waits for step_complete
  7. Pushes: <channel step="phase-review" phase="99" state="verified">
     (or skips if harness_passed=false or code_review disabled)
  8. Waits for step_complete
  9. Pushes: <channel step="phase-learn" phase="99" state="reviewed">
  10. Waits for step_complete
  11. Pushes: <channel step="phase-commit" phase="99" state="learned">
  12. Waits for step_complete
  13. Transitions phase-execute actor to "committed" (terminal)
                    |
                    v
After all phases complete:
Server sends EXECUTE_COMPLETE to lu state machine
lu actor transitions: executing -> complete
Server pushes final event or summary notification
```

**Key insight:** The channel server manages BOTH state machines. It knows which one is active and can nest/sequence them. This replaces the lu -> lu-phase-loop -> phase-execute Skill() chain entirely.

### Flow 5: Conditional Logic and Branching

The channel server handles all branching decisions deterministically:

| Decision Point                           | Who Decides    | How                                                             |
| ---------------------------------------- | -------------- | --------------------------------------------------------------- |
| Skip backlog?                            | Channel server | Reads flags from step_start input                               |
| Skip review?                             | Channel server | Reads harness_passed from step_complete output                  |
| Gap retry?                               | Channel server | Reads verification result, applies retry budget                 |
| Oversight gate (pause/continue)?         | Channel server | Reads oversight level from config, pushes pause event if needed |
| Route decision (phase-execute vs quick)? | Channel server | Reads routing_decision from step_complete output                |
| Phase dependency check                   | Channel server | Reads ROADMAP.md, builds DAG                                    |

For oversight gates that require user input, the server pushes a special event:

```xml
<channel source="lu-orchestrator" step="oversight-gate" phase="99" type="pause">
This phase requires your approval before proceeding.

Phase 99: Anti-Skip Enforcement Layer
Goal: Implement enforcement hooks for sub-skill ordering

Options:
1. Continue -- Plan and execute this phase
2. Skip -- Park this phase and move to next
3. Stop -- End session

Reply with your choice by calling step_complete with output: { choice: "continue" | "skip" | "stop" }
</channel>
```

---

## Interaction Model Design

### Q1: When does the channel start?

**Answer:** The user starts Claude Code with `--dangerously-load-development-channels server:lu-orchestrator` (research preview) or `--channels server:lu-orchestrator` (after allowlist approval). The channel server starts and is IDLE until Claude calls `step_start`.

This means:

- Normal interactive use is unaffected (the server is quiet until invoked)
- The user types `/lu` to start orchestration
- The /lu skill spec is a thin stub that instructs Claude to call `step_start`
- Multiple sessions cannot run concurrently (context file contention)

### Q2: How does the channel know WHAT task to execute?

**Answer:** The `step_start` tool receives the full task description and flags:

```typescript
// Claude calls:
step_start({
  task: "implement anti-skip enforcement layer",
  flags: {
    complexity: "MODERATE",
    skip_backlog: true,
    oversight: "flagged",
    max_phases: 3,
  },
});
```

The channel server stores these and uses them for all subsequent decisions.

### Q3: How does the channel pass phase-specific context?

**Answer:** Every channel event includes context as `meta` attributes (become XML attributes) and as part of the `content` body:

```xml
<channel source="lu-orchestrator"
         step="phase-execute-waves"
         state="setup"
         phase="99"
         complexity="MODERATE"
         oversight="flagged">
## Phase 99: Anti-Skip Enforcement Layer

### Instructions
Execute wave discovery and wave-based execution for this phase.
[... full instructions from current phase-execute-waves skill spec ...]

### Phase Context
- Phase directory: .planning/phases/99-anti-skip-enforcement/
- Plans: 01-PLAN.md, 02-PLAN.md
- Complexity: MODERATE
- Model tier: balanced

### Completion
When done, call step_complete with your execution summary.
</channel>
```

**Note on meta key constraints:** The official docs specify "Keys must be identifiers: letters, digits, and underscores only. Keys containing hyphens or other characters are silently dropped." This means meta keys like `phase_number` work but `phase-number` would be dropped.

### Q4: What about the reply tool -- does the channel need one?

**Answer:** Yes. The channel exposes three tools via standard MCP tool capability:

| Tool            | Purpose                                          |
| --------------- | ------------------------------------------------ |
| `step_start`    | Begin orchestration (called by Claude after /lu) |
| `step_complete` | Signal step completion with output data          |
| `step_failed`   | Signal unrecoverable step failure                |

These are standard MCP tools (registered via `ListToolsRequestSchema` and `CallToolRequestSchema` handlers), not channel-specific. The channel-specific part is the `notifications/claude/channel` events pushed into the session.

### Q5: Can the channel push while Claude is processing?

**Answer:** This is the critical timing question.

The architecture is designed so the channel server does NOT push the next event until Claude calls `step_complete`. This creates a natural lock:

```
Channel pushes event A -> Claude processes A -> Claude calls step_complete -> Channel pushes event B
```

There is no race condition because the channel server controls when events are pushed, and it only pushes after receiving the completion signal via the tool call.

**Risk:** If Claude spawns a Task() or Agent() sub-agent during step execution, and that sub-agent takes a long time, the main session is blocked. The channel event queue is not a concern because we push exactly one event at a time. However, the timeout mechanism must account for long-running sub-agent work (e.g., lu-planner may take 10+ minutes for complex phases).

---

## Timing Analysis

### Concern 1: Event queuing during Agent/Task calls

**Assessment: NOT A RISK** for the orchestrator channel.

The orchestrator channel follows a strict request-response pattern:

1. Push event
2. Wait for `step_complete` tool call
3. Push next event

Events are never pushed speculatively.

### Concern 2: Multiple channel events before Claude processes the first

**Assessment: NOT A RISK** for the same reason. The server pushes exactly one event per step and waits.

### Concern 3: Timeout handling

**Assessment: REAL CONCERN.** If Claude fails to call `step_complete` (bug, context overflow, crash), the orchestration stalls forever.

**Mitigation:**

- Server implements configurable timeout per step type
- Suggested timeouts: route=5m, configure=3m, backlog=10m, waves=60m, verify=30m, review=30m, learn=5m, commit=3m
- On timeout, server pushes a reminder event: `<channel source="lu-orchestrator" reminder="true">You have an active orchestration step (step="route") that has not been completed. Call step_complete or step_failed.</channel>`
- After N reminders (configurable, default 3), server transitions to `failed` state and pushes an abort notification
- All timeouts reset when any MCP tool call arrives from the session (activity indicator)

### Concern 4: Context file corruption

**Assessment: LOW RISK.** The channel server owns the state machine in-memory. Even if Claude writes garbage to the context file, the server validates via Zod schemas before accepting. The server's in-memory XState actor is the source of truth; the context file is a persistence/communication layer.

### Concern 5: Session crash and recovery

**Assessment: MEDIUM RISK.** If Claude Code crashes:

- The channel server process dies (it is a subprocess)
- The context file persists on disk
- On restart with `--channels`, the server can read the context file and attempt to resume from the last known state
- However, Claude's in-session context is lost -- it would need to re-read the context file

**Mitigation:** On startup, if the context file exists and has a non-idle `current_state`, the server can push a recovery event that tells Claude: "An orchestration was in progress. Current state: X. Resume from step Y."

---

## Mapping Current Skill() Chain to Channel Events

### lu State Machine Events

| Current Flow            | Current Mechanism                  | Channel Event                                                                   |
| ----------------------- | ---------------------------------- | ------------------------------------------------------------------------------- |
| User runs /lu           | Skill spec loaded by Claude        | Claude reads slim /lu spec, calls `step_start` tool                             |
| lu-route                | `Skill(skill: "lu-route")`         | `<channel step="route" state="idle">` with full route instructions              |
| lu-configure            | `Skill(skill: "lu-configure")`     | `<channel step="configure" state="routed">` with configure instructions         |
| lu-backlog              | `Skill(skill: "lu-backlog")`       | `<channel step="backlog" state="configured">` with backlog instructions         |
| Skip backlog            | Orchestrator writes state directly | Server sends SKIP_BACKLOG to XState actor, pushes next step automatically       |
| lu-phase-loop           | `Skill(skill: "lu-phase-loop")`    | Server enters phase loop mode, pushes per-phase events (see below)              |
| Non-phase-execute route | `Skill(skill: "quick")` etc.       | `<channel step="route-handler" route="quick">` with route-specific instructions |

### Per-Phase Events (replaces lu-phase-loop internals)

| Current Flow              | Current Mechanism                                  | Channel Event                                                                      |
| ------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Dependency check          | Inline in lu-phase-loop                            | Server checks DAG internally, skips blocked phases                                 |
| Oversight gate            | Inline in lu-phase-loop                            | `<channel step="oversight-gate" phase="99" type="pause">` if oversight requires it |
| Complexity classification | `Task(agent: "lu-router")`                         | `<channel step="classify" phase="99">` -- Claude spawns Task(lu-router)            |
| Discussion                | `Skill(skill: "phase-discuss")`                    | `<channel step="discuss" phase="99">` with discussion instructions                 |
| Planning                  | `Skill(skill: "phase-plan")` or `Task(lu-planner)` | `<channel step="plan" phase="99">` with planning instructions                      |
| Execution start           | `Skill(skill: "phase-execute")`                    | Server creates phase-execute state machine, pushes setup event                     |

### phase-execute State Machine Events (per phase)

| Current Flow        | Current Mechanism                      | Channel Event                                                    |
| ------------------- | -------------------------------------- | ---------------------------------------------------------------- |
| Setup (steps 0-0.6) | Inline in phase-execute skill          | `<channel step="phase_setup" phase="99" state="idle">`           |
| Wave execution      | `Skill(skill: "phase-execute-waves")`  | `<channel step="phase_waves" phase="99" state="setup">`          |
| Verification        | `Skill(skill: "phase-execute-verify")` | `<channel step="phase_verify" phase="99" state="executed">`      |
| Code review         | `Skill(skill: "phase-execute-review")` | `<channel step="phase_review" phase="99" state="verified">`      |
| Skip review         | Orchestrator sends SKIP_REVIEW         | Server sends SKIP_REVIEW to actor, pushes learning step directly |
| Learning capture    | Inline in phase-execute skill          | `<channel step="phase_learn" phase="99" state="reviewed">`       |
| Final commit        | Inline in phase-execute skill          | `<channel step="phase_commit" phase="99" state="learned">`       |
| Gap retry           | Re-invoke phase-plan + phase-execute   | Server pushes re-entry events with `retry="true"` meta           |
| Milestone gate      | `Skill(skill: "milestone-complete")`   | `<channel step="milestone_gate">` with milestone instructions    |

---

## What Stays and What Changes

### Sub-Skills: Transform, Don't Delete

The 23 sub-skills **survive conceptually** but change form:

| Aspect                        | Current                                | Channel Architecture                                                                                                                                                      |
| ----------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Skill specs (.claude/skills/) | Full SKILL.md files loaded via Skill() | **Only /lu keeps a SKILL.md** (thin stub that says "call step_start"). All other sub-skill instructions move to `step-instructions.ts` and are pushed via channel events. |
| Sub-skill instructions        | Embedded in SKILL.md sections          | Extracted into `step-instructions.ts`, pushed as channel event content                                                                                                    |
| Sub-skill invocation          | `Skill(skill: "phase-execute-waves")`  | Channel event with instructions in body                                                                                                                                   |
| Sub-skill enforcement         | Pre-step hooks validate Skill() calls  | Channel server validates state before pushing (enforcement is inherent)                                                                                                   |

**Critical change:** Sub-skills like `phase-execute-waves`, `phase-execute-verify`, `phase-execute-review` no longer need to be standalone skills when orchestrated by the channel. Their instructions become payloads in channel events.

**Recommendation:** Keep the skill specs as files for manual standalone invocation (e.g., user runs `/phase-execute-waves 99` directly). Add a preamble: "If running under the lu-orchestrator channel, these instructions arrive automatically via channel events. If running standalone, execute normally." This preserves manual invocation while enabling channel-driven orchestration.

### Enforcement Hooks: Simplified

| Current Hook                | Current Behavior                                        | Channel Architecture                                            |
| --------------------------- | ------------------------------------------------------- | --------------------------------------------------------------- |
| pre-step-lu                 | Validates Skill("lu-route") only from idle state        | Unnecessary when channel is active -- channel controls ordering |
| pre-step-phase-execute      | Validates Skill("phase-execute-waves") from setup state | Unnecessary when channel is active                              |
| pre-step-verify             | Validates verify sub-skill ordering                     | Unnecessary when channel is active                              |
| pre-step-milestone-complete | Validates milestone-complete ordering                   | Unnecessary when channel is active                              |
| pre-step-pr-address         | Validates pr-address ordering                           | Unchanged (PR workflow is separate from orchestrator)           |

**Key insight:** The channel server IS the enforcement layer. By controlling what events are pushed and when, it inherently enforces ordering. Pre-step hooks become redundant for channel-driven workflows.

**Recommendation:** Keep hooks for the non-channel path (manual skill invocation, standalone runs) but short-circuit them when the channel is active. The channel server writes a sentinel file (e.g., `/tmp/lu-channel-active`) at startup. Hooks check for this file and exit success immediately if it exists. Sentinel is deleted on server shutdown.

### Context File Protocol: Mostly Unchanged

The context file at `/tmp/lu-context.json` continues to exist. Changes:

| Aspect                          | Current                                            | Channel Architecture                                                                            |
| ------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Who writes `current_state`      | Claude (via context-cli bash calls in skill specs) | Channel server (via TypeScript helpers directly -- more reliable)                               |
| Who reads context for decisions | Claude (via context-cli bash calls)                | Channel server reads for state machine decisions; Claude reads for step context when instructed |
| Schema                          | Unchanged                                          | Optionally add `channel_session_id` field for multi-session safety                              |
| context-cli.ts                  | Used by Claude for reading and writing             | Still available; server may use the `createContextHelpers` factory directly from TypeScript     |

### Build Pipeline: New Package, Minor Changes

| Aspect            | Impact                                                                     |
| ----------------- | -------------------------------------------------------------------------- |
| New dependency    | `@modelcontextprotocol/sdk` added to root package.json                     |
| New domain        | `src/channel/` added (T3 Infrastructure tier per domain-architecture rule) |
| .mcp.json         | Created at project root with lu-orchestrator server entry                  |
| Skill compilation | Unchanged -- skills still compile to SKILL.md for standalone use           |
| Hook compilation  | Hooks add sentinel check for channel-active detection                      |
| build:all         | Add channel server build step (compile TypeScript to runnable script)      |

### State Machines: Reused Directly

The existing state machines (`luStateMachine`, `phaseExecuteStateMachine`, `verifyStateMachine`, `milestoneCompleteStateMachine`, `prAddressStateMachine`) are reused without modification. The channel server imports and instantiates them. This is a major advantage -- no new state definitions needed.

---

## Anti-Patterns to Avoid

- **Polling for completion:** Do NOT have the channel server poll the context file to detect step completion. Use the reply tool (`step_complete`) for explicit signaling. Polling introduces latency, race conditions, and platform-specific fs.watch() bugs.

- **Pushing all steps at once:** Do NOT push all step events upfront and let Claude process them in order. Claude cannot guarantee ordering of multiple concurrent channel events. Push exactly one event, wait for completion, push the next.

- **Replacing all skills with channel events:** Do NOT remove standalone skill invocation. Users should still be able to run `/phase-execute 99` manually without the channel. The channel is an orchestration layer, not a replacement for direct skill access.

- **Embedding business logic in the channel server:** Do NOT put task execution logic (code writing, verification, review) in the server. The server is a state machine driver and event emitter. All intelligence stays with Claude.

- **Ignoring the development flag requirement:** During the research preview, custom channels require `--dangerously-load-development-channels`. Do NOT assume the channel will be on the approved allowlist immediately. Plan for the development flag workflow.

- **Using channel events for non-orchestration purposes:** Do NOT push general-purpose messages through the orchestrator channel. It exists solely for workflow step orchestration. Use separate channels for other push-based needs.

- **Skipping the step_start handshake:** Do NOT have the channel server push events immediately on startup. The server must wait for Claude to call `step_start` so it knows what task to orchestrate and with what flags.

---

## Confidence Assessment

| Area                                                       | Level  | Reason                                                                                                                                                       |
| ---------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Channel protocol and API                                   | HIGH   | Verified against official Claude Code documentation at code.claude.com/docs/en/channels-reference, with full code examples                                   |
| Reply tool mechanism                                       | HIGH   | Documented pattern with full two-way channel examples in official reference                                                                                  |
| Event timing (no queuing race)                             | MEDIUM | Architecture avoids the problem by design (push-wait-push), but channel event ordering guarantees during concurrent processing are not explicitly documented |
| State machine reuse                                        | HIGH   | XState machines already exist in codebase (`lu.states.ts`, `phase-execute.states.ts`), tested, deeply frozen                                                 |
| Context file protocol compatibility                        | HIGH   | Existing infrastructure (`context-helpers.ts`, `context-cli.ts`), no schema changes needed                                                                   |
| Enforcement hook simplification                            | MEDIUM | Logical conclusion but needs validation -- hooks may still be needed for edge cases not covered by channel orchestration                                     |
| Development flag / allowlist path                          | HIGH   | Documented at code.claude.com/docs/en/channels-reference#test-during-the-research-preview                                                                    |
| Bug #17351 as motivation                                   | HIGH   | Confirmed open bug with 26 upvotes, reproduced across v2.1.3 through v2.1.37+, affects macOS and Windows                                                     |
| Channel availability constraint (claude.ai login required) | HIGH   | Documented limitation -- Console and API key authentication not supported for channels                                                                       |
| Phase loop nesting (two state machines)                    | MEDIUM | Architecturally sound but untested -- the channel server managing nested XState actors is a novel pattern                                                    |
| Timeout and stall recovery                                 | LOW    | Designed but not prototyped. Timeout behavior during Task()/Agent() sub-agent calls needs empirical testing                                                  |
| Session crash recovery                                     | LOW    | Conceptually possible via context file persistence, but the Claude session context loss makes full recovery unlikely without user intervention               |

---

## Open Questions Requiring Further Investigation

1. **Does Claude process channel events during Agent/Task subagent execution?** If Claude spawns a Task() for lu-router complexity classification during a step, does a channel event arriving mid-task get queued or dropped? The architecture avoids this by not pushing during active steps, but edge cases exist (e.g., what if Claude calls step_complete and immediately spawns a Task before the next channel event arrives?).

2. **What is the maximum channel event content size?** The step instructions for phase-execute-waves are approximately 500 lines. Is this within channel event limits? The official documentation does not specify a content size limit for the `content` field.

3. **Can the channel server access the project filesystem reliably?** The server runs as a subprocess spawned by Claude Code. It should inherit the working directory. Needs empirical verification, especially for reading ROADMAP.md and config.json during phase loop setup.

4. **How does `--dangerously-load-development-channels` interact with `--channels`?** Can a user pass both flags simultaneously? The documentation says the bypass does not extend to `--channels` entries -- they are independent.

5. **Session persistence across Claude Code restarts:** If Claude Code crashes and restarts, the channel server process dies. The context file persists. Can the server resume orchestration from the last known state? Architecture supports this, but Claude's in-session context is lost.

6. **Team/Enterprise adoption:** Channels require `channelsEnabled` admin setting on Team/Enterprise plans. This is a deployment concern rather than an architecture concern, but must be documented for downstream consumers.

7. **Swarm mode compatibility:** The current lu-phase-loop supports parallel phase execution via TeamCreate/Task. Can the channel server push concurrent events for parallel phases, or must it serialize them? The push-wait-push pattern implies serialization. Parallel execution may need a different mechanism (multiple concurrent step_complete expectations).

---

## Implementation Phases (Suggested)

### Phase 1: Proof of Concept (~4-6 hours, LOW risk)

- Install `@modelcontextprotocol/sdk` as dependency
- Build minimal channel server that pushes a single "hello" event
- Create `.mcp.json` at project root
- Verify it works with `--dangerously-load-development-channels server:lu-orchestrator`
- Verify reply tool round-trip (step_start -> channel event -> step_complete)

### Phase 2: Single-Step Orchestration (~6-8 hours)

- Implement `step_start`, `step_complete`, `step_failed` tools with Zod validation
- Wire lu state machine (idle -> routed only)
- Extract lu-route instructions into step-instructions.ts
- Push lu-route instructions as channel event
- Validate full round-trip: user -> /lu -> step_start -> channel event -> Claude executes -> step_complete -> next event

### Phase 3: Full lu Chain (~8-12 hours)

- Wire remaining lu states (configure, backlog, execute)
- Implement skip logic (SKIP_BACKLOG based on flags)
- Add timeout mechanism with configurable per-step limits
- Add context file writes after each state transition
- Test the full idle -> routed -> configured -> scanned -> executing -> complete flow

### Phase 4: Nested Phase Execution (~12-16 hours)

- Wire phase-execute state machine within the channel server
- Implement per-phase context tracking and event pushing
- Handle the phase loop (iterate over ROADMAP phases)
- Handle gap retries and failure modes (park-and-continue)
- Wire milestone gate

### Phase 5: Enforcement Migration (~4-6 hours)

- Add channel-active sentinel file mechanism
- Modify enforcement hooks to short-circuit when sentinel exists
- Validate manual skill invocation still works without the channel
- Update /lu SKILL.md to thin stub for channel-driven path

---

## Sources

- [Push events into a running session with channels - Claude Code Docs](https://code.claude.com/docs/en/channels)
- [Channels reference - Claude Code Docs](https://code.claude.com/docs/en/channels-reference)
- [BUG #17351: Nested skills don't return to invoking skill context](https://github.com/anthropics/claude-code/issues/17351)
- [Claude Code Channels: Telegram, Discord & iMessage (2026)](https://claudefa.st/blog/guide/development/claude-code-channels)
- [What Is Claude Code Channels? (Complete Explanation)](https://www.lowcode.agency/blog/claude-code-channels)
