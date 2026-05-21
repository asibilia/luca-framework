---
phase: 4
plan: 2
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 4 Plan 2: Outcome Tracking

## Objective

Add outcome tracking to the Luca workflow through two mechanisms: (1) a contextual trigger in lu-cognition that prompts the developer about recently shipped features during cognitive pre-flight, and (2) a standalone /outcome skill for on-demand outcome recording. This enables the framework to track whether shipped features achieve their stated goals.

## Context

@src/agents/general/lu-cognition.agent.ts (lu-cognition agent — add outcome_check step)
@src/skills/general/progress.skill.ts (simple skill pattern reference)
@src/skills/\_\_helpers/build-skill-registry.ts (skill registry pattern)
@.planning/phases/04-process-intelligence/04-CONTEXT.md (Gray Areas 3 and 4 decisions)
@.planning/todos/pending/102-v4-outcome-tracking.md (todo spec)

## Tasks

### 1. Add outcome_check Step to lu-cognition

**Type:** auto
**TDD:** false
**Depends on:** none

Add a new `<step name="outcome_check">` to lu-cognition's execution flow in `src/agents/general/lu-cognition.agent.ts`. Per 04-CONTEXT.md Decision 3, the step is placed after `cleanup_stale_sessions` and before `initialize_working`.

**Step logic (from 04-CONTEXT.md Gray Area 3):**

The step must be inserted into the existing sections content string, within the execution_flow XML tags. Add the step element between the `cleanup_stale_sessions` closing tag and the `initialize_working` opening tag.

**Step content:**

```
<step name="outcome_check" priority="full-mode-only">
```

1. **Complexity gate:** This step only runs in Full mode (MODERATE+). If lite mode was triggered in `check_complexity_mode`, SKIP this step entirely.

2. **Check graduation gate:** Recall `metric:outcome-completion` from MuninnDB:

   ```
   mcp__muninn__muninn_recall(vault: "default", context: "metric:outcome-completion")
   ```

   Parse the result. If the metric exists with 10+ recorded interactions AND completion rate below 20%, SKIP this step (graduated out). Log: "Outcome tracking graduated out — completion rate below threshold."

3. **Recall recent features:** Call MuninnDB recall for recently shipped features:

   ```
   mcp__muninn__muninn_recall(vault: "default", context: "outcome:* recent features shipped in current domain")
   ```

4. **Cross-reference outcomes:** For each recently shipped feature found:
   - Check if an `outcome:feature-goal` engram already exists for it
   - If a feature was shipped (has a learning/pattern engram from a recent phase) but has NO outcome recorded, it is a candidate for prompting

5. **Prompt the developer** (if unrecorded outcomes exist):
   - Display: "You shipped [Feature X] in Phase [N]. Did it achieve its goal?"
   - Present options: (1) Yes -- it works as intended, (2) No -- it missed the mark, (3) Too early to tell

6. **Store response:**
   - If "yes" or "no": Store as `outcome:feature-goal` engram via `mcp__muninn__muninn_remember`:
     ```
     concept: "outcome:feature-goal"
     content: "Feature: {name}\nPhase: {phase}\nMilestone: {milestone}\nAchieved: {yes|no}\nRecorded: {timestamp}"
     ```
   - If "too early": Store as `outcome:deferred` engram (will be re-prompted in a future session)
   - Update `metric:outcome-completion` via `mcp__muninn__muninn_evolve`:
     ```
     id: "metric:outcome-completion"
     content: "total_prompts: {N+1}, responses: {M+1|M}, completion_rate: {rate}"
     ```

7. **Continue** to `initialize_working`.

**Files to create/edit:**

- `src/agents/general/lu-cognition.agent.ts` (EDIT)

**Verification:**

- The `outcome_check` step exists in lu-cognition's execution flow
- Step is positioned between `cleanup_stale_sessions` and `initialize_working`
- Step includes complexity gate (Full mode only)
- Step includes graduation gate (metric:outcome-completion check)
- Step includes MuninnDB recall for outcome:\* engrams
- Step includes developer prompt with 3 options (yes/no/too early)
- Step includes storage of outcome and metric update
- `bunx --bun tsc --noEmit` passes

### 2. Create /outcome Skill

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/skills/general/outcome.skill.ts` — a standalone interactive skill for on-demand outcome recording. Per 04-CONTEXT.md Decision 4, this is a simple skill with no sub-agents, no complexity gating, and `disable-model-invocation: true`.

**Skill config:**

- `name`: "outcome"
- `description`: "Record whether a shipped feature achieved its goal."
- `disable-model-invocation`: true

**Skill main section — interactive prompt flow:**

```markdown
# Luca Outcome

