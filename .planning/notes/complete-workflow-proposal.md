# Complete `/lu` Workflow — Proposal Draft

> **Status:** Brainstorming — first pass at restoring the full end-to-end autonomous workflow.
> **Context:** The move from Skill() chaining to flat Agent() orchestration (to fix the skill-skipping bug) dropped key capabilities from the original autopilot. This document proposes what the complete workflow _should_ look like.

## Core Design Principles

1. **No routing, no skipping.** Every task enters the same structured pipeline regardless of complexity. Complexity controls model tier and loop budgets only — never which steps run.
2. **Backfill, don't skip.** If a step discovers missing prerequisites (no roadmap, no plan, no milestone), it triggers the upstream steps needed to get into the right state. The pipeline always moves forward.
3. **Flat orchestration.** All Agent() calls originate from the `/lu` orchestrator. Sub-agents are leaf workers — they cannot spawn agents, tasks, or skills.
4. **Commit only verified code.** The implementation loop (execute → harness → verify) must pass before code review or commit happens.

## What Was Lost

| Capability                                                                | Original Location                                     | Current Status                                                                         |
| ------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Milestone bootstrapping (questioning → research → requirements → roadmap) | autopilot Step 6 → `Skill("milestone-new")`           | **Gone** — `/lu` assumes ROADMAP.md exists                                             |
| Backlog WSJF scoring                                                      | autopilot Step 2 → `Task("lu-pm-planner")`            | **Gone** — backlog scan exists but only reads, doesn't score or revise                 |
| Roadmap revision (absorb unplanned todos into phases)                     | autopilot Step 2                                      | **Gone**                                                                               |
| Cross-milestone loop                                                      | autopilot Step 6 → `Skill("milestone-new")` → restart | **Dead code** — Step 9 references it but has no creation mechanism                     |
| Oversight gate matrix (full-auto / flagged / milestone / phase)           | autopilot oversight_gates section                     | **Partially kept** — flag exists, gate behavior matrix is gone                         |
| Phase parking + cascade prevention                                        | autopilot Steps 4a, 4g                                | **Partially kept** — dependency check exists, but parking/retry logic is thin          |
| Implementation looping (plan → execute → verify → gap-close → re-verify)  | autopilot Step 4f-4g                                  | **Partially kept** — gap closure exists (7p) but ordering is wrong (runs after commit) |

## Proposed End-to-End Pipeline

### Phase 0: Bootstrap (Entry)

```
Step 0: Parse Args, Crash Recovery, Initialize
  - Parse CLI flags
  - Initialize state machine (luca-bridge ensure-init)
  - Crash recovery: detect interrupted session, resume from checkpoint
```

### Phase 1: Cognitive Context

```
Step 1: Cognitive Pre-Flight + Classify
  - Agent("cognition") — recall brain tree, semantic recall, intuition flags
  - Agent("classify") — determine COMPLEXITY (controls model tier + loop budgets ONLY)
  - Emit ROUTE_COMPLETE transition

  NOTE: No routing. Every task enters the same structured pipeline.
  Complexity NEVER gates which steps run — only model tier and iteration budgets.
```

### Phase 2: Ensure Active Milestone + Roadmap (RESTORED)

> **This is the key missing piece.** Before we can execute phases, we need to ensure a milestone and roadmap exist.
>
> **Backfill principle:** Every step checks its own prerequisites. If this step finds no roadmap,
> it doesn't skip — it runs the milestone creation sub-steps to get into the right state.
> This applies throughout the pipeline: if Step 4 finds no phases, it triggers Step 2's
> milestone creation. If the phase loop finds no plan, it triggers planning. No step is ever
> skipped, but steps can trigger upstream work to satisfy their preconditions.

