---
phase: 182
plan: 1
type: improvement
autonomous: true
wave: 1
depends_on: []
---

# Phase 182 Plan 1: Core Merge -- Absorb Autopilot Sections into lu.skill.ts

## Objective

Absorb all 11 autopilot.skill.ts sections into lu.skill.ts, creating a single unified entry point. This involves merging the main sections, merging the sub-agent delegation sections, updating the routing logic to make autopilot behavior the default for phase/milestone work, adding the --ask flag, and appending all remaining autopilot sections (configuration through summary) as new sections in lu.

## Context

@src/skills/luca/lu.skill.ts -- Current lu skill (233 lines, 3 sections: main, sub-agent_delegation_requirements, workflow)
@src/skills/general/autopilot.skill.ts -- Autopilot skill to absorb (1362 lines, 11 sections)
@.planning/phases/182-skill-consolidation/182-CONTEXT.md -- Phase context with merge decisions

## Tasks

### 1. Merge autopilot main content into lu main section

**Type:** auto
**TDD:** false
**Depends on:** none

Update lu's `main` section to combine:

- Lu's routing description with autopilot's orchestrator description
- Combined flag set: `--complexity`, `--force-complex`, `--skip-memory`, `--skip-branch`, `--oversight`, `--skip-backlog`, `--max-phases=N`, `--no-swarm`, `--dry-run`, `--ask`
- Autopilot's vault resolution block (already in lu's workflow section, so just reference it)
- Autopilot's CRITICAL workflow compliance rules (the 6 numbered rules about orchestrator boundaries)
- Keep lu's existing "CRITICAL: You are a router" instruction, augmented with autopilot's orchestrator rules

The merged main section should describe lu as BOTH a router (for quick/debug/PR tasks) AND an autonomous orchestrator (for phase/milestone work -- the former autopilot behavior).

**Files to edit:**

- src/skills/luca/lu.skill.ts (main section content)

**Verification:**

- The main section includes the combined flag set with all flags from both skills plus --ask
- The main section includes autopilot's 6 workflow compliance rules
- The main section describes lu as unified entry point + autonomous orchestrator

### 2. Merge sub-agent delegation sections

**Type:** auto
**TDD:** false
**Depends on:** 1

Update lu's `sub-agent_delegation_requirements` section to include autopilot's sub-agent/sub-skill delegation lists:

From autopilot's main section, absorb:

- Sub-skills list: phase-discuss, phase-plan, phase-execute, milestone-complete, milestone-new, git-commit
- Sub-agents list: lu-cognition, lu-router, lu-pm-planner, lu-roadmap-architect, lu-roadmap-prioritizer, lu-roadmap-qa, lu-roadmap-synthesizer

Merge these with lu's existing delegation section which already lists: Skill tool usage, Task tool usage, model resolution table.

The merged section should have lu's existing content PLUS autopilot's expanded sub-skill and sub-agent lists.

**Files to edit:**

- src/skills/luca/lu.skill.ts (sub-agent_delegation_requirements section content)

**Verification:**

- All 6 sub-skills from autopilot are listed
- All 7 sub-agents from autopilot are listed
- lu's existing model resolution table is preserved
- The section describes both routing delegation (for quick tasks) and orchestrator delegation (for phase/milestone work)

### 3. Update lu workflow section -- remove autopilot routing, make autonomous execution the default

**Type:** auto
**TDD:** false
**Depends on:** 1

Update lu's `workflow` section (currently titled "workflow", order 3) to:

a) **Add --ask flag handling** in Step 0 (Parse Request):

- `--ask`: shorthand for `--oversight=phase` (human-in-the-loop control)

b) **Update Step 4 (Route to Handler)** -- the critical change:

- Remove the "Autopilot mode" routing block entirely (the block that routes to `Skill(skill: "autopilot")`)
- Update "Task routing (all steps mandatory)" to make full-auto the DEFAULT behavior:
  - When routing to phase/milestone work, lu now runs the autonomous pipeline directly (configuration, backlog scan, roadmap revision, multi-phase execution)
  - The pipeline is: Step 0 config -> Step 1 backlog scan -> Step 2 roadmap revision -> Step 3 execution order -> Step 4 phase loop -> Step 5 milestone gate -> etc.
  - Reference the new sections (configuration, backlog_scan, etc.) that will be added in Task 4
- Remove "or autopilot instead" from the quick task routing text
- Keep all other routes unchanged (project-new, milestone-new, quick, pr-address, debug, session-plan, progress)

c) **Update Step 3 (Complexity Classification)** -- add note that for autonomous pipeline, complexity is classified per-phase inside the phase loop, not just once upfront.

