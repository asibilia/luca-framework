---
title: "Pilot: Apply all 5 layers to pr-address as proof of concept"
area: skills
created: 2026-03-28
source: conversation
---

## Context

pr-address is the ideal pilot for the anti-step-skipping architecture: it's medium-sized (815 lines), has a well-understood step-skipping problem (PR #112 skipped Steps 3, 5, 7, 7.5), and its decomposition boundaries are already designed.

## Task

Apply all 5 layers to pr-address as a proof of concept before rolling out to other skills:

### Step 1: Decompose (Layer 0)

Create 6 sub-skills:

- `src/skills/general/pr-fetch.skill.ts`
- `src/skills/general/pr-validate.skill.ts`
- `src/skills/general/pr-debate.skill.ts`
- `src/skills/general/pr-fix.skill.ts`
- `src/skills/general/pr-learn.skill.ts`
- `src/skills/general/pr-respond.skill.ts`

Refactor `pr-address.skill.ts` into thin orchestrator calling `Skill()` for each.

### Step 2: State Machine (Layer 2)

Create `src/skills/__schemas/states/pr-address.states.ts` with 11 states:

```
IDLE -> FETCHED -> CATEGORIZED -> VALIDATED -> DEBATED -> PLANNED -> FIXED -> VERIFIED -> LEARNED -> RESPONDED -> PUSHED
```

### Step 3: Progressive Disclosure (Layer 1)

Configure the pr-address orchestrator to use progressive execution mode — reveal only the current sub-skill's context.

### Step 4: Hook Gate (Layer 3)

Add pre-step gate that validates pr-address state before each sub-skill invocation.

### Step 5: Gap Detection (Layer 4)

Add post-execution audit that checks all 6 sub-skills completed.

### Verification

Run `/pr-address` on a test PR and verify:

- [ ] All 6 sub-skills are invoked (no skips)
- [ ] lu-learner spawns and writes to MuninnDB (the original problem)
- [ ] State machine rejects any attempt to push without LEARNED transition
- [ ] Gap detector reports 0 gaps
- [ ] Total latency is acceptable (< 2x current)

## Notes

- This pilot validates the architecture before investing in decomposing lu.skill.ts (19,000 tokens)
- Research: `docs/research/anti-step-skipping/05-recommended-architecture.md`
- Depends on: Layer 2 schema + runtime, Layer 3 hook infrastructure, Layer 4 gap detector
- The existing `pr-address-learning-capture.md` todo is superseded by this
- Estimated effort: 3-5 days (after layer infrastructure is built)
