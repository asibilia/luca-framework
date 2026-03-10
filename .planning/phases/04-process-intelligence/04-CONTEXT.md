# Phase 4: Process Intelligence — Implementation Context

Phase goal: Close the measurement loop with process data collection and outcome tracking.

Todos: #101 (lu-process-data agent), #102 (outcome tracking)

---

## Gray Area 1: lu-process-data Pipeline Placement

**Question:** Where exactly in `phase-execute.skill.ts` should lu-process-data run? After lu-learner? How does it interact with the existing `PROCESS_DATA_COMPLETE` event in the state machine?

**Decision: Spawn lu-process-data sequentially after lu-learner completes, within the existing `learning` state. It emits `PROCESS_DATA_COMPLETE` to transition to `committing`.**

### Rationale

1. **The state machine already supports this flow.** In `machine.ts` (lines 473-487), the `learning` state accepts three events:
   - `LEARN_COMPLETE` -> `committing`
   - `PROCESS_DATA_COMPLETE` -> `committing`
   - `SKIP` -> `committing`

   Currently, lu-learner emits `LEARN_COMPLETE` and the machine transitions to `committing`. With lu-process-data, the flow becomes: lu-learner emits `LEARN_COMPLETE`, but instead of immediately transitioning to `committing`, the orchestrator catches the learner result and spawns lu-process-data before emitting the final transition.

2. **Problem: The machine transitions on `LEARN_COMPLETE` before lu-process-data can run.** The current wiring sends `LEARN_COMPLETE -> committing` immediately. lu-process-data needs to run AFTER learning but BEFORE committing.

3. **Solution: Change the machine wiring for `LEARN_COMPLETE`.** Two approaches:

   **Option A: Add a new `process_data` sub-state within `learning` (REJECTED)**
   - Requires a child state machine within `learning`, adding structural complexity
   - Over-engineers what is a simple sequential spawn

   **Option B: Keep `learning` state as-is, orchestrator manages the sequencing (CHOSEN)**
   - After lu-learner returns, the orchestrator does NOT emit `LEARN_COMPLETE` to the bridge
   - Instead, it spawns lu-process-data with the phase metrics
   - After lu-process-data returns, the orchestrator emits `PROCESS_DATA_COMPLETE` to the bridge (which transitions `learning -> committing`)
   - If lu-process-data is skipped (e.g., `--skip-memory`), emit `LEARN_COMPLETE` as before

   This approach uses the existing state machine wiring without modification. The orchestrator simply delays which event it sends.

4. **Precedent:** This follows the same pattern as the pre-mortem agent in Phase 3. The `discussing` state accepts both `DISCUSS_COMPLETE` and `PREMORTEM_COMPLETE` — the orchestrator decides which to emit based on whether the pre-mortem ran.

### Implementation Plan

In `src/skills/general/phase-execute.skill.ts`, modify the learning capture section (Step 9 area, between verification passing and commit):

1. **After lu-learner Task returns:** Do NOT emit `LEARN_COMPLETE` via bridge yet
2. **Spawn lu-process-data via Task():**

   ```python
   Task(
     prompt="""
     <process_data_context>
     **Phase:** {phase_number}
     **Complexity:** {complexity}
     **Appetite:** {appetite_level} (ceiling: {appetite_token_ceiling})
     **Appetite Used Tokens:** {appetite_used_tokens}
     **Harness Fix Iterations:** {loop_a_iterations}
     **Max Harness Iterations:** {max_iterations}
     **Pre-Mortem Ran:** {true/false}
     **Pre-Mortem Risks:** {risk_count}
     **Pre-Mortem Mitigations Applied:** {mitigations_summary}
     **Verification Result:** {verification_status}
     **Phase Start Time:** {phase_start_timestamp}
     **DORA Gate:** {true if COMPLEX+, false otherwise}
     </process_data_context>

     Compute process metrics for this phase and store as MuninnDB engrams.
     """,
     subagent_type="lu-process-data",
     model="{process_data_model}",
     description="Compute process metrics"
   )
   ```

3. **After lu-process-data returns:** Emit `PROCESS_DATA_COMPLETE` via bridge with the returned metrics:
   ```bash
   bun run packages/luca-framework/src/state/bridge.ts transition \
     --event=PROCESS_DATA_COMPLETE \
     --data='{"tokens_used":N,"context_percent_used":N,"agent_invocations":N,"wall_clock_ms":N}' \
     2>/dev/null || true
   ```