```
Step 2: Ensure Active Milestone + Roadmap

  ┌──────────────────────────────────────────────────────────────────┐
  │  This step has two branches:                                     │
  │                                                                  │
  │  A. No active milestone → CREATE (full milestone lifecycle)      │
  │  B. Active milestone exists → SYNC (backlog delta check)         │
  │                                                                  │
  │  Both branches end with a validated ROADMAP.md ready for         │
  │  execution ordering in Step 3.                                   │
  └──────────────────────────────────────────────────────────────────┘

  ─── 2a. Check for active milestone ───

    - Read ROADMAP.md — does it exist? Does it have incomplete phases?
    - Read STATE.md — is there a current_milestone set?
    - Read .planning/todos/pending/ — are there backlog items?

  ─── BRANCH A: No roadmap OR no incomplete phases → CREATE MILESTONE ───

    Oversight gate:
    - full-auto: auto-create from task description
    - flagged: auto-create from task description
    - milestone/phase: PAUSE — present options, confirm goals

    2b. Load project context
      - Read PROJECT.md (project identity, history, past milestones)
      - Read existing milestones/ directory for version history
      - Read .planning/config.json for depth, workflow settings

    2c. Gather milestone goals
      - IF task description is sufficient: parse goals from it
      - IF MILESTONE-CONTEXT.md exists: consume it (delete after)
      - OTHERWISE: question user about goals, scope, constraints
        - Reference .claude/luca/references/questioning.md for technique
        - Challenge vagueness, make abstract concrete
        - Identify what's already decided vs. open questions

    2d. Determine milestone version
      - Parse last version from ROADMAP.md or milestones/ directory
      - Suggest next version (semver bump based on scope)

    2e. Domain research (optional, oversight-gated)
      - Spawn 4 parallel research specialists:
        Agent("research-stack-{VER}", subagent_type: "lu-project-researcher")
        Agent("research-features-{VER}", subagent_type: "lu-project-researcher")
        Agent("research-arch-{VER}", subagent_type: "lu-project-researcher")
        Agent("research-risks-{VER}", subagent_type: "lu-project-researcher")
      - Wait for ALL 4 to return
      - Agent("research-synth-{VER}", subagent_type: "lu-research-synthesizer")
        → produces research/SUMMARY.md

    2f. Define requirements
      - Present feature categories derived from goals + research
      - User scopes each category (v1 / v2 / out)
      - Create REQUIREMENTS.md with REQ-IDs
      - Reference .claude/luca/templates/requirements.md for format

    2g. Create roadmap
      - Agent("milestone-roadmap", subagent_type: "lu-roadmapper")
      - Inputs: PROJECT.md, REQUIREMENTS.md, research/SUMMARY.md, config.json
      - lu-roadmapper:
        1. Extracts all v1 requirements with IDs
        2. Groups by natural delivery boundaries (NOT horizontal layers)
        3. Identifies dependencies between groups
        4. Creates phases that complete coherent capabilities
        5. Derives 2-5 observable success criteria per phase (goal-backward)
        6. Cross-checks: every v1 requirement maps to exactly one phase
        7. Validates 100% coverage — no orphans, no duplicates
      - Writes: ROADMAP.md, STATE.md
      - Updates: REQUIREMENTS.md traceability section
      - Applies depth calibration from config (quick=3-5, standard=5-8, comprehensive=8-12)
      - Phase numbering: continues from previous milestone if applicable

    2h. Update project state
      - Update PROJECT.md with Current Milestone section
      - Reset state machine: luca-bridge transition --event=RESET
      - luca-bridge ensure-init --force
      - luca-bridge set-field --field=current_milestone --value="v{version}"

    2i. Seed memory (if first milestone)
      - Populate MuninnDB with project identity (brain:project-identity)

    → Continue to Step 2j (backlog sync — check if any pending todos
      weren't captured in the newly created roadmap)

  ─── BRANCH B: Roadmap exists with incomplete phases → SYNC BACKLOG ───

    This is the delta check: have new todos appeared since the roadmap
    was last built or revised?

    2j. Read pending todos
      - ls .planning/todos/pending/*.md
      - IF count == 0: continue to Step 3 (nothing to sync)

    2k. WSJF scoring
      - Agent("backlog-score", subagent_type: "lu-pm-planner")
      - Score ALL pending todos by WSJF:
        WSJF = (Business Value + Time Criticality + Risk Reduction) / Effort
      - Identify which todos are already referenced in ROADMAP.md
      - Identify unplanned todos (not in any phase)

    2l. IF unplanned todos exist: roadmap revision
      - Agent("roadmap-revise", subagent_type: "lu-pm-planner")
      - For each unplanned todo:
        - IF fits scope of existing incomplete phase → absorb into that phase
        - IF architecturally distinct → propose new phase with goal + deps
        - IF too large for current milestone → flag as milestone-worthy
      - Re-order phases by WSJF priority
      - Propose revision with rationale

    2m. Oversight gate on revision
      - full-auto: auto-approve revision
      - flagged: auto-approve unless milestone-worthy items flagged
      - milestone/phase: present revision proposal, wait for approval

    → Continue to Step 3
```

