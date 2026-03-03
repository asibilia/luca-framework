---
title: Add Verification Tribunal for T1/T3 signal conflicts
area: framework/agents
created: 2026-03-02
source: conversation — debate-pattern-review team research (agent-analyst + flow-researcher)
---

## Context

lu-verifier uses a two-signal system: T1 (tests pass/fail) is PRIMARY, T3 (goal-backward semantic check) is SECONDARY. When T1 passes but T3 finds a semantic gap, there's a conflict — tests say "done" but verification says "not quite." Currently this is resolved by the verifier alone. Two researchers flagged this as a high-value debate opportunity.

## Task

Add a Verification Tribunal that activates when T1 and T3 signals conflict:

1. **Trigger:** lu-verifier detects T1 PASS + T3 PARTIAL/FAIL
2. **Debate participants:**
   - lu-test-writer explains test encoding ("here's what the tests actually verify")
   - lu-verifier explains semantic gap ("here's what's missing from goal perspective")
   - lu-integration-checker assesses if gap is wiring vs specification
3. **Resolution:** Agents present "conflicting signals report" with recommendation:
   - Tests are incomplete (need more tests)
   - Goal is over-specified (adjust acceptance criteria)
   - Wiring issue (integration gap, not test gap)

### Token cost

- +10-15k tokens per T1/T3 conflict
- Conflicts are relatively rare (~10-15% of COMPLEX+ phases)
- Gate: COMPLEX+ complexity only

## Notes

- Depends on todo #36 (Design Tribunal) being validated first as proof of concept
- Key insight from agent-analyst: "needs debate on what 'passing' means"
- Current agents: `src/agents/luca/lu-verifier.agent.ts`, `src/agents/luca/lu-test-writer.agent.ts`
