# `/lu` End-to-End Workflow Specification

> **Date:** 2026-03-31
> **Status:** Final specification
> **Purpose:** Definitive implementation blueprint for the `/lu` orchestrator redesign, incorporating all 10 GSD2 learnings with user-resolved decisions applied.

---

## 1. Design Principles

### Core Principles (Established)

1. **No routing, no skipping.** Every task enters the same structured pipeline regardless of complexity. Complexity controls model tier and loop budgets only -- never which steps run.
2. **Backfill, don't skip.** If a step discovers missing prerequisites (no roadmap, no plan, no milestone), it triggers the upstream steps needed to get into the right state. The pipeline always moves forward.
3. **Flat orchestration.** All Agent() calls originate from the `/lu` orchestrator. Sub-agents are leaf workers -- they cannot spawn agents, tasks, or skills.
4. **Commit only verified code.** The implementation loop (execute -> harness -> verify) must pass before code review or commit happens.

### Principles from GSD2 Learnings

5. **Deterministic over LLM for routing decisions.** Classification, verification aggregation, crash recovery, backlog scanning, process data, and configuration become heuristic/mechanical functions. LLM tokens are reserved for creative work (planning, execution, research, review, discussion, learning).
6. **Structured data over prose.** state.json is the sole source of truth. Verification output is JSON-first. Convergence tracking, drift detection, and milestone validation all read structured data mechanically.
7. **Profile-controlled ceremony.** Token profiles (budget/balanced/quality) control how deeply each step runs. Complexity remains the input signal for model tier selection. Users choose rigor level explicitly.
8. **Convergence-aware loops.** Implementation loops exit on convergence signals (stuck detection, error classification), not just iteration counts. This prevents wasted iterations and provides diagnostic context for parking decisions.
9. **Crash-resilient state.** Pipeline position tracking, lock files, and deterministic recovery eliminate LLM interpretation from crash recovery. The system resumes from structured state, not from inferred context.
10. **Fresh context per unit.** The orchestrator assembles a scoped context payload before each Agent() call. Agents write results to disk and return terse status lines. The orchestrator reads no more than 2K tokens per agent dispatch preparation.

---

## 2. Pipeline Overview

```
Step 0: Parse Args, Crash Recovery, Initialize
Step 1: Cognitive Pre-Flight + Classify
Step 2: Ensure Active Milestone + Roadmap
  Branch A: CREATE (full milestone lifecycle)
  Branch B: SYNC (backlog delta check via WSJF)
Step 3: Git Workflow Setup
Step 4: Build Phase Execution Order
Step 5: Phase Execution Loop (per phase, serial)
  5a: Dependency check
  5b: Oversight gate
  5c: Per-phase complexity classify (deterministic)
  5d: Gate resolution (premortem, process_data)
  5d-v2: Research pipeline (v2 only, profile-gated)
  5e: Discussion (SEPARATE agent, always runs at all profiles)
  5f-g: Planning + plan review
  5h-k: Implementation loop (per-wave execution)
    5h: Execute wave tasks (1 Agent per wave)
    5i: Harness + stuck detection (convergence-aware)
    5j: Goal-backward verification (structured JSON)
    5k: Loop exit evaluation
  5l: Code review (ALL 4 reviewers: arch, dx, security, simplifier)
  5m: Review fix loop
  5n: Learning capture (LLM agent, always runs at all profiles)
  5o: Process data (mechanical TypeScript, no agent)
  5p: Commit + push
  5q: Update state
  5q+: Drift detection (mechanical + conditional LLM)
Step 6: Milestone Boundary Check
Step 7: Cross-Milestone Continuation
Step 8: Session Wrap-up
```

---

## 3. Detailed Pipeline

### Step 0: Parse Args, Crash Recovery, Initialize

```
0a. Parse CLI flags
    - Parse --profile=budget|balanced|quality (default: balanced)
    - Parse --complexity=LEVEL override (if provided, skip classification)
    - Parse standard flags: --skip-branch, --skip-backlog, --oversight=MODE,
      --max-phases=N, --v2, --dry-run, --ask, --force, --skip-review, --skip-uat
    - Parse task description / Jira URL / ticket ID

0b. Crash recovery (deterministic)
    - Check for .planning/.pipeline-lock.json
    - IF lock exists AND PID dead (stale lock):
      - Run deterministic recovery: bun src/recovery/recover.ts
      - Reads: lock file, state.json, git status, filesystem
      - Returns: RecoveryAction JSON:
        { action: "fresh-start" | "restart-step" | "resume-phase" | "advance-phase",
          step?: string, phase?: number, briefing: string }
      - Print recovery briefing to user
      - Jump to resume point (skip completed steps)
    - IF lock exists AND PID alive:
      - Warn: "Another /lu session running (PID $PID)."
      - Exit unless --force
    - IF no lock:
      - Continue to fresh start

0c. Initialize
    - luca-bridge ensure-init (creates state.json only, NOT STATE.md per-transition)
    - Acquire pipeline lock: write .planning/.pipeline-lock.json with:
      { session_id, pid, started_at, pipeline_step: "init", phase_step: null, phase_id: null }
    - Set pipeline_position.current_step = "init" in state.json
    - Set token_profile in state.json from --profile flag or config.json default
    - Initialize context file: bun src/skills/__schemas/context-cli.ts init lu
```

**State transitions:** None (pre-machine).
**Lock update:** `pipeline_step = "init"`

---

### Step 1: Cognitive Pre-Flight + Classify

```
1a. Cognitive Pre-Flight
    - Update lock: pipeline_step = "preflight"
    - Agent("cognition", subagent_type: "lu-cognition", model: ALWAYS_FAST,
        prompt: COGNITION_PROMPT({phase, complexity, vault, currentState}))
    - Agent writes structured context payload to disk:
      /tmp/lu-context-payload.json containing:
      - Project identity summary (from brain tree)
      - Relevant patterns filtered for this task (from MuninnDB)
      - Session context
      - Intuition flags (RISK, CAUTION, OPPORTUNITY, UNKNOWN)
    - Agent output to orchestrator is TERSE (status line only)

1b. Classify (DETERMINISTIC -- no Agent() call)
    - Update lock: pipeline_step = "classify"
    - IF --complexity=LEVEL provided: use override directly
    - ELSE: Run deterministic heuristic:
      RESULT=$(bun src/complexity/__helpers/classify.ts \
        --description="$TASK_DESCRIPTION" \
        --roadmap=".planning/ROADMAP.md" \
        --history=".planning/routing-history.jsonl" \
        2>/dev/null)
    - Returns: { complexity, route, score, signals }
    - Complexity used to index MODEL_ROUTING_TABLE
    - Route determines pipeline branch (phase-execute, quick, debug, pr-address, etc.)
    - For ambiguous routes: LLM fallback Agent() call (rare)

1c. Configure (INLINE -- no Agent() call)
    - Read config.json, set shell variables, resolve profile settings
    - Read workflow version (v1/v2) from config or --v2 flag
    - Deterministic, no LLM

1d. Emit ROUTE_COMPLETE transition
    - luca-bridge transition --event=ROUTE_COMPLETE --data='{"complexity":"LEVEL"}'
    - Store complexity + route + profile in state.json
```

**Agent calls:** 1 (cognition). Classification is deterministic. Configure is inline.
**State transitions:** ROUTE_COMPLETE
**Lock update:** `pipeline_step = "classify"` -> `"configure"`

---

### Step 2: Ensure Active Milestone + Roadmap

Two branches:

#### Branch A (CREATE): No ROADMAP.md -> full milestone lifecycle

```
2a. Inherit current /milestone-new flow as-is:
    - 2b. Load project context (PROJECT.md, milestones/, config.json)
    - 2c. Gather milestone goals (questioning)
    - 2d. Determine version (semver)
    - 2e. Domain research (4 parallel specialists -> synthesis)
    - 2f. Define requirements (user scopes categories -> REQUIREMENTS.md with REQ-IDs)
    - 2g. Create roadmap (lu-roadmapper: requirements -> phases,
           goal-backward success criteria, 100% coverage)
    - 2h. Update project state (reset state machine)
    - 2i. Seed memory (MuninnDB)
    - Falls through to Branch B

NOTE: Milestone bootstrap optimization is deferred to a future milestone.
The existing flow works; it can be streamlined later.
```

#### Branch B (SYNC): ROADMAP.md exists -> backlog delta check

```
2j. Read pending todos (DETERMINISTIC -- no Agent() call)
    - bun src/backlog/scan.ts --todos=".planning/todos/pending/"
    - Scans directory, parses frontmatter, returns structured list

2k. WSJF scoring (LLM agent: lu-pm-planner)
    - Agent("backlog", subagent_type: "lu-pm-planner", model: ORCHESTRATOR,
        prompt: BACKLOG_WSJF_PROMPT({todos, roadmap}))
    - Scores items by business_value, time_criticality, risk_reduction, job_size
    - Returns scored and prioritized list
    - WSJF scoring stays as LLM because it requires judgment about
      business value and time criticality

2l. Roadmap revision if unplanned todos exist
    - If scored items don't fit existing phases: propose new phases or phase modifications
    - Agent produces revised ROADMAP.md section

2m. Oversight-gated approval
    - See Oversight Gate Matrix (Section 6) for behavior per profile/oversight mode
```

