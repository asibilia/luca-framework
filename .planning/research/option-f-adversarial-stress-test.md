# Adversarial Stress Test: Option F (Channel-Driven Orchestrator)

**Purpose:** Construct adversarial scenarios against the Option F architecture to identify failure modes that the initial research may have underestimated or missed entirely.

**Date:** 2026-03-29
**Methodology:** For each scenario, we assume the worst-case behavior from both Claude (the LLM) and the infrastructure, then assess whether the current Option F design handles it.

---

## Scenario 1: Claude Goes Rogue (Step Disobedience)

### Setup

The channel server pushes:

```xml
<channel source="luca-orchestrator" step="lu_configure" state="routed">
## Step: Configure Session
Read .planning/config.json and resolve complexity, oversight, model profile...
When done, call step_complete with step_name="lu_configure" and success=true.
</channel>
```

Claude receives this event but decides: "I already know the configuration from context. Let me skip ahead and start executing the phase directly."

### Analysis

**What prevents this?** Under the current Option F design: **nothing deterministic**. Channel events are advisory text injected into the conversation. They are semantically identical to a user typing instructions. Claude has full autonomy to:

1. Read the channel event and do something completely different
2. Do partial work (configure 2 of 5 fields, then jump to execution)
3. Call `step_complete(step_name="lu_configure", success=true)` without doing the work at all (lying)
4. Ignore the event entirely and respond to something else in context

**Comparison with current Skill() + hooks enforcement:**

The current system has **three defense layers** against rogue behavior:

- **Layer 1 (State Machine):** The XState state machine in `/tmp/lu-context.json` tracks `current_state`. The orchestrator skill writes state transitions.
- **Layer 2 (Pre-Step Hooks):** `pre-step-lu.ts` fires on every `Skill()` call. It reads `current_state` from the context file and blocks the call if the state does not match. This is a **deterministic programmatic gate** -- it runs as a PreToolUse hook in Claude Code and returns exit code 2 to block. Claude cannot bypass this.
- **Layer 3 (Fail-Closed Flags):** Gate flags (`--run-premortem`, `--skip-premortem`) are resolved by the orchestrator and passed as explicit flags. Sub-skills cannot resolve their own gates.

Under Option F, Layer 2 **disappears entirely**. There are no `Skill()` calls to intercept. The channel event is not a tool call -- it is injected text. There is no PreToolUse hook that fires when Claude "processes" a channel event.

**The critical gap:** The current enforcement hooks are a **programmatic barrier** (exit code 2 blocks the tool call). Channel events provide only a **semantic barrier** (instructions that say "do this, not that"). The LLM can always override semantic barriers. It cannot override programmatic barriers.

**Can channels + hooks work together?** Only if Claude still makes interceptable tool calls during step execution. For example, if the channel event says "call Skill('lu-configure')" and Claude does so, the pre-step hook fires and validates state. But this defeats the purpose of channels -- we are back to Skill() orchestration with an extra layer of indirection.

**Mitigation needed:**

- The `step_complete` reply tool should validate that expected artifacts exist (e.g., check that config was actually read, check that expected context fields were populated)
- The channel server should read the context file after `step_complete` and verify that expected state changes occurred, not just trust Claude's self-report
- Post-step validation via the existing gap detection (Layer 4) remains essential

| Rating                     | Value                                                                               |
| -------------------------- | ----------------------------------------------------------------------------------- |
| Severity                   | HIGH                                                                                |
| Likelihood                 | MEDIUM (Claude generally follows instructions, but degrades under context pressure) |
| Current design handles it? | NO -- relies entirely on Claude's compliance with semantic instructions             |

---

## Scenario 2: Stale Context

### Setup

The channel server pushes Step 5 (`phase_waves`). The `step_complete` handler for Step 4 wrote `current_state: "setup"` to `/tmp/phase-execute-context.json`. However, a timing issue means:

