# Plan 15-01 Summary: Cognition Audit Matrix & Tier System

**Completed:** 2026-02-11
**Delivers:** COGN-01, COGN-02, COGN-03

## What Was Done

### Task 1: Current-State Audit Matrix (COGN-01)

- Audited all 25 agent `.md` files for 5 cognition features (BRAIN, MEMORY, WORKING, Pre-flight, Learning)
- Used 15-RESEARCH.md as primary data source, then independently verified all 25 agents via grep
- **Found 3 research inaccuracies**: lu-planner (classified T0, actually T2 with full cognitive pre-flight), lu-executor (classified T0, actually T2 with WORKING.md + lu-learner), lu-verifier (classified T0, actually T1 with lu-learner integration)
- Corrected current-state distribution: T3=2, T2=3, T1=2, T0=18

### Task 2: Ideal-State Cognition Profiles (COGN-02)

- Defined tier assignment criteria for all 4 tiers (T0-T3)
- Assigned recommended tier, promotable-to ceiling, and memory tags for all 25 agents
- Recommended 3 promotions from T0 to T1: lu-phase-researcher, lu-plan-checker, lu-pr-reviewer
- Defined 14 domain tags for selective MEMORY.md recall
- Recommended distribution: T3=2, T2=3, T1=5, T0=15

### Task 3: Gap Analysis (COGN-02)

- **3 critical gaps**: lu-phase-researcher, lu-plan-checker, lu-pr-reviewer (all T0 -> T1)
- **5 moderate gaps**: Agents at correct tier but with promotable-to ceilings that enable complexity-driven promotion
- **17 no-change**: Agents already at correct tier or where T0 is appropriate
- No agent has a tier delta >= 2 (research corrections narrowed the gap space)

### Task 4: COGNITION-AUDIT.md Report

- Produced comprehensive 9-section report at `.planning/phases/15-cognition-per-agent-audit/COGNITION-AUDIT.md`
- Follows Phase 14 AUDIT-REPORT.md format precedent (table-based, per-step analysis)
- Sections: Executive Summary, Tier System Definition, Current-State Matrix, Ideal-State Profiles, Gap Analysis, Distribution Summary, Memory Tag Vocabulary, Tier Promotion Rules, Implementation Priority

## Key Findings

1. **The cognition system is more mature than research suggested**: 7 agents (28%) have cognition features, not 4 (16%). The research missed lu-planner's full cognitive pre-flight, lu-executor's WORKING.md + learning integration, and lu-verifier's lu-learner pass-through.

2. **Only 3 agents need tier changes**: lu-phase-researcher, lu-plan-checker, and lu-pr-reviewer should be promoted from T0 to T1. All other agents are either already at their recommended tier or appropriately stateless.

3. **The tier system formalizes implicit behavior**: The 4-tier model (T0-T3) codifies what already exists informally. The main value is making it explicit, machine-readable, and promotable via the complexity matrix.

4. **Context budget is manageable**: Even at CRITICAL complexity with all promotions active, the estimated overhead is 4700-10000 extra tokens -- well within typical context budgets.

## Artifacts Produced

| Artifact           | Path                                                               |
| ------------------ | ------------------------------------------------------------------ |
| COGNITION-AUDIT.md | `.planning/phases/15-cognition-per-agent-audit/COGNITION-AUDIT.md` |
| WORKING.md updates | `.planning/WORKING.md` (findings + candidate learnings)            |

## Verification Checklist

- [x] Audit matrix covers ALL 25 agents (verified by count)
- [x] Every agent has current-state assessment (5 features checked)
- [x] Every agent has ideal-state recommendation (tier + memory tags)
- [x] Gap analysis classifies all non-matching agents into Critical/Moderate/No-change
- [x] Tier definitions include all 4 tiers (T0-T3) with capabilities matrix
- [x] Memory tag vocabulary lists all 14 domain tags with definitions
- [x] Distribution summary shows current vs recommended tier counts
- [x] Report follows Phase 14 audit format precedent
