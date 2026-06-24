# Phase 2 Context: Adaptive Complexity Self-Tuning

## Phase Goal

Add mid-execution complexity reassessment so that under-resourced tasks get promoted to higher complexity levels automatically, and calibration data feeds back into future classification accuracy.

## Decisions

### 1. Reassessment Trigger Points

**Decision:** Reactive checks at wave boundaries.

- Reassess after each wave completes (natural checkpoint)
- Only reassess when signals exceed thresholds — don't check when everything is going smoothly
- If promoted, remaining waves immediately get upgraded resources (higher model tiers, more iteration budget)
- Maximum one promotion per phase to prevent thrashing

### 2. Promotion vs Demotion Behavior

**Decision:** Promotion only (upward). Never demote mid-execution.

- Demoting could under-resource a phase that already showed signs of difficulty
- If a COMPLEX task turns out simpler, you finish faster with better resources — no harm
- Already-spawned agents are unaffected — promotion applies to agents spawned in subsequent waves only
- No mid-agent model switching

### 3. Signal Weighting

**Decision:** Threshold-based with any-of (OR) logic. No weighted composite scores.

Reassessment triggers when ANY single signal exceeds its threshold:

| Signal                          | Threshold                                                                   | Source                      |
| ------------------------------- | --------------------------------------------------------------------------- | --------------------------- |
| Files touched                   | Exceeds classification's upper bound (e.g., MODERATE allows 3-5, touched 7) | git diff --stat             |
| Harness fix iterations consumed | > 50% of budget                                                             | iteration/budget.ts         |
| Stall detected                  | Convergence failure flagged                                                 | iteration/stall-detector.ts |
| Error count                     | > 2x expected range for current level                                       | harness results             |

- Any single strong signal is sufficient to promote
- Simpler to reason about and debug than weighted composites
- Each signal maps to a concrete, measurable metric already tracked

### 4. Calibration Persistence

**Decision:** MuninnDB engrams with milestone-level aggregation.

- Store prediction-vs-actual as `decision:complexity-calibration-{phase}` engrams in MuninnDB
- The Phase 1 learning loop automatically measures if calibrations are useful (feedback attribution)
- Recall past calibrations during cognitive pre-flight to inform lu-router
- At `/milestone-complete`, lu-learner consolidates calibration data into summary patterns (e.g., "observer phases tend to be one level higher than predicted")
- Over time, lu-router's initial classification improves from recalled calibration patterns

## Key Files

| File                                             | Changes                                   |
| ------------------------------------------------ | ----------------------------------------- |
| `src/complexity/__helpers/defaults.ts`           | Signal thresholds for promotion triggers  |
| `src/complexity/__schemas/complexity.schemas.ts` | ComplexityReassessmentSchema              |
| `src/complexity/__helpers/self-tuning.ts`        | Reassessment logic, promotion function    |
| `src/complexity/__helpers/model-routing.ts`      | Dynamic re-resolution after promotion     |
| `src/skills/general/phase-execute.skill.ts`      | Wave boundary reassessment hook           |
| `src/iteration/__helpers/checkpoint.ts`          | Signal collection at checkpoints          |
| `src/agents/general/lu-cognition.agent.ts`       | Recall calibration data during pre-flight |

## Scope Guardrail

This phase adds adaptive reassessment and calibration feedback. It does NOT:

- Change the 5-level classification system itself
- Add new complexity levels
- Modify lu-router's initial classification algorithm (it learns indirectly via recalled calibrations)
- Touch the observer UI (calibration visibility is a future phase)

## Deferred Ideas

- Observer view for complexity calibration history
- Cross-project calibration sharing
- Automatic threshold tuning based on calibration history
