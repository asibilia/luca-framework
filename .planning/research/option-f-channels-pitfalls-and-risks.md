# Pitfalls and Risks: Option F -- Claude Code Channels as Deterministic Orchestrator

## Scope

This document catalogs risks, edge cases, and failure modes for using Claude Code Channels as a deterministic orchestration layer for the Luca workflow pipeline. In this architecture, a custom channel MCP server runs the state machine and pushes "execute next step" events into the running Claude Code session. Claude receives each `<channel>` event and performs the work for that step.

**Proposal context:** Instead of migrating from Skill() to Agent() calls (Option B from `docs/skill-to-agent-migration.md`), Option F externalizes orchestration entirely. The channel MCP server is the orchestrator; Claude is the worker.

**Research date:** 2026-03-29

---

## Common Pitfalls

### Pitfall 1: Channels Have a Confirmed, Unresolved Message Delivery Bug

**What goes wrong:** After Claude responds to the first channel event, subsequent channel notifications are silently dropped. The MCP server emits `notifications/claude/channel` successfully (the `await` resolves), but Claude Code's REPL does not process the notification. The session sits at the idle prompt (`>`) waiting for user input.

**Why it happens:** The root cause is in Claude Code core, not the MCP server or plugin. After a reply completes, the REPL notification listener fails to pick up the next queued notification. Multiple independent reproductions confirm this:

- [#36477](https://github.com/anthropics/claude-code/issues/36477): "--channels mode stops processing incoming messages after first response" (OPEN, confirmed on v2.1.80-v2.1.86, all platforms)
- [#38259](https://github.com/anthropics/claude-code/issues/38259): "Telegram channel stops processing inbound messages after completing a turn" (OPEN)
- Community workarounds exist (custom MCP servers bypassing official plugins, local patches to `cli.js`) but no official fix has shipped

**Impact on Option F:** CATASTROPHIC. The entire Option F architecture depends on sequential channel events being reliably delivered. If the pipeline pushes "execute step 2" and Claude never receives it, the pipeline halts -- exactly the same failure mode as the Skill() bug (#17351) that Option F is supposed to fix.

**How to avoid:**

- Wait for Anthropic to fix the core REPL notification listener bug before building on channels
- Monitor [#36477](https://github.com/anthropics/claude-code/issues/36477) for an official fix
- If building despite this risk: implement a heartbeat/ping mechanism where the channel server periodically checks if Claude is still processing, and re-sends the last event if not. However, there is no reliable way to detect "Claude received but didn't process" vs "Claude is still working"

**Warning signs:** Pipeline completes step 1 and then hangs indefinitely. The channel server's `notification()` call resolves successfully (misleadingly -- this only means the stdio write completed, not that Claude rendered the event).

### Pitfall 2: Research Preview Status Means the API Contract May Change

**What goes wrong:** Anthropic changes the channel protocol, removes capabilities, alters the `--channels` flag syntax, or removes channels entirely. Luca's orchestration layer breaks with no migration path.

**Why it happens:** The official documentation explicitly warns: "Channels are a research preview feature. The `--channels` flag syntax and protocol contract may change based on feedback." Research preview features have no stability guarantees. Channels launched March 20, 2026 -- they are 9 days old at the time of this research.

**How to avoid:**

- Build an abstraction layer between the orchestrator and the channel protocol, so the channel-specific code is isolated and replaceable
- Pin to a specific Claude Code version for production use
- Maintain Option B (Agent migration) as a ready fallback
- Track Claude Code's CHANGELOG for breaking changes

**Warning signs:** Claude Code updates break the `--channels` flag, change notification format, or remove `experimental: { 'claude/channel': {} }` capability.

### Pitfall 3: Channel Events Arrive as Queued User Messages, Not Controlled Workflow Steps

**What goes wrong:** Channel events use the same queuing mechanism as user messages. When Claude is busy, events are queued FIFO and processed after the current turn completes. There is no priority system, no deduplication, no event ordering guarantee beyond FIFO. Events cannot interrupt in-progress work.

**Why it happens:** Channels are designed for chat bridges (Telegram, Discord, iMessage) and webhook receivers, not deterministic workflow orchestration. The event delivery model is "best effort with FIFO queuing" -- appropriate for chat, inappropriate for a state machine.

**How to avoid:**

- The channel server must implement its own ordering and deduplication layer
- Never send step N+1 until step N has been confirmed complete (the channel server must wait for Claude to signal completion before pushing the next event)
- Use the reply tool as a synchronization mechanism: Claude calls the reply tool when a step is done, the channel server receives this and sends the next step

**Warning signs:** Steps arrive out of order. Duplicate steps execute. Steps queue up while Claude is processing a long task, then execute in rapid succession when Claude becomes available.

### Pitfall 4: No Back-Channel for Step Completion Signaling

**What goes wrong:** The channel MCP server pushes "execute step N" but has no reliable way to know when step N is complete. The reply tool can be used, but Claude must be explicitly instructed to call it, and the LLM may forget, skip, or hallucinate the call.

**Why it happens:** Channels are one-way or two-way chat bridges. The reply tool is a voluntary MCP tool call, not a guaranteed completion signal. There is no protocol-level acknowledgment of "event processed" or "step complete."

**How to avoid:**

- Include explicit instructions in the channel's `instructions` field requiring Claude to call the reply tool with a structured completion payload after every step
- Implement a timeout in the channel server: if no reply arrives within N seconds, re-send the event or alert the user
- Write completion state to a file (e.g., context file) that the channel server can poll

**Warning signs:** The channel server sends step 2 before step 1 is complete because it never received a completion signal. Steps execute concurrently or out of order.

### Pitfall 5: Context File Protocol Becomes the Synchronization Bottleneck

**What goes wrong:** If the channel server reads/writes the context file to track state, and Claude also reads/writes it during step execution, race conditions can corrupt the file or cause stale reads.

**Why it happens:** The channel server runs as a subprocess of Claude Code (spawned via stdio). It shares the filesystem with Claude. If both processes access the same context file concurrently, and Claude is in the middle of writing when the channel server reads, the file may contain partial data.

**How to avoid:**

- Use atomic file writes (write to temp file, rename) for all context file updates
- Use a dedicated signaling mechanism (reply tool, not filesystem) for step completion
- Consider using a SQLite database instead of a JSON file for atomic read/write guarantees

**Warning signs:** Context file contains `null` or partial JSON. Pipeline skips a step because it read stale state.

---

## Failure Modes

### Session Termination Mid-Pipeline

**Trigger:** User closes terminal, Claude Code crashes, macOS sleep, SSH disconnect, context window exhausted

**Impact:** Pipeline halts with partial state. The channel server dies too (it is a subprocess of Claude Code). All queued events are lost. Messages sent during downtime are permanently lost (documented behavior -- not a bug).

**Prevention:**

- Run Claude Code inside `tmux` or `screen` for session persistence
- Implement checkpoint/resume in the channel server: write pipeline state to disk before each step
- The existing `luca-bridge suspend` / `resume-phase` commands could be adapted for crash recovery

**Recovery:** User must restart Claude Code with `--channels`, the channel server must detect partial state and resume from the last completed step.

### Context Compaction Destroys Pipeline State

**Trigger:** Claude's context window fills during a multi-phase pipeline. Auto-compaction triggers at ~83.5% usage (~167K tokens for a 200K window).

**Impact:** Compaction summarizes the conversation, potentially losing:

- Channel event history (all `<channel>` tags from previous steps)
- Intermediate results from completed steps
- The LLM's understanding of "where we are in the pipeline"
- Instructions from the channel's `instructions` field (which is in the system prompt and may be preserved, but this is not guaranteed)

**Prevention:**

- Each channel event must be self-contained: include full context for the current step, not just "do step 5"
- Write all pipeline state to files (context file, STATE.md) so Claude can recover after compaction
- The channel server's `instructions` field should include recovery instructions: "If you don't remember previous steps, read the context file at path X"
- Use Luca's existing context management (context tiers, compaction hooks) to proactively manage context usage

**Recovery:** After compaction, Claude reads the context file to determine current state. The channel server pushes the current step event again with full context.

### Channel Server Crash

**Trigger:** Unhandled exception in the channel MCP server code. Bun runtime crash. OOM kill.

**Impact:** Claude Code continues running but no more events arrive. The pipeline stalls silently. Claude may do unrelated work or sit idle.

**Prevention:**

- Robust error handling in the channel server (try/catch around all async operations)
- Process supervision: the channel server could restart itself on crash. However, Claude Code spawns it as a subprocess, and it is unclear whether Claude Code will respawn a crashed MCP server
- Write a heartbeat file that a separate watchdog monitors

**Recovery:** User must restart Claude Code with `--channels` to respawn the channel server.

### Concurrent Channel Events During Agent() Calls

**Trigger:** The channel server pushes an event while Claude is in the middle of an Agent() call (sub-agent execution).

**Impact:** The event queues behind the Agent() call. When the Agent() completes, the queued channel event processes. This is likely safe (FIFO ordering), but the timing creates ambiguity: did step N complete before or after the queued event was sent?

**Prevention:**

- The channel server must wait for explicit completion signals before sending the next event
- Never rely on timing -- always use the reply tool as a synchronization primitive

**Recovery:** Check context file state to determine actual completion status.

### Multiple Channel Events Arrive Simultaneously

**Trigger:** Network hiccup causes the channel server to batch-send multiple events, or the server's event source delivers a burst.

**Impact:** All events queue FIFO. Claude processes them sequentially. But if step 3 was sent before step 2 completed, the ordering is wrong.

**Prevention:**

- Single-event-in-flight discipline: the channel server must never have more than one unacknowledged event
- Implement a sequence number in the `meta` field so Claude can detect and reject out-of-order events

**Recovery:** Claude detects wrong sequence number, signals error via reply tool, channel server re-sends the correct event.

---

## Performance Traps

| Pattern                                                                       | Why It's Slow                                                                                                     | Better Approach                                                                             |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Pushing all step instructions via channel events                              | Each event consumes context window tokens. A 20-step pipeline could consume 20K+ tokens in channel event overhead | Push minimal "execute step N" events; let Claude read full instructions from files          |
| Channel server polling for completion                                         | Filesystem polling is wasteful and latency-prone                                                                  | Use the reply tool for synchronous completion signals                                       |
| Re-sending full context on every event                                        | Massive duplication as the pipeline progresses                                                                    | Use incremental context: only new information per step                                      |
| Running the channel server in the same process as complex orchestration logic | State machine evaluation blocks event delivery                                                                    | Keep the channel server lightweight; run orchestration logic in a separate process or async |

---

## Security Considerations

### Prompt Injection via Channel Events

The `<channel>` tag content is inserted directly into Claude's conversation. If the channel server receives external input (webhooks, chat messages), malicious content could manipulate Claude's behavior. For Option F, this is mitigated because the channel server generates events internally from the state machine -- it does not relay external user input. However, if the architecture evolves to accept external triggers (e.g., CI webhooks triggering pipeline steps), prompt injection becomes a risk.

### File System Access

The channel server runs as a subprocess with full filesystem access. It reads/writes context files, state files, and potentially source code. A bug in the channel server could corrupt project state. All file operations must be defensive (validate before write, atomic updates).

### Authentication Requirement

Channels require claude.ai login. Console and API key authentication is not supported. This means:

- Users must have a claude.ai account (not just an API key)
- Enterprise users must have their admin enable `channelsEnabled`
- CI/CD environments using API keys cannot use channels
- This restricts Option F to interactive development, not automated pipelines

---

## Migration / Version Risks

### Claude Code Version Requirements

- Channels require v2.1.80+ (basic), v2.1.81+ (permission relay)
- Users on older versions cannot use Option F at all
- The `--channels` flag is ignored on older versions with no error message
- Users who have `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` set lose access to channels silently ([#38450](https://github.com/anthropics/claude-code/issues/38450))
- Personal Max plan users with auto-generated org IDs may be blocked ([#36460](https://github.com/anthropics/claude-code/issues/36460))

### Allowlist Restrictions

During research preview, `--channels` only accepts plugins from the Anthropic-maintained allowlist. A custom Luca orchestration channel would require:

- Using `--dangerously-load-development-channels` (not suitable for production)
- Publishing the channel to the official marketplace (requires security review, uncertain timeline)
- Enterprise admins adding it to `allowedChannelPlugins` (enterprise-only)

This means Option F cannot ship to non-enterprise users during the research preview without the `--dangerously-` flag, which is a poor user experience.

### Startup Ceremony

The user must start Claude Code with `--channels plugin:luca-orchestrator@marketplace` (or `--dangerously-load-development-channels server:luca-orchestrator`). This is different from the current `/lu` invocation. Options:

- User adds `--channels` to their shell alias
- A wrapper script handles startup
- If the user forgets `--channels`, `/lu` works but without the channel-driven pipeline, creating silent behavioral difference

---

## Anti-Skip Enforcement Comparison: Channels vs. Skill() vs. Agent()

### Enforcement Strength Analysis

| Property                        | Skill() (Current)                                  | Agent() (Option B)                                        | Channels (Option F)                                                                                                                                                                                                |
| ------------------------------- | -------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Step ordering enforcement       | Pre-step hooks validate state before Skill()       | Pre-step hooks validate state before Agent()              | Channel server controls event sequence; Claude receives one step at a time                                                                                                                                         |
| Can Claude skip a step?         | Yes (LLM can choose not to call Skill())           | Yes (LLM can choose not to call Agent())                  | Partially: Claude cannot "skip ahead" because it only receives one event at a time. But it CAN do nothing with a received event or do unrelated work                                                               |
| Can Claude go rogue?            | Yes (LLM can do inline work instead of delegating) | Yes (same, but less likely since Agent() returns clearly) | Yes -- channel events are advisory. Claude can ignore `<channel>` content and do whatever it wants. There is no enforcement mechanism preventing Claude from reading a channel event and then doing unrelated work |
| Can Claude reorder steps?       | Yes (LLM chooses call order)                       | Yes (same)                                                | No -- steps arrive one at a time from the channel server. This is the primary enforcement advantage                                                                                                                |
| Nesting works?                  | No (bug #17351)                                    | Partially (flat only, no nesting)                         | N/A (no nesting concept -- channel events are sequential)                                                                                                                                                          |
| Pipeline completion guaranteed? | No (stuck after first Skill())                     | Yes (Agent() returns control)                             | No (message delivery bug #36477 can halt after first event)                                                                                                                                                        |

### Key Anti-Skip Difference

**Option B (Agent migration)** gives the LLM freedom to choose which Agent() to call and when, but hooks enforce ordering. The LLM could theoretically skip an Agent() call entirely -- hooks only fire when a call is ATTEMPTED, not when a call is MISSING.

**Option F (Channels)** removes the LLM's ability to choose step ordering (the channel server decides), but gives the LLM complete freedom within each step. Claude cannot skip ahead because it does not know what future steps are. However, Claude CAN:

1. Ignore the channel event entirely (do nothing, or do unrelated work)
2. Partially execute a step (do 3 of 5 tasks in the event instructions)
3. Signal completion via the reply tool without actually completing the work

**Neither approach fully prevents skipping.** Option B relies on the LLM to make the right Agent() calls. Option F relies on the LLM to faithfully execute what the channel event says. Both require gap detection (Layer 4) to catch missed work after the fact.

### Interaction With Existing Enforcement Stack

| Layer                 | Current                   | Under Option B      | Under Option F                                                                                                        |
| --------------------- | ------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| L0: State Machine     | XState definitions        | Same                | Lives in channel server, not Claude                                                                                   |
| L1: Fail-Closed Flags | Gate flags (--run/--skip) | Same                | Channel server resolves gates before sending events                                                                   |
| L2: Pre-Step Hooks    | Match Skill() calls       | Match Agent() calls | **Irrelevant** -- there are no Skill() or Agent() calls to intercept. The channel server IS the enforcement mechanism |
| L3: Checkpoints       | Context files             | Same                | Channel server writes checkpoints                                                                                     |
| L4: Gap Detection     | Post-execution audit      | Same                | Same                                                                                                                  |

Under Option F, Layers 0-2 collapse into the channel server. The pre-step hooks (Layer 2) become useless because the LLM is not making tool calls that can be intercepted -- it is receiving `<channel>` events and acting on them. **This means the entire hook-based enforcement infrastructure built in phases 222-224 becomes dead code.**

---

## Option F vs. Option B: Comparative Analysis

### What Option F Solves That Option B Does Not

1. **Step ordering is deterministic:** The channel server controls which step happens next. Claude cannot reorder.
2. **No LLM orchestration logic:** The SKILL.md does not need orchestration instructions. Less context consumed.
3. **No nesting constraint:** The flat sub-agent limitation does not apply because there are no Agent() calls from the orchestrator.
4. **Simpler prompts:** Each channel event can be a focused, single-step instruction without orchestration overhead.

### What Option B Solves That Option F Does Not

1. **Works today:** Agent() is a stable, documented feature. Channels have an unresolved message delivery bug.
2. **No version requirements:** Agent() works on all Claude Code versions. Channels require v2.1.80+.
3. **No startup ceremony:** No `--channels` flag needed. `/lu` works as-is.
4. **No allowlist restriction:** Agent() does not require marketplace approval or `--dangerously-` flags.
5. **Proven pattern:** Agent() is used throughout the codebase already (lu-cognition, lu-router, lu-planner, etc.).
6. **Context isolation:** Each Agent() gets its own context window. Channel events share the main session's context, meaning a 20-step pipeline consumes the main session's context window.
7. **Rollback is simple:** Revert source files via git. Channels require removing infrastructure.

### Could They Be Combined?

**Yes, potentially.** A hybrid approach:

- Option B for the orchestration pattern (Agent() calls for leaf work)
- Channel server as an "auto-advance" mechanism that pushes "call the next Agent()" prompts into the session

This gives you:

- Agent() isolation for heavy work (own context window)
- Channel-driven step sequencing (deterministic ordering)
- Hook-based enforcement still works (hooks intercept Agent() calls)

**Risk of hybrid:** Two failure modes compound. The channel delivery bug (#36477) AND the Agent() nesting constraint both apply.

### Rollback Story

|                    | Option B                                                                     | Option F                                                                    |
| ------------------ | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Rollback mechanism | `git checkout` source files, restore deleted sub-skills, `bun run build:all` | Remove channel server, revert lu.skill.ts, remove `--channels` from startup |
| Rollback speed     | Minutes (file revert)                                                        | Minutes (file revert + startup change)                                      |
| Rollback risk      | LOW (independent per orchestrator)                                           | MEDIUM (channel infrastructure is cross-cutting)                            |
| Partial rollback   | Yes (migrate one orchestrator at a time)                                     | No (channels is all-or-nothing for orchestration)                           |

---

## User Experience Risks

### Noise in Terminal

Channel events appear as `<channel source="luca-orchestrator">` tags in the conversation. A 15-step pipeline means 15 channel events visible in the terminal. This is noisy but manageable -- similar to current Skill() loading messages.

### User Interaction During Pipeline

The user CAN type messages while the pipeline is running. User messages queue behind channel events (FIFO). If the user types "stop" or asks a question mid-pipeline, it queues and executes after the current step completes. There is no "interrupt" mechanism -- the user cannot abort a running step.

**Abort mechanism:** The user can Ctrl+C to interrupt Claude Code, but this kills the entire session including the channel server. There is no graceful "pause pipeline" option via channels.

### User Types During Execution

If the user types "what files did you change?" while step 5 is executing, this message queues. After step 5 completes, Claude processes the user's question INSTEAD of the next channel event (because the user message arrived first in the FIFO queue). The pipeline stalls until Claude finishes answering, then the next channel event processes.

This is a significant UX issue: casual user interaction can stall the pipeline unpredictably.

---

## Deployment Risks

### The `--channels` Flag Requirement

Every Claude Code session that wants to use `/lu` with channel-driven orchestration must be started with `--channels`. This is a fundamental change to user workflow:

- Users who forget `--channels` get a degraded experience
- Users cannot add channels to an already-running session
- The flag requires specifying the exact plugin/server identifier

### Conditional Channel Enablement

Channels cannot be conditionally enabled within a session. You either start with `--channels` or without. This means:

- Users who want `/lu` but also want to do normal coding in the same session must always use `--channels`
- The channel server runs for the entire session even when not executing a pipeline
- The channel server consuming resources (HTTP port, polling loops) during normal coding work

### Version Fragmentation

Users on Claude Code < v2.1.80 cannot use Option F. The framework must maintain a fallback path:

- Detect Claude Code version at startup
- If < v2.1.80, fall back to Option B or current Skill() behavior
- Two code paths to maintain indefinitely (or until old versions are EOL)

---

## Confidence Assessment

| Area                               | Level  | Reason                                                                                                                                               |
| ---------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Message delivery bug (#36477)      | HIGH   | Confirmed by 10+ independent reproductions across all platforms, verified on v2.1.80-v2.1.86, root cause analysis available, no official fix shipped |
| Research preview instability       | HIGH   | Official documentation explicitly warns about API contract changes                                                                                   |
| FIFO event queuing behavior        | MEDIUM | Inferred from Claude Code's message queuing behavior + search results, not explicitly documented for channels                                        |
| Context compaction impact          | MEDIUM | Compaction behavior is well-documented, but its interaction with channel `instructions` and event history is not explicitly documented               |
| Anti-skip enforcement comparison   | HIGH   | Based on direct analysis of channel protocol docs, enforcement hook source code, and existing anti-skip architecture                                 |
| Allowlist/deployment restrictions  | HIGH   | Official documentation, confirmed by bug reports (#36460, #38450)                                                                                    |
| User interaction disruption (FIFO) | MEDIUM | Inferred from message queuing behavior; not specifically tested with channels                                                                        |
| Hybrid approach feasibility        | LOW    | Speculative; no evidence of anyone combining channels with Agent() orchestration                                                                     |

---

## Summary Recommendation

**Option F is architecturally elegant but not production-ready.** The deterministic step ordering it provides is exactly what Luca needs, but three critical blockers exist:

1. **The message delivery bug (#36477) is the same class of failure as the Skill() bug (#17351).** Swapping one "messages silently dropped" bug for another "messages silently dropped" bug does not fix the fundamental problem. Until #36477 is resolved, Option F replaces one stuck pipeline with a differently-stuck pipeline.

2. **Research preview status provides no stability guarantees.** Building core orchestration infrastructure on a 9-day-old research preview feature is high risk. The protocol, flags, and capabilities may change without notice.

3. **Allowlist restrictions prevent shipping to non-enterprise users** without the `--dangerously-load-development-channels` flag, which is not acceptable for production use.

**Recommendation: Proceed with Option B (Agent migration) as the primary approach. Track channels maturity. Re-evaluate Option F when:**

- Bug #36477 is resolved
- Channels exits research preview
- Custom channels can be shipped without `--dangerously-` flags

**Preserve Option F design documents** for future adoption. The hybrid approach (channels for auto-advance + Agent() for leaf work) is worth prototyping once the delivery bug is fixed.

---

## Research Sources

### Official Documentation (HIGH confidence)

- [Push events into a running session with channels](https://code.claude.com/docs/en/channels) -- Claude Code Docs
- [Channels reference](https://code.claude.com/docs/en/channels-reference) -- Claude Code Docs

### Bug Reports (HIGH confidence)

- [#36477: --channels mode stops processing incoming messages after first response](https://github.com/anthropics/claude-code/issues/36477) (OPEN, 13+ comments, confirmed on v2.1.80-v2.1.86)
- [#38259: Telegram channel stops processing inbound messages after completing a turn](https://github.com/anthropics/claude-code/issues/38259) (OPEN)
- [#36460: Channels not available on personal Max plan](https://github.com/anthropics/claude-code/issues/36460) (OPEN)
- [#38450: Telemetry opt-out should not disable Channels feature flag](https://github.com/anthropics/claude-code/issues/38450) (OPEN)
- [#36817: TUI queue management for messages sent during active task](https://github.com/anthropics/claude-code/issues/36817) (OPEN -- documents FIFO queuing behavior)
- [#17351: Nested skills don't return to invoking skill context](https://github.com/anthropics/claude-code/issues/17351) (OPEN -- the original Skill() bug)
- [#29191: Parent skill cannot resume after nested skill completes](https://github.com/anthropics/claude-code/issues/29191) (OPEN)

### Internal Research (HIGH confidence)

- `.planning/notes/skill-orchestration-investigation.md` -- Root cause and options A-E
- `docs/skill-to-agent-migration.md` -- Option B design
- `.planning/research/04-pitfalls-and-risks.md` -- Option B risk assessment

### Community Reports (MEDIUM confidence)

- [Claude Code Channels: Telegram, Discord & iMessage (2026)](https://claudefa.st/blog/guide/development/claude-code-channels)
- [Channels Is the Missing Layer in Claude Code's Architecture](https://www.techbuzz.ai/articles/channels-is-the-missing-layer-in-claude-code-s-architecture)
- [Agentic coding tools should give more control over message queueing](https://solmaz.io/agentic-coding-tools-message-queueing)