4. **If `--skip-memory` flag is active:** Skip both lu-learner AND lu-process-data, emit `SKIP` event

### State Transition Flow

```
verifying
  └─ VERIFY_PASSED → learning
                        ├─ [lu-learner runs] → [lu-process-data runs] → PROCESS_DATA_COMPLETE → committing
                        ├─ [lu-learner runs, process-data skipped] → LEARN_COMPLETE → committing
                        └─ SKIP → committing (--skip-memory)
```

### Key Files

- `src/skills/general/phase-execute.skill.ts` — Add lu-process-data spawn after lu-learner (source)
- `packages/luca-framework/src/state/machine.ts` — No changes needed (PROCESS_DATA_COMPLETE already wired)
- `packages/luca-framework/src/state/types.ts` — No changes needed (process_data context and event already defined)

---

## Gray Area 2: Metric Computation Data Sources

**Question:** Where does lu-process-data get the raw data for its 3 metrics? Appetite accuracy needs `appetite_used_tokens` from bridge, harness iterations from where, pre-mortem signal rate from where?

**Decision: The orchestrator (phase-execute) collects all raw data from its own execution context and passes it to lu-process-data as prompt context. lu-process-data is a pure compute agent — it receives data, computes metrics, and stores engrams.**

### Rationale

1. **lu-process-data should NOT need tool access to read state.** The orchestrator already has all the data accumulated during the phase execution pipeline. Passing it as prompt context is simpler, cheaper (no additional bridge/MCP calls), and follows the existing sub-agent pattern where the orchestrator assembles context.

2. **Data source mapping for each metric:**

   | Metric                         | Raw Data                                          | Source in Orchestrator                                                     |
   | ------------------------------ | ------------------------------------------------- | -------------------------------------------------------------------------- |
   | Appetite accuracy              | `appetite_token_ceiling`, `appetite_used_tokens`  | Read from bridge `read-status` (Step 4.1 already does this)                |
   | Rework ratio                   | harness fix iterations consumed, max allowed      | Available from Loop A results (Step 6.6.3 outcome)                         |
   | Pre-mortem signal rate         | risks listed, mitigations that prevented failures | Pre-mortem result stored in state context; verification result from Step 7 |
   | Lead time (COMPLEX+)           | phase start timestamp, commit timestamp           | `PHASE_START_COMMIT` timestamp from Step 0.1, current time at Step 11      |
   | Change failure rate (COMPLEX+) | verification failures count per phase             | From phase_results in state context                                        |

3. **Why NOT have lu-process-data read bridge/MuninnDB itself:**
   - Adds unnecessary tool dependencies (Read, Bash) to an agent that should be lightweight
   - Increases token cost — agent would need to parse JSON from bridge, recall from MuninnDB
   - Violates the principle that the orchestrator assembles context (existing pattern from lu-executor, lu-verifier spawning)
   - The FAST_PROMOTED routing means this agent runs on haiku — giving it tool access would be wasteful

4. **Appetite accuracy formula:**

   ```
   accuracy = 1 - abs(actual_tokens - ceiling) / ceiling
   ```

   Where `actual_tokens` = `appetite_used_tokens` from bridge, `ceiling` = `appetite_token_ceiling` from bridge. An accuracy of 1.0 means the budget was perfectly used. Values below 1.0 indicate either undershoot (budget wasted) or overshoot (budget exceeded).

5. **Rework ratio formula:**

   ```
   rework_ratio = harness_fix_iterations / max_harness_iterations
   ```

   A ratio of 0 means no rework needed (harness passed on first try). A ratio of 1.0 means all fix iterations were consumed.

6. **Pre-mortem signal rate formula:**
   ```
   signal_rate = mitigations_that_prevented_failures / total_risks_identified
   ```
   This requires human judgment to determine which mitigations were actually effective. lu-process-data will use a heuristic: if a risk category matches a gap that was NOT found in verification (i.e., the mitigation worked), count it as a successful signal. If the pre-mortem did not run, this metric is omitted.

### Implementation Plan

