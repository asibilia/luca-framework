---
id: 13-03
title: Gated Steps and Skill/Rule Updates
phase: 13-complexity-gates
wave: 3
status: complete
delivers: CPLX-03, CPLX-06
---

# Summary 13-03: Gated Steps and Skill/Rule Updates

## What Was Done

### Task 1: Created complexity-gating Rule
- Created `src/rules/general/complexity-gating.rule.ts` following the `harness-verification.rule.ts` pattern exactly
- Rule defines the 5-level complexity matrix (TRIVIAL through CRITICAL)
- Documents always-on steps that cannot be gated
- Provides complexity matrix for all optional workflow steps
- Includes "How to Apply" instructions for agents to self-gate
- Documents override mechanisms (--complexity flag, config booleans, per-invocation flags)
- Rule has `alwaysApply: true`

### Task 2: Registered complexity-gating Rule
- Added import to `src/rules/index.ts`
- Added `"complexity-gating": ComplexityGatingRule` to `ruleRegistry`
- Updated test assertion in `__tests__/src/rules/rule-registry.test.ts` from 20 to 21

### Task 3: Added Complexity Gating to lu-execute-phase
- **Step 6.6**: Harness fix iterations now read from complexity matrix (TRIVIAL=1, SIMPLE=2, MODERATE=3, COMPLEX=3, CRITICAL=5)
- **Step 7.5**: Code review skip condition expanded to include TRIVIAL/SIMPLE; reviewer spawning table added (dx-advocate, code-simplifier at MODERATE+; code-architect at COMPLEX+; tailwind-auditor/security-auditor conditional)
- **Step 11**: UAT skip condition expanded to include TRIVIAL/SIMPLE; complexity gate table added (MODERATE=optional, COMPLEX=required, CRITICAL=required+thorough)
- **Learning Capture**: Added complexity-gated depth table (TRIVIAL=skip, SIMPLE=brief, MODERATE=standard, COMPLEX=full, CRITICAL=full+debrief)

### Task 4: Added Complexity Gating to lu-plan-phase
- **Step 5 (Research)**: Added complexity gate (TRIVIAL/SIMPLE skip, MODERATE optional, COMPLEX/CRITICAL required)
- **Step 10 (Plan Verification)**: Added complexity gate with iteration scaling (TRIVIAL/SIMPLE skip entirely, MODERATE=1 iter, COMPLEX=2 iter, CRITICAL=3 iter)
- **Step 12 (Revision Loop)**: Changed from fixed "Max 3 Iterations" to "Complexity-Scaled Iterations" (MODERATE=1, COMPLEX=2, CRITICAL=3)

### Task 5: Added Complexity Gating to lu-verify-work
- **Step 9 (Code Review)**: Added complexity gate before reviewer spawning; TRIVIAL/SIMPLE skip entirely; reviewer matrix matches lu-execute-phase for consistency

### Task 6: Added Complexity Awareness to lu-discuss-phase
- Added complexity gate at top of Process section (TRIVIAL/SIMPLE skip with banner, MODERATE optional, COMPLEX recommended, CRITICAL required)
- Updated probing depth section to scale by complexity (MODERATE=4, COMPLEX=4-6, CRITICAL=6+ questions per area)

### Task 7: Build and Validate
- `bun run build:all` completed successfully (178 files generated)
- `.cursor/rules/complexity-gating.mdc` exists
- `.claude/rules/complexity-gating.md` exists
- Rule registry has 21 entries (confirmed via runtime check)
- 569 tests pass, 7 fail (same as pre-existing; no regressions)
- TypeScript compilation: 1 pre-existing error in `lu-verifier.agent.ts` (owned by Plan 13-04, running in parallel)

## Files Modified

| File | Change |
|------|--------|
| `src/rules/general/complexity-gating.rule.ts` | NEW - complexity gating rule |
| `src/rules/index.ts` | Added import + registry entry (21 rules) |
| `__tests__/src/rules/rule-registry.test.ts` | Updated count assertion: 20 -> 21 |
| `src/skills/general/lu-execute-phase.skill.ts` | Gated: fix iterations, code review, UAT, learning |
| `src/skills/general/lu-plan-phase.skill.ts` | Gated: research, plan verification, revision loop |
| `src/skills/general/lu-verify-work.skill.ts` | Gated: code review spawning |
| `src/skills/general/lu-discuss-phase.skill.ts` | Gated: discussion skip + probing depth |

## Backward Compatibility

All gating is backward-compatible:
- When no complexity is set, behavior defaults to current (pre-gating) behavior
- Config booleans and per-invocation flags take precedence over complexity gating
- The complexity matrix is "soft enforcement" -- agents read the rule and self-gate

## Exit Criteria

- [x] `complexity-gating.rule.ts` created and registered (21 rules total)
- [x] lu-execute-phase gates: harness fix iterations, code review, UAT, learning capture by complexity
- [x] lu-plan-phase gates: research, plan verification, revision loop by complexity
- [x] lu-verify-work gates: code review agent spawning by complexity
- [x] lu-discuss-phase: skips for TRIVIAL/SIMPLE, scales probing depth
- [x] All gating is backward-compatible
- [x] Build pipeline produces updated output for all modified entities
- [x] No regressions (569 pass, 7 fail -- same as baseline)
