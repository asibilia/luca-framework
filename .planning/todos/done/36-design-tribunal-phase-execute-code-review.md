---
title: Add Design Tribunal debate round to phase-execute code review
area: framework/skills
created: 2026-03-02
source: conversation — debate-pattern-review team research (all 4 researchers flagged as P0)
---

## Context

All 4 research agents independently identified phase-execute code review as the #1 highest-impact debate opportunity in the entire framework. Currently 5 reviewers (dx-advocate, code-simplifier, code-architect, tailwind-auditor, security-auditor) run in parallel on the same diff and findings are merged by severity — but reviewers never interact or challenge each other.

## Task

Add a "Design Tribunal" debate round to the phase-execute skill's code review phase:

1. **Phase 1 — Independent Review (existing):** 5 reviewers analyze same diff independently, produce findings
2. **Phase 2 — Disagreement Detection (new):** Orchestrator identifies conflicts across findings:
   - dx-advocate says "too complex" but code-architect says "abstraction justified"
   - security-auditor flags defensive code that code-simplifier wants to remove
   - code-architect's structural decision creates a security surface
3. **Phase 3 — Rebuttal Round (new):** Conflicting agents challenge each other's conclusions via agent team messaging
4. **Phase 4 — Unified Recommendations:** Merge debate-refined findings with confidence ratings

### Implementation approach

- Use agent teams (TeamCreate + SendMessage) for the debate round
- Gate behind complexity: COMPLEX+ only (skip debate for TRIVIAL/SIMPLE/MODERATE)
- Token budget: +20-30k per phase (~25% overhead on existing 100-150k review budget)
- Debate round runs only when disagreements detected (not every review)

### Debate scenarios to handle

| Agent A          | Agent B          | Conflict                                 | Resolution via                   |
| ---------------- | ---------------- | ---------------------------------------- | -------------------------------- |
| dx-advocate      | code-architect   | Complexity vs justified abstraction      | Architect defends with rationale |
| security-auditor | code-simplifier  | Defensive code vs unnecessary complexity | Security justifies threat model  |
| code-architect   | security-auditor | Module boundary vs auth surface          | Both present constraints         |
| dx-advocate      | security-auditor | Convention vs security exception         | Severity-based tiebreak          |

## Notes

- This is the entry point for all debate patterns — validate here before expanding
- Current skill: `src/skills/general/phase-execute.skill.ts` (or similar)
- Related: todo #35 (milestone-audit debate — same pattern, broader scope)
- Requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` enabled
- All 4 researchers converged on this independently — highest confidence recommendation
