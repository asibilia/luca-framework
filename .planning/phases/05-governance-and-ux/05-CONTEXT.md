# Phase 5: Governance & UX — Implementation Context

Phase goal: Add self-tuning kill switches, milestone retrospective, and divergent mode advisory.

Todos: #103 (self-tuning governance), #104 (process retro dashboard), #105 (divergent mode nudge)

Depends on: Phase 4 (completed — lu-process-data and outcome tracking are wired)

---

## Gray Area 1: Self-Tuning Governance Integration Location

**Question:** Where exactly does auto-skip logic live? In phase-discuss.skill.ts (which already checks the premortem gate)? In lu-process-data? In config.json as new gates? Or a new standalone helper?

**Decision: Split the governance logic across two layers — lu-process-data computes and stores aggregate metrics, and the consuming skill (phase-discuss) reads the aggregate engram from MuninnDB to decide whether to skip. No new standalone helper. No new config.json gates.**

### Rationale

1. **lu-process-data already computes `signal_rate` per phase** (lines 88-103 of `lu-process-data.agent.ts`). The todo asks it to also maintain a running aggregate (`metric:signal-rate-aggregate`). This is a natural extension — after computing the per-phase signal rate, also recall the prior aggregate engram, compute the new running average, and store it back. This keeps all metric computation in a single agent.

2. **The gate-check mechanism already exists.** `phase-discuss.skill.ts` already performs a gate check for premortem (lines 240-253). The existing pattern is:

   ```bash
   PREMORTEM_GATE=$(bun run packages/luca-framework/src/state/bridge.ts gate-check --gate=premortem 2>/dev/null | ...)
   ```

   Self-tuning governance should NOT replace this config gate. Instead, it adds a second check: after the config gate says "enabled", query MuninnDB for the signal rate aggregate. If the aggregate is below threshold (<10% over 20+ MODERATE+ runs), skip anyway and log the auto-skip decision.

