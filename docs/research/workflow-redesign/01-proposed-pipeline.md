# Proposed `/lu` Pipeline (Pre-GSD2 Learnings)

> **Status:** Draft — this captures our initial proposal BEFORE applying GSD2 learnings.
> The final workflow will be in `06-final-workflow.md` after research is complete.

## Core Design Principles

1. **No routing, no skipping.** Every task enters the same structured pipeline regardless of complexity. Complexity controls model tier and loop budgets only — never which steps run.
2. **Backfill, don't skip.** If a step discovers missing prerequisites (no roadmap, no plan, no milestone), it triggers the upstream steps needed to get into the right state. The pipeline always moves forward.
3. **Flat orchestration.** All Agent() calls originate from the `/lu` orchestrator. Sub-agents are leaf workers — they cannot spawn agents, tasks, or skills.
4. **Commit only verified code.** The implementation loop (execute → harness → verify) must pass before code review or commit happens.

## Pipeline Summary

```
Step 0: Parse Args, Crash Recovery, Initialize
Step 1: Cognitive Pre-Flight + Classify
Step 2: Ensure Active Milestone + Roadmap
  Branch A: CREATE (full milestone lifecycle)
  Branch B: SYNC (backlog delta check via WSJF)
Step 3: Git Workflow Setup
Step 4: Build Phase Execution Order
Step 5: Phase Execution Loop (per phase, serial)
  5a-g: dependency → oversight → classify → gates → research → discuss → plan
  5h-k: IMPLEMENTATION LOOP (execute → harness → verify → gap-close)
  5l-m: Code review + review fix loop
  5n-q: Learning → process data → commit → update state
Step 6: Milestone Boundary Check
Step 7: Cross-Milestone Continuation
Step 8: Session Wrap-up
```

## Step Details

### Step 0: Parse Args, Crash Recovery, Initialize

- Parse CLI flags
- Initialize state machine (`luca-bridge ensure-init`)
- Crash recovery: detect interrupted session, resume from checkpoint

### Step 1: Cognitive Pre-Flight + Classify

- Agent("cognition") — recall brain tree, semantic recall, intuition flags
- Agent("classify") — determine COMPLEXITY (controls model tier + loop budgets ONLY)
- Emit ROUTE_COMPLETE transition

### Step 2: Ensure Active Milestone + Roadmap

Two branches:

**Branch A (CREATE):** No roadmap → full milestone lifecycle

- 2b. Load project context (PROJECT.md, milestones/, config.json)
- 2c. Gather milestone goals (questioning)
- 2d. Determine version (semver)
- 2e. Domain research (4 parallel specialists → synthesis)
- 2f. Define requirements (user scopes categories → REQUIREMENTS.md with REQ-IDs)
- 2g. Create roadmap (lu-roadmapper: requirements → phases, goal-backward success criteria, 100% coverage)
- 2h. Update project state (reset state machine)
- 2i. Seed memory
- Falls through to Branch B

**Branch B (SYNC):** Roadmap exists → backlog delta check

- 2j. Read pending todos
- 2k. WSJF scoring (lu-pm-planner)
- 2l. Roadmap revision if unplanned todos exist
- 2m. Oversight-gated approval

### Step 3: Git Workflow Setup

- Create GitHub issue + feature branch (conditional on --skip-branch)

### Step 4: Build Phase Execution Order

- Parse ROADMAP.md, dependency graph, topological sort, apply MAX_PHASES
- If no phases found, backfill → trigger Step 2

### Step 5: Phase Execution Loop (per phase, serial)

- **5a.** Dependency check — park if blocked (cascade)
- **5b.** Oversight gate
- **5c.** Per-phase complexity classify
- **5d.** Gate resolution (premortem, process_data)
- **5d-v2.** Research pipeline (v2 only)
- **5e.** Discussion
- **5f-g.** Plan check + planning (+ plan review in v2)
- **5h-k.** Implementation loop:
  ```
  FOR attempt = 1 to MAX_IMPL_ITERATIONS:
    5h. Execute wave tasks
    5i. Harness fix loop (tsc + test)
    5j. Goal-backward verification
    5k. If passed → BREAK. If gaps → plan gaps, loop. If max → park/escalate.
  ```
- **5l.** Code review (4 parallel reviewers)
- **5m.** Review fix loop (CRITICAL findings)
- **5n.** Learning capture
- **5o.** Process data
- **5p.** Commit + push
- **5q.** Update state, emit PHASE_COMPLETE

### Step 6: Milestone Boundary Check

- Milestone summary (passed/parked table)
- If all passed: 5 milestone agents (learn, prune, shadow, archive, finalize)
- If parked: oversight-gated decision
- Create PR if feature branch exists

### Step 7: Cross-Milestone Continuation

- If CROSS_MILESTONE enabled and milestone completed cleanly
- Safety limit: max 3 milestones per session
- Bootstrap next milestone (reuses Step 2), loop back to Step 3

### Step 8: Session Wrap-up

- Gap detection audit
- Session summary
- Final state transition

## Oversight Gate Behavior Matrix

| Decision Point          | full-auto      | flagged         | milestone      | phase           |
| ----------------------- | -------------- | --------------- | -------------- | --------------- |
| Milestone creation (2A) | auto-create    | auto-create     | PAUSE: confirm | PAUSE: confirm  |
| Roadmap revision (2B)   | auto-approve   | auto-approve    | PAUSE: approve | PAUSE: approve  |
| Before each phase (5b)  | continue       | continue        | continue       | PAUSE: C/S/Stop |
| Phase gaps (5k)         | park, continue | PAUSE: R/S/Stop | park, continue | PAUSE: R/S/Stop |
| CRITICAL review (5l)    | PAUSE (safety) | PAUSE           | PAUSE          | PAUSE           |
| Milestone boundary (6)  | auto-complete  | PAUSE if parked | PAUSE: confirm | PAUSE: confirm  |
| Cross-milestone (7)     | auto-continue  | auto-continue   | PAUSE: confirm | PAUSE: confirm  |

## Implementation Budget Matrix

| Parameter              | TRIVIAL | SIMPLE | MODERATE | COMPLEX | CRITICAL |
| ---------------------- | ------- | ------ | -------- | ------- | -------- |
| MAX_IMPL_ITERATIONS    | 1       | 1      | 2        | 3       | 3        |
| HARNESS_FIX_ITERATIONS | 1       | 2      | 2        | 2       | 3        |
| REVIEW_FIX_ITERATIONS  | 0       | 1      | 1        | 2       | 2        |