**Lock update:** `pipeline_step = "backlog"`

---

### Step 3: Git Workflow Setup

```
3a. Create GitHub issue + feature branch
    - Conditional on --skip-branch (skip if present)
    - Create issue via gh CLI
    - Create and push feature branch
    - Branch naming convention: {version}--{kebab-case} or {ticket}--{kebab-case}

3b. Write git workflow context to state.json:
    luca-bridge set-field --field=git_workflow \
      --value='{"issue_number":N,"issue_url":"URL","branch_name":"BRANCH"}'
```

**Lock update:** `pipeline_step = "git-setup"`

---

### Step 4: Build Phase Execution Order

```
4a. Parse ROADMAP.md
    - Extract incomplete phases
    - Build dependency graph
    - Topological sort
    - Apply --max-phases limit (default from config.json or unlimited)

4b. If no phases found:
    - Backfill: trigger Step 2 (Branch A if no roadmap, Branch B if empty roadmap)

4c. If --dry-run: display plan and RETURN

4d. Store execution order in state.json:
    luca-bridge set-field --field=pipeline_position.remaining_phases --value='[1,2,3]'
```

**Lock update:** `pipeline_step = "phase-order"`

---

### Step 5: Phase Execution Loop (per phase, serial)

```
FOR each phase in execution order:
  Write loop counter to state.json: pipeline_position.loop_index = N

  Emit PHASE_START:
    luca-bridge transition --event=PHASE_START --data='{"phase_id":NN}'
    Update lock: pipeline_step = "phase-loop", phase_id = NN
```

#### 5a. Dependency Check (INLINE)

```
- Verify all phases in this phase's depends_on list are marked complete in ROADMAP.md
- IF any dependency incomplete:
  - Park this phase (mark PARKED in ROADMAP.md)
  - Check for cascade: if dependent phases also depend on this phase, park them too
  - Log: "Phase NN parked: dependency on Phase X not met"
  - CONTINUE to next phase
- Update lock: phase_step = "dependency-check"
```

#### 5b. Oversight Gate (INLINE, interactive)

```
- Read oversight mode from state.json (full-auto | flagged | milestone | phase)
- Read token_profile from state.json
- Consult Oversight Gate Matrix (Section 6) for behavior
- IF gate says PAUSE: prompt user for Continue/Skip/Stop
- IF gate says continue: proceed
- Update lock: phase_step = "oversight-gate"
```

#### 5c. Per-Phase Complexity Classify (DETERMINISTIC -- no Agent() call)

```
- Run deterministic heuristic with phase-specific data:
  PHASE_COMPLEXITY=$(bun src/complexity/__helpers/classify.ts \
    --plan=".planning/phases/${PHASE_DIR}/PLAN.md" \
    --phase=$NN \
    --history=".planning/routing-history.jsonl" \
    2>/dev/null | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.complexity)")
- IF plan does not exist yet: use session-level complexity as default
- Adaptive adjustment from routing history:
  - Cap: max 1 level adjustment (up or down)
  - Window: last 20 entries or current milestone (whichever smaller)
  - User override via --complexity always takes precedence
- Per-phase complexity used for model tier resolution for remaining phase steps
- Update lock: phase_step = "classify"
```

#### 5d. Gate Resolution (INLINE, deterministic)

```
- Resolve gates via luca-bridge gate-check:
  PREMORTEM_GATE=$(luca-bridge gate-check --gate=premortem 2>/dev/null | ...)
  PROCESS_DATA_GATE=$(luca-bridge gate-check --gate=process_data 2>/dev/null | ...)
- Pass flags to sub-steps: --run-premortem / --skip-premortem, etc.
- Fail-closed: absent flag = skip
- Update lock: phase_step = "gates"
```

#### 5d-v2. Research Pipeline (v2 ONLY, profile-gated)

```
Gate: IF WORKFLOW_VERSION != "v2": SKIP to 5e

Profile behavior:
  - budget:   SKIP entirely
  - balanced: 2 researchers (architecture + implementation), no review loop
  - quality:  Full pipeline (4 researchers + review loop + graduation)

Research graduation: stays SEPARATE from synthesis (not merged).

Graceful degradation: if any v2 step fails, log and continue to 5e.

Steps (quality profile, full):
  5d-v2a. Research scope
    Agent("research-scope-{NN}", subagent_type: "lu-phase-researcher", model: ORCHESTRATOR)
  5d-v2b. Parallel research (4 specialists simultaneously)
    Agent("research-arch-{NN}", subagent_type: "lu-architecture-researcher", model: ROUTER)
    Agent("research-impl-{NN}", subagent_type: "lu-implementation-researcher", model: ROUTER)
    Agent("research-eco-{NN}", subagent_type: "lu-ecosystem-researcher", model: ROUTER)
    Agent("research-risk-{NN}", subagent_type: "lu-risk-researcher", model: ROUTER)
  5d-v2c. Research synthesis
    Agent("research-synth-{NN}", subagent_type: "lu-research-synthesizer", model: ORCHESTRATOR)
  5d-v2d. Research review loop (up to 2 iterations for quality profile)
    Agent("review-accuracy-{NN}", ...)
    Agent("review-completeness-{NN}", ...)
    Agent("review-actionability-{NN}", ...)
    IF gaps: Agent("research-expand-{NN}", ...)
  5d-v2e. Research graduation (SEPARATE step, not merged into synthesis)
    Agent("research-graduate-{NN}", subagent_type: "lu-research-graduator", model: ORCHESTRATOR)
    Graduates research findings into phase context for planning

Update lock: phase_step = "research"
```

#### 5e. Discussion (ALWAYS SEPARATE AGENT at ALL profiles)

```
CRITICAL DECISION: Discussion is ALWAYS a separate Agent() call.
It is NEVER merged into planning, NEVER skipped by profile.

Agent("discuss-{NN}", subagent_type: "lu-discuss-researcher", model: ORCHESTRATOR,
  prompt: DISCUSSION_PROMPT({phase: NN, research_context, user_request, ...}))

- Discussion captures user decisions, constraints, and context
- Produces CONTEXT.md in the phase directory
- If --ask flag set: interactive mode with user input
- Update lock: phase_step = "discuss"
```

#### 5f-g. Planning + Plan Review

```
5f. Planning
    Agent("plan-{NN}", subagent_type: "lu-planner", model: ORCHESTRATOR,
      prompt: PLAN_PROMPT({phase: NN, discussion_context, research_summary, ...}))

    Planner MUST include per-task:
    - File count estimate
    - Scope classification (SMALL/MEDIUM/LARGE)
    - Split marker if scope is LARGE (must split or justify)

    Planner MUST include per-wave:
    - Total file count across tasks < 10
    - Wave dependency declarations

    Planner MUST assign criterion IDs to success criteria:
    - SC-1, SC-2, SC-3, ... for each success criterion
    - These IDs are tracked through verification for convergence detection

    Output: PLAN.md with wave-grouped tasks and success criteria

5g. Plan review (v2 only, or quality profile)
    Agent("plan-review-{NN}", subagent_type: "lu-plan-checker", model: ORCHESTRATOR,
      prompt: PLAN_REVIEW_PROMPT({phase: NN, ...}))

    7 verification dimensions (original 6 + task sizing):
    1. Goal alignment
    2. Dependency correctness
    3. Coverage completeness
    4. Feasibility
    5. Risk assessment
    6. Success criteria clarity
    7. TASK SIZING:
       - Flag BLOCKER if any task touches 10+ files
       - Flag WARNING if any task has no file count estimate
       - Validate wave total file count < 10

    IF BLOCKERs found: Agent("plan-revise-{NN}", ...) to fix plan

    Update lock: phase_step = "plan"
```

#### 5h-k. Implementation Loop (Per-Wave Execution)

This is the core execution cycle. See Section 4 for full detail.