3. **Why NOT a new standalone helper:**
   - The auto-skip logic is 5-10 lines of MuninnDB recall + threshold comparison. It does not warrant its own module.
   - It runs inside skill prompt instructions (LLM follows the skill's text). There is no TypeScript function being called — the skill instructs the LLM to recall from MuninnDB and compare.
   - Creating a TypeScript helper would require adding tool access to phase-discuss (currently `disable-model-invocation: true`), which contradicts the skill's design.

4. **Why NOT new config.json gates:**
   - The existing `gates.premortem` boolean controls whether premortem CAN run. The graduation criteria control whether it SHOULD run. These are different concerns.
   - Adding `gates.premortem_self_tuning` would couple config.json to MuninnDB state, which is a layering violation. Config.json is static; graduation criteria are dynamic.
   - The developer can still force premortem ON via `gates.premortem: true` regardless of signal rate — the auto-skip is advisory, not override.

5. **Graduation criteria for other components (retro, outcome, divergent) follow the same pattern:** lu-process-data computes and stores the aggregate metric, and the consuming skill reads it before acting. This keeps the pattern uniform across all four components.

### Implementation Plan

**In lu-process-data agent (src/agents/luca/lu-process-data.agent.ts):**

Add a new section to the agent's output format and computation instructions:

- After computing the per-phase `signal_rate`, recall `metric:signal-rate-aggregate` from MuninnDB
- Compute new aggregate: weighted running average over last 20 MODERATE+ runs
- Include in the JSON output a new field: `aggregate_metrics.signal_rate_aggregate`
- Include `storage_keys.signal_rate_aggregate: "metric:signal-rate-aggregate"`
- Similarly add aggregate tracking for:
  - `metric:retro-response-rate` (for #104 graduation)
  - `metric:divergent-optin-rate` (for #105 graduation)
  - `metric:outcome-completion-rate` (for outcome tracking graduation, already designed in Phase 4)

**In phase-discuss.skill.ts (src/skills/general/phase-discuss.skill.ts):**

Add to the pre-mortem gate check section (after line 253), a second condition:

```
After confirming premortem gate is enabled:
1. Recall `metric:signal-rate-aggregate` from MuninnDB
2. If the aggregate exists AND sample_count >= 20 AND rate < 0.10:
   - Skip pre-mortem
   - Store `process:auto-skip` engram: "Pre-mortem auto-skipped: signal rate {rate} over {count} runs"
   - Log: "Pre-mortem auto-skipped (signal rate below threshold)"
3. Otherwise: proceed with pre-mortem as normal
```

### Key Files

- `src/agents/luca/lu-process-data.agent.ts` — Add aggregate metric computation and storage keys
- `src/skills/general/phase-discuss.skill.ts` — Add signal-rate aggregate check in pre-mortem gate section

---

## Gray Area 2: Process Retro Placement in milestone-complete

**Question:** #104 says to add a process dashboard and developer question to milestone-complete.skill.ts. Where in the current structure does this fit? How does it read metrics from MuninnDB?

**Decision: Add a new "Step 7.5: Process Retrospective" between Step 7 (commit and tag) and Step 8 (create GitHub milestone). The dashboard is rendered by the LLM from MuninnDB recall results — no sub-agent needed. The developer question is a single inline prompt.**

### Rationale

1. **Current milestone-complete flow (from the source):**

   ```
   Step 0: Check for audit
   Step 1: Verify readiness
   Step 2: Gather stats
   Step 3: Extract accomplishments
   Step 4: Archive milestone
   Step 5: Archive requirements
   Step 6: Update PROJECT.md
   Step 7: Commit and tag
   Step 8: Create GitHub milestone
   Step 9: Offer next steps
   ```

   The retro should run AFTER the milestone is committed and tagged (the work is done, metrics are final) but BEFORE the GitHub milestone is created and next steps are offered (so the retro happens while context is fresh). This places it at Step 7.5.

2. **Step 0.5 for Learning Consolidation already exists** (lines 36-82) — this runs BEFORE archiving. The retro dashboard is different: it is a read-only summary of process health, not a learning extraction step. It should not be conflated with Step 0.

3. **Reading metrics from MuninnDB:** The skill uses `disable-model-invocation: true`, meaning the orchestrating LLM (Claude) executes the instructions directly. It already demonstrates MuninnDB recall in Step 0 (lines 47-48):

   ```
   mcp__muninn__muninn_recall(vault: "default", context: "...")
   ```

   The process retro follows the same pattern:
   - Recall `metric:appetite-accuracy-*` engrams for the current milestone
   - Recall `metric:rework-ratio-*` engrams
   - Recall `metric:signal-rate-*` engrams
   - Recall agent scorecard data (from observability domain)

4. **Dashboard format:** A simple ASCII table rendered inline, similar to the auto-discuss results table in phase-discuss.skill.ts (lines 102-113). The LLM formats the recalled metrics into the table. No rendering library or sub-agent required.

5. **Developer question:** Single free-form question after the dashboard: "Anything to change about how we work?" Response stored as `process:workflow-change` engram. If developer presses enter or says "no", skip and track the non-response for graduation criteria.

6. **Graduation gate:** Before showing the question, recall `metric:retro-response-rate`. If response rate < 30% over 10+ milestones, show the dashboard but skip the question. The dashboard is always shown (auto-metrics have no developer cost).

### Implementation Plan

Add to the `milestone-complete.skill.ts` main section content, after Step 7 and before Step 8:

```markdown
## Step 7.5: Process Retrospective

### Dashboard (always shown)

Recall process metrics from MuninnDB for the current milestone:

1. `mcp__muninn__muninn_recall(vault: "default", context: "metric:appetite-accuracy {milestone}")` — appetite trend
2. `mcp__muninn__muninn_recall(vault: "default", context: "metric:rework-ratio {milestone}")` — rework trend
3. `mcp__muninn__muninn_recall(vault: "default", context: "metric:signal-rate {milestone}")` — pre-mortem signal trend
4. `mcp__muninn__muninn_recall(vault: "default", context: "agent:scorecard {milestone}")` — agent performance

Display as:
{dashboard table format}

### Developer Question (gated)

Check `metric:retro-response-rate` from MuninnDB:

- If sample_count >= 10 AND response_rate < 0.30: skip question, show dashboard only
- Otherwise: ask "Anything to change about how we work?" (free-form, optional)

If developer responds:

- Store as `process:workflow-change` engram
- Update `metric:retro-response-rate` (responded: true)

If developer skips:

- Update `metric:retro-response-rate` (responded: false)
```

### Key Files

- `src/skills/general/milestone-complete.skill.ts` — Add Step 7.5 with dashboard and question

---

## Gray Area 3: Divergent Mode and Cooldown State Interaction

**Question:** The cooldown state already exists in the state machine (built in Phase 2). #105 says to add `complete -> cooldown -> idle`. How does the divergent mode nudge interact with the existing cooldown transition? Does SKIP_COOLDOWN handle the opt-out case?

**Decision: The existing state machine wiring is already correct for divergent mode. No machine.ts changes needed. The nudge logic lives entirely in milestone-complete.skill.ts, which decides whether to emit `COOLDOWN_COMPLETE` (opt-in) or `SKIP_COOLDOWN` (opt-out).**

### Rationale

1. **The `complete` state already handles both paths** (machine.ts lines 505-519):

   ```typescript
   complete: {
     on: {
       SKIP_COOLDOWN: {
         target: "idle",                    // Developer opts out
         actions: ["resetContext", "recordTransition"],
       },
       COOLDOWN_COMPLETE: {
         target: "cooldown",               // Developer opts in
         actions: ["recordCooldownReason", "recordTransition"],
       },
       RESET: {
         target: "idle",                    // Hard reset
         actions: ["resetContext", "recordTransition"],
       },
     },
   },
   ```

   The `cooldown` state then auto-returns to `idle` after the idle timeout (5 minutes by default) or on a manual `COOLDOWN_COMPLETE` event:

   ```typescript
   cooldown: {
     after: {
       idleTimeout: { target: "idle", ... },
     },
     on: {
       COOLDOWN_COMPLETE: { target: "idle", ... },
       RESET: { target: "idle", ... },
     },
   },
   ```

2. **Mapping to divergent mode:**
   - **Opt-in (divergent mode):** milestone-complete emits `COOLDOWN_COMPLETE` from the `complete` state. The machine transitions to `cooldown`. The developer takes their divergent break. When ready, they can emit `COOLDOWN_COMPLETE` again (from `cooldown` state) to return to `idle`, or just wait for the idle timeout.
   - **Opt-out:** milestone-complete emits `SKIP_COOLDOWN` from the `complete` state. The machine transitions directly to `idle`.
   - **Not prompted (streak < 8):** milestone-complete emits `SKIP_COOLDOWN` silently (no nudge shown).

3. **The `cooldown_reason` context field already exists** (types.ts line 226). The `recordCooldownReason` action sets it to "Session complete — entering cooldown" (machine.ts lines 253-262). For divergent mode, the milestone-complete skill should override this by setting the field via bridge before emitting the event:

   ```bash
   bun run packages/luca-framework/src/state/bridge.ts set-field \
     --field=cooldown_reason \
     --value='"Divergent mode: {N} consecutive milestones completed"' \
     2>/dev/null || true
   ```

4. **No new events or states needed.** The existing `COOLDOWN_COMPLETE`, `SKIP_COOLDOWN`, and `RESET` events handle all divergent mode transitions. The nudge logic, milestone counter, and opt-in tracking are all MuninnDB operations, not state machine concerns.

5. **The idle timeout in cooldown is fine for divergent mode.** The default is 5 minutes (line 73 of machine.ts), which is a session-level timeout. For divergent mode's recommended "1 calendar day (COMPLEX), 2 calendar days (CRITICAL)" duration, the developer would simply start a new session when ready. The cooldown state is not meant to persist across sessions — it's a per-session signal. The calendar-day recommendation is advisory text, not enforced by the machine.

### Implementation Plan

No changes to `packages/luca-framework/src/state/machine.ts` or `packages/luca-framework/src/state/types.ts`.

All logic lives in `src/skills/general/milestone-complete.skill.ts` (see Gray Area 4 for the exact placement).

### Key Files

- `packages/luca-framework/src/state/machine.ts` — No changes needed (already wired)
- `packages/luca-framework/src/state/types.ts` — No changes needed (cooldown_reason exists)
- `src/skills/general/milestone-complete.skill.ts` — Nudge logic, MuninnDB counter, event emission

---

## Gray Area 4: Shared File Conflicts Between #104 and #105

**Question:** Both #104 (process retro) and #105 (divergent mode) modify milestone-complete.skill.ts. Should they be in the same plan or separate plans in the same wave?

**Decision: Same plan. Both modify milestone-complete.skill.ts at different, non-overlapping insertion points. Separate plans would cause merge conflicts. Combine them into a single plan titled "Milestone boundary enhancements."**

### Rationale

1. **Both modifications target the same skill file** (`src/skills/general/milestone-complete.skill.ts`). If they were separate plans executing in the same wave, both would read the same initial file state and produce conflicting edits. If they were in separate waves, the second would need to re-read the file modified by the first — possible but unnecessarily complex.

2. **The insertions are logically sequential and non-overlapping:**
   - #104 (process retro): Inserts Step 7.5 between Step 7 (commit/tag) and Step 8 (GitHub milestone)
   - #105 (divergent mode): Inserts Step 8.5 between Step 8 (GitHub milestone) and Step 9 (offer next steps)

   Both are additions to the existing flow, not modifications of existing steps. A single plan can add both at their respective positions in one pass.

3. **#103 (self-tuning governance) modifies different files.** Its changes go to lu-process-data.agent.ts and phase-discuss.skill.ts. It has no file overlap with #104 or #105. Therefore, #103 can be a separate plan that runs in the same wave.

4. **Recommended wave structure:**

   **Wave 1 (2 plans, parallel-safe):**
   - Plan A: #103 — Self-tuning governance (lu-process-data.agent.ts + phase-discuss.skill.ts)
   - Plan B: #104 + #105 — Milestone boundary enhancements (milestone-complete.skill.ts)

   Both plans touch different files, so they can execute in parallel within Wave 1. No Wave 2 needed.

### Implementation Plan

**Plan B scope (milestone-complete.skill.ts):**

1. Add Step 7.5: Process Retrospective dashboard + developer question (#104)
2. Add Step 8.5: Divergent Mode Advisory nudge (#105)
3. Update Success Criteria section to include retro and divergent mode checkboxes
4. Update the Step 0 "Learning Consolidation" section to mention that metrics will be surfaced in Step 7.5

**Ordering within the skill:**

```
Step 0:   Check for audit (existing)
Step 0.5: Learning consolidation (existing)
Step 1-7: Existing steps (unchanged)
Step 7.5: Process retrospective dashboard + question (NEW — #104)
Step 8:   Create GitHub milestone (existing)
Step 8.5: Divergent mode advisory nudge (NEW — #105)
Step 9:   Offer next steps (existing — add divergent mode as option)
```

### Key Files

- `src/skills/general/milestone-complete.skill.ts` — Single plan modifies this file for both #104 and #105

---

## Summary of Decisions

| Gray Area                 | Decision                                                                             | Key Reason                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Auto-skip logic location  | lu-process-data computes aggregates; consuming skills read from MuninnDB             | Keeps metric computation centralized; skills stay lightweight (no new helpers) |
| Process retro placement   | Step 7.5 in milestone-complete (after commit/tag, before GitHub milestone)           | Metrics are final after commit; context is fresh before next steps             |
| Divergent mode + cooldown | Existing state machine wiring is sufficient; nudge logic lives in milestone-complete | complete -> cooldown and SKIP_COOLDOWN already handle opt-in/opt-out           |
| Shared file conflict      | Combine #104 and #105 into one plan; #103 is a separate parallel plan                | Same file, non-overlapping insertions; prevents merge conflicts                |

## Locked Constraints (From Codebase Analysis)

- State machine `complete` state already accepts `SKIP_COOLDOWN` (-> idle) and `COOLDOWN_COMPLETE` (-> cooldown) events (machine.ts lines 505-519)
- `cooldown` state already exists with auto-timeout to `idle` (machine.ts lines 522-539)
- `cooldown_reason` field already exists in context schema (types.ts line 226)
- `recordCooldownReason` action already exists (machine.ts lines 253-262)
- `gates.premortem` gate already exists in config.json and is checked by `gate-check --gate=premortem` (config.json line 52)
- `gates.process_data` gate already exists (config.json line 53)
- lu-process-data already computes `signal_rate` per phase (lu-process-data.agent.ts lines 88-103)
- milestone-complete.skill.ts uses `disable-model-invocation: true` — all logic is LLM-executed from skill instructions
- MuninnDB recall is already used in milestone-complete (lines 47-48) and phase-discuss (lines 94)
- The existing flow in milestone-complete has clear step boundaries (Steps 0-9) making insertion straightforward
- Skills in `src/` are SOURCE — `.claude/`, `.cursor/`, `.pi/` are generated output (never edit directly)
