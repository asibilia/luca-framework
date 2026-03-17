---
title: Merge autopilot skill into lu skill
area: skills
created: 2025-07-24
source: conversation
---

## Context

The `autopilot` skill and `lu` skill have significant overlap. In practice, `autopilot` is always used and `lu` is rarely invoked directly. Today `lu` is a thin router that delegates to `autopilot` for autonomous work but can also manually chain discuss → plan → execute for single-phase work. The goal is to consolidate into a single `lu` skill that does everything.

## Task

Absorb `autopilot.skill.ts` into `lu.skill.ts` so that `lu` becomes the single unified entry point with autopilot's full capabilities as the default behavior.

### Key design decisions

- **Default mode**: `full-auto` oversight (zero pauses except CRITICAL safety gates)
- **`--ask` flag**: New shorthand for `--oversight=phase` (pause before every phase for human approval), replacing the old manual `lu` behavior
- **Routing preserved**: `lu` keeps its intelligence for non-phase tasks (PR URL → pr-address, bug → debug, trivial ad-hoc → quick, etc.). The autopilot loop activates when the task is phase/milestone work or no specific task type is detected.

### Combined flag set

From autopilot: `--oversight=flagged|milestone|phase|full-auto`, `--skip-backlog`, `--max-phases=N`, `--no-swarm`, `--dry-run`
From lu: `--complexity=TRIVIAL|SIMPLE|MODERATE|COMPLEX|CRITICAL`, `--force-complex`, `--skip-memory`, `--skip-branch`
New: `--ask` (alias for `--oversight=phase`)

### Capabilities absorbed from autopilot

- Backlog scan & unplanned detection
- Roadmap revision (3-specialist swarm: architect, prioritizer, QA + synthesizer)
- Dependency graph (topological sort, level-based ordering)
- Parallel execution (TeamCreate, worktree isolation, merge sequencing)
- Oversight gates (4 levels, default full-auto)
- Milestone completion + cross-milestone looping
- Gap closure retries (configurable)
- Park-and-continue failure handling (with cascade prevention)

### Files to modify

- `src/skills/luca/lu.skill.ts` — absorb all autopilot sections
- `src/skills/general/autopilot.skill.ts` — delete after merge
- `.claude/rules/lu-workflow.md` — remove autopilot references
- Any other skills/agents that reference `/autopilot` — update to `/lu`
- Skill registry — remove autopilot entry

## Notes

- The autopilot skill is ~1360 lines; lu is ~230 lines. The merged skill will be large but comprehensive.
- Both skills already share: cognitive pre-flight (lu-cognition), vault resolution, complexity classification (lu-router), git context setup, and the core phase pipeline (discuss → plan → execute).
- Line 185-189 of lu.skill.ts currently routes to autopilot — this indirection gets eliminated.