1. The channel server calls `luHelpers.write({ current_state: "setup" })` (async, involves `Bun.write()` which is atomic write-to-temp + rename)
2. Immediately pushes the channel notification for Step 5
3. Claude receives the notification and reads the context file
4. The file rename from step (1) has not completed yet -- Claude reads the old state

### Analysis

**How likely is this?** On macOS (FSEvents), `Bun.write()` atomic rename is typically <1ms. The channel notification travels via stdio to Claude Code and is injected into the conversation context. By the time Claude's LLM inference begins (which takes 500ms+ minimum), the file write has long completed.

**However, there is a subtler variant:** Claude is NOT reading the context file in response to the channel event. Claude is reading files that were SUPPOSED to be updated by a previous step. For example:

- Step 3 was "plan the phase" and should have written `01-PLAN.md`
- Step 5 is "execute waves" which reads `01-PLAN.md`
- But Claude's step 3 execution only wrote a partial plan (it got interrupted by context compaction, or the Agent() call timed out)
- The channel server called `step_complete` based on Claude's self-report, not based on verifying the plan file exists

**The real stale context risk is not filesystem timing -- it is semantic staleness.** Claude says "done" but the artifacts are incomplete or wrong.

**Mitigation in current design:**

- The `handleStepCompletion` function in the prototype validates `currentStep.step_name !== args.step_name` but does NOT validate that the step's expected outputs exist
- The channel server should add artifact validation: after `step_complete("plan")`, check that `01-PLAN.md` exists and is non-empty before pushing the next event

| Rating                     | Value                                                                  |
| -------------------------- | ---------------------------------------------------------------------- |
| Severity                   | MEDIUM                                                                 |
| Likelihood                 | MEDIUM (filesystem timing is LOW, semantic staleness is MEDIUM)        |
| Current design handles it? | PARTIALLY -- step name validation exists, artifact validation does not |

---

## Scenario 3: Long-Running Step

### Setup

Claude receives a channel event for `phase_waves` (wave execution). Claude spawns `Agent("lu-executor")` which takes 20 minutes to execute a COMPLEX phase with 3 waves. The channel server is waiting for `step_complete`.

### Analysis

**Does the server timeout?** The existing research proposes configurable timeouts (e.g., waves=60m). This is sensible. But the adversarial scenario is more nuanced:

**Sub-scenario 3a: Agent() blocks the main session**

When Claude spawns an `Agent()` call, the main session is blocked until the Agent returns. During this time:

- Claude cannot process any new channel events (they queue)
- Claude cannot call `step_complete` (the main session is not running)
- The channel server's timeout clock is ticking
- The channel server cannot "health-check" the session because MCP tools are bidirectional -- the server can push notifications, but it cannot PULL status from Claude

If the timeout fires at 60 minutes and sends a reminder, that reminder queues behind the Agent() call. When the Agent returns after 20 minutes, Claude sees the step_complete event it needs to process PLUS the reminder notification that arrived during the Agent() call.

**Sub-scenario 3b: Can the channel server detect session liveness?**

The MCP protocol does not provide a "is the session alive and processing?" signal. The channel server knows:

- Whether its stdio pipe to Claude Code is open (if it closes, Claude Code crashed)
- Whether tool calls arrive (activity indicator)
- Whether notifications were successfully written to stdio (does NOT mean Claude processed them)

It does NOT know:

- Whether Claude is in the middle of an Agent() call
- Whether Claude is waiting for user input
- Whether Claude is in context compaction
- How much context remains

**Sub-scenario 3c: What if the Agent() call itself stalls?**

If the sub-agent enters an infinite loop (e.g., retrying a failing harness fix repeatedly), the main session never regains control. The channel server times out, sends a reminder, but the reminder queues. Eventually the channel server sends an abort. The abort also queues. The pipeline is truly stuck until the user Ctrl+C's the session.

**Mitigation needed:**

