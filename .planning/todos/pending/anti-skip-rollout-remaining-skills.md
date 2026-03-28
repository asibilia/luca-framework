---
title: "Rollout: Apply anti-step-skipping architecture to remaining high-risk skills"
area: skills
created: 2026-03-28
source: conversation
---

## Context

After the pr-address pilot validates the 5-layer architecture, apply it to the remaining high-risk skills. This is Phase 3 of the implementation sequence from `docs/research/anti-step-skipping/05-recommended-architecture.md`.

## Task

### Skill 2: milestone-complete (~800 lines, 9+ steps, HIGH risk)

Decompose into:

- `milestone-learn.skill.ts` (Step 0: final learning extraction)
- `milestone-prune.skill.ts` (Step 0.5: stale memory detection)
- `milestone-shadow-gate.skill.ts` (Step 0.7: shadow debt scan)
- `milestone-archive.skill.ts` (Steps 1-7: archive + stats + retro)
- `milestone-finalize.skill.ts` (Steps 8-9: commit + tag + GitHub)

Add state machine: IDLE -> LEARNED -> PRUNED -> SCANNED -> ARCHIVED -> FINALIZED

### Skill 3: lu.skill.ts (~19,000 tokens, 11+ steps, HIGH risk)

Decompose into:

- `lu-route.skill.ts` (routing + classification)
- `lu-configure.skill.ts` (config + cognitive preflight)
- `lu-backlog.skill.ts` (backlog scan + roadmap revision)
- `lu-phase-loop.skill.ts` (phase iteration + milestone gate)

Add state machine: IDLE -> ROUTED -> CONFIGURED -> SCANNED -> EXECUTING -> COMPLETE

### Skill 4: verify.skill.ts (~800 lines, 12 steps, MEDIUM risk)

Decompose into:

- `verify-extract.skill.ts` (find summaries, extract deliverables)
- `verify-test.skill.ts` (present tests, collect results)
- `verify-diagnose.skill.ts` (spawn debuggers for failures)
- `verify-review.skill.ts` (code review swarm)

### Skill 5: phase-execute.skill.ts (~29,000 tokens, MEDIUM risk)

Already has some state machine support. Decompose wave execution, code review, and verification loops into distinct sub-skills. Extend existing bridge transitions.

## Notes

- Each skill follows the same pattern established in the pr-address pilot
- Estimated effort: 1-2 weeks total
- Prioritize by skip risk: milestone-complete > lu > verify > phase-execute
