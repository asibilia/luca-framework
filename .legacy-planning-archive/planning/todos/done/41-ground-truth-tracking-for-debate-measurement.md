---
title: Add ground truth tracking infrastructure for debate effectiveness measurement
area: framework/state
created: 2026-03-02
source: conversation — debate-pattern-review team research (flow-researcher prerequisite)
---

## Context

Flow-researcher flagged a critical prerequisite: before scaling debate mechanisms, we need ground truth tracking to measure whether debates actually improve outcomes. Without this, we can't distinguish "debate improved confidence" from "debate added cost without value."

## Task

Add measurement infrastructure to track:

1. **Iteration metrics:**
   - Actual iteration count vs predicted stall point
   - How often stall-vs-retry debate changes the outcome
2. **Plan quality metrics:**
   - Execution time vs WSJF score
   - Plan coverage vs executor satisfaction
3. **Review quality metrics:**
   - Debate round findings vs non-debate findings
   - How often debate changes the final recommendation
   - False positive/negative rates with and without debate
4. **Convergence metrics:**
   - Premature halt rate before/after stall debate
   - Error classification accuracy (conservative vs aggressive)

### Storage

- Append metrics to STATE.md or a new `.planning/metrics.json`
- Aggregate across sessions in MEMORY.md patterns section

### Implementation approach

- Start lightweight: log key decision points and outcomes
- Don't over-engineer — simple counters and timestamps first
- Build dashboard/reporting later once data accumulates

## Notes

- This is a PREREQUISITE for todos #37-40 (all advanced debate patterns)
- Todo #36 (Design Tribunal) can proceed without this as a proof of concept
- Flow-researcher: "All opportunities need ground truth tracking"
- Consider aligning with existing state machine bridge for persistence