```
FOR each wave in PLAN.md (ordered by wave number):
  IF wave has dependencies: verify all dependency waves complete

  5h. Execute wave tasks
      - Orchestrator assembles context payload BEFORE spawning agent (max 2K tokens):
        - Read relevant PLAN.md section (this wave only)
        - Read phase goal from ROADMAP.md
        - Include relevant patterns from cognition payload
        - Include upstream drift info (if any, from Step 5q+)
        - Include research summary (if v2)
      - One Agent() call PER WAVE, not per plan:
        Agent("execute-{NN}-w{WW}", subagent_type: "lu-executor", model: ORCHESTRATOR,
          prompt: EXECUTE_WAVE_PROMPT({wave_tasks, inlined_context}))
      - Overflow detection: if agent outputs OVERFLOW:{task-id}, orchestrator
        spawns fresh Agent() for remaining tasks
      - Agent writes results to disk (SUMMARY file), returns only structured
        status line to orchestrator
      - Update lock: phase_step = "execute"

  5i. Harness + Stuck Detection (CONVERGENCE-AWARE)
      See Section 4 for full convergence loop detail.
      - Update lock: phase_step = "harness"

  5j. Goal-backward verification (STRUCTURED JSON)
      - ONLY runs after harness passes
      - Agent("verify-{NN}", subagent_type: "lu-verifier", model: DEEP_ANALYSIS,
          prompt: GOAL_VERIFY_PROMPT({phase: NN, criteria_ids, ...}))
      - Agent writes verification-result.json:
        { phase, verdict: "passed"|"partial"|"failed",
          criteria_met, criteria_total,
          criteria: [{ criterion_id, description, met, evidence, gap, blocking }],
          blocking_gaps: [...], timestamp, duration_ms }
      - Orchestrator reads JSON for verdict (not prose parsing)
      - Agent optionally writes VERIFICATION.md as human-readable view
      - Track verification convergence across impl loop iterations:
        Compare failing criteria sets between iteration N and N+1
        If same criteria fail: invoke stuck detection with verification context
      - Update lock: phase_step = "verify"

  5k. Implementation loop exit
      - IF all passed (harness + verification): BREAK to code review
      - IF gaps and not stalled: plan gaps with convergence context, loop
        Agent("plan-gaps-{NN}", subagent_type: "lu-planner", model: ORCHESTRATOR, ...)
        Agent("execute-gaps-{NN}", subagent_type: "lu-executor", model: ORCHESTRATOR, ...)
      - IF stalled (convergence failure + stall evaluation says halt): park phase
        luca-bridge transition --event=PHASE_PARK --data='{"phase_id":NN,"reason":"convergence_failure"}'
      - IF max iterations reached (budget exhausted): park/escalate
      - EXIT PRIORITY:
        1. all_passed -> success
        2. convergence_failure (stall + evaluation says halt) -> park
        3. budget_exhausted (iteration hard limit) -> park
        4. soft_stop (80% budget used) -> finish current, don't start new

END per-wave loop
```

#### 5l. Code Review (ALL 4 REVIEWERS -- never consolidated)

```
CRITICAL DECISION: Keep ALL 4 code reviewers. Never consolidate to 2.

Profile behavior for code review:
  - budget:   ALL 4 reviewers still run (code review is always run at all profiles)
  - balanced: ALL 4 reviewers run
  - quality:  ALL 4 reviewers run

4 parallel reviewers:
  Agent("review-arch-{NN}", subagent_type: "code-architect", model: DEEP_ANALYSIS)
  Agent("review-dx-{NN}", subagent_type: "dx-advocate", model: DEEP_ANALYSIS)
  Agent("review-security-{NN}", subagent_type: "security-auditor", model: DEEP_ANALYSIS)
  Agent("review-simplify-{NN}", subagent_type: "code-simplifier", model: DEEP_ANALYSIS)

Reviewers run in parallel, independently, with no cross-pollination.

Update lock: phase_step = "review"
```

#### 5m. Review Fix Loop

```
- IF any reviewer returned CRITICAL findings:
  FOR attempt = 1 to REVIEW_FIX_ITERATIONS:
    Agent("review-fix-{NN}", subagent_type: "lu-executor", model: ORCHESTRATOR,
      prompt: REVIEW_FIX_PROMPT({critical_findings, ...}))
    Re-run affected reviewers to validate fix
    IF no CRITICAL findings remain: BREAK
- Update lock: phase_step = "review-fix"
```

#### 5n. Learning Capture (LLM AGENT -- never mechanical)

```
CRITICAL DECISION: Learning capture stays as LLM agent at ALL profiles.
It is NEVER replaced by mechanical structured JSON append.

Agent("learn-{NN}", subagent_type: "lu-learner", model: FAST_PROMOTED,
  prompt: LEARNING_CAPTURE_PROMPT({phase: NN, verification_result, review_findings, ...}))

- Captures patterns, decisions, and pitfalls from this phase
- Writes to MuninnDB via memory protocol
- LLM judgment is required to identify nuanced learnings

Update lock: phase_step = "learn"
```

#### 5o. Process Data (MECHANICAL -- no Agent() call)

```
DECISION: Process data becomes inline TypeScript, no LLM needed.

bun src/process-data/compute.ts --context=state.json
- Reads context metrics from state.json
- Computes aggregates (duration, error rates, convergence stats)
- Writes structured metrics back to state.json
- Pure data aggregation, zero LLM tokens

Update lock: phase_step = "process-data"
```

#### 5p. Commit + Push

```
- Stage and commit phase changes
- Push to feature branch
- Update lock: phase_step = "commit"
```

#### 5q. Update State

```
- Mark phase complete in ROADMAP.md
- Write phase result to state.json verification_results[]
- Write routing history entry to .planning/routing-history.jsonl:
  { timestamp, phase, initial_complexity, final_complexity, succeeded,
    stalled, harness_iterations, impl_iterations, task_count, file_count,
    keywords_matched }
- Emit PHASE_COMPLETE transition:
  luca-bridge transition --event=PHASE_COMPLETE --data='{"phase_id":NN,"summary":"..."}'
- Update lock: advance to next phase
- Update pipeline_position.loop_index, remaining_phases in state.json
```

#### 5q+. Drift Detection (NEW -- runs after every phase)

```
ALWAYS RUN mechanical check (0 LLM tokens):
  1. git diff --name-only for this phase's changes
  2. Compare against file references in remaining phases (from ROADMAP.md)
  3. Check for deleted/renamed modules referenced by future phases
  4. Check verification verdict for cross-phase impact
  5. Check for dependency graph changes (package.json, tsconfig.json)
  6. Ignore infrastructure files (tsconfig.json, package.json) unless
     structural changes detected

IF drift detected (file overlap, deleted modules, dependency changes):
  - Spawn Agent("reassess-{NN}", subagent_type: "lu-reassessor", model: ROUTER,
      prompt: REASSESS_PROMPT({completed_phase, modified_files, remaining_phases, drift_signals}))
  - Agent returns: per remaining phase:
      VALID | NEEDS_UPDATE | REDUNDANT | BLOCKED
  - IF PHASES_REDUNDANT > 0:
      Mark redundant phases complete (skip them)
      Log: "Phases {list} made redundant by Phase {NN}"
  - IF PHASES_NEED_UPDATE > 0:
      IF oversight == "full-auto": auto-apply updates to ROADMAP.md
      ELSE: PAUSE: show user proposed changes, ask for confirmation
  - IF PHASES_BLOCKED > 0:
      Park blocked phases, check cascade
  - Rebuild phase execution order if needed
  - Drift event recorded in session-ledger.jsonl:
    { event: "DRIFT_DETECTED", phase_id, drift_type, affected_phases, action_taken, result }
  - luca-bridge transition --event=DRIFT_DETECTED --data='{...}'

IF no drift detected: continue to next phase (zero overhead)
```

**END phase loop**

---

### Step 6: Milestone Boundary Check

```
6a. Milestone validation (DETERMINISTIC -- no LLM)
    - Read all verification-result.json files for completed phases
    - Aggregate mechanically:
      { milestone_passed: boolean, phases_passed, phases_total,
        criteria_met, criteria_total, blocking_gaps: [...] }
    - Deterministic verdict: milestone_passed = all phases passed AND no blocking gaps
    - No LLM interpretation needed

6b. IF all passed: milestone completion agents
    - Agent("milestone-learn", subagent_type: "lu-learner", model: FAST_PROMOTED)
      Synthesizes per-phase structured learnings into MuninnDB engrams
    - Agent("milestone-prune", subagent_type: "lu-shadow-scanner", model: FAST_PROMOTED)
    - Agent("milestone-shadow", subagent_type: "lu-shadow-scanner", model: FAST_PROMOTED)
    - Agent("milestone-archive", subagent_type: "lu-learner", model: FAST_PROMOTED)
    - Agent("milestone-finalize", subagent_type: "lu-learner", model: FAST_PROMOTED)

6c. IF parked phases exist: oversight-gated decision
    - See Oversight Gate Matrix for behavior
    - Options: retry parked phases, accept partial milestone, escalate

6d. Create PR if feature branch exists
    - Use gh pr create with milestone summary as body
    - Include structured results (phases passed/parked, criteria coverage)

6e. Archive milestone data
    - Move verification-result.json files to milestones/ directory
    - Write milestone summary to milestones/v{SEMVER}-AUDIT.md
```

**State transitions:** MILESTONE_COMPLETE or MILESTONE_PARTIAL

---

### Step 7: Cross-Milestone Continuation

