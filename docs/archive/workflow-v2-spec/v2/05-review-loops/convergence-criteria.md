# Convergence Criteria

> The formal model that determines when review loops have achieved sufficient quality to proceed, when they are stuck, and when to escalate. **This is the canonical specification** for the convergence model used by both review loops (Decision 3, Decision 19). The model is the **gap-severity model** -- findings are classified by severity (CRITICAL/IMPORTANT/MINOR for research; BLOCKING/ADVISORY for plan), and convergence is determined by the absence of blocking-severity findings. There is no scored-dimension model (no 1-10 scores, no 7/10 thresholds).

---

## Definition of Convergence

A review loop has **converged** when no reviewer has findings at or above the loop's blocking severity threshold. Formally:

```
CONVERGED(research_review, iteration) iff:
  for-all reviewer r in R:
    r.critical_count == 0 AND
    (r.important_count == 0 OR NOT continueForImportant OR iteration >= max_iterations)

CONVERGED(plan_review, iteration) iff:
  for-all reviewer r in R:
    r.blocking_count == 0
  (advisory findings never block convergence at any iteration)
```

Where:

- `R` is the set of all reviewers in the loop (always 3, per Decision 13)
- `critical_count` / `blocking_count` is the number of findings at the blocking severity level
- `important_count` is the number of findings at the secondary severity level (research review only)
- `max_iterations` is the complexity-gated iteration budget (see [iteration-budgets.md](iteration-budgets.md))
- `continueForImportant` is a config flag (default: `true`) controlling whether IMPORTANT findings trigger additional research review iterations (config key: `research.reviewLoop.continueForImportant`, Decision 9)

### Design Tradeoff: Weakening Convergence at Budget Exhaustion

At the maximum iteration, the research review loop converges even with IMPORTANT findings remaining. This means the convergence condition is weaker at higher iterations -- the bar lowers as you approach the budget. This is intentional: it prevents infinite loops while accepting that some IMPORTANT findings may not be resolved. These are documented as caveats for the planner.

### Severity Mapping Across Loops

| Severity Level | Research Review | Plan Review | Effect on Convergence                                           |
| -------------- | --------------- | ----------- | --------------------------------------------------------------- |
| Blocking       | CRITICAL        | BLOCKING    | Must reach 0 for convergence                                    |
| Secondary      | IMPORTANT       | ADVISORY    | Research: must reach 0 OR budget exhausted. Plan: never blocks. |
| Informational  | MINOR           | (not used)  | No effect on convergence                                        |

### Asymmetry Rationale (IMP-RL-001)

The two loops treat secondary findings differently: IMPORTANT research gaps may trigger additional iterations (configurable), while ADVISORY plan findings never block convergence. This asymmetry exists because **research gaps propagate downstream** -- a gap in research becomes an assumption in the plan, which becomes a hallucination in execution, compounding at each stage. Plan advisory findings, by contrast, can be addressed during execution without compounding risk.

---

## Metrics Tracked Per Iteration

The orchestrator tracks the following metrics across all iterations of a review loop. These metrics are recorded in REVIEW-LOG.md and serve both as convergence signals and as quality indicators for process improvement.

### 1. Total Findings Count

```
F(n) = total findings at iteration n (all severities, all reviewers)
```

**Expected behavior**: `F(n) < F(n-1)` (monotonically decreasing). Each iteration addresses findings from the prior iteration, so the total should decrease.