### Phase 3: Git Workflow Setup

```
Step 3: Create Issue + Branch — CONDITIONAL (skip if --skip-branch)

  3a. Create GitHub issue for milestone/task
  3b. Create feature branch
  3c. Store in context for later PR creation
```

### Phase 4: Build Execution Order

```
Step 4: Build Phase Execution Order (INLINE)

  NOTE: If no incomplete phases found, backfill — trigger Step 2
  (milestone bootstrapping) to create work before continuing.

  - Read ROADMAP.md, parse incomplete phases
  - Build dependency graph, topological sort
  - Apply MAX_PHASES limit
  - IF --dry-run: display plan and RETURN
```

### Phase 5: Phase Execution Loop

```
Step 5: FOR each phase in execution order (serial):

  5a. Dependency check
    - Verify all deps complete
    - IF dep is parked: park this phase too (cascade), continue

  5b. Oversight gate
    - phase: prompt user for Continue/Skip/Stop
    - milestone/flagged/full-auto: auto-continue

  5c. Per-phase complexity classify (controls model tier for this phase's agents)
    - Agent("classify-{NN}")

  5d. Gate resolution (premortem, process_data)

  5d-v2. Research Pipeline (v2 only)
    - Scope → 4 parallel researchers → synthesis → review loop → graduation

  5e. Discussion
    - Agent("discuss-{NN}") with premortem if gated

  5f. Plan existence check
    - IF PLAN.md exists: skip planning

  5g. Planning
    - Agent("plan-{NN}")

  5g-v2. Plan Review Loop (v2 only)
    - plan-review → approve/revise/escalate loop

  ┌─────────────────────────────────────────────────────┐
  │  IMPLEMENTATION LOOP (RESTORED)                      │
  │                                                      │
  │  This is the core execute→verify→fix cycle that      │
  │  ensures work actually meets the phase goal before    │
  │  moving on. Previously lost in the flattening.       │
  │                                                      │
  │  FOR attempt = 1 to MAX_IMPL_ITERATIONS:             │
  │                                                      │
  │    5h. Execution                                     │
  │      Agent("execute-{NN}") — execute wave tasks      │
  │                                                      │
  │    5i. Harness Fix Loop (mechanical correctness)     │
  │      FOR harness_attempt = 1 to HARNESS_FIX_ITERS:   │
  │        Agent("harness-{NN}") — tsc + test            │
  │        IF PASSED: BREAK                              │
  │        Agent("fix-{NN}") — fix errors                │
  │                                                      │
  │    5j. Goal-backward verification                    │
  │      Agent("verify-{NN}") — semantic verification    │
  │                                                      │
  │    5k. Verification outcome routing                  │
  │      IF PASSED: BREAK implementation loop            │
  │      IF GAPS_FOUND AND attempt < MAX:                │
  │        Agent("plan-gaps-{NN}") — plan gap closure    │
  │        Continue loop (re-execute with gap plan)      │
  │      IF GAPS_FOUND AND attempt == MAX:               │
  │        Park phase or escalate per oversight level    │
  │      IF HUMAN_NEEDED:                                │
  │        Pause regardless of oversight                 │
  │                                                      │
  └─────────────────────────────────────────────────────┘

  5l. Code review (parallel reviewers)
    - Agent("review-arch-{NN}")
    - Agent("review-dx-{NN}")
    - Agent("review-security-{NN}")
    - Agent("review-simplify-{NN}")
    - CRITICAL findings → pause regardless of oversight

  5m. Review fix loop (if CRITICAL findings)
    FOR fix_attempt = 1 to REVIEW_FIX_ITERATIONS:
      Agent("fix-review-{NN}") — address critical findings
      Re-run affected reviewers
      IF resolved: BREAK

  5n. Learning capture
    - Agent("learn-{NN}")

  5o. Process data (conditional)
    - Agent("process-data-{NN}")

  5p. Commit (INLINE)
    - git add + commit + push on feature branch

  5q. Update state
    - Mark phase complete in ROADMAP.md
    - Emit PHASE_COMPLETE transition
```