- **lu-process-data agent tools:** `[]` (no tools needed — pure compute from prompt context)
- **Orchestrator collects before spawning:**
  1. Read `appetite_used_tokens` and `appetite_token_ceiling` from bridge `read-status`
  2. Read `loop_a_iterations` and `max_iterations` from Loop A results (already in orchestrator memory from Step 6.6.3)
  3. Read pre-mortem result from bridge `read-status` (it's stored in `context.pre_mortem_result`)
  4. Read verification status from Step 7 result
  5. Calculate `wall_clock_ms` from `PHASE_START_COMMIT` timestamp to current time
  6. If COMPLEX+: calculate lead time and change failure rate

### Key Files

- `src/agents/luca/lu-process-data.agent.ts` — New agent, no tools, receives prompt context
- `src/skills/general/phase-execute.skill.ts` — Orchestrator collects data and formats prompt

---

## Gray Area 3: lu-cognition Contextual Trigger for Outcome Tracking

**Question:** How should the outcome tracking trigger integrate with the existing lu-cognition agent? What's the current structure and where does the trigger fit?

**Decision: Add a new `<step name="outcome_check">` to lu-cognition's execution flow, after `cleanup_stale_sessions` and before `initialize_working`. The step recalls `outcome:*` engrams and conditionally prompts the developer.**

### Rationale

1. **lu-cognition's structure is step-based.** The agent uses `<step>` tags in its execution flow (lines 95-739 in the source). The current flow is:

   ```
   check_complexity_mode → load_brain → extract_keywords → resolve_cognition_tier →
   agent_health_check → selective_recall → load_global_memory →
   cleanup_stale_sessions → initialize_working → intuition_check → generate_report
   ```

2. **The outcome check should run early in the flow, before the main work starts.** The spec says it's a "contextual prompt during cognitive pre-flight" that takes ~15 seconds of developer attention. It should NOT run in lite mode (TRIVIAL/SIMPLE) since the developer would experience friction on quick tasks.

3. **Placement after `cleanup_stale_sessions` and before `initialize_working`:**
   - By this point, the brain tree is loaded and keywords are extracted
   - The session context hasn't been initialized yet, so any outcome recording goes to long-term memory (not session)
   - The step can use MuninnDB recall to find recent `outcome:*` engrams
   - If the developer responds, the outcome is stored immediately as an engram
   - If the developer says "too early", skip and don't ask again for this feature until the next milestone

4. **Complexity gate:** Only run in Full mode (MODERATE+). In lite mode, skip entirely. This aligns with the spec's philosophy of zero friction on lightweight tasks.

5. **Graduation criteria implementation:** Track `metric:outcome-completion` engram that records how many times the prompt was shown vs how many times the developer responded meaningfully. After 10 features, if completion rate < 20%, lu-cognition removes the step from its flow (read the metric engram on startup and skip if below threshold).

### Implementation Plan

In `src/agents/general/lu-cognition.agent.ts`, add a new step element to the execution flow. The step should:

**Skip if:** Lite mode (TRIVIAL/SIMPLE) -- this step only runs in Full mode.

**Logic:**

1. **Check graduation gate:** Recall `metric:outcome-completion` from MuninnDB. If completion rate is below 20% over 10+ features, SKIP this step entirely (graduated out).

2. **Recall recent features:** Call `mcp__muninn__muninn_recall(vault: "default", context: "outcome:* recent features shipped")` to find recently shipped features in the current domain.

3. **Cross-reference:** If a feature was shipped in a recent phase AND no `outcome:feature-goal` engram exists for it, prompt the developer:
   - "You shipped [Feature X] in Phase [N]. Did it achieve its goal?"
   - Options: (1) Yes -- it works as intended, (2) No -- it missed the mark, (3) Too early to tell

4. **Store response:** If "yes" or "no", store as `outcome:feature-goal` engram. If "too early", store as `outcome:deferred` (re-prompt in a future session). Update `metric:outcome-completion` with the interaction record.

5. **Continue** to `initialize_working`.

### Key Files

- `src/agents/general/lu-cognition.agent.ts` — Add `outcome_check` step (note: lu-cognition lives in `general/`, not `luca/`)
- No state machine changes needed — outcome tracking is purely MuninnDB-driven

---

## Gray Area 4: /outcome Skill Structure

**Question:** Should this be a standalone skill or embedded in an existing skill? What's the interaction pattern with MuninnDB?

**Decision: Create a new standalone skill at `src/skills/general/outcome.skill.ts`. It is a simple interactive skill with MuninnDB write access — no complexity gating, no sub-agents.**

### Rationale

1. **Standalone is appropriate.** The `/outcome` command is user-initiated, not part of any existing workflow step. It doesn't fit inside phase-execute, phase-discuss, or any other skill. It's a lightweight recording tool — similar in spirit to `/session-pause` or `/progress`.

2. **No complexity gating.** Per the spec: "No complexity gating — available at all levels." The developer can run `/outcome` at any time to record whether a shipped feature achieved its goal.

3. **Interaction pattern:**
   - Developer invokes `/outcome`
   - Skill prompts: "Which feature? What was the goal? Did it achieve it?"
   - Skill stores as `outcome:feature-goal` engram in MuninnDB
   - Skill updates `metric:outcome-completion` counter
   - Done — no verification, no sub-agents, no state machine transitions

4. **MuninnDB engram structure:**

   ```
   concept: "outcome:feature-goal"
   content: |
     Feature: {feature_name}
     Phase: {phase_number}
     Milestone: {milestone}
     Goal: {stated_goal}
     Achieved: {yes|no|partial}
     Evidence: {developer's notes}
     Recorded: {timestamp}
   ```

5. **Model routing:** This skill doesn't spawn sub-agents. It uses `disable-model-invocation: true` like most interactive skills. The orchestrator (Claude) handles the interaction directly.

6. **Alternatives considered:**

   **Embedding in `/progress` skill (REJECTED)**
   - `/progress` is read-only (status display). Adding write operations changes its contract.
   - Would clutter the progress output with unrelated prompts.

   **Embedding in lu-learner agent (REJECTED)**
   - lu-learner runs at phase boundaries, not on-demand.
   - Outcome tracking is developer-initiated, not automated.

### Implementation Plan

Create `src/skills/general/outcome.skill.ts`:

```typescript
const outcomeConfig: SkillConfig = {
  frontmatter: {
    name: "outcome",
    description: "Record whether a shipped feature achieved its goal.",
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `...interactive prompt flow...`,
      order: 1,
    },
  ],
};
```

The skill's main section instructs the orchestrator to:

1. Ask: "Which feature or milestone outcome do you want to record?"
2. If the developer provides a feature name, recall recent `outcome:*` engrams to check for duplicates
3. Ask: "What was the goal of this feature?"
4. Ask: "Did it achieve that goal? (yes / no / partial)"
5. Ask: "Any evidence or notes?"
6. Store as MuninnDB engram:
   ```
   mcp__muninn__muninn_remember(
     vault: "default",
     concept: "outcome:feature-goal",
     content: "{structured outcome record}"
   )
   ```
7. Update completion metric:
   ```
   mcp__muninn__muninn_evolve(
     vault: "default",
     id: "metric:outcome-completion",
     content: "outcome recorded: {feature_name}, total: {N+1}"
   )
   ```
8. Display confirmation banner

### Key Files

- `src/skills/general/outcome.skill.ts` — New standalone skill
- No changes to existing skills, agents, or state machine

---

## Summary of Decisions

| Gray Area            | Decision                                                                   | Key Reason                                                                     |
| -------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Pipeline placement   | After lu-learner, emit `PROCESS_DATA_COMPLETE` instead of `LEARN_COMPLETE` | State machine already wired; orchestrator manages sequencing                   |
| Data sources         | Orchestrator collects all data, passes as prompt context                   | Agent stays lightweight (no tools); follows existing sub-agent pattern         |
| lu-cognition trigger | New `outcome_check` step in lu-cognition execution flow                    | Fits existing step-based architecture; complexity-gated to Full mode           |
| /outcome skill       | New standalone `outcome.skill.ts`                                          | User-initiated, not part of any existing workflow; simple MuninnDB interaction |

## Locked Constraints (From Codebase Analysis)

- State machine `learning` state already accepts `PROCESS_DATA_COMPLETE` event (machine.ts line 478-481)
- `recordProcessData` action already wired to store `process_data` in context (machine.ts lines 279-293)
- `process_data` field already defined in `workflowContextSchema` (types.ts lines 214-223)
- `PROCESS_DATA_COMPLETE` event schema already defined with `tokens_used`, `context_percent_used`, `agent_invocations`, `wall_clock_ms` fields (types.ts lines 327-333)
- FAST_PROMOTED routing preset exists (model-routing.ts lines 83-88) — needs `"lu-process-data": FAST_PROMOTED` entry added
- lu-learner uses FAST_PROMOTED routing (model-routing.ts line 167)
- lu-cognition lives at `src/agents/general/lu-cognition.agent.ts` (not `src/agents/luca/`)
- No existing `src/agents/luca/lu-learner.agent.ts` or `lu-cognition.agent.ts` in the `luca/` directory — they are in `general/`
- Skills in `src/` are the SOURCE — `.claude/`, `.cursor/`, `.pi/` are generated output (never edit directly)
- Appetite fields (`appetite_level`, `appetite_token_ceiling`, `appetite_used_tokens`) are already in the state context and readable via bridge