**Anomaly**: `F(n) >= F(n-1)` signals that fixes introduced new problems or that scope is expanding. See [Diminishing Returns Detection](#diminishing-returns-detection).

### 2. Blocking Findings Count

```
B(n) = blocking findings at iteration n (CRITICAL or BLOCKING, all reviewers)
```

**Convergence condition**: `B(n) == 0`. This is the primary convergence signal. Everything else is secondary.

**Tracking across iterations**:

```
Iteration 1:  B(1) = 3   [initial review, highest count expected]
Iteration 2:  B(2) = 1   [most issues addressed, one remains]
Iteration 3:  B(3) = 0   [converged]
```

### 3. New vs. Repeated Findings

A finding is **repeated** if it matches a finding from the previous iteration (same file, same gap, same or similar description). A finding is **new** if it was not flagged in any prior iteration.

```
NEW(n)      = findings at iteration n not present at iteration n-1
REPEATED(n) = findings at iteration n also present at iteration n-1
```

**Expected behavior**: `REPEATED(n) == 0`. If a finding was flagged at iteration n-1 and appears again at iteration n, the fix attempt did not address it.

**Anomaly**: `REPEATED(n) > 0` signals that the author (researcher or planner) did not properly address the finding. The orchestrator should:

1. Flag the repeated finding with higher priority
2. Include the prior iteration's context in the revision request
3. If repeated across 2+ iterations, escalate to the user

### 4. Reviewer Agreement Score

```
AGREEMENT(n) = fraction of findings where 2+ reviewers flagged the same issue
```

High agreement strengthens confidence in the finding. Low agreement (each reviewer flags unique issues) is normal for iteration 1 but concerning at iteration 3+.

---

## Convergence State Machine

Each review loop follows a state machine with four possible states:

```
                    +---> CONVERGED (all blocking = 0)
                    |
  REVIEWING --------+---> IMPROVING (blocking decreased, not yet 0)
                    |
                    +---> STALLED (blocking unchanged, total flat or decreased)
                    |
                    +---> DIVERGING (blocking increased OR total increased)
```

### State Transitions

The state is determined by comparing blocking count `B(n)` and total finding count `F(n)` against the prior iteration:

```
                     Start
                       |
                       v
                  REVIEWING
                  (iteration 1)
                       |
              Collect findings
                       |
           +-----------+-----------+
           |           |           |
           v           v           v
      B(n) == 0    B(n) < B(n-1)  B(n) > B(n-1)
           |           |               |
           v           v               v
       CONVERGED   IMPROVING       DIVERGING
           |           |               |
           v        iteration       iteration
        DONE        < max?          < max?
                    /    \          /      \
                  YES     NO     YES       NO
                   |       |      |         |
                   v       v      v         v
               REVIEWING  APPROVED  REVIEWING  ESCALATE
               (next iter) (note     (next iter,  (to user)
                           caveats)   log warning)

                   B(n) == B(n-1)
                        |
              +---------+---------+
              |                   |
              v                   v
        F(n) > F(n-1)       F(n) <= F(n-1)
              |                   |
              v                   v
          DIVERGING            STALLED
              |                   |
           (same as            iteration
            above)              < max?
                               /      \
                             YES       NO
                              |         |
                              v         v
                          REVIEWING  ESCALATE
                          (next iter,
                           enhanced request)
```

### State Descriptions

| State         | Condition                                                 | Action                                                                  |
| ------------- | --------------------------------------------------------- | ----------------------------------------------------------------------- |
| **REVIEWING** | Iteration in progress                                     | Wait for all reviewers to complete                                      |
| **CONVERGED** | `B(n) == 0`                                               | Stop loop, proceed to next pipeline step                                |
| **IMPROVING** | `B(n) < B(n-1)`                                           | Continue loop (system is converging)                                    |
| **STALLED**   | `B(n) == B(n-1)` and `F(n) <= F(n-1)`                     | Continue loop with enhanced revision request; log warning               |
| **DIVERGING** | `B(n) > B(n-1)` OR (`B(n) == B(n-1)` and `F(n) > F(n-1)`) | Flag for investigation; continue if iteration < max, escalate otherwise |

**Clarification (IMP-RL-002)**: DIVERGING is triggered when blocking count increases OR when blocking count stays flat but total findings increase (the fixes are introducing new non-blocking problems while not resolving existing blockers). STALLED is triggered only when blocking count stays flat and total findings stay flat or decrease (the system is not making progress but also not getting worse). This prevents the ambiguous case where `B(n) > B(n-1)` but `F(n) == F(n-1)` from being classified as merely STALLED when it is objectively worse.

---

## Diminishing Returns Detection

Review loops should converge within their iteration budget. When they do not, the system needs to detect the failure mode and take appropriate action.

### Increasing Finding Count

```
Condition: F(n) > F(n-1)   (more findings this iteration than last)
```

This signals one of three problems:

1. **Fixes introduced new problems**: The targeted researcher or planner addressed the flagged gaps but broke something else in the process
2. **Scope expansion**: Reviewers are expanding their evaluation scope with each iteration, finding more to critique
3. **Meta-level findings**: Reviewers are not finding content gaps but structural problems ("this research is too broad", "this plan is too vague")

**Response**:

- If `B(n) > B(n-1)` (more blocking findings), this is a DIVERGING state. The orchestrator logs a warning and, if iteration < max, continues with an explicit note to the author: "The prior revision introduced new blocking issues. Address only the new blockers, do not make unrelated changes."
- If `B(n) <= B(n-1)` but `F(n) > F(n-1)` due to secondary findings, this is normal for iteration 2 (reviewers notice more details after major issues are fixed). Continue normally.

### Repeated Findings Across Iterations

```
Condition: REPEATED(n) > 0 AND REPEATED(n) were CRITICAL/BLOCKING
```

This signals that the author did not properly address the finding. The orchestrator:

1. Includes the finding's full history in the next revision request
2. Explicitly states: "This finding was raised at iteration N-1 and was not addressed. The prior response was: [quote prior response]."
3. If repeated across 3 iterations, escalates to the user regardless of remaining iteration budget

### Meta-Level Findings

```
Condition: Findings reference the research/plan structure rather than content
```

Examples:

- "This research file is too broad -- it covers three distinct topics"
- "The plan's wave structure does not match the codebase's existing module boundaries"
- "Research confidence levels are inconsistently applied"

These findings indicate a **scope or methodology problem** that targeted re-expansion cannot fix. The orchestrator should:

1. Classify the meta-finding as CRITICAL (it blocks downstream quality)
2. Present it to the user with context
3. Let the user decide whether to restructure the research/plan or accept the current structure

---

## Emergency Exit

When the maximum iteration count is reached without convergence, the orchestrator executes the emergency exit protocol:

### Step 1: Compile Remaining Gap Summary

```markdown
## Review Loop: Emergency Exit

**Loop**: [Research Review / Plan Review]
**Iterations completed**: [N] of [N] (max reached)
**Final blocking count**: [count]

### Remaining Blocking Findings

- [Finding ID]: [Description] -- [File] -- [History across iterations]
  - Iteration 1: First flagged
  - Iteration 2: Author responded with [summary], reviewer found insufficient
  - Iteration 3: Author responded with [summary], reviewer still blocking

### Improvement Trajectory

- Iteration 1: [B(1)] blocking, [F(1)] total
- Iteration 2: [B(2)] blocking, [F(2)] total
- Iteration 3: [B(3)] blocking, [F(3)] total
- Trend: [IMPROVING / STALLED / DIVERGING]

### Recommended Action

[Orchestrator's recommendation based on trajectory and remaining gaps]
```

### Step 2: Present to User

The user receives the summary and chooses one of:

| Option                       | When to Use                                     | Effect                                                |
| ---------------------------- | ----------------------------------------------- | ----------------------------------------------------- |
| **Manual resolution**        | User has domain knowledge to resolve the gap    | User edits research/plan files directly, loop re-runs |
| **Accept risk and continue** | Remaining gaps are low-risk or time-constrained | Gaps are documented as caveats, pipeline continues    |
| **Abort phase**              | Remaining gaps are fundamental                  | Phase is abandoned, user reconsiders scope            |
| **Add iteration budget**     | System was IMPROVING but ran out of iterations  | Max iterations increased, loop continues              |

### Step 3: Record Decision

The user's decision is recorded in REVIEW-LOG.md and (if the pipeline continues) in the plan as an explicit caveat:

```markdown
### Emergency Exit Decision

**User decision**: Accept risk and continue
**Rationale**: "The remaining gap (jitter strategy edge case) is low-risk for
the initial implementation. We can address it in a follow-up phase."
**Remaining gaps carried forward**:

- G-COMP-003: [severity: CRITICAL] Jitter behavior during rapid reconnect cycles
```

---

## Quality Metrics

The convergence data from review loops provides quality signals that can be tracked across phases and sessions:

### Convergence Speed

```
CONVERGENCE_SPEED = iterations_used / max_iterations
```

- **< 0.5**: Fast convergence (research/plan was high quality on first attempt)
- **0.5 - 0.8**: Normal convergence (typical for MODERATE+ complexity)
- **> 0.8**: Slow convergence (research or planning methodology needs improvement)
- **1.0**: Did not converge (emergency exit triggered)

### First-Pass Quality

```
FIRST_PASS_QUALITY = 1 - (B(1) / total_reviewable_items)
```

Where `total_reviewable_items` is the number of research files (for research review) or plan tasks (for plan review). High first-pass quality indicates effective research/planning agents.

**Edge case**: If `total_reviewable_items == 0` (no research files or no plan tasks), FIRST_PASS_QUALITY is undefined. In this case, the metric is not computed and the review loop should not have been triggered (see trigger conditions in [research-review-protocol.md](research-review-protocol.md) and [plan-review-protocol.md](plan-review-protocol.md)).

### Finding Resolution Rate

```
RESOLUTION_RATE = (B(1) - B(final)) / B(1)
```

A resolution rate of 1.0 means all blocking findings were addressed. A rate < 1.0 means some findings persisted to emergency exit. Track this across phases to identify systemic issues.

### Cross-Phase Tracking

These metrics are stored in MuninnDB as `metric:signal-rate-*` engrams in the repo vault:

```
metric:signal-rate-research-review-convergence
metric:signal-rate-plan-review-convergence
metric:signal-rate-research-first-pass-quality
metric:signal-rate-plan-first-pass-quality
```

Over time, improving metrics indicate that the research and planning agents are learning from past review feedback (via MuninnDB pattern engrams).

---

## Formal Convergence Conditions (Summary)

### Research Review Loop

```
CONVERGED iff:
  for-all reviewer r in {lu-completeness-reviewer, lu-accuracy-reviewer, lu-actionability-reviewer}:
    r.critical_count == 0 AND
    (r.important_count == 0 OR NOT continueForImportant OR iteration >= max_iterations)

  AND NOT:
    any accuracy_concern on HIGH-confidence findings remains unverified
    (an accuracy concern on a HIGH-confidence finding is effectively CRITICAL --
     it could propagate a factual error into the plan)
```

- `continueForImportant`: config flag, default `true` (config key: `research.reviewLoop.continueForImportant`)
- `max_iterations`: per-complexity budget from [iteration-budgets.md](iteration-budgets.md) (config key: `complexity.matrix.{level}.researchReviewMaxIterations`)
- The accuracy concern special case means that even if `critical_count == 0`, an unverified accuracy concern on a HIGH-confidence finding prevents convergence

### Plan Review Loop

```
CONVERGED iff:
  for-all reviewer r in {code-architect, dx-advocate, security-auditor}:
    r.blocking_count == 0

  (advisory findings do not block convergence at any iteration)
```

- `max_iterations`: per-complexity budget from [iteration-budgets.md](iteration-budgets.md) (config key: `complexity.matrix.{level}.planVerificationIterations`)

### Emergency Exit

```
ESCALATE iff:
  iteration == max_iterations AND
  exists reviewer r in R:
    r.blocking_count > 0
```

---

## Related Documentation

- [README.md](README.md) -- Overview of both review loops
- [research-review-protocol.md](research-review-protocol.md) -- Research review loop protocol
- [plan-review-protocol.md](plan-review-protocol.md) -- Plan review loop protocol
- [iteration-budgets.md](iteration-budgets.md) -- Token budgets and iteration caps
- [External Research: GSD 2](../07-external-research/gsd-2-framework.md) -- Sliding-window stuck detection (related pattern)