### Phase 6: Milestone Boundary (RESTORED)

```
Step 6: Milestone Boundary Check

  6a. Milestone summary
    - Display phase results table (passed/parked/failed)

  6b. IF all phases passed:
    - Agent("milestone-learn") — extract learnings
    - Agent("milestone-prune") — prune stale memories
    - Agent("milestone-shadow") — shadow debt scan (conditional)
    - Agent("milestone-archive") — archive milestone artifacts
    - Agent("milestone-finalize") — finalize state

  6c. IF some phases parked:
    Oversight-gated decision:
    - full-auto: log gaps, do NOT complete milestone
    - flagged/milestone/phase: present parked phases, offer Retry/Complete-partial/Stop

  6d. Create Pull Request (if feature branch exists)
    - gh pr create with phase summaries
```

### Phase 7: Cross-Milestone Continuation (RESTORED)

```
Step 7: Cross-Milestone Loop — CONDITIONAL

  IF CROSS_MILESTONE config == false: skip to Step 8
  IF milestone was incomplete (parked phases): skip to Step 8

  7a. Check for remaining backlog
    - ls .planning/todos/pending/*.md
    - IF empty AND no more milestones: skip to Step 8

  7b. Safety limit
    - Track milestones completed this session
    - IF > 3: pause regardless of oversight ("3 milestones completed. Continue?")

  7c. Bootstrap next milestone (reuse Step 2 Branch A logic)
    - Gather next milestone goals
    - Run Steps 2b through 2i (full milestone creation)
    - Then run Step 2j-2m (backlog sync for the new roadmap)
    - Loop back to Step 3 (git setup for new milestone)
```

### Phase 8: Session Wrap-up

```
Step 8: Gap Detection Audit + Session Summary + Cleanup
  - Verify all required context sections populated
  - Advisory warning if gaps found
  - Final state transition
  - Display session summary with completed/parked/remaining counts
```

## Implementation Loop — Before vs After

### Before (Current — Broken Ordering)

```
5h. Execute
5i. Harness fix loop
5j. Verify
5k. Code review
5l. Learning
5m. Process data
5n. Commit          ← commits BEFORE gap closure
5o. Update state
5p. Gap closure     ← tries to fix AFTER committing broken code
```

The gap closure retry (5p) runs AFTER the commit (5n). This means we commit potentially incomplete work, then try to fix it. The fix creates another commit on top of broken code.

### After (Proposed — Correct Ordering)