- The channel server timeout should write a sentinel file (e.g., `/tmp/lu-pipeline-timeout`) that the user's shell can monitor
- A separate watchdog process (not the channel server) should monitor the sentinel and alert the user
- The timeout should be generous for known-long steps but aggressive for known-short steps

| Rating                     | Value                                                                      |
| -------------------------- | -------------------------------------------------------------------------- |
| Severity                   | HIGH                                                                       |
| Likelihood                 | HIGH (Agent() calls regularly exceed 5 minutes for COMPLEX phases)         |
| Current design handles it? | PARTIALLY -- timeout mechanism proposed but cannot interrupt Agent() calls |

---

## Scenario 4: Session Compaction

### Setup

A multi-phase pipeline has been running for 45 minutes. Context usage hits 83.5% (the documented compaction threshold). Claude Code auto-compacts, summarizing the conversation. The channel events from steps 1-8 are condensed into a summary paragraph. Claude no longer has:

- The original channel `instructions` text (may or may not survive -- it is in the system prompt, but compaction behavior with system prompt additions is not documented)
- The step-by-step history of what was accomplished
- The instruction to "call `step_complete` when done"
- Awareness that it is in a pipeline at all

### Analysis

**This is the most dangerous adversarial scenario for Option F.** After compaction:

1. Claude may not know it is in a pipeline
2. Claude may not know to call `step_complete`
3. The channel server pushes Step 9. Claude receives `<channel source="luca-orchestrator" step="phase_verify" ...>` but lacks the context to understand what this means or what to do with it
4. Claude may treat the channel event as an isolated user request and respond conversationally instead of executing the verification step

**The `instructions` field is Claude's lifeline.** The channel server sets an `instructions` string that is "added to Claude's system prompt." System prompt content typically survives compaction (it is not part of the conversation that gets summarized). BUT:

- This behavior is not explicitly documented for channel `instructions`
- System prompts have size limits and may be truncated under pressure
- Even if `instructions` survive, they are generic ("You are running under the Luca orchestrator channel...") and may not provide enough context to resume a specific step

**Comparison with current architecture:** Under the current Skill() approach, each sub-skill is loaded fresh with its full SKILL.md. Compaction is less dangerous because the skill spec is injected anew each time. Under Option F, step instructions arrive as channel events (ephemeral conversation content) rather than tool-loaded specs.

**Mitigation needed:**

- Each channel event MUST be fully self-contained. Include: what step this is, what the pipeline state is, what to do, and how to signal completion. Do NOT rely on the LLM remembering anything from previous steps
- The channel `instructions` field must include a "recovery protocol": "If you do not remember previous steps, read the context file at /tmp/lu-context.json to determine current state"
- Consider writing a "pipeline status" file that Claude can read at any time to re-orient itself

| Rating                     | Value                                                                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Severity                   | HIGH                                                                                                                          |
| Likelihood                 | HIGH (multi-phase pipelines regularly consume >80% context)                                                                   |
| Current design handles it? | PARTIALLY -- self-contained events are proposed but not mandated; instructions field may survive but behavior is undocumented |

---

## Scenario 5: Concurrent User Input

### Setup

The pipeline is on Step 7 (code review). The channel server pushed the review event. Claude is processing it. The user types: "Hey, what's the status of the pipeline?"

### Analysis

