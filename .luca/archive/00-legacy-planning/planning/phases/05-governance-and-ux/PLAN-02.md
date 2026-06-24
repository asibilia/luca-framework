---
phase: 5
plan: 2
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 5 Plan 2: Milestone Boundary Enhancements (#104 + #105)

## Objective

Add two new steps to milestone-complete.skill.ts: a process retrospective dashboard with developer question (Step 7.5, #104) and a divergent mode advisory nudge (Step 8.5, #105). Both enhancements run at milestone boundaries to surface process health data and encourage periodic divergent thinking. Combined into one plan because both modify the same file at non-overlapping insertion points.

## Context

@src/skills/general/milestone-complete.skill.ts (skill to extend with Steps 7.5 and 8.5)
@.planning/phases/05-governance-and-ux/05-CONTEXT.md (Gray Areas 2, 3, and 4 decisions)
@.planning/todos/pending/104-v4-process-retro.md (process retro todo spec)
@.planning/todos/pending/105-v4-divergent-mode.md (divergent mode todo spec)
@packages/luca-framework/src/state/machine.ts (state machine -- no changes needed, already wired)

## Tasks

### 1. Add Step 7.5: Process Retrospective Dashboard

**Type:** auto
**TDD:** false
**Depends on:** none

Add a new "Step 7.5: Process Retrospective" to the milestone-complete skill's main section content, inserted between Step 7 (commit and tag) and Step 8 (create GitHub milestone). Per 05-CONTEXT.md Gray Area 2, the dashboard is rendered by the LLM from MuninnDB recall results, and the developer question is a single inline prompt.

**Insert the following content after the Step 7 block (after the "Ask about pushing tag" line) and before the Step 8 heading:**

````markdown
7.5. **Process retrospective:**

### Dashboard (always shown)

Recall process metrics from MuninnDB for the current milestone:

1.  Appetite accuracy trend:

    ```
    mcp__muninn__muninn_recall(vault: "default", context: "metric:appetite-accuracy {milestone_version}")
    ```

2.  Rework ratio trend:

    ```
    mcp__muninn__muninn_recall(vault: "default", context: "metric:rework-ratio {milestone_version}")
    ```

3.  Pre-mortem signal rate trend:

    ```
    mcp__muninn__muninn_recall(vault: "default", context: "metric:signal-rate {milestone_version}")
    ```

4.  Agent performance scores:
    ```
    mcp__muninn__muninn_recall(vault: "default", context: "agent:scorecard {milestone_version}")
    ```

Display results as an ASCII table:
````

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Luca > PROCESS RETROSPECTIVE — v{version}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Metric             | Phases | Trend   | Current |
| ------------------ | ------ | ------- | ------- |
| Appetite Accuracy  | {N}    | {trend} | {val}   |
| Rework Ratio       | {N}    | {trend} | {val}   |
| Pre-Mortem Signal  | {N}    | {trend} | {val}   |
| Agent Scores (avg) | {N}    | {trend} | {val}   |

Trend: improving / stable / declining (compare first half vs second half of phases)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

```

If no metric data is found in MuninnDB (first milestone with process data), display:

```

No process metrics found for v{version}. Dashboard will populate after future milestones with process data collection enabled.

```

### Developer Question (gated)

Before asking the question, check graduation criteria:

```

mcp**muninn**muninn_recall(vault: "default", context: "metric:retro-response-rate")

```

Parse the recalled engram:
- If `sample_count >= 10` AND `response_rate < 0.30`: SKIP the question (developer rarely engages). Show dashboard only. Update `metric:retro-response-rate` with `responded: false`.
- Otherwise: proceed with the question.

Ask the developer:

```

Anything to change about how we work? (optional — press Enter to skip)

````

**If developer responds with content:**
- Store as MuninnDB engram:
  ```
  mcp__muninn__muninn_remember(
    vault: "default",
    concept: "process:workflow-change",
    content: "Milestone: v{version}\nFeedback: {developer_response}\nRecorded: {timestamp}"
  )
  ```
- Update retro response rate:
  ```
  mcp__muninn__muninn_evolve(
    vault: "default",
    id: "metric:retro-response-rate",
    content: "sample_count: {N+1}, responses: {M+1}, response_rate: {updated_rate}"
  )
  ```
  If the metric engram does not exist yet, create it with `muninn_remember` instead of `muninn_evolve`.

**If developer skips (presses Enter or says "no"):**
- Update retro response rate (responded: false):
  ```
  mcp__muninn__muninn_evolve(
    vault: "default",
    id: "metric:retro-response-rate",
    content: "sample_count: {N+1}, responses: {M}, response_rate: {updated_rate}"
  )
  ```
  If the metric engram does not exist yet, create it with `muninn_remember`.
````

**Files to create/edit:**

- `src/skills/general/milestone-complete.skill.ts` (EDIT)

**Verification:**

- Step 7.5 exists in the skill content between Step 7 and Step 8
- Dashboard recalls 4 metric categories from MuninnDB
- Dashboard renders as ASCII table with trend analysis
- Developer question is gated by `metric:retro-response-rate` graduation criteria
- Response and skip both update the retro-response-rate metric
- Workflow feedback stored as `process:workflow-change` engram
- `bunx --bun tsc --noEmit` passes

### 2. Add Step 8.5: Divergent Mode Advisory Nudge

**Type:** auto
**TDD:** false
**Depends on:** none

Add a new "Step 8.5: Divergent Mode Advisory" to the milestone-complete skill's main section content, inserted between Step 8 (create GitHub milestone) and Step 9 (offer next steps). Per 05-CONTEXT.md Gray Area 3, no state machine changes are needed — the existing `COOLDOWN_COMPLETE` and `SKIP_COOLDOWN` events handle all transitions.

**Insert the following content after the Step 8 block and before the Step 9 heading:**

```markdown
8.5. **Divergent mode advisory:**

### Milestone Counter

Recall the convergent streak counter from MuninnDB:
```

mcp**muninn**muninn_recall(vault: "default", context: "metric:convergent-streak")

```

If no counter exists, create it with count = 1:

```

mcp**muninn**muninn_remember(
vault: "default",
concept: "metric:convergent-streak",
content: "consecutive_milestones: 1, last_milestone: v{version}, last_updated: {timestamp}"
)

```

If counter exists, increment it:

```

mcp**muninn**muninn_evolve(
vault: "default",
id: "metric:convergent-streak",
content: "consecutive_milestones: {N+1}, last_milestone: v{version}, last_updated: {timestamp}"
)

```

### Graduation Check

Before showing the nudge, check if divergent mode has graduated out:

```

mcp**muninn**muninn_recall(vault: "default", context: "metric:divergent-optin-rate")

```

If `sample_count >= 20` AND `rate < 0.10`: SKIP the nudge entirely. Developer consistently opts out. Update convergent streak and proceed to Step 9.

### Nudge (streak >= 8 AND not graduated out)

If `consecutive_milestones >= 8` AND graduation check passes:

```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Luca > DIVERGENT MODE ADVISORY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You've completed {N} consecutive milestones in convergent
(spec-driven) mode. Consider taking a divergent break:

     - Architecture sketching and exploration
     - Research reading and technology evaluation
     - Product exploration and shaping future work
     - Anything cognitively distinct from spec-driven development

Recommended duration: 1 calendar day (COMPLEX), 2 days (CRITICAL)
No acceptance criteria. No deliverables required.

[Y] Enter divergent mode [N] Continue convergent work
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

````

**If developer opts IN (Y):**

- Reset convergent streak to 0:
  ```
  mcp__muninn__muninn_evolve(
    vault: "default",
    id: "metric:convergent-streak",
    content: "consecutive_milestones: 0, last_milestone: v{version}, divergent_mode_entered: {timestamp}"
  )
  ```
- Update divergent opt-in rate (opted_in: true):
  ```
  mcp__muninn__muninn_evolve(
    vault: "default",
    id: "metric:divergent-optin-rate",
    content: "sample_count: {N+1}, optins: {M+1}, rate: {updated_rate}"
  )
  ```
  If the metric does not exist yet, create it with `muninn_remember`.
- Set cooldown reason via bridge:
  ```bash
  bun run packages/luca-framework/src/state/bridge.ts set-field \
    --field=cooldown_reason \
    --value='"Divergent mode: {N} consecutive milestones completed"' \
    2>/dev/null || true
  ```
- Emit COOLDOWN_COMPLETE via bridge to transition complete -> cooldown:
  ```bash
  bun run packages/luca-framework/src/state/bridge.ts transition \
    --event=COOLDOWN_COMPLETE 2>/dev/null || true
  ```
- Display: "Entering divergent mode. When ready to return, start a new session."

**If developer opts OUT (N):**

- Update divergent opt-in rate (opted_in: false):
  ```
  mcp__muninn__muninn_evolve(
    vault: "default",
    id: "metric:divergent-optin-rate",
    content: "sample_count: {N+1}, optins: {M}, rate: {updated_rate}"
  )
  ```
  If the metric does not exist yet, create it with `muninn_remember`.
- Emit SKIP_COOLDOWN via bridge to transition complete -> idle:
  ```bash
  bun run packages/luca-framework/src/state/bridge.ts transition \
    --event=SKIP_COOLDOWN 2>/dev/null || true
  ```
- Proceed to Step 9.

### No Nudge (streak < 8)

If `consecutive_milestones < 8`: do not show the nudge. Silently emit SKIP_COOLDOWN:

```bash
bun run packages/luca-framework/src/state/bridge.ts transition \
  --event=SKIP_COOLDOWN 2>/dev/null || true
````

Proceed to Step 9.

````

**Files to create/edit:**

- `src/skills/general/milestone-complete.skill.ts` (EDIT)

**Verification:**

- Step 8.5 exists in the skill content between Step 8 and Step 9
- Convergent streak counter is recalled, created, or incremented from MuninnDB
- Graduation check queries `metric:divergent-optin-rate` (skip if <10% over 20+)
- Nudge displays when streak >= 8 AND not graduated out
- Opt-in resets streak to 0, emits COOLDOWN_COMPLETE, sets cooldown_reason
- Opt-out updates opt-in rate, emits SKIP_COOLDOWN
- No nudge (streak < 8) silently emits SKIP_COOLDOWN
- No changes to machine.ts or types.ts (existing wiring is sufficient)
- `bunx --bun tsc --noEmit` passes

### 3. Update Success Criteria and Next Steps

**Type:** auto
**TDD:** false
**Depends on:** 1, 2

Update the Success Criteria and Next Steps sections of milestone-complete.skill.ts to reflect the new Steps 7.5 and 8.5.

**Changes:**

1. **Add to Success Criteria** (at the end of the existing checkbox list):

   ```markdown
   - [ ] Process retrospective dashboard shown with metric trends
   - [ ] Developer question asked (or skipped per graduation criteria)
   - [ ] Retro response rate tracked in MuninnDB
   - [ ] Divergent mode advisory shown (if streak >= 8)
   - [ ] Convergent streak counter updated in MuninnDB
   - [ ] Divergent opt-in rate tracked in MuninnDB
````

2. **Add to the Next Steps table** a divergent mode option:

   ```markdown
   | Opted into divergent mode | Take a break | No command — start new session when ready |
   ```

**Files to create/edit:**

- `src/skills/general/milestone-complete.skill.ts` (EDIT)

**Verification:**

- Success criteria include process retro and divergent mode checkboxes
- Next steps include divergent mode option
- `bunx --bun tsc --noEmit` passes

## Verification

1. `bunx --bun tsc --noEmit` passes with zero errors
2. milestone-complete.skill.ts has Step 7.5 (process retro) between Steps 7 and 8
3. milestone-complete.skill.ts has Step 8.5 (divergent mode) between Steps 8 and 9
4. Process retro dashboard recalls 4 metric categories from MuninnDB
5. Process retro developer question is gated by `metric:retro-response-rate` graduation criteria
6. Divergent mode nudge is gated by streak >= 8 AND `metric:divergent-optin-rate` graduation criteria
7. State machine events used correctly: COOLDOWN_COMPLETE for opt-in, SKIP_COOLDOWN for opt-out
8. No changes to machine.ts or types.ts (confirmed by git diff)
9. All MuninnDB engrams use consistent concept naming (metric:_, process:_)

## Success Criteria

- Process retrospective dashboard renders at milestone boundary with 4 metric trends (appetite accuracy, rework ratio, signal rate, agent scores)
- Developer question is asked unless graduation criteria met (<30% response over 10+ milestones)
- Responses and skips both update `metric:retro-response-rate` for graduation tracking
- Divergent mode nudge shows after 8+ consecutive milestones without divergent break
- Opt-in resets streak counter to 0 and enters cooldown state
- Opt-out tracks the decision and proceeds to idle
- Graduation criteria prevent nudge if opt-in rate < 10% over 20+ milestones
- No state machine changes required (existing complete -> cooldown -> idle wiring confirmed)

## Output Specification

- `src/skills/general/milestone-complete.skill.ts` -- Updated with Step 7.5 (process retro), Step 8.5 (divergent mode), expanded success criteria, and updated next steps
