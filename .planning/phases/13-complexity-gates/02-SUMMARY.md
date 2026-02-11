---
id: 13-02
title: Router Expansion and Override Mechanism
phase: 13-complexity-gates
wave: 2
status: complete
---

# Plan 13-02 Summary: Router Expansion and Override Mechanism

## What Was Done

### Task 1: Expand lu-router Agent to 5 Levels
**File:** `src/agents/general/lu-router.agent.ts`

- Updated role section: classify line now lists TRIVIAL, SIMPLE, MODERATE, COMPLEX, CRITICAL
- Expanded classification criteria from 3 to 5 levels with distinct descriptions and examples
- Updated "Always Verify" section to reference all 5 levels grouped appropriately
- Expanded complexity_signals from 3 to 5 blocks (added Simple and Critical)
- Updated classification pseudocode from 3 branches to 5 branches with refined conditions
- Added edge cases: "Architect"/"overhaul" -> CRITICAL, "External API" -> COMPLEX minimum, "Multiple RISK flags" -> bump up one level
- Expanded determine_route step from 3 to 5 routing paths with differentiated steps per level
- Expanded routing_paths section from 3 to 5 detailed path descriptions (TRIVIAL, SIMPLE, MODERATE, COMPLEX, CRITICAL)
- Updated structured returns: classification template now shows all 5 levels
- Added "Gated Steps (from complexity matrix)" table to routing decision output

### Task 2: Update General lu.skill.ts
**File:** `src/skills/general/lu.skill.ts`

- Arguments line updated: added `--complexity=TRIVIAL|SIMPLE|MODERATE|COMPLEX|CRITICAL` flag (before existing `--force-complex`)
- Workflow diagram updated from 3 paths to 4 path groups (TRIVIAL, SIMPLE, MODERATE, COMPLEX/CRITICAL)
- Added "Complexity Override" section documenting override mechanism, backward compatibility with `--force-complex`, and default behavior

### Task 3: Update Luca-Specific lu.skill.ts
**File:** `src/skills/luca/lu.skill.ts`

- Mirrored all three changes from Task 2: arguments line, workflow diagram, and override mechanism section
- Both skill variants are now consistent

### Task 4: Build Pipeline
- `bun run build:all` completed successfully (176 files generated)
- Updated lu-router agent compiled to `.claude/agents/lu-router.md` and `.cursor/agents/lu-router.md`
- Updated lu skill compiled to `.claude/skills/lu/SKILL.md` and `.cursor/skills/lu/SKILL.md`
- Verified output files mention all 5 complexity levels

### Task 5: Tests and Validation
- `bun test`: 569 pass, 7 fail (same as pre-existing; no regressions)
- `bunx --bun tsc --noEmit`: 1 pre-existing error in `lu-verifier.agent.ts` (not related to our changes)
- Config validation: Confirmed `Levels: [ "TRIVIAL", "SIMPLE", "MODERATE", "COMPLEX", "CRITICAL" ]` and `Default: auto`

## Files Changed

| File | Change |
|------|--------|
| `src/agents/general/lu-router.agent.ts` | Expanded from 3 to 5 complexity levels throughout |
| `src/skills/general/lu.skill.ts` | Added `--complexity` flag, updated diagram, added override docs |
| `src/skills/luca/lu.skill.ts` | Mirrored general skill changes |
| `.claude/agents/lu-router.md` | Build output (auto-generated) |
| `.cursor/agents/lu-router.md` | Build output (auto-generated) |
| `.claude/skills/lu/SKILL.md` | Build output (auto-generated) |
| `.cursor/skills/lu/SKILL.md` | Build output (auto-generated) |

## Exit Criteria Verification

- [x] lu-router classifies into 5 levels: TRIVIAL, SIMPLE, MODERATE, COMPLEX, CRITICAL
- [x] lu-router outputs gated steps table in routing decision
- [x] `/lu` accepts `--complexity=<level>` flag
- [x] `--force-complex` still works as backward-compatible alias
- [x] Override mechanism documented in skill definition
- [x] Both lu.skill.ts variants (general + luca) updated consistently
- [x] Build pipeline produces updated output
- [x] No regressions (569 pass, 7 fail same as before)