Record whether a shipped feature or milestone deliverable achieved its stated goal. This creates a feedback loop that informs future planning.

## Process

### Step 1: Identify Feature

Ask the developer: "Which feature or milestone outcome do you want to record?"

If the developer provides a feature name, recall recent `outcome:*` engrams from MuninnDB to check for existing records:
```

mcp**muninn**muninn_recall(vault: "default", context: "outcome:feature-goal {feature_name}")

```

If a record already exists, show it and ask: "An outcome was already recorded for this feature. Do you want to update it?"

### Step 2: Capture Goal

Ask: "What was the stated goal of this feature?"

If context is available from MuninnDB (e.g., from the plan's objective or a learning engram), pre-fill the goal and ask the developer to confirm or edit.

### Step 3: Assess Achievement

Ask: "Did it achieve that goal?"
- **Yes** — Feature works as intended and meets its goal
- **No** — Feature missed the mark or did not deliver expected value
- **Partial** — Feature partially achieved its goal

### Step 4: Collect Evidence

Ask: "Any evidence or notes? (optional)"

Developer can provide observations, metrics, user feedback, or skip.

### Step 5: Store Outcome

Store the outcome as a MuninnDB engram:

```

mcp**muninn**muninn_remember(
vault: "default",
concept: "outcome:feature-goal",
content: "Feature: {feature_name}\nPhase: {phase_number}\nMilestone: {milestone}\nGoal: {stated_goal}\nAchieved: {yes|no|partial}\nEvidence: {evidence}\nRecorded: {timestamp}"
)

```

### Step 6: Update Completion Metric

Update the outcome completion tracking metric:

```

mcp**muninn**muninn_evolve(
vault: "default",
id: "metric:outcome-completion",
content: "outcome recorded: {feature_name}, total: {N+1}, completion_rate: {updated_rate}"
)

```

If the metric engram does not exist yet, create it:

```

mcp**muninn**muninn_remember(
vault: "default",
concept: "metric:outcome-completion",
content: "total_prompts: 1, responses: 1, completion_rate: 100%"
)

```

### Step 7: Confirm

Display confirmation:

```

---

Outcome Recorded

Feature: {feature_name}
Goal: {stated_goal}
Achieved: {yes|no|partial}
Stored as: outcome:feature-goal engram in MuninnDB

---

```

```

**Files to create/edit:**

- `src/skills/general/outcome.skill.ts` (CREATE)

**Verification:**

- File exists at `src/skills/general/outcome.skill.ts`
- Exports `outcomeSkill` via `createSkill()`
- Skill has `disable-model-invocation: true`
- Skill has 1 section (main) with the interactive prompt flow
- Flow covers: identify feature, capture goal, assess achievement, collect evidence, store, update metric, confirm
- `bunx --bun tsc --noEmit` passes

### 3. Register /outcome Skill in Skill Registry

**Type:** auto
**TDD:** false
**Depends on:** 2

Add the outcome skill to the skill registry so the build pipeline can generate its compiled .md file.

**Changes:**

1. Add import: `import { outcomeSkill } from "../general/outcome.skill";`
2. Add registry entry: `outcome: () => outcomeSkill,`

**Files to create/edit:**

- `src/skills/__helpers/build-skill-registry.ts` (EDIT)

**Verification:**

- Import added in the general skills import block
- Registry entry added in alphabetical position
- `bunx --bun tsc --noEmit` passes

## Verification

1. `bunx --bun tsc --noEmit` passes with zero errors
2. lu-cognition has the outcome_check step in the correct position (after cleanup_stale_sessions, before initialize_working)
3. outcome_check step is gated to Full mode only (MODERATE+)
4. outcome_check step includes graduation criteria check (metric:outcome-completion)
5. /outcome skill exists with correct interactive flow
6. /outcome skill is registered in the skill registry
7. Both outcome mechanisms store engrams in the same format (outcome:feature-goal)

## Success Criteria

- lu-cognition contextual trigger prompts about unrecorded outcomes during Full mode pre-flight
- Graduation criteria are tracked: if <20% completion over 10+ features, the trigger self-disables
- /outcome skill provides a standalone interactive recording experience
- Both mechanisms store outcomes in the same MuninnDB engram format for consistent querying
- Completion rate metric (metric:outcome-completion) is updated by both mechanisms
- No impact on lite mode (TRIVIAL/SIMPLE) pre-flight performance

## Output Specification

- `src/agents/general/lu-cognition.agent.ts` — Updated with outcome_check step
- `src/skills/general/outcome.skill.ts` — New standalone skill
- `src/skills/__helpers/build-skill-registry.ts` — Updated with outcome skill import and registry entry
