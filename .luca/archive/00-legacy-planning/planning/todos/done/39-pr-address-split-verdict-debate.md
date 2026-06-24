---
title: Add debate round for pr-address split verdict resolution
area: framework/skills
created: 2026-03-02
source: conversation — debate-pattern-review team research (skill-auditor)
---

## Context

The pr-address skill spawns 6 validators that independently judge PR comments as valid or invalid, with majority vote deciding the outcome. Skill-auditor identified that when validators produce split verdicts (e.g., 3 valid / 3 invalid), the majority-vote approach loses nuance. A debate round could surface the actual tradeoffs.

## Task

Add a debate round to pr-address when validators produce split verdicts:

1. **Trigger:** Validator votes split (no clear majority, or narrow 4-2 / 3-3 split)
2. **Debate:** Dissenting validators explain their reasoning, majority defenders respond
3. **Resolution:** Present both perspectives with attribution to the user

### Example scenario

- PR comment: "Use Redux instead of Context API"
- security-auditor: valid (better isolation)
- code-architect: invalid (over-engineering for this scope)
- Debate surfaces the actual tradeoff rather than flattening to yes/no

### Token cost

- +30-40k tokens per split verdict
- Split verdicts occur ~10-20% of PRs
- No complexity gate needed — all PR flows benefit

## Notes

- Current skill: `src/skills/general/pr-address.skill.ts` (or similar)
- Unique among debate opportunities: operates on subjective domain (comment quality) where variance is expected
- May not need full agent teams — could use a simpler "rebuttal prompt" pattern