```
DECISION: FULL STATE RESET between milestones.

7a. Prerequisite check
    - CROSS_MILESTONE must be enabled in config.json
    - Previous milestone must have completed cleanly (all phases passed)
    - Safety limit: max 3 milestones per session

7b. State reset
    - Lock file: released and re-acquired with new session context
    - Routing history: RESET (cleared for new milestone)
    - Pipeline position: RESET to init
    - Milestone data: archived (moved to milestones/ directory)
    - state.json: reset context fields, preserve session_id and git_workflow

7c. Bootstrap next milestone
    - Reuses Step 2 Branch A (full milestone lifecycle)
    - New ROADMAP.md, new phases, fresh planning

7d. Loop back to Step 3
    - New feature branch for new milestone
    - Re-enter Phase Execution Loop
```

---

### Step 8: Session Wrap-up

```
8a. Gap detection audit
    - Scan for incomplete work, unresolved TODOs, parked phases
    - Produce session summary

8b. Session summary
    - Write session summary to session-ledger.jsonl
    - Include: phases completed, phases parked, total duration,
      agent call count, convergence events, drift events

8c. Final state transition
    - luca-bridge transition --event=SESSION_COMPLETE

8d. Release pipeline lock
    - Delete .planning/.pipeline-lock.json

8e. Final memory persistence
    - Persist session context to MuninnDB
    - Write routing history entries for this session
```

---

## 4. Implementation Loop Detail

The implementation loop (Steps 5h-5k) is the most complex part of the pipeline. It combines per-wave execution with convergence-aware stuck detection.

### Per-Wave Execution Model

Each wave in PLAN.md gets its own Agent() call. This ensures each execution unit fits within one agent context window.

```
FOR each wave W in PLAN.md (ordered by wave number):
  IF wave W has dependencies: verify all dependency waves are complete
  IF dependencies not met: BREAK with error (plan should have ordered correctly)
```

### Context Assembly (before each agent dispatch)

The orchestrator assembles a scoped context payload. Max 2K tokens orchestrator-side read.

```
1. Read PLAN.md section for this wave ONLY (extract by wave header)
2. Read phase goal from ROADMAP.md (1-2 line extract, not full file)
3. Read relevant patterns from /tmp/lu-context-payload.json (top 3 by relevance)
4. If drift detected in previous phases: include drift summary
5. If v2 research: include research summary (compressed)
6. Build prompt using template function with inlinedContext parameter
```

### Execution Agent Contract

```
Agent("execute-{NN}-w{WW}", subagent_type: "lu-executor", model: ORCHESTRATOR,
  prompt: EXECUTE_WAVE_PROMPT({
    wave_tasks,          // tasks for this wave only
    inlined_context: {
      phase_goal,        // from ROADMAP.md
      plan_tasks,        // from PLAN.md (this wave)
      research_summary,  // optional, from v2
      relevant_patterns, // from cognition payload
      upstream_changes,  // from drift detection
    }
  }))

OUTPUT CONTRACT (terse, to orchestrator):
  STATUS: complete|partial|overflow
  TASKS_COMPLETED: [task-1, task-2]
  FILES_MODIFIED: [file1.ts, file2.ts]
  OVERFLOW: task-3  (only if overflow detected)

DISK OUTPUT (detailed, for downstream agents):
  .planning/phases/{NN}-{desc}/{WW}-SUMMARY.md

OVERFLOW PROTOCOL:
  If agent detects context exhaustion mid-wave:
    Output OVERFLOW:{task-id} and stop
    Orchestrator spawns fresh Agent() for remaining tasks in that wave
```

### Harness Fix Loop with Convergence Detection

```
INITIALIZE convergence state:
  LEDGER='{}'
  PREV_ERRORS='[]'
  STALE_COUNT=0
  CHECKPOINT_TAG=null

FOR attempt = 1 to HARNESS_FIX_ITERATIONS:

  # Create checkpoint for potential rollback
  CHECKPOINT_TAG="iter-${NN}-${attempt}"
  git tag "$CHECKPOINT_TAG" 2>/dev/null || true

  # 5i-a. Run harness
  Agent("harness-{NN}", subagent_type: "lu-verifier-fast", model: FAST_PROMOTED,
    prompt: HARNESS_CHECK_PROMPT({...}))
  -> writes .planning/harness-result.json

  # 5i-b. Classify errors (DETERMINISTIC, CLI)
  CLASSIFIED=$(bun src/iteration/__helpers/classifier.ts \
    --harness-result="$(cat .planning/harness-result.json)" \
    --ledger="$LEDGER" \
    --promotion-threshold=3)
  LEDGER=<extract updated_ledger from CLASSIFIED>
  CURRENT_ERRORS=<extract classified errors from CLASSIFIED>
  # Errors classified as: transient, correctable, permanent

  # 5i-c. Compute convergence signals (DETERMINISTIC, CLI)
  CONVERGENCE=$(bun src/iteration/__helpers/convergence.ts \
    --current="$CURRENT_ERRORS" \
    --previous="$PREV_ERRORS" \
    --artifact-delta=$(git diff --stat HEAD~1 2>/dev/null | tail -1 | awk '{print $1}' || echo 0) \
    --previous-stale-count=$STALE_COUNT \
    --stale-threshold=2)
  # Returns: { should_halt, status, consecutive_stale, signals: {
  #   fingerprint_overlap, error_count_delta, artifact_change_delta, semantic_overlap } }

  SHOULD_HALT=<extract should_halt>
  STALE_COUNT=<extract consecutive_stale>

  # 5i-d. IF stall detected
  IF SHOULD_HALT:
    STRATEGY=$(bun src/iteration/__helpers/stall-debate.ts \
      --convergence="$CONVERGENCE" \
      --ledger="$LEDGER" \
      --attempt=$attempt \
      --max-attempts=$HARNESS_FIX_ITERATIONS)
    # Returns: { strategy: "halt"|"retry_with_context_promotion"|"retry_with_error_focus"|"retry_with_rollback",
    #            reason: "..." }

    CASE strategy:
      "halt":
        Log: "Stall detected after $attempt iterations. Parking phase."
        Park phase
        BREAK

      "retry_with_context_promotion":
        Promote fix agent model tier (e.g., sonnet -> opus)
        CONTINUE

      "retry_with_error_focus":
        Narrow fix prompt to top correctable errors only
        CONTINUE

      "retry_with_rollback":
        git checkout "$CHECKPOINT_TAG" -- .
        CONTINUE

  # 5i-e. IF all checks passed
  IF harness-result shows all_passed:
    Clean up checkpoint tags
    BREAK (success, proceed to verification)

  # 5i-f. IF errors exist and not stalled
  # Filter to correctable errors only (exclude permanent)
  CORRECTABLE=<filter CURRENT_ERRORS where classification != "permanent">
  IF CORRECTABLE is empty AND permanent errors exist:
    Log: "All remaining errors are permanent. Parking phase."
    Park phase
    BREAK

  Agent("fix-{NN}", subagent_type: "lu-executor", model: ORCHESTRATOR,
    prompt: HARNESS_FIX_PROMPT({
      correctable_errors: CORRECTABLE,
      iteration: attempt,
      previous_attempts: <what was tried before>,
      strategy_hint: <from convergence analysis if available>
    }))

  # 5i-g. Update convergence state
  PREV_ERRORS=$CURRENT_ERRORS

END harness fix loop
```

### Verification Convergence (Outer Loop)

The outer implementation loop (5h-5k) also tracks convergence at the verification level:

```
OUTER CONVERGENCE STATE:
  prev_failing_criteria = Set()
  outer_stale_count = 0

AFTER each verification (Step 5j):
  current_failing = Set(verification_result.criteria.filter(c => !c.met).map(c => c.criterion_id))

  IF prev_failing_criteria is not empty:
    overlap = |current_failing INTERSECT prev_failing_criteria| / |current_failing UNION prev_failing_criteria|
    IF overlap >= 0.8:
      outer_stale_count++
      IF outer_stale_count >= 2:
        Run stall evaluation with verification context
        IF halt: park phase
        IF retry: use gap-close with narrowed focus on persistent criteria

  prev_failing_criteria = current_failing
```

### Stuck Detection Patterns

| Pattern                         | Detection Signal                                            | Response                                           |
| ------------------------------- | ----------------------------------------------------------- | -------------------------------------------------- |
| Harness oscillation (A-B-A-B)   | fingerprint_overlap >= 0.8 AND error_count_delta ~0         | Stall evaluation: context promotion or error focus |
| Unfixable errors (permanent)    | All remaining errors classified permanent                   | Park with diagnostic                               |
| Semantic drift without progress | semantic_overlap >= 0.9 with non-zero artifact_change_delta | Stall evaluation: rollback or halt                 |
| Goal verification stall         | Same criteria_ids failing across outer loop iterations      | Stall evaluation with verification context         |

---

## 5. Milestone Lifecycle

### Bootstrapping (Step 2A)

When no ROADMAP.md exists, the full milestone creation flow runs. This is inherited from the current `/milestone-new` skill:

```
1. Load project context (PROJECT.md, milestones/, config.json)
2. Gather milestone goals (questioning agent - interactive)
3. Determine version (semver based on scope)
4. Domain research (4 parallel research specialists -> synthesis agent)
5. Define requirements (user scopes categories -> REQUIREMENTS.md with REQ-IDs)
6. Create roadmap (lu-roadmapper agent):
   - Requirements -> phases
   - Goal-backward success criteria per phase
   - 100% requirement coverage validation
   - Dependency graph between phases
7. Update project state (reset state machine for new milestone)
8. Seed memory (write milestone context to MuninnDB)
```

This flow is not optimized in this redesign. It works as-is and can be streamlined in a future milestone.

### Completion (Step 6)

```
1. Deterministic validation:
   - Read all verification-result.json files
   - Aggregate: phases_passed, criteria_met, criteria_total, blocking_gaps
   - milestone_passed = (all phases passed) AND (blocking_gaps is empty)

2. IF milestone_passed:
   a. milestone-learn: synthesize per-phase learnings into MuninnDB engrams
   b. milestone-prune: remove obsolete content
   c. milestone-shadow: scan for shadow tech debt
   d. milestone-archive: archive phase artifacts to milestones/
   e. milestone-finalize: update PROJECT.md, version tags, final state

3. IF NOT milestone_passed:
   a. Oversight-gated decision:
      - full-auto: auto-complete if >= 80% criteria met, else park
      - flagged/milestone/phase: PAUSE for user decision
   b. Options: retry parked phases, accept partial, escalate

4. Create PR if feature branch exists
5. Archive milestone data to milestones/v{SEMVER}-*
```

### Cross-Milestone (Step 7)

```
PREREQUISITE:
  - config.json cross_milestone.enabled = true
  - Previous milestone completed cleanly (all phases passed)
  - Session milestone count < 3 (safety limit)

FULL STATE RESET:
  1. Release pipeline lock
  2. Archive current milestone:
     - Move verification results to milestones/
     - Write milestone audit: milestones/v{SEMVER}-MILESTONE-AUDIT.md
  3. RESET routing history (.planning/routing-history.jsonl -> clear or archive)
  4. RESET pipeline position in state.json (back to init)
  5. Re-acquire pipeline lock with fresh session context

BOOTSTRAP NEXT MILESTONE:
  - Jump to Step 2 Branch A (full milestone lifecycle)
  - User is prompted for next milestone goals
  - New ROADMAP.md, new phases, fresh state

LOOP:
  - After Step 2A completes, continue to Step 3 (git setup)
  - New feature branch for new milestone
  - Re-enter Phase Execution Loop (Step 5)
```

---

## 6. Oversight Gate Matrix

The matrix has two axes: oversight mode (rows) and decision point (columns). Token profile modifies behavior as noted.

| Decision Point                | full-auto      | flagged                | milestone      | phase                     |
| ----------------------------- | -------------- | ---------------------- | -------------- | ------------------------- |
| Milestone creation (2A)       | auto-create    | auto-create            | PAUSE: confirm | PAUSE: confirm            |
| WSJF / Roadmap revision (2B)  | auto-approve   | auto-approve           | PAUSE: approve | PAUSE: approve            |
| Before each phase (5b)        | continue       | continue               | continue       | PAUSE: Continue/Skip/Stop |
| Phase gaps (5k)               | park, continue | PAUSE: Retry/Skip/Stop | park, continue | PAUSE: Retry/Skip/Stop    |
| CRITICAL review findings (5l) | PAUSE (safety) | PAUSE                  | PAUSE          | PAUSE                     |
| Drift detected (5q+)          | auto-apply     | PAUSE if update        | auto-apply     | PAUSE                     |
| Milestone boundary (6)        | auto-complete  | PAUSE if parked        | PAUSE: confirm | PAUSE: confirm            |
| Cross-milestone (7)           | auto-continue  | auto-continue          | PAUSE: confirm | PAUSE: confirm            |

**Token profile modifications to the matrix:**

| Decision Point                | budget modifier                      | balanced modifier  | quality modifier                        |
| ----------------------------- | ------------------------------------ | ------------------ | --------------------------------------- |
| Milestone creation (2A)       | no change                            | no change          | no change                               |
| Before each phase (5b)        | no change                            | no change          | no change                               |
| CRITICAL review findings (5l) | no change (CRITICAL always pauses)   | no change          | no change                               |
| Drift detected (5q+)          | auto-apply (regardless of oversight) | per oversight mode | PAUSE (always, regardless of oversight) |

CRITICAL review findings ALWAYS pause regardless of profile or oversight mode. This is a safety gate.

---

## 7. Budget Matrix

### Base Iteration Limits by Complexity

| Parameter              | TRIVIAL | SIMPLE | MODERATE | COMPLEX | CRITICAL |
| ---------------------- | ------- | ------ | -------- | ------- | -------- |
| MAX_IMPL_ITERATIONS    | 1       | 1      | 2        | 3       | 3        |
| HARNESS_FIX_ITERATIONS | 1       | 2      | 2        | 2       | 3        |
| REVIEW_FIX_ITERATIONS  | 0       | 1      | 1        | 2       | 2        |
| Max files per task     | 3       | 5      | 6        | 8       | 8        |
| Max tasks per wave     | 2       | 3      | 4        | 5       | 6        |

### Profile Multipliers Applied to Base Values

| Profile  | Loop budget multiplier | Effective HARNESS_FIX (MODERATE) | Effective MAX_IMPL (COMPLEX) |
| -------- | ---------------------- | -------------------------------- | ---------------------------- |
| budget   | 0.5x (minimum 1)       | max(1, floor(2 \* 0.5)) = 1      | max(1, floor(3 \* 0.5)) = 1  |
| balanced | 1.0x                   | 2                                | 3                            |
| quality  | 2.0x                   | 4                                | 6                            |

**Floor rule:** All iteration limits have a minimum of 1 (never 0 for active loops). REVIEW_FIX_ITERATIONS at TRIVIAL is 0 (code review has no fix loop at TRIVIAL).

### Task Sizing Limits (Not Profile-Modified)

Task sizing limits (max files per task, max tasks per wave) are NOT modified by profile. They are intrinsic constraints based on context window capacity, which does not change with profile.

### Convergence Overrides

Convergence detection can override iteration limits:

- A loop making progress (error count decreasing, new fingerprints) should continue even if iteration budget is at 80%
- A loop that is stalled (same errors, no artifact changes) should stop even if iteration budget remains
- Priority: convergence signals > iteration count > soft stop

---

## 8. State Management

### state.json -- Sole Source of Truth

STATE.md is ELIMINATED ENTIRELY. It is not a derived view. It is not generated on-demand. It is DELETED. `state.json` is the ONLY state file. Humans inspect state via `luca-bridge read-status`.

#### state.json Schema (key fields)

```typescript
interface StateJson {
  status: "active" | "done" | "error";
  value: string; // XState machine state
  context: {
    // Identity
    session_id: string;
    ticket_id: string;

    // Classification
    complexity: "TRIVIAL" | "SIMPLE" | "MODERATE" | "COMPLEX" | "CRITICAL";
    oversight: "full-auto" | "flagged" | "milestone" | "phase";
    token_profile: "budget" | "balanced" | "quality";

    // Pipeline position (enables deterministic crash recovery)
    pipeline_position: {
      current_step:
        | "init"
        | "preflight"
        | "classify"
        | "configure"
        | "git-setup"
        | "backlog"
        | "phase-order"
        | "phase-loop"
        | "milestone"
        | "wrap-up";
      current_phase_step?:
        | "dependency-check"
        | "oversight-gate"
        | "classify"
        | "gates"
        | "research"
        | "discuss"
        | "plan"
        | "plan-review"
        | "execute"
        | "harness"
        | "verify"
        | "review"
        | "review-fix"
        | "learn"
        | "process-data"
        | "commit"
        | "update-state"
        | "drift-check";
      loop_index: number;
      remaining_phases: number[];
      completed_steps: string[];
      started_at: string; // ISO 8601
    };

    // Phase tracking
    current_phase: number;
    current_wave_count: number;
    phase_results: Array<{
      phase_id: number;
      status: "passed" | "parked" | "failed";
      summary: string;
      errors: string[];
      duration_ms: number;
      timestamp: string;
    }>;

    // Structured verification results (replaces VERIFICATION.md reads)
    verification_results: Array<{
      phase_id: number;
      harness: {
        status: "passed" | "failed";
        checks: Array<{
          name: string;
          command: string;
          exit_code: number;
          duration_ms: number;
          error_count: number;
        }>;
        timestamp: string;
      };
      verification: {
        status: "passed" | "partial" | "failed";
        criteria_met: number;
        criteria_total: number;
        blocking_gaps: string[];
        timestamp: string;
      };
    }>;

    // Git workflow context (migrated from /tmp/lu-context.json)
    git_workflow: {
      issue_number?: number;
      issue_url?: string;
      branch_name?: string;
      pr_number?: number;
      pr_url?: string;
      commits: Array<{
        hash: string;
        phase_id: number;
        message: string;
        timestamp: string;
      }>;
    };

    // Intuition and memory
    intuition_flags: string[];
    started_at: string;
    last_transition_at: string;

    // Schema version for forward compatibility
    schema_version: number; // currently 2
  };
}
```