```
FOR attempt = 1 to MAX_IMPL_ITERATIONS:
  5h. Execute
  5i. Harness fix loop (mechanical)
  5j. Verify (semantic)
  5k. IF passed: BREAK
      IF gaps: plan gaps → continue loop
      IF max attempts: park/escalate

5l. Code review     ← only reviews verified-passing code
5m. Review fix loop ← fix critical review findings
5n. Learning        ← captures learnings from clean implementation
5o. Commit          ← commits verified, reviewed code
5p. Update state
```

Key difference: **code review and commit only happen after the implementation loop produces verified-passing code.** No committing broken work.

## Oversight Gate Behavior Matrix (RESTORED)

| Decision Point                 | full-auto      | flagged                | milestone                | phase                     |
| ------------------------------ | -------------- | ---------------------- | ------------------------ | ------------------------- |
| Milestone creation (Step 2A)   | auto-create    | auto-create            | PAUSE: confirm goals     | PAUSE: confirm goals      |
| Roadmap revision (Step 2B)     | auto-approve   | auto-approve           | PAUSE: approve changes   | PAUSE: approve changes    |
| Before each phase (Step 5b)    | continue       | continue               | continue                 | PAUSE: Continue/Skip/Stop |
| Phase gaps/failures (Step 5k)  | park, continue | PAUSE: Retry/Skip/Stop | park, continue           | PAUSE: Retry/Skip/Stop    |
| CRITICAL code review (Step 5l) | PAUSE (safety) | PAUSE                  | PAUSE                    | PAUSE                     |
| Milestone boundary (Step 6)    | auto-complete  | PAUSE if parked        | PAUSE: summary + confirm | PAUSE: summary + confirm  |
| Cross-milestone (Step 7)       | auto-continue  | auto-continue          | PAUSE: confirm next      | PAUSE: confirm next       |

## Implementation Budget Matrix

| Parameter                | TRIVIAL | SIMPLE | MODERATE | COMPLEX | CRITICAL |
| ------------------------ | ------- | ------ | -------- | ------- | -------- |
| MAX_IMPL_ITERATIONS      | 1       | 1      | 2        | 3       | 3        |
| HARNESS_FIX_ITERATIONS   | 1       | 2      | 2        | 2       | 3        |
| REVIEW_FIX_ITERATIONS    | 0       | 1      | 1        | 2       | 2        |
| GAP_RETRIES (deprecated) | —       | —      | —        | —       | —        |

GAP_RETRIES is replaced by MAX_IMPL_ITERATIONS which wraps the full execute→verify cycle.

## New Agent Requirements

| Agent                   | Purpose                             | Exists?                                 |
| ----------------------- | ----------------------------------- | --------------------------------------- |
| lu-pm-planner           | WSJF scoring + roadmap revision     | Yes (exists but unused)                 |
| lu-roadmapper           | Create ROADMAP.md from requirements | Yes (exists, used by /milestone-new)    |
| lu-milestone-researcher | Domain research for milestone scope | Reuse existing 4 specialist researchers |

No new agents needed — the pieces exist, they just need to be wired into the `/lu` pipeline.

## Key Design Decisions to Make

1. **Implementation loop budget:** The proposed MAX_IMPL_ITERATIONS wraps the full cycle. Is 2-3 iterations the right budget, or should COMPLEX/CRITICAL get more?

2. **Cross-milestone safety:** The original autopilot had a 3-milestone safety limit per session. Is that still appropriate, or should it be configurable?

3. **Oversight defaults:** What should the default oversight level be? The autopilot defaulted to "milestone". The current `/lu` effectively runs as "full-auto" within a phase but has no milestone-level gating.

4. **Context window management:** The implementation loop on COMPLEX phases could exhaust context. Should each loop iteration get a fresh agent, or should context be compressed between iterations?

## Open Questions for Research

- What do other agentic frameworks do for multi-phase execution with retry loops?
- How should the implementation loop interact with context window limits?
- What are the best patterns for agentic workflow orchestration with self-correction?
