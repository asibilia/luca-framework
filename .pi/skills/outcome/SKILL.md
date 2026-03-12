---
name: outcome
description: Record whether a shipped feature achieved its intended goal. Tracks outcomes in MuninnDB for long-term process learning.
---

# outcome

Record whether a shipped feature achieved its intended goal. Tracks outcomes in MuninnDB for long-term process learning.

## main

<main>
# Luca Outcome Tracking

Record whether a shipped feature achieved its intended goal. Builds a feedback loop between what we build and whether it worked.

**Vault Resolution:** Read `.planning/config.json` and extract `muninn.vault` as REPO_VAULT. Set DEFAULT_VAULT = "default". Use REPO_VAULT for project-scoped operations (outcome:*, metric:*, session:*) and DEFAULT_VAULT for cross-cutting operations (pattern, pitfall, preference, brain:user).

## Process

### Step 1: Identify Feature

Ask the developer which feature they want to record an outcome for:

```
Which shipped feature would you like to record an outcome for?

(Describe the feature, e.g., "semantic search in MuninnDB" or "complexity-gated model routing")
```

After the developer responds, check MuninnDB for duplicate outcomes:

```
mcp__muninn__muninn_recall(vault: REPO_VAULT, context: "outcome:<feature-name> goal achievement")
```

**If an outcome already exists for this feature:**

```
An outcome was already recorded for this feature:

  [existing outcome summary]
  Recorded: [date]

Would you like to:
1. Update the existing outcome (e.g., new information)
2. Record a separate follow-up outcome
3. Cancel

(Reply 1, 2, or 3)
```

If update (1): proceed to Step 3 and use `muninn_evolve` instead of `muninn_remember`.
If follow-up (2): proceed normally, marking as a follow-up.
If cancel (3): exit.

### Step 2: Capture Goal

Check MuninnDB for any previously stored goal for this feature:

```
mcp__muninn__muninn_recall(vault: REPO_VAULT, context: "<feature-name> goal purpose objective intent")
```

**If a goal is found in MuninnDB:**

```
I found a previously recorded goal for this feature:

  "[pre-filled goal from MuninnDB]"

Is this the goal you want to assess? (yes/no, or type a different goal)
```

**If no goal found:**

```
What was the intended goal of this feature?

(e.g., "Reduce context rot by recalling relevant patterns from past sessions")
```

### Step 3: Assess Achievement

Present the assessment prompt:

```
Feature: [feature name]
Goal: [stated goal]

Did this feature achieve its goal?

1. Yes - it achieved what we intended
2. No - it did not meet expectations
3. Partial - some aspects worked, others did not

(Reply 1, 2, or 3)
```

### Step 4: Collect Evidence

Ask for optional supporting notes:

```
Any additional notes or evidence? (optional, press Enter to skip)

Examples:
- "Users reported faster onboarding"
- "Memory recall accuracy improved from 60% to 85%"
- "Feature was rarely used in practice"
- "Goal was partially met but revealed a new need"
```

### Step 5: Store Outcome in MuninnDB

Build the outcome engram content from the collected data:

```
FEATURE: [feature name]
GOAL: [stated goal]
ACHIEVEMENT: [Yes | No | Partial]
EVIDENCE: [notes or "None provided"]
RECORDED: [current timestamp]
CONTEXT: [milestone/phase if known]
```

Store in MuninnDB:

```
mcp__muninn__muninn_remember(
  vault: REPO_VAULT,
  concept: "outcome:feature-goal",
  content: "<formatted outcome above>"
)
```

If this is an update to an existing outcome (from Step 1), use evolve instead:

```
mcp__muninn__muninn_evolve(
  vault: REPO_VAULT,
  id: "<existing-outcome-id>",
  update: "Updated assessment: [new assessment]. [new evidence]. Updated [timestamp]."
)
```

### Step 6: Update Completion Metric

Update the outcome tracking metric:

```
mcp__muninn__muninn_recall(vault: REPO_VAULT, context: "metric:outcome-completion")
```

**If metric exists:** Evolve it with incremented count:

```
mcp__muninn__muninn_evolve(
  vault: REPO_VAULT,
  id: "<metric-id>",
  update: "Outcome recorded. Interactions: <N+1>. Completion rate: <recalculated>%."
)
```

**If metric does not exist:** Create it:

```
mcp__muninn__muninn_remember(
  vault: REPO_VAULT,
  concept: "metric:outcome-completion",
  content: "Outcome completion tracking metric. Interactions: 1. Outcomes recorded: 1. Completion rate: 100%."
)
```

### Step 7: Display Confirmation

Show a confirmation banner:

```
--- Outcome Recorded ---

Feature:     [feature name]
Goal:        [stated goal]
Achievement: [Yes / No / Partial]
Evidence:    [notes or "None"]
Stored as:   outcome:feature-goal in MuninnDB

Metric updated: [N] outcomes tracked.

---

This outcome will inform future planning and priority decisions.
To view all recorded outcomes: recall "outcome:*" from MuninnDB.
```

## Success Criteria

- [ ] Feature identified (with duplicate check)
- [ ] Goal captured (pre-filled from MuninnDB if available)
- [ ] Achievement assessed (yes/no/partial)
- [ ] Evidence collected (optional)
- [ ] Outcome stored as outcome:feature-goal engram in MuninnDB
- [ ] metric:outcome-completion updated
- [ ] Confirmation banner displayed

## Next Steps

This skill records a single outcome. Outcomes accumulate in MuninnDB and inform:

- **lu-cognition** outcome_check step (proactive prompting)
- **Future planning** (patterns of success/failure)
- **Process improvement** (which types of features achieve their goals)

**Common follow-ups:**
- `/progress` -- Check current project state
- `/help` -- See all available commands
</main>