#### Size Management

- Cap `verification_results` to last 3 phases in active state.json
- Archive completed phase data to session-ledger.jsonl at phase boundaries
- session-ledger.jsonl is the full history; state.json is working memory

### Lock File: `.planning/.pipeline-lock.json`

```json
{
  "session_id": "uuid",
  "pid": 12345,
  "started_at": "2026-04-01T12:00:00Z",
  "pipeline_step": "phase-loop",
  "phase_step": "execute",
  "phase_id": 3,
  "lock_acquired_at": "2026-04-01T12:15:00Z"
}
```

**Lifecycle:**

1. Acquired on `/lu` start (Step 0c)
2. Updated on every step transition (via inline bash in orchestrator)
3. Released on clean exit (Step 8d: delete file)
4. Stale detection on next start: check PID liveness + 24-hour staleness threshold

**Why separate from state.json:**

- Updated ~20 times per phase (every sub-step) vs state.json ~5 times per phase
- Small file (< 200 bytes) ensures atomic write reliability
- Deleted on clean exit; state.json persists across sessions
- Answers "is a session running?" (lock) vs "what is the workflow state?" (state.json)

### Routing History: `.planning/routing-history.jsonl`

Append-only JSONL file tracking complexity classification outcomes per phase:

```json
{
  "timestamp": "2026-04-01T12:30:00Z",
  "phase": 3,
  "initial_complexity": "MODERATE",
  "final_complexity": "MODERATE",
  "succeeded": true,
  "stalled": false,
  "harness_iterations": 1,
  "impl_iterations": 1,
  "task_count": 4,
  "file_count": 6,
  "keywords_matched": ["refactor"]
}
```

**Used by:** Deterministic classifier (Step 1b, 5c) for adaptive adjustment.
**Window:** Last 20 entries or current milestone (whichever smaller).
**Reset:** Cleared on cross-milestone boundary (Step 7).

### Eliminated State Artifacts

| Artifact                                         | Status                 | Replacement                                          |
| ------------------------------------------------ | ---------------------- | ---------------------------------------------------- |
| STATE.md                                         | ELIMINATED             | `luca-bridge read-status` for human inspection       |
| /tmp/lu-context.json (pipeline position)         | MIGRATED to state.json | `pipeline_position` field                            |
| /tmp/lu-context.json (git workflow)              | MIGRATED to state.json | `git_workflow` field                                 |
| /tmp/lu-context.json (agent output accumulation) | KEPT as-is             | Ephemeral, session-scoped, not critical for recovery |

---

## 9. Token Profiles

Three profiles control ceremony depth. Discussion, code review, and learning capture ALWAYS run at all profiles per user decisions.

### Profile: `budget`

**Intent:** Ship fast with minimal ceremony. Prototyping, spike work, quick fixes.

| Dimension     | Setting                                                                                                                                                  |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model tier    | Demote all agents one tier EXCEPT: lu-executor (minimum balanced), lu-discuss-researcher (no change), code reviewers (no change), lu-learner (no change) |
| v2 research   | Skipped entirely                                                                                                                                         |
| Code review   | ALL 4 reviewers run (never skipped)                                                                                                                      |
| Discussion    | Runs (ALWAYS separate agent, never skipped)                                                                                                              |
| Learning      | Runs as LLM agent (never mechanical, never skipped)                                                                                                      |
| Verification  | Harness + goal-backward verifier (both always run)                                                                                                       |
| Loop budgets  | 0.5x multiplier (minimum 1)                                                                                                                              |
| Context depth | Minimal inlining: PLAN.md + task description only                                                                                                        |
| Recall depth  | 0-1 MuninnDB entries                                                                                                                                     |

### Profile: `balanced` (DEFAULT)

**Intent:** Default production work. Good quality with reasonable cost. Matches current behavior.

| Dimension     | Setting                                                       |
| ------------- | ------------------------------------------------------------- |
| Model tier    | Use MODEL_ROUTING_TABLE as-is, indexed by complexity          |
| v2 research   | 2 researchers (architecture + implementation), no review loop |
| Code review   | ALL 4 reviewers run                                           |
| Discussion    | Runs (ALWAYS separate agent)                                  |
| Learning      | Runs as LLM agent                                             |
| Verification  | Harness + goal-backward verifier                              |
| Loop budgets  | From complexity matrix (1.0x, no modification)                |
| Context depth | Standard inlining: PLAN.md + relevant source files + research |
| Recall depth  | From complexity matrix (1-3 entries)                          |

### Profile: `quality`

**Intent:** Production releases, critical infrastructure, high-stakes changes.

| Dimension     | Setting                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------- |
| Model tier    | Promote all agents one tier (fast->balanced, balanced->capable, capable->capable)             |
| v2 research   | Full pipeline: 4 researchers + review loop (2 iterations) + graduation                        |
| Code review   | ALL 4 reviewers run                                                                           |
| Discussion    | Runs (ALWAYS separate agent)                                                                  |
| Learning      | Runs as LLM agent                                                                             |
| Verification  | Harness + goal-backward verifier + human review gate at COMPLEX+                              |
| Loop budgets  | 2.0x multiplier on complexity matrix values                                                   |
| Context depth | Deep inlining: PLAN.md + source files + research + related phase summaries + recalled engrams |
| Recall depth  | Unlimited MuninnDB entries                                                                    |

### Profile Modifier Logic

```typescript
function resolveModelWithProfile(
  agentName: string,
  complexity: ComplexityLevel,
  profile: TokenProfile,
): ModelTier {
  const baseTier = resolveModelForAgent(agentName, complexity);

  switch (profile) {
    case "budget":
      // Protected agents: never demote these
      if (
        [
          "lu-executor",
          "lu-discuss-researcher",
          "code-architect",
          "dx-advocate",
          "security-auditor",
          "code-simplifier",
          "lu-learner",
        ].includes(getSubagentType(agentName))
      ) {
        return baseTier; // no change
      }
      return demoteTier(baseTier); // capable->balanced, balanced->fast, fast->fast

    case "balanced":
      return baseTier; // no modification

    case "quality":
      return promoteTier(baseTier); // fast->balanced, balanced->capable, capable->capable
  }
}
```

### What Profiles Do NOT Control

Per user decisions, these dimensions are FIXED regardless of profile:

| Dimension                  | Behavior                      | Rationale                               |
| -------------------------- | ----------------------------- | --------------------------------------- |
| Discussion                 | Always runs as separate agent | User decision: never fold into planning |
| Code reviewers             | All 4 always run              | User decision: never consolidate to 2   |
| Learning capture           | Always LLM agent              | User decision: never make mechanical    |
| Harness verification       | Always runs                   | Core quality gate                       |
| Goal-backward verification | Always runs                   | Core quality gate                       |

---

## 10. Agent Inventory

### Per-Session Agents (fire once)

| Agent Name  | subagent_type | Routing Preset | When            | Produces                                          |
| ----------- | ------------- | -------------- | --------------- | ------------------------------------------------- |
| `cognition` | lu-cognition  | ALWAYS_FAST    | Step 1a, always | /tmp/lu-context-payload.json (structured context) |

**Eliminated per-session agents:**

- `classify` -- replaced by deterministic CLI (Step 1b)
- `configure` -- replaced by inline config read (Step 1c)
- `backlog` (scan only) -- replaced by deterministic TypeScript (Step 2j). WSJF scoring remains as `lu-pm-planner` agent.

### Per-Phase Agents (fire for each phase)

| Agent Name Pattern     | subagent_type         | Routing Preset | When                | Produces                                   |
| ---------------------- | --------------------- | -------------- | ------------------- | ------------------------------------------ |
| `discuss-{NN}`         | lu-discuss-researcher | ORCHESTRATOR   | Step 5e, always     | CONTEXT.md                                 |
| `plan-{NN}`            | lu-planner            | ORCHESTRATOR   | Step 5f, always     | PLAN.md with sized tasks and SC-IDs        |
| `plan-review-{NN}`     | lu-plan-checker       | ORCHESTRATOR   | Step 5g, v2/quality | Review findings, 7 dimensions              |
| `execute-{NN}-w{WW}`   | lu-executor           | ORCHESTRATOR   | Step 5h, per wave   | {WW}-SUMMARY.md, code changes              |
| `harness-{NN}`         | lu-verifier-fast      | FAST_PROMOTED  | Step 5i, always     | harness-result.json                        |
| `verify-{NN}`          | lu-verifier           | DEEP_ANALYSIS  | Step 5j, always     | verification-result.json + VERIFICATION.md |
| `review-arch-{NN}`     | code-architect        | DEEP_ANALYSIS  | Step 5l, always     | Review findings                            |
| `review-dx-{NN}`       | dx-advocate           | DEEP_ANALYSIS  | Step 5l, always     | Review findings                            |
| `review-security-{NN}` | security-auditor      | DEEP_ANALYSIS  | Step 5l, always     | Review findings                            |
| `review-simplify-{NN}` | code-simplifier       | DEEP_ANALYSIS  | Step 5l, always     | Review findings                            |
| `learn-{NN}`           | lu-learner            | FAST_PROMOTED  | Step 5n, always     | MuninnDB engrams                           |