**Files to edit:**

- src/skills/luca/lu.skill.ts (workflow section content)

**Verification:**

- No references to `Skill(skill: "autopilot")` remain
- No references to "or autopilot instead" remain
- The --ask flag is documented in Step 0
- Phase/milestone work routes to the autonomous pipeline (references to configuration, backlog_scan, etc. sections)
- All other routes (quick, debug, PR, etc.) are preserved unchanged
- Step 5 (Verification) and Step 6 (Learning Capture) are preserved

### 4. Append autopilot's remaining sections as new sections in lu

**Type:** auto
**TDD:** false
**Depends on:** 3

Add all remaining autopilot sections as new sections in lu.skill.ts, preserving their content verbatim. These sections contain the detailed implementation instructions for the autonomous pipeline.

Sections to add (in order, after the existing 3 lu sections):

1. `configuration` (order 4) -- Step 0: Configuration & Pre-Flight (read config, CLI flag overrides, cognitive pre-flight, session start)
2. `backlog_scan` (order 5) -- Step 1: Backlog Scan & Unplanned Detection
3. `roadmap_revision` (order 6) -- Step 2: Roadmap Revision (specialist swarm, synthesis)
4. `execution_order` (order 7) -- Step 3: Build Execution Order
5. `phase_loop` (order 8) -- Step 4: Phase Execution Loop (classify, discuss, plan, execute per phase)
6. `milestone_gate` (order 9) -- Step 5: Milestone Completion Gate
7. `cross_milestone` (order 10) -- Step 6: Cross-Milestone Continuity
8. `oversight_gates` (order 11) -- Oversight Level Gates reference
9. `failure_handling` (order 12) -- Failure Handling & Recovery
10. `summary` (order 13) -- Session Summary

When copying, make these text substitutions:

- Replace "Luca AUTOPILOT" display headers with "Luca" (e.g., "Luca AUTOPILOT > SESSION START" becomes "Luca > SESSION START")
- Replace "autopilot skill" or "the autopilot" with "lu" or "the lu skill" where it refers to this skill's own identity
- Keep config key references as `c.autopilot?.oversight` etc. (config key stays 'autopilot' per CONTEXT.md decision 1)
- Add a code comment near the config reads: `// Config key is 'autopilot' for backward compatibility`
- In the configuration section's cognitive pre-flight prompt, update "Run cognitive pre-flight for autopilot session" to "Run cognitive pre-flight for lu session"
- In the phase_loop section, update any "autopilot orchestrator" references to "lu orchestrator"
- In the roadmap_revision section, "the autopilot Step 2b" becomes "the lu Step 2b"

**Files to edit:**

- src/skills/luca/lu.skill.ts (add 10 new sections to the sections array)

**Verification:**

- lu.skill.ts now has 13 sections total (3 original + 10 new from autopilot)
- All 10 autopilot sections are present with correct content
- Config key references remain 'autopilot' (not renamed)
- Display headers say "Luca" not "Luca AUTOPILOT"
- Self-references say "lu" not "autopilot"
- The file compiles without TypeScript errors: `bunx --bun tsc --noEmit`

### 5. Verify merged lu.skill.ts compiles and has correct structure

**Type:** auto
**TDD:** false
**Depends on:** 4

Run type checking to verify the merged file is valid TypeScript:

```bash
bunx --bun tsc --noEmit
```

Also verify the section structure by checking:

- 13 sections exist in the sections array
- Each section has a unique title
- Order values are sequential (1-13)
- The file exports `luSkill` correctly

**Files to verify:**

- src/skills/luca/lu.skill.ts

**Verification:**

- TypeScript compilation succeeds with zero errors
- All 13 sections have unique titles
- The exported `luSkill` object is valid

## Verification

After all tasks complete:

1. `bunx --bun tsc --noEmit` passes with zero errors
2. lu.skill.ts contains 13 sections covering all functionality from both skills
3. No references to `Skill(skill: "autopilot")` exist in lu.skill.ts
4. The --ask flag is documented
5. Config key references remain 'autopilot' (backward compatible)
6. All autopilot orchestrator logic is now in lu

## Success Criteria

- lu.skill.ts is a fully merged file with all autopilot functionality absorbed
- The file is valid TypeScript
- Routing logic makes autonomous execution the default for phase/milestone work
- All other lu routes (quick, debug, PR, etc.) are preserved
- The --ask flag provides human-in-the-loop shorthand

## Output Specification

- Modified file: `src/skills/luca/lu.skill.ts` (expected ~1500 lines)