**Documented behavior:** Channel events and user messages share the same FIFO queue ([#36817](https://github.com/anthropics/claude-code/issues/36817)). The user message queues behind the current processing turn. When Claude finishes Step 7 and calls `step_complete`, the channel server pushes Step 8. But the user's message arrived BEFORE Step 8's channel event. FIFO order:

1. Claude finishes Step 7, calls `step_complete` -> channel server pushes Step 8
2. User message "what's the status?" is already in the queue from earlier
3. Claude processes the user message NEXT (it arrived first)
4. Claude responds conversationally to the user
5. Step 8's channel event processes AFTER the user interaction

**Impact:**

- The pipeline stalls for however long the user interaction takes
- If the user asks Claude to do something ("fix this bug in file X"), Claude does it, consuming context and potentially modifying files that Step 8 expected to be in a certain state
- After the user interaction, Claude processes the Step 8 event but now the filesystem/context state may have changed in ways Step 8 does not expect

**Worse case:** The user types "stop" or "cancel" during the pipeline. There is no graceful abort mechanism. Claude interprets "stop" as a conversational instruction and stops doing pipeline work. The channel server keeps pushing events. Claude is now in an undefined state -- partially pipeline-driven, partially user-interactive.

**Even worse case:** The user types a new `/lu` command while a pipeline is running (addressed in Scenario 7 below).

**Mitigation needed:**

- The channel `instructions` should tell Claude: "If you receive a user message during pipeline execution, acknowledge it briefly and continue with the current pipeline step. Do NOT abandon the pipeline to address user requests."
- This is a semantic instruction, not a programmatic enforcement. Claude may or may not follow it
- A "pipeline lock" indicator in the UI would be ideal but does not exist in Claude Code's channel architecture

| Rating                     | Value                                                               |
| -------------------------- | ------------------------------------------------------------------- |
| Severity                   | MEDIUM                                                              |
| Likelihood                 | HIGH (users frequently interact with running sessions)              |
| Current design handles it? | NO -- no mechanism to prioritize pipeline events over user messages |

---

## Scenario 6: Channel Server Crash

### Setup

The channel MCP server process crashes at Step 5 (OOM, unhandled promise rejection, Bun runtime crash). Claude is in the middle of executing Step 5's work.

### Analysis

**What happens immediately:**

1. The channel server process dies. Its stdio pipe to Claude Code closes.
2. Claude Code detects the MCP server disconnection. (MCP SDK handles this via transport close event.)
3. Claude is mid-work on Step 5. It finishes the work and tries to call `step_complete`.
4. The `step_complete` tool call FAILS because the MCP server is dead. Claude Code reports "MCP server luca-orchestrator is not connected" or similar error.
5. Claude sees the error and does not know what to do. The pipeline is stuck.

**How does Claude know the pipeline is dead?**

Claude receives a tool call failure when it tries to call `step_complete`. This is the signal. But what should Claude do with it?

- The `instructions` field could include: "If step_complete fails, the orchestrator has crashed. Save your current work and inform the user."
- But `instructions` is a system prompt addition -- Claude may not reliably follow it on tool failure

**Can the pipeline resume when the server restarts?**

Theoretically yes:

1. User restarts Claude Code with `--channels`
2. Channel server starts fresh, checks `/tmp/lu-context.json`
3. If context file exists with `current_state: "setup"` (Step 5 was in progress), the server pushes Step 5 again

But Claude's conversation context is either:

- The same session (if Claude Code reconnects without restarting) -- Claude remembers what happened
- A new session (if Claude Code was restarted) -- Claude has no memory of Steps 1-4

**The existing research proposes recovery events:** "An orchestration was in progress. Current state: X. Resume from step Y." This is reasonable but untested.

**Subtle issue:** Was Step 5's work actually completed? Claude did the work but never signaled completion. The context file may or may not have been updated (depending on whether the step's work included a context write). The server would re-push Step 5, potentially causing duplicate execution.

**Mitigation needed:**

- The channel server should write a "last-ack" file with the last completed step BEFORE pushing the next event
- On recovery, the server reads the last-ack file to determine exactly where to resume
- For idempotent steps (file writes, state updates), re-execution is safe. For non-idempotent steps (git commits, PR creation), re-execution is dangerous
- Each step should declare whether it is idempotent

| Rating                     | Value                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------- |
| Severity                   | HIGH                                                                                                |
| Likelihood                 | LOW (Bun process crashes are rare, but OOM is possible on large phases)                             |
| Current design handles it? | PARTIALLY -- recovery via context file proposed, but re-execution safety and last-ack not addressed |

---

## Scenario 7: Multiple /lu Invocations

### Setup

User runs `/lu implement feature A` in Terminal 1. Pipeline starts. User opens Terminal 2, starts another Claude Code session, and runs `/lu implement feature B`. Both pipelines try to use the same state machine and context files.

### Analysis

**Context file contention:** Both pipelines write to `/tmp/lu-context.json`. The second write overwrites the first. State machine transitions interleave. The context file becomes a garbled mix of Feature A and Feature B state.

**Channel server isolation:** Each Claude Code session spawns its own channel server subprocess. So there are two independent channel server processes, each with their own in-memory XState actors, but both reading/writing the same filesystem paths.

**State machine desync:** Server 1 thinks `current_state: "setup"`, Server 2 writes `current_state: "idle"` (its own initial state). Server 1 reads the file, sees "idle", and thinks the pipeline has been reset.

**The existing design acknowledges this:** The implementation research notes "Multiple sessions cannot run concurrently (context file contention)" but proposes no prevention mechanism beyond the note.

**Prevention options:**

1. **Lock file:** The channel server writes a PID lock file at startup (e.g., `/tmp/lu-pipeline.lock`). A second server checks for the lock and refuses to start.
2. **Session ID in context:** Add a `channel_session_id` field to the context file. Each server generates a unique session ID. Before each write, verify the session ID matches. If it does not, another pipeline is running.
3. **Named context files:** Use `/tmp/lu-context-{session-hash}.json` so each session has its own file. But then enforcement hooks cannot find the right file.

**The simplest and most reliable approach is (1): a PID lock file with stale-lock detection (check if the PID is still running).**

**Comparison with current architecture:** The current Skill() approach has the same vulnerability. Two `/lu` sessions can interleave context file writes. However, because the current approach runs within a single Claude Code session (Skill() calls are inline), the second `/lu` is less likely to be concurrent. With Option F, the explicit subprocess architecture makes concurrent access more plausible.

| Rating                     | Value                                                                  |
| -------------------------- | ---------------------------------------------------------------------- |
| Severity                   | HIGH                                                                   |
| Likelihood                 | LOW (requires deliberate action, but users do open multiple terminals) |
| Current design handles it? | NO -- acknowledged but no prevention mechanism                         |

---

## Scenario 8: Enforcement Strength Comparison

### Current Enforcement Stack

After reading the enforcement source code (`enforcement-hook-factory.ts`, `pre-step-lu.ts`, `hook-io.ts`), the current architecture has these enforcement properties:

**Deterministic enforcement (programmatic):**

1. `pre-step-lu.ts` fires on EVERY `Skill()` tool call (registered as PreToolUse hook)
2. It reads `tool_name` from stdin JSON -- this is provided by Claude Code, not by the LLM. Claude cannot forge this value.
3. It matches the skill name against a hardcoded set (`lu-route`, `lu-configure`, `lu-backlog`, `lu-phase-loop`)
4. It reads `current_state` from `/tmp/lu-context.json` (written by the orchestrator, not by the sub-skill)
5. It does an exact set lookup: `validStatesForSkill.has(currentState)`
6. If invalid, it returns exit code 2 with a `permissionDecision: "deny"` payload. **Claude Code blocks the tool call.** Claude receives an error saying the call was denied.

**This is a true programmatic gate.** The LLM cannot bypass it. It does not matter what Claude "wants" to do -- if the state is wrong, the tool call is physically blocked.

**Semantic enforcement (LLM-dependent):**

- The SKILL.md instructions say "do this step, then call the next skill"
- Gate flags (`--run-premortem`, `--skip-premortem`) are passed as string arguments -- Claude COULD ignore them, but typically follows them

### Option F Enforcement Properties

**Deterministic enforcement (programmatic):**

1. The channel server decides which event to push next -- Claude has no choice in receiving it
2. The `step_complete` reply tool validates that `step_name` matches the expected step (mismatch is rejected)
3. The channel server writes `current_state` before pushing the next event (Claude cannot forge state transitions)

**Semantic enforcement (LLM-dependent):**

1. Claude must actually do the work described in the channel event -- no programmatic check
2. Claude must call `step_complete` when done -- no programmatic enforcement (it is a voluntary tool call)
3. Claude must not do work outside the current step -- no programmatic enforcement
4. Claude must not lie about completion -- no programmatic enforcement

### Verdict

| Enforcement Property    | Current (Hooks)                                 | Option F (Channels)                                      | Winner                                                                                       |
| ----------------------- | ----------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Step ordering           | Programmatic (hook blocks wrong order)          | Programmatic (server controls event sequence)            | TIE -- both are deterministic                                                                |
| Step execution fidelity | Semantic (SKILL.md says "do X")                 | Semantic (channel event says "do X")                     | TIE -- both rely on LLM compliance                                                           |
| Skip prevention         | Programmatic (hook blocks if state wrong)       | Semantic (Claude can ignore event)                       | HOOKS WIN -- hooks physically block; channels advise                                         |
| Reordering prevention   | Programmatic + semantic                         | Programmatic (only one event visible at a time)          | CHANNELS WIN -- cannot see future steps                                                      |
| Lying about completion  | Not applicable (hooks verify before, not after) | Possible (Claude calls step_complete without doing work) | HOOKS WIN -- hooks validate preconditions, channels validate postconditions (if implemented) |
| Forgetting to complete  | Not applicable (Skill() calls are explicit)     | Possible (Claude forgets to call step_complete)          | HOOKS WIN -- failure mode does not exist with Skill()                                        |

**Overall assessment:** Channels are STRONGER for ordering (Claude cannot see future steps) but WEAKER for compliance (no programmatic enforcement that Claude actually does the work). The net effect depends on which failure mode is more common in practice:

- If the primary failure is **wrong ordering** (Claude calls skills out of order): Channels win
- If the primary failure is **skipping** (Claude does not do the work): Hooks win
- If the primary failure is **partial execution** (Claude does half the work): Both are equally weak

**Can they work together?** Yes, in a specific configuration:

1. Channel server drives step ordering (pushes events in correct sequence)
2. Channel events instruct Claude to call Skill() for each step
3. Pre-step hooks fire on the Skill() call and validate state
4. After completion, Claude calls `step_complete` to advance the pipeline

This gives you: channel ordering + hook enforcement + reply tool confirmation = triple-layered defense. But it re-introduces Skill() calls, which means bug #17351 applies again for nested sub-skills.

**Hybrid approach (channels + hooks without Skill()):**

If steps use Agent() instead of Skill(), and the hooks are updated to match on Agent() calls (per the Option B migration plan), then:

1. Channel pushes event -> Claude calls Agent() -> hook validates Agent() call -> Agent() executes -> Claude calls step_complete

This gives channel ordering + hook enforcement + Agent() isolation. It requires both Option B AND Option F infrastructure. This is the most robust approach but also the most complex.

| Rating                     | Value                                                          |
| -------------------------- | -------------------------------------------------------------- |
| Severity                   | N/A (comparison, not a failure mode)                           |
| Likelihood                 | N/A                                                            |
| Current design handles it? | Option F alone is WEAKER than hooks for compliance enforcement |

---

## Scenario 9: Option B First, Option F Later -- Migration Path Assessment

### Would Option B changes make Option F harder?

**Option B changes:**

1. Delete 23 sub-skill source files (inlined into monolith Agent() prompts)
2. Rewrite 5 orchestrator SKILL.md files to use Agent() instead of Skill()
3. Update enforcement hooks to match Agent() calls
4. Update context file protocol for cross-process Agent() access

**Impact on future Option F adoption:**

| Option B Change                  | Impact on Option F                                                                                                                                                                 | Positive or Negative?              |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Delete 23 sub-skills             | Option F needs step instructions extracted from sub-skills. If they are already deleted and inlined, extraction must happen from the monolith prompts instead of standalone files. | NEGATIVE (harder extraction)       |
| Rewrite orchestrators to Agent() | Option F replaces the orchestrator entirely with the channel server. The Agent() orchestrator becomes throwaway code.                                                              | NEUTRAL (throwaway either way)     |
| Update hooks for Agent()         | If Option F later replaces Agent() calls with channel events, the Agent()-matching hooks become dead code. But they were useful during the Option B period.                        | NEUTRAL                            |
| Context file updates             | Context file protocol changes for Agent() (cross-process access) also apply to channel server (also cross-process).                                                                | POSITIVE (reusable infrastructure) |

### Would Option B make Option F easier?

**Yes, in two important ways:**

1. **Flattened architecture:** Option B eliminates nesting. The orchestrator makes flat Agent() calls. This is structurally identical to what Option F needs: a flat sequence of steps. Converting from "orchestrator calls Agent('step-name')" to "channel pushes event for step-name" is a mechanical transformation.

2. **Context file protocol:** Option B forces the context file protocol to work cross-process (Agent() sub-agents are separate processes). This is exactly what the channel server needs. The protocol changes survive into Option F.

3. **Step instruction isolation:** If Option B extracts step instructions into the Agent() prompt parameter (rather than inlining the full SKILL.md), those extracted instructions can be directly reused as channel event content.

### What is the transition cost?

| Work Item                                                                | Effort                                                 | Risk                           |
| ------------------------------------------------------------------------ | ------------------------------------------------------ | ------------------------------ |
| Replace Agent() orchestrator calls with channel event pushes             | ~4 hours per orchestrator (5 orchestrators = 20 hours) | LOW (mechanical)               |
| Build channel server infrastructure                                      | ~20-30 hours (from scratch)                            | MEDIUM (new infrastructure)    |
| Extract step instructions from Agent() prompts to channel event payloads | ~8 hours                                               | LOW (extraction, not creation) |
| Update hooks to short-circuit when channel active                        | ~4 hours                                               | LOW                            |
| Add `--channels` startup ceremony                                        | ~2 hours                                               | LOW                            |
| Testing and validation                                                   | ~16 hours                                              | MEDIUM                         |
| **Total**                                                                | **~50-70 hours**                                       |                                |

For comparison, doing Option F from the current architecture (skipping Option B) would cost approximately the same 50-70 hours because the step instruction extraction work is similar whether extracting from sub-skill SKILL.md files or from Agent() prompts.

### Recommendation

**Option B first, Option F later is the correct sequencing.** Reasons:

1. **Option B works today.** Channels have an unresolved message delivery bug (#36477). Waiting for a fix is the right call.
2. **Option B's flat architecture is a stepping stone to Option F.** The refactoring work is not wasted.
3. **Option B's context file improvements are reusable.** Cross-process context access is needed by both approaches.
4. **Option F can be implemented incrementally on top of Option B.** Start with the channel server pushing "call Agent('step-name')" events (hybrid mode), then progressively move step instructions into channel event content.
5. **Rollback from Option F back to Option B is trivial.** Remove the channel server, keep the Agent() orchestrators. Rollback from Option F back to the current Skill() architecture would be much harder.

The transition cost from Option B to Option F (~50-70 hours) is roughly the same as building Option F from scratch. But the risk is MUCH lower because:

- Option B is already validated and production-proven by the time Option F work starts
- The channel server can be developed and tested in parallel without disrupting the working Option B pipeline
- The hybrid approach (channels + Agent()) provides a gradual migration path

---

## Summary Risk Matrix

| #   | Scenario                                       | Severity | Likelihood | Design Handles It? | Key Gap                                                            |
| --- | ---------------------------------------------- | -------- | ---------- | ------------------ | ------------------------------------------------------------------ |
| 1   | Claude goes rogue (ignores channel event)      | HIGH     | MEDIUM     | NO                 | No programmatic enforcement that Claude executes the step          |
| 2   | Stale context (artifacts not verified)         | MEDIUM   | MEDIUM     | PARTIALLY          | Step name validated, artifact existence not validated              |
| 3   | Long-running Agent() blocks pipeline           | HIGH     | HIGH       | PARTIALLY          | Timeout exists but cannot interrupt Agent() calls                  |
| 4   | Session compaction destroys pipeline awareness | HIGH     | HIGH       | PARTIALLY          | Self-contained events proposed, instructions survival undocumented |
| 5   | User input disrupts pipeline (FIFO queue)      | MEDIUM   | HIGH       | NO                 | No mechanism to prioritize pipeline events over user messages      |
| 6   | Channel server crash mid-pipeline              | HIGH     | LOW        | PARTIALLY          | Recovery via context file, but re-execution safety not addressed   |
| 7   | Multiple /lu invocations (context contention)  | HIGH     | LOW        | NO                 | Acknowledged in research, no prevention mechanism                  |
| 8   | Enforcement weaker than hooks for compliance   | HIGH     | N/A        | NO                 | Channels cannot programmatically verify work was done              |
| 9   | Option B -> Option F transition cost           | LOW      | N/A        | YES                | Option B is a valid stepping stone; transition is incremental      |

---

## Conclusions

### Option F's Fundamental Tradeoff

Option F trades **compliance enforcement** for **ordering enforcement**:

- **Ordering is strictly better:** Claude cannot see future steps, cannot reorder, cannot jump ahead. The channel server is the sole authority on what happens next.
- **Compliance is strictly worse:** Once Claude receives a step event, it has complete freedom. No programmatic gate verifies that the work was actually done. The `step_complete` reply tool is a voluntary self-report, not a verified attestation.

This tradeoff is acceptable IF the primary failure mode in practice is "wrong ordering" rather than "skipping work." Based on the existing premortem analyses and the anti-skip enforcement work in phases 222-224, **both failure modes occur** -- Claude sometimes reorders steps AND sometimes skips work. Option F fixes one but regresses the other.

### The Message Delivery Bug (#36477) Remains the Blocker

All adversarial scenarios above are academic until bug #36477 is fixed. If sequential channel notifications are unreliable, the entire architecture fails at the most basic level: delivering instructions to Claude. This is the same class of failure as the Skill() bug (#17351) that motivated the investigation.

### The Strongest Architecture is the Hybrid

Channels (ordering) + Agent() (isolation) + Hooks (compliance enforcement) = triple-layered defense. This requires both Option B and Option F infrastructure, which is why the "Option B first, Option F later" migration path is the recommended approach.

---

## Sources

- `src/hooks/__helpers/enforcement-hook-factory.ts` -- Current enforcement implementation (262 lines)
- `src/hooks/scripts/pre-step-lu.ts` -- Lu sub-skill enforcement hook
- `src/hooks/__helpers/hook-io.ts` -- Hook I/O contract (stdin parsing, exit codes, dedup guards)
- `.claude/rules/gate-enforcement.md` -- Gate enforcement rule (fail-closed semantics)
- `.planning/research/option-f-channels-pitfalls-and-risks.md` -- Initial Option F risk assessment
- `.planning/research/01-architecture-patterns.md` -- Option F architecture proposal
- `.planning/research/02-implementation-approaches.md` -- Option F implementation details
- `.planning/research/04-pitfalls-and-risks.md` -- Option B risk assessment
- [#36477: --channels mode stops processing incoming messages after first response](https://github.com/anthropics/claude-code/issues/36477)
- [#36817: TUI queue management for messages sent during active task](https://github.com/anthropics/claude-code/issues/36817)
- [#17351: Nested skills don't return to invoking skill context](https://github.com/anthropics/claude-code/issues/17351)