### Conditional Per-Phase Agents

| Agent Name Pattern  | subagent_type | Routing Preset | Condition                | Produces                       |
| ------------------- | ------------- | -------------- | ------------------------ | ------------------------------ |
| `fix-{NN}`          | lu-executor   | ORCHESTRATOR   | Harness fails            | Code fixes                     |
| `plan-revise-{NN}`  | lu-planner    | ORCHESTRATOR   | Plan review BLOCKERs     | Revised PLAN.md                |
| `plan-gaps-{NN}`    | lu-planner    | ORCHESTRATOR   | Verification gaps        | Gap closure plan               |
| `execute-gaps-{NN}` | lu-executor   | ORCHESTRATOR   | Gap closure needed       | Code changes                   |
| `review-fix-{NN}`   | lu-executor   | ORCHESTRATOR   | CRITICAL review findings | Code fixes                     |
| `reassess-{NN}`     | lu-reassessor | ROUTER         | Drift detected (5q+)     | Roadmap update recommendations |

### v2 Research Agents (fire per phase, v2 only, profile-gated)

| Agent Name Pattern          | subagent_type                | Routing Preset | Profile Gate             | Produces             |
| --------------------------- | ---------------------------- | -------------- | ------------------------ | -------------------- |
| `research-scope-{NN}`       | lu-phase-researcher          | ORCHESTRATOR   | balanced+quality         | RESEARCH-SCOPE.md    |
| `research-arch-{NN}`        | lu-architecture-researcher   | ROUTER         | balanced(2 only)+quality | Research findings    |
| `research-impl-{NN}`        | lu-implementation-researcher | ROUTER         | balanced(2 only)+quality | Research findings    |
| `research-eco-{NN}`         | lu-ecosystem-researcher      | ROUTER         | quality only             | Research findings    |
| `research-risk-{NN}`        | lu-risk-researcher           | ROUTER         | quality only             | Research findings    |
| `research-synth-{NN}`       | lu-research-synthesizer      | ORCHESTRATOR   | balanced+quality         | Synthesized findings |
| `review-accuracy-{NN}`      | lu-accuracy-reviewer         | DEEP_ANALYSIS  | quality only             | Review findings      |
| `review-completeness-{NN}`  | lu-completeness-reviewer     | DEEP_ANALYSIS  | quality only             | Review findings      |
| `review-actionability-{NN}` | lu-actionability-reviewer    | DEEP_ANALYSIS  | quality only             | Review findings      |
| `research-expand-{NN}`      | lu-research-synthesizer      | ORCHESTRATOR   | quality only             | Expanded research    |
| `research-graduate-{NN}`    | lu-research-graduator        | ORCHESTRATOR   | quality only             | GRADUATION-REPORT.md |

### Milestone Boundary Agents (fire once per milestone)

| Agent Name           | subagent_type     | Routing Preset | When              | Produces                         |
| -------------------- | ----------------- | -------------- | ----------------- | -------------------------------- |
| `milestone-learn`    | lu-learner        | FAST_PROMOTED  | All phases passed | MuninnDB milestone engrams       |
| `milestone-prune`    | lu-shadow-scanner | FAST_PROMOTED  | All phases passed | Pruned obsolete content          |
| `milestone-shadow`   | lu-shadow-scanner | FAST_PROMOTED  | All phases passed | Shadow debt scan                 |
| `milestone-archive`  | lu-learner        | FAST_PROMOTED  | All phases passed | Archived phase artifacts         |
| `milestone-finalize` | lu-learner        | FAST_PROMOTED  | All phases passed | Updated PROJECT.md, version tags |

### Mechanical Steps (no Agent() call)

| Step                         | Mechanism                                                    | When                    |
| ---------------------------- | ------------------------------------------------------------ | ----------------------- |
| Classification (1b, 5c)      | `bun src/complexity/__helpers/classify.ts`                   | Always                  |
| Configuration (1c)           | Inline bash: read config.json                                | Always                  |
| Backlog scan (2j)            | `bun src/backlog/scan.ts`                                    | Always (when enabled)   |
| Process data (5o)            | `bun src/process-data/compute.ts`                            | Always                  |
| Error classification (5i-b)  | `bun src/iteration/__helpers/classifier.ts`                  | During harness fix loop |
| Convergence detection (5i-c) | `bun src/iteration/__helpers/convergence.ts`                 | During harness fix loop |
| Stall evaluation (5i-d)      | `bun src/iteration/__helpers/stall-debate.ts`                | When stall detected     |
| Drift check (5q+)            | Inline bash: git diff + file comparison                      | After every phase       |
| Milestone validation (6a)    | Deterministic TypeScript: aggregate verification-result.json | Milestone boundary      |
| Crash recovery (0b)          | `bun src/recovery/recover.ts`                                | On crash detection      |

### Agent Count Summary

| Scenario                                         | Per-Phase Agents                                                    | Per-Session Agents       | Total (5-phase milestone) |
| ------------------------------------------------ | ------------------------------------------------------------------- | ------------------------ | ------------------------- |
| Minimal happy path (no fixes, no gaps, no drift) | 11 (discuss + plan + execute + harness + verify + 4 review + learn) | 1 (cognition) + 1 (WSJF) | 57                        |
| Typical (1 fix, no gaps, no drift)               | 12                                                                  | 2                        | 62                        |
| Typical + drift on 1 phase                       | 13 (+ reassess)                                                     | 2                        | 67                        |
| v2 balanced (+ 2 researchers + synth)            | 15                                                                  | 2                        | 77                        |
| v2 quality (full research)                       | 22                                                                  | 2                        | 112                       |
| Worst case (v2 quality, fixes, gaps, drift)      | 30+                                                                 | 2                        | 152+                      |

---

## 11. Implementation Phases

### Phase I: Foundation (Highest value, lowest risk, enables everything else)

**Deliverables:**

1. **Structured state consolidation**
   - Add `pipeline_position`, `git_workflow`, `token_profile`, `schema_version` to WorkflowContext schema
   - Migrate pipeline tracking from /tmp/lu-context.json to state.json
   - Eliminate STATE.md entirely: remove all generation, remove all reads, delete the file
   - Update `luca-bridge` commands: remove dual-write guarantee, remove `snapshot` command
   - Add `luca-bridge read-status` as the sole human inspection interface
   - All skills/agents that grep STATE.md: update to use bridge reads

2. **Deterministic classification**
   - Create `src/complexity/__helpers/classify.ts` with scoring heuristic
   - Input extraction: task count, file count, keyword scan, dependency count
   - CLI entry point for orchestrator invocation
   - Eliminate the classify Agent() calls (session-level + per-phase)
   - Add routing history schema (.planning/routing-history.jsonl)
   - Routing history append path (after each phase in Step 5q)
   - Adaptive adjustment function with 1-level cap and 20-entry window

3. **Lock file for crash recovery**
   - Create `.planning/.pipeline-lock.json` on `/lu` start
   - Update lock at each step transition (inline bash in lu.skill.ts)
   - Stale lock detection: PID check + 24-hour staleness threshold
   - `--force` flag to override stale locks
   - Concurrent session prevention

4. **Token profile configuration**
   - Add `--profile=budget|balanced|quality` CLI flag
   - Add profile config to config.json `profiles` section
   - `balanced` matches current behavior exactly (zero-regression change)
   - Profile-based skip logic for v2 research (budget skips, balanced reduces)
   - Profile stored in state.json for crash recovery
   - NOTE: Discussion, reviewers, and learning are NEVER skipped by profile

**Why first:** Structured state (L9) is the hard prerequisite for crash recovery (L10) and enhances verification (L5), ceremony audit (L7), and profiles (L8). Deterministic classification (L6) is independent with immediate latency and determinism benefits. Lock file prevents concurrent session corruption (a current failure mode). Profiles are additive with zero-regression default.

**Estimated scope:** 5-8 files changed. Schema additions, one new CLI tool, prompt modifications in lu.skill.ts.

---

### Phase II: Verification and Detection (Enables convergence-aware loops)

**Deliverables:**

1. **Structured verification output**
   - Define PhaseVerificationResultSchema and CriterionResultSchema in `src/verification/__schemas/`
   - Update GOAL_VERIFY_PROMPT to write verification-result.json
   - Orchestrator reads JSON for verdict, falls back to prose parsing
   - Planner assigns criterion IDs (SC-1, SC-2, ...) to success criteria
   - Verifier optionally writes VERIFICATION.md as human-readable view
   - Deterministic milestone validation (Step 6a) replaces LLM-based milestone agent reads

2. **Stuck detection wiring**
   - Wire existing `src/iteration/__helpers/classifier.ts` into harness fix loop (5i-b)
   - Wire existing `src/iteration/__helpers/convergence.ts` into harness fix loop (5i-c)
   - Wire existing `src/iteration/__helpers/stall-debate.ts` for stall evaluation (5i-d)
   - Update HARNESS_FIX_PROMPT to accept classified errors (correctable only)
   - Add verification-level convergence tracking to outer implementation loop (5h-5k)
   - Wire checkpoint module for rollback support (5i-d retry_with_rollback)
   - Convergence state persisted for crash recovery

3. **Ceremony reductions (subset -- those not blocked by user decisions)**
   - Merge 1: Classification (already done in Phase I)
   - Merge 5: Process data becomes inline TypeScript (no agent call)
   - Merge 6: Configure becomes inline (already done in Phase I)

   **NOT merged (per user decisions):**
   - Merge 2: Discussion stays separate agent
   - Merge 3: All 4 reviewers kept
   - Merge 4: Learning stays as LLM agent
   - Merge 7: Backlog WSJF scoring stays as LLM agent (scan is deterministic)
   - Merge 8: Research graduation stays separate

**Why second:** Structured verification (L5) enables verification-level convergence tracking (L4). Stuck detection (L4) improves loop behavior with structured verification data. Ceremony reductions reduce surface area for remaining changes.

**Estimated scope:** 8-12 files changed. New schema file, prompt modifications, orchestrator loop restructuring.

---

### Phase III: Context Quality and Drift (Improves output quality)

**Deliverables:**

1. **Fresh context per unit**
   - Define PhaseContextPayload schema
   - Define context tiers (Full/Scoped/Minimal) per agent type:
     - Full: lu-executor, lu-planner (phase goal + plan tasks + patterns + research)
     - Scoped: lu-verifier, code reviewers (phase goal + specific task scope)
     - Minimal: harness checker (phase number + status flags)
     - NOTE: lu-discuss-researcher and lu-learner keep their current context approach (NOT minimal, per user decisions)
   - Update prompt templates to accept inlinedContext parameter
   - Update memoryProtocol() isolation levels per agent
   - Orchestrator assembles context before each Agent() call (max 2K tokens read)

2. **Per-wave execution**
   - Change orchestrator from 1 Agent() per plan to 1 Agent() per wave
   - Add size metadata to PLAN.md format (file count, scope, estimated context)
   - Update planner prompt with sizing constraint instructions
   - Add 7th verification dimension (task sizing) to plan review
   - Add overflow detection protocol to executor prompt
   - Create EXECUTE_WAVE_PROMPT (singular) template

3. **Per-phase reassessment (drift detection)**
   - Implement mechanical drift check (inline bash in orchestrator, Step 5q+)
   - Create reassessment agent prompt (REASSESS_PROMPT, conditional LLM)
   - Add lu-reassessor to agent type mapping (ROUTER preset)
   - Drift detection decision logic in orchestrator
   - Infrastructure file ignore list (tsconfig.json, package.json unless structural change)
   - Drift events recorded in session-ledger.jsonl

**Why third:** These learnings improve quality but are not foundational. Fresh context (L1) benefits from fewer ceremony agents (Phase II). Per-wave execution (L2) benefits from deterministic classification (Phase I). Reassessment (L3) benefits from structured verification (Phase II).

**Estimated scope:** 6-10 files changed. Prompt template architecture changes, planner prompt additions, new drift check logic.

---

### Phase IV: Recovery and Polish (Completes the system)

**Deliverables:**

1. **Deterministic crash recovery**
   - Create `src/recovery/recover.ts` with deterministic recovery algorithm
   - Recovery reads: lock file, state.json, git status, filesystem
   - Returns: RecoveryAction JSON (fresh-start | restart-step | resume-phase | advance-phase)
   - Integration with lu.skill.ts Step 0 (recovery replaces LLM interpretation)
   - Recovery briefing generation for cognitive pre-flight
   - Add `luca-bridge recover` command (runs recover.ts, returns JSON)
   - Add `luca-bridge lock-status` command (returns lock file contents or "unlocked")

2. **Token profile full integration**
   - Wire profile modifiers into resolveModelForAgent() via resolveModelWithProfile()
   - Profile-based loop budget multipliers
   - Profile stored in state.json (already done in Phase I)
   - Print active profile at session start
   - Include profile in commit messages ("budget profile: ...")
   - Warn if complexity=COMPLEX/CRITICAL and profile=budget

3. **Cross-milestone support**
   - Implement full state reset between milestones (Step 7)
   - Lock file release and re-acquisition
   - Routing history reset
   - Milestone archival to milestones/ directory
   - Safety limit: max 3 milestones per session

**Why last:** Crash recovery (L10) has a hard dependency on structured state (Phase I) and benefits from structured verification (Phase II). Full profile integration builds on the Phase I foundation. Cross-milestone is a future feature that builds on everything else.

**Estimated scope:** 4-6 files changed. Recovery module, bridge command additions, profile integration.

---

## Appendix A: Migration Notes

### Files to Create

| File                                                 | Phase | Purpose                             |
| ---------------------------------------------------- | ----- | ----------------------------------- |
| `src/complexity/__helpers/classify.ts`               | I     | Deterministic complexity classifier |
| `src/recovery/recover.ts`                            | IV    | Deterministic crash recovery        |
| `src/process-data/compute.ts`                        | II    | Mechanical process data computation |
| `src/backlog/scan.ts`                                | I     | Deterministic backlog scanner       |
| `src/verification/__schemas/verification.schemas.ts` | II    | PhaseVerificationResult schema      |

### Files to Modify

| File                                          | Phase  | Changes                                                            |
| --------------------------------------------- | ------ | ------------------------------------------------------------------ |
| `src/skills/luca/lu.skill.ts`                 | I-IV   | All pipeline changes (the orchestrator prompt)                     |
| `src/skills/__helpers/agent-prompts.ts`       | II-III | Verification prompt, executor prompt (per-wave), context tiers     |
| `src/state/types.ts` (WorkflowContext)        | I      | Add pipeline_position, git_workflow, token_profile, schema_version |
| `src/complexity/__helpers/model-routing.ts`   | IV     | Add resolveModelWithProfile()                                      |
| `packages/luca-framework/src/state/bridge.ts` | I      | Remove dual-write, remove STATE.md generation                      |

### Files to Delete

| File                 | Phase | Reason                                            |
| -------------------- | ----- | ------------------------------------------------- |
| `.planning/STATE.md` | I     | Eliminated entirely. Not a derived view. DELETED. |

### Backward Compatibility

- All STATE.md grep fallbacks in skills/agents must be migrated to bridge reads BEFORE STATE.md deletion
- `balanced` profile = current behavior exactly (zero regression)
- Deterministic classification with LLM fallback for ambiguous routes ensures no misrouting regression
- Structured verification writes JSON alongside optional VERIFICATION.md (Phase II), then makes prose optional (Phase III)

---

## Appendix B: Decision Log

Decisions made by the user after reviewing all contradictions, findings, and gaps from the synthesis document. These decisions are BINDING and must not be revisited without explicit user approval.

| ID  | Decision                                                                      | Rationale                                                              |
| --- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| D1  | Classification becomes deterministic TypeScript heuristic (Merge 1 ACCEPTED)  | Well-defined criteria, sub-ms execution, deterministic                 |
| D2  | Discussion stays SEPARATE agent at all profiles (Merge 2 REJECTED)            | Discussion needs dedicated context, never fold into planning           |
| D3  | Keep ALL 4 code reviewers (Merge 3 REJECTED)                                  | Maximum review coverage, parallel execution is acceptable              |
| D4  | Learning capture stays as LLM agent (Merge 4 REJECTED)                        | LLM judgment needed for nuanced pattern/pitfall identification         |
| D5  | Process data becomes mechanical TypeScript (Merge 5 ACCEPTED)                 | Pure data aggregation, zero LLM value-add                              |
| D6  | Configure becomes inline (Merge 6 ACCEPTED)                                   | Config reading is deterministic                                        |
| D7  | Backlog WSJF scoring stays as LLM agent (Merge 7 REJECTED)                    | WSJF requires judgment about business value                            |
| D8  | Research graduation stays separate from synthesis (Merge 8 REJECTED)          | Separate concerns, separate context                                    |
| D9  | STATE.md ELIMINATED ENTIRELY                                                  | Not a derived view, not on-demand. DELETED. state.json is sole source. |
| D10 | Adaptive routing history: 1-level cap, 20-entry window, --complexity override | Bounded adaptive learning, user escape valve                           |
| D11 | Orchestrator context read: 2K tokens max per agent dispatch                   | Prevents orchestrator context exhaustion                               |
| D12 | Cross-milestone: FULL STATE RESET                                             | Lock releases, routing resets, milestone archived, fresh start         |
| D13 | Milestone bootstrap: inherit current flow, optimize later                     | Working flow, defer optimization                                       |
| D14 | Hook interaction: no changes needed                                           | Hooks are independent of pipeline redesign                             |
| D15 | Reviewer context sharing: keep parallel/independent                           | Cross-pollination requires sequential execution, doubles latency       |
