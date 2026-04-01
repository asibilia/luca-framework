# Workflow Redesign Synthesis

> **Date:** 2026-03-31
> **Status:** Complete
> **Purpose:** Cross-document synthesis of all 10 GSD2 learning research files, producing a unified view of the revised pipeline, dependency ordering, contradictions, gaps, risks, and implementation phases.

---

## 1. Contradictions

### Contradiction 1: Per-Wave Execution vs Ceremony Reduction

**Documents:** Learning 2 (task-sizing-constraint) vs Learning 7 (pipeline-ceremony-audit)

**Conflict:** Learning 2 recommends spawning one Agent() call per wave instead of one per plan, which increases the number of Agent() calls. Learning 7's entire thesis is that Luca spawns too many agents and should reduce ceremony overhead. Per-wave execution directly increases agent count.

**Resolution:** These are not truly contradictory -- they optimize different axes. Learning 7 reduces ceremony (agents that add process but not value), while Learning 2 increases execution precision (agents that do the actual work). The net effect depends on plan structure: a 1-wave plan (common for TRIVIAL/SIMPLE) sees no increase. A 3-wave plan adds 2 execution calls but eliminates 6 ceremony calls (from Learning 7 merges). The math favors adoption of both: ceremony reduction saves more calls than per-wave execution adds. Accept both. Monitor total agent count per milestone to validate.

### Contradiction 2: Discussion as Separate Agent vs Merged into Planning

**Documents:** Learning 7 (Merge 2: fold discussion into planning) vs Learning 8 (quality profile keeps discussion separate)

**Conflict:** Learning 7 proposes merging discussion into planning to eliminate 1 agent call per phase. Learning 8's quality profile explicitly keeps discussion as a separate agent for "dedicated context for user decisions and constraints."

**Resolution:** No actual contradiction. The profile system resolves this. Budget profile: skip discussion entirely. Balanced profile: merge discussion into the planning prompt (Learning 7 Merge 2). Quality profile: keep discussion as a separate agent. The merge is the default behavior; the quality profile's separate agent is an opt-in upgrade. Document this as a profile-controlled dimension, not a fixed architectural decision.

### Contradiction 3: Routing History for Adaptive Classification vs Deterministic Classification

**Documents:** Learning 6 (deterministic-classification)

**Internal tension:** Learning 6 recommends both "sub-millisecond deterministic heuristics" AND "adaptive learning from routing history." The adaptive adjustment reads a JSONL file and applies corrections based on past outcomes. This is still deterministic (no LLM), but it introduces statefulness and potential instability (one bad entry could cascade into worse routing for similar tasks).

**Resolution:** Keep adaptive learning but bound its influence. The routing history should apply a maximum of one complexity level of adjustment (up or down). A MODERATE task can be promoted to COMPLEX but never to CRITICAL by history alone. Cap the history window (last 20 entries or current milestone, whichever is smaller) to prevent stale history from dominating. The user can always override with `--complexity=LEVEL`.

### Contradiction 4: STATE.md Elimination Timeline

**Documents:** Learning 5 (structured verification, proposes 3-phase STATE.md elimination) vs Learning 9 (structured state, proposes 2-phase STATE.md transition with "Option A: on-demand derived view")

**Conflict:** Learning 5 proposes an eventual Phase 3 where "STATE.md is no longer generated" and "state.json is the sole source of truth." Learning 9 recommends Option A where STATE.md continues to exist as an on-demand derived view. These are different end states.

**Resolution:** Adopt Learning 9's Option A as the permanent end state. STATE.md is valuable for human inspection in file browsers and PR reviews. The cost of generating it on-demand (session start/end, explicit `luca-bridge snapshot`) is negligible. Never generate it per-transition, never read it programmatically, but do not eliminate it entirely. Update Learning 5's Phase 3 to match: STATE.md becomes an on-demand derived view, not eliminated.

### Contradiction 5: Context Inlining vs Orchestrator Context Accumulation

**Documents:** Learning 1 (fresh-context-per-unit) vs Learning 2 (task-sizing-constraint)

**Tension:** Learning 1 says the orchestrator should read artifacts and inline them into agent prompts. But the orchestrator IS an LLM, and reading artifacts accumulates tokens in its own context window. Learning 2 says tasks must fit in one context window. If the orchestrator reads a 5K PLAN.md to build a prompt, those 5K tokens stay in the orchestrator's context forever.

**Resolution:** Both documents acknowledge this tension. The resolution is the "write results to disk, not to output" pattern from Learning 1 Section 2: agents write to files, the orchestrator reads only the minimum needed to build the next prompt and captures only structured status output (not verbose prose). The orchestrator should extract sections, not cat entire files. The practical limit is that the orchestrator should read no more than ~2K tokens per agent dispatch preparation. Document this as a hard constraint in the orchestrator design guidelines.

---

## 2. Dependencies and Ordering

### Dependency Graph

```
Learning 9 (Structured State)
  |
  +---> Learning 10 (Crash Recovery)       [HARD dependency: needs pipeline_position in state.json]
  |
  +---> Learning 5 (Structured Verification) [SOFT dependency: shares "data not documents" principle]
  |
  +---> Learning 8 (Token Profiles)        [SOFT dependency: profile stored in state.json]

Learning 6 (Deterministic Classification)
  |
  +---> Learning 7 (Ceremony Audit, Merge 1) [ENABLES: classification agent elimination]
  |
  +---> Learning 8 (Token Profiles, Phase 3) [ENABLES: complexity as input to profiles]

Learning 5 (Structured Verification)
  |
  +---> Learning 4 (Stuck Detection)       [ENABLES: verification-level convergence tracking]

Learning 7 (Ceremony Audit)
  |
  +---> Learning 1 (Fresh Context)         [ENABLES: fewer agents means fewer prompts to assemble]
  |
  +---> Learning 8 (Token Profiles)        [COMPLEMENTARY: profiles control conditional agents]

Learning 2 (Task Sizing)
  |
  +---> Learning 1 (Fresh Context)         [COUPLED: context budget constrains task size]

Learning 3 (Per-Phase Reassessment)
  |
  (no hard dependencies -- can be implemented independently)
  |
  +---> Learning 5 (Structured Verification) [ENHANCES: mechanical drift check reads structured data]
  +---> Learning 9 (Structured State)       [ENHANCES: drift events stored as structured state]
```

### Implementation Ordering (topological)

1. **Learning 9** (Structured State) -- foundational, enables 10, enhances 5/7/8
2. **Learning 6** (Deterministic Classification) -- independent, enables 7 Merge 1
3. **Learning 5** (Structured Verification) -- depends on 9 for full value, enables 4
4. **Learning 7** (Ceremony Audit merges) -- depends on 6 for Merge 1
5. **Learning 4** (Stuck Detection) -- depends on 5 for verification convergence
6. **Learning 10** (Crash Recovery) -- hard depends on 9
7. **Learning 1** (Fresh Context) -- benefits from 7 (fewer prompts to build)
8. **Learning 2** (Task Sizing) -- coupled with 1, benefits from 6
9. **Learning 3** (Per-Phase Reassessment) -- independent, benefits from 5/9
10. **Learning 8** (Token Profiles) -- depends on 6/7 for full value, reads from 9

---

## 3. The Revised Pipeline

Below is the proposed pipeline from `01-proposed-pipeline.md` with all 10 learnings applied. Changes are annotated with `[L#]` references.

### Step 0: Parse Args, Crash Recovery, Initialize

```
0a. Parse CLI flags
    - NEW [L8]: Parse --profile=budget|balanced|quality (default: balanced)
    - NEW [L6]: Parse --complexity=LEVEL override (if provided, skip classification)

0b. Crash recovery [L10]
    - Check for .planning/.pipeline-lock.json
    - IF lock exists AND PID dead (stale lock):
      - Run deterministic recovery: bun src/recovery/recover.ts
      - Reads: lock file, state.json, git status, filesystem
      - Returns: RecoveryAction JSON (fresh-start | restart-step | resume-phase | advance-phase)
      - Print recovery briefing to user
      - Jump to resume point (skip completed steps)
    - IF lock exists AND PID alive:
      - Warn: "Another /lu session running." Exit unless --force.
    - IF no lock:
      - Continue to fresh start

0c. Initialize [L9]
    - luca-bridge ensure-init (creates state.json, NOT STATE.md per-transition)
    - Acquire pipeline lock: write .planning/.pipeline-lock.json with PID + timestamp
    - Set pipeline_position.current_step = "init" in state.json
    - Set token_profile in state.json from --profile flag or config.json
```

**Changes from original:**

- Lock file acquisition [L10]
- Deterministic recovery algorithm replaces LLM interpretation [L10]
- Token profile parsing [L8]
- Pipeline position tracking begins [L9]
- No STATE.md generation at init [L9]

### Step 1: Cognitive Pre-Flight + Classify

```
1a. Cognitive Pre-Flight [L1]
    - Update lock: pipeline_step = "preflight"
    - Agent("cognition") -> recall brain tree, semantic recall, intuition flags
    - NEW [L1]: Cognition agent writes a structured context payload to
      /tmp/lu-context.json (or state.json pipeline context) containing:
      - Project identity summary
      - Relevant patterns filtered for this task
      - Session context from MuninnDB
    - Agent output is TERSE (status line only, not verbose summary)
    - Detailed context written to disk for downstream prompts

1b. Classify [L6]
    - Update lock: pipeline_step = "classify"
    - CHANGED [L6]: No Agent() call. Run deterministic heuristic:
      bun src/complexity/__helpers/classify.ts
        --description="$TASK_DESCRIPTION"
        --roadmap=".planning/ROADMAP.md"
        --history=".planning/routing-history.jsonl"
    - Returns: { complexity, route, score, signals }
    - Complexity used to index MODEL_ROUTING_TABLE
    - Route determines pipeline branch (phase-execute, quick, debug, etc.)
    - FALLBACK [L6]: For ambiguous routes, keep LLM fallback

1c. Emit ROUTE_COMPLETE transition
    - luca-bridge transition --event=ROUTE_COMPLETE
    - Store complexity + route + profile in state.json
```

**Changes from original:**

- Cognition agent produces structured context payload, not just intuition flags [L1]
- Classification agent eliminated, replaced by CLI heuristic [L6]
- Route classification is heuristic-first with LLM fallback [L6]
- Step 1 drops from 2 Agent() calls to 1

### Step 2: Ensure Active Milestone + Roadmap

```
Branch A (CREATE): No roadmap -> full milestone lifecycle
  2b-2i: Unchanged from original (questioning, research, requirements, roadmap)
  - NOTE [L8]: In budget profile, research step (2e) runs 2 specialists instead of 4

Branch B (SYNC): Roadmap exists -> backlog delta check
  2j. Read pending todos [L7]
      - CHANGED [L7]: No Agent("backlog") call. Replaced with deterministic
        TypeScript function: scan todos/pending/, parse frontmatter, return list.
        bun src/backlog/scan.ts --todos=".planning/todos/pending/"
  2k. WSJF scoring [L7]
      - Can remain deterministic (score from frontmatter fields) or LLM if judgment needed
  2l. Roadmap revision if unplanned todos exist
  2m. Oversight-gated approval
```

**Changes from original:**

- Backlog scan becomes deterministic [L7, Merge 7]
- Research depth in Branch A is profile-gated [L8]

### Step 3: Git Workflow Setup

```
3a. Create GitHub issue + feature branch (conditional on --skip-branch)
3b. NEW [L9]: Write git workflow context to state.json:
    luca-bridge set-field --field=git_workflow --value='{"issue_number":N,"branch_name":"..."}'
```

**Changes from original:**

- Git workflow context stored in state.json instead of /tmp/lu-context.json [L9]

### Step 4: Build Phase Execution Order

```
4a. Parse ROADMAP.md, dependency graph, topological sort, apply MAX_PHASES
4b. If no phases found, backfill -> trigger Step 2
4c. NEW [L7]: Configuration step is inline (no Agent("configure") call)
    - Read config.json, set shell variables, resolve profile settings
    - CHANGED [L7, Merge 6]: Deterministic, no LLM
```

**Changes from original:**

- Configure agent eliminated, replaced by inline config read [L7, Merge 6]

### Step 5: Phase Execution Loop (per phase, serial)

```
FOR each phase in execution order:

  5a. Dependency check [unchanged]
      - Park if blocked (cascade)
      - Update lock: pipeline_step = "dependency-check", phase_id = N

  5b. Oversight gate [unchanged, L8 adds profile awareness]
      - Profile-aware: budget profile auto-continues all gates except CRITICAL review

  5c. Per-phase complexity classify [L6]
      - CHANGED [L6]: No Agent("classify-{NN}") call. Deterministic heuristic:
        bun src/complexity/__helpers/classify.ts --plan="PLAN.md path" --phase=N
      - Per-phase classification uses plan data (task count, file count) for precision
      - Write result to routing-history.jsonl after phase completes

  5d. Gate resolution (premortem, process_data) [unchanged]

  5d-v2. Research pipeline [L7, L8]
      - CHANGED [L8]: Profile-gated:
        - budget: SKIP entirely
        - balanced: 2 researchers (architecture + implementation), no review loop
        - quality: full pipeline (4 researchers + review loop + graduation)
      - CHANGED [L7, Merge 8]: Research graduation merged into synthesis agent

  5e. Discussion [L7, L8]
      - CHANGED [L7, Merge 2]: Profile-gated:
        - budget: SKIP
        - balanced: Merged into planning prompt (discussion context is a section,
          not a separate agent call)
        - quality: Separate Agent("discuss-{NN}") call

  5f-g. Planning [L2]
      - Planning prompt includes discussion context (if balanced profile) [L7]
      - ADDED [L2]: Planner must include task size metadata:
        - File count estimate per task
        - Scope classification (SMALL/MEDIUM/LARGE)
        - Split marker if scope is LARGE
      - ADDED [L2]: Wave grouping becomes the sizing unit. Total file count per wave < 10.
      - ADDED [L2]: Planner assigns criterion IDs (SC-1, SC-2, ...) to success criteria [L5]

  5g-v2. Plan review [L2]
      - ADDED [L2]: 7th verification dimension: task sizing
        - Flag BLOCKER if any task touches 10+ files
        - Flag WARNING if any task has no file count estimate
        - Validate wave total file count < 10

  5h-k. IMPLEMENTATION LOOP [L2, L4, L5]

      CHANGED [L2]: Per-wave execution instead of per-plan.

      FOR each wave in PLAN.md (ordered by wave number):
        IF wave has dependencies: verify all dependencies complete

        5h. Execute wave tasks [L1, L2]
            - Update lock: phase_step = "execute"
            - CHANGED [L1]: Orchestrator assembles context payload BEFORE spawning agent:
              - Read relevant PLAN.md section (this wave only)
              - Read phase goal from ROADMAP.md
              - Include relevant patterns from cognition payload
              - Include upstream drift info (if any, from Step 5q+)
              - Include research summary (if v2)
            - CHANGED [L2]: One Agent() call PER WAVE, not per plan
              Agent(name: "execute-{NN}-w{WW}", prompt: EXECUTE_WAVE_PROMPT({
                wave_tasks, inlined_context
              }))
            - ADDED [L2]: Agent includes overflow detection protocol:
              If context overflow detected, output OVERFLOW:{task-id} and stop.
              Orchestrator spawns fresh Agent() for remaining tasks.
            - CHANGED [L1]: Agent writes results to disk (SUMMARY file), returns
              only structured status line to orchestrator

        5i. Harness + Stuck Detection [L4, L5]
            - Update lock: phase_step = "harness"

            INITIALIZE convergence state: [L4]
              ledger = {}, prev_errors = [], stale_count = 0

            FOR attempt = 1 to HARNESS_FIX_ITERATIONS:
              5i-a. Run harness agent -> harness-result.json [unchanged]
              5i-b. Classify errors [L4]:
                     bun src/iteration/__helpers/classifier.ts
                       --harness-result="$(cat .planning/harness-result.json)"
                       --ledger="$LEDGER"
                     Returns: classified errors + updated ledger
              5i-c. Compute convergence signals [L4]:
                     bun src/iteration/__helpers/convergence.ts
                       --current="$CURRENT_ERRORS"
                       --previous="$PREV_ERRORS"
                       --artifact-delta=$(git diff --stat ...)
                       --previous-stale-count=$STALE_COUNT
                     Returns: convergence result (should_halt, strategy)
              5i-d. IF stall detected [L4]:
                     Evaluate stall debate -> strategy
                     - halt: park phase, BREAK
                     - retry_with_context_promotion: promote model tier, CONTINUE
                     - retry_with_error_focus: narrow fix prompt, CONTINUE
                     - retry_with_rollback: git checkout to checkpoint, CONTINUE
              5i-e. IF passed: BREAK
              5i-f. IF errors and not stalled [L4]:
                     Spawn fix agent with ONLY correctable errors (not permanent)
                     Fix agent receives: classified errors, iteration history,
                     what was attempted before
              5i-g. Update convergence state, advance budget

            EXIT PRIORITY [L4]:
              1. all_passed -> success
              2. convergence_failure (stall + debate says halt) -> park
              3. budget_exhausted (iteration hard limit) -> park
              4. soft_stop (80% budget used) -> finish current, don't start new

        5j. Goal-backward verification [L5]
            - Update lock: phase_step = "verify"
            - ONLY runs after harness passes [unchanged]
            - CHANGED [L5]: Verifier agent writes verification-result.json:
              { phase, verdict, criteria_met, criteria_total, criteria: [...],
                blocking_gaps: [...], timestamp, duration_ms }
            - CHANGED [L5]: Orchestrator reads JSON for verdict (not prose parsing)
            - OPTIONAL [L5]: Verifier also writes VERIFICATION.md as human-readable view
            - ADDED [L4]: Track verification convergence across impl loop iterations:
              Compare failing criteria sets. If same criteria fail in N and N+1,
              invoke stall debate with verification context.

        5k. Implementation loop exit [L4]
            - IF all passed (harness + verification) -> BREAK to code review
            - IF gaps and not stalled -> plan gaps with convergence context, loop
            - IF stalled or max iterations -> park/escalate

      END per-wave loop

  5l. Code review [L7, L8]
      - Update lock: phase_step = "review"
      - CHANGED [L7, L8]: Profile-gated:
        - budget: SKIP entirely (pre-commit hooks still catch mechanical errors)
        - balanced: 2 consolidated reviewers [L7, Merge 3]:
          - review-structure-{NN}: architecture + simplification
          - review-safety-{NN}: security + DX
        - quality: 4 separate reviewers (original behavior)

  5m. Review fix loop [unchanged except profile-gated]
      - budget: N/A (no review)
      - balanced/quality: CRITICAL findings trigger fix loop

  5n. Learning capture [L7]
      - CHANGED [L7, Merge 4]: Profile-gated:
        - budget: Mechanical only (structured JSON append, no Agent() call)
        - balanced: Mechanical only per-phase; LLM learning at milestone boundary
        - quality: Full LLM Agent("learn-{NN}") call per phase

  5o. Process data [L7]
      - CHANGED [L7, Merge 5]: No Agent() call at any profile level.
        Replaced with inline TypeScript:
        bun src/process-data/compute.ts --context=state.json
        Writes structured metrics to state.json. Pure data aggregation.

  5p. Commit + push [unchanged]
      - Update lock: phase_step = "commit"

  5q. Update state [L9]
      - Mark phase complete in ROADMAP.md
      - Write phase result to state.json verification_results[] [L5, L9]
      - Write routing history entry to routing-history.jsonl [L6]
      - Emit PHASE_COMPLETE transition
      - Update lock: advance to next phase

  5q+. Drift Detection (NEW) [L3]
      - ALWAYS RUN mechanical check (0 LLM tokens):
        1. git diff --name-only for this phase's changes
        2. Compare against file references in remaining phases
        3. Check for deleted/renamed modules referenced by future phases
        4. Check verification verdict for cross-phase impact
        5. Check for dependency graph changes (package.json, tsconfig)
      - IF drift detected:
        - Spawn Agent("reassess-{NN}") to evaluate roadmap validity [L3]
        - Agent returns: PHASES_VALID/PHASES_NEED_UPDATE/PHASES_REDUNDANT/PHASES_BLOCKED
        - Mark redundant phases complete (skip them)
        - Flag phases needing update for re-planning
        - Park blocked phases
        - Rebuild phase execution order if needed
        - Drift event recorded in session-ledger.jsonl [L9]
      - IF no drift: continue to next phase (zero overhead)

END phase loop
```

**Summary of per-phase changes:**

| Step           | Original agents | Revised agents (balanced) | Change        |
| -------------- | --------------- | ------------------------- | ------------- |
| Classification | 1 (LLM)         | 0 (deterministic)         | -1 [L6]       |
| Discussion     | 1               | 0 (merged into planning)  | -1 [L7]       |
| Planning       | 1               | 1                         | 0             |
| Execution      | 1 (per plan)    | 1-3 (per wave)            | +0 to +2 [L2] |
| Harness        | 1               | 1                         | 0             |
| Verification   | 1               | 1                         | 0             |
| Code review    | 4               | 2                         | -2 [L7]       |
| Learning       | 1               | 0 (mechanical)            | -1 [L7]       |
| Process data   | 1               | 0 (mechanical)            | -1 [L7]       |
| Drift check    | 0               | 0-1 (conditional)         | +0 to +1 [L3] |
| **Total**      | **12**          | **6-9**                   | **-3 to -6**  |

### Step 6: Milestone Boundary Check [L5]

```
6a. Milestone validation [L5]
    - CHANGED [L5]: Deterministic validation, no LLM:
      Read all verification-result.json files for completed phases
      Aggregate: phases_passed, criteria_met, criteria_total, blocking_gaps
      Deterministic verdict: milestone_passed = all phases passed
    - This replaces LLM-based milestone agents reading prose summaries

6b. If all passed: milestone completion agents
    - milestone-learn (LLM: synthesizes per-phase structured learnings into MuninnDB engrams)
    - milestone-prune, milestone-shadow, milestone-archive, milestone-finalize [unchanged]
    - CHANGED [L7]: These 5 agents could be reduced to 3 in a future ceremony audit

6c. If parked phases: oversight-gated decision [unchanged]

6d. Create PR if feature branch exists [unchanged]

6e. NEW [L9]: Generate STATE.md snapshot on demand:
    luca-bridge snapshot
```

### Step 7: Cross-Milestone Continuation [unchanged]

### Step 8: Session Wrap-up

```
8a. Gap detection audit [unchanged]
8b. Session summary [unchanged]
8c. Final state transition [unchanged]
8d. NEW [L10]: Release pipeline lock (delete .planning/.pipeline-lock.json)
8e. NEW [L9]: Generate final STATE.md snapshot: luca-bridge snapshot
```

### Oversight Gate Behavior Matrix (revised)

The original matrix is augmented with the token profile dimension [L8]:

| Decision Point          | budget          | balanced (full-auto) | balanced (flagged) | quality (any oversight) |
| ----------------------- | --------------- | -------------------- | ------------------ | ----------------------- |
| Milestone creation (2A) | auto-create     | auto-create          | auto-create        | PAUSE: confirm          |
| Roadmap revision (2B)   | auto-approve    | auto-approve         | auto-approve       | PAUSE: approve          |
| Before each phase (5b)  | continue        | continue             | continue           | PAUSE: C/S/Stop         |
| Phase gaps (5k)         | park, continue  | park, continue       | PAUSE: R/S/Stop    | PAUSE: R/S/Stop         |
| CRITICAL review (5l)    | N/A (no review) | PAUSE (safety)       | PAUSE              | PAUSE                   |
| Drift detected (5q+)    | auto-apply      | auto-apply           | PAUSE if update    | PAUSE                   |
| Milestone boundary (6)  | auto-complete   | auto-complete        | PAUSE if parked    | PAUSE: confirm          |

### Implementation Budget Matrix (revised with profile multipliers) [L8]

| Parameter               | TRIVIAL | SIMPLE | MODERATE | COMPLEX | CRITICAL | Profile multiplier        |
| ----------------------- | ------- | ------ | -------- | ------- | -------- | ------------------------- |
| MAX_IMPL_ITERATIONS     | 1       | 1      | 2        | 3       | 3        | budget: 0.5x, quality: 2x |
| HARNESS_FIX_ITERATIONS  | 1       | 2      | 2        | 2       | 3        | budget: 0.5x, quality: 2x |
| REVIEW_FIX_ITERATIONS   | 0       | 1      | 1        | 2       | 2        | budget: 0x, quality: 2x   |
| Max files per task [L2] | 3       | 5      | 6        | 8       | 8        | --                        |
| Max tasks per wave [L2] | 2       | 3      | 4        | 5       | 6        | --                        |

---

## 4. Gaps

### Gap 1: Milestone Bootstrap (Step 2, Branch A) Not Covered by Any Learning

None of the 10 learnings address the milestone bootstrap lifecycle (questioning, research, requirements, roadmap creation). This is one of the capabilities lost in the flattening (per `00-overview.md`). The research pipeline (v2) touches research methodology but not the milestone-level research-to-requirements-to-roadmap flow.

**Impact:** The revised pipeline inherits the original proposal's Step 2 Branch A without improvement. This is the longest step in the pipeline and the most token-intensive. It likely benefits from profile gating (budget: minimal questioning, skip domain research) and context assembly (Learning 1) but no research document analyzes it.

**Recommendation:** Add a follow-up research item: "Milestone bootstrap ceremony audit." Analyze whether the questioning + 4-specialist research + requirements + roadmapping flow can be streamlined, especially under budget profile.

### Gap 2: Cross-Milestone Continuation (Step 7) Not Analyzed

Step 7 (cross-milestone continuation) was listed as lost capability but no learning addresses how it should work in the revised pipeline. Should crash recovery (Learning 10) preserve cross-milestone state? Should the lock file span milestones? Should the routing history reset between milestones?

**Impact:** Low for initial implementation (cross-milestone is a future feature), but the state schema design (Learning 9) should anticipate it.

**Recommendation:** Add a `milestone_history` field to state.json that tracks completed milestones in the current session. The lock file should persist across milestones within a session. Routing history should persist across milestones (it is already scoped to recent entries).

### Gap 3: WSJF Scoring Mechanism Not Detailed

Step 2k (WSJF scoring) is mentioned in the original pipeline and referenced in Learning 7's backlog merge, but no learning analyzes how WSJF scoring should work in the revised system. Is it deterministic (read frontmatter scores) or LLM-based (score based on description)? The ceremony audit (Learning 7) suggests making backlog scanning deterministic, but WSJF scoring involves judgment about business value and time criticality.

**Recommendation:** WSJF scoring should be a hybrid: read existing scores from todo frontmatter (deterministic), flag items without scores for LLM scoring (conditional). This matches the Learning 3 hybrid pattern (mechanical check always, LLM only when flagged).

### Gap 4: Pre-Commit Hook Interaction Not Addressed

The pipeline has hooks (post-edit-typecheck, pre-commit-gate) that run alongside the pipeline. None of the 10 learnings address how these hooks interact with the revised pipeline. For example: if the harness is restructured (Learning 5), do the hooks need to change? If stuck detection (Learning 4) parks a phase, should the pre-commit hook still allow commits for other files?

**Recommendation:** Hooks are independent of the pipeline redesign. They fire on tool events (Edit, Write) and git events (commit), not on pipeline steps. No changes needed, but document the boundary: hooks are enforcement mechanisms, the pipeline is the workflow. They do not interact directly.

### Gap 5: Agent Prompt Template Architecture Not Fully Specified

Learning 1 proposes context tiers (Full/Scoped/Minimal) and inlined context blocks. Learning 7 proposes merging discussion into planning prompts. Learning 2 proposes per-wave execution prompts. These all require changes to agent-prompts.ts, but no research document provides a unified view of the prompt template architecture. How do the templates compose? Which templates are eliminated? Which gain new parameters?

**Recommendation:** Create a prompt template specification document that lists every active template, its context tier, its profile behavior, and its inputs. This is a follow-up specification task, not a research gap that blocks implementation.

### Gap 6: Parallel Reviewer Context Sharing

Learning 7 proposes consolidating 4 reviewers to 2. The original 4 reviewers run in parallel with no cross-pollination (noted in MEMORY.md's "Debate Pattern Opportunities"). The research does not address whether the 2 consolidated reviewers should share context or run independently. If `review-structure` and `review-safety` run in parallel (the default), they cannot see each other's findings.

**Recommendation:** Keep reviewers parallel and independent. Cross-pollination requires sequential execution, which doubles review latency. The review fix loop (Step 5m) handles conflicting findings by presenting all findings to the fix agent. This is the existing pattern and works.

---

## 5. Risk Assessment

### Risk 1: Cascading Regression from Simultaneous Changes (Blast Radius: HIGH)

**What could go wrong:** Implementing all 10 learnings simultaneously touches nearly every step of the pipeline. A bug in structured state (Learning 9) could break crash recovery (Learning 10), which could prevent session resumption, which could cause work loss.

**Blast radius:** If state.json schema migration corrupts existing state files, all in-progress milestones are affected. Recovery requires manual state.json repair or deletion (losing progress).

**Mitigation:** Implement in phases (see Section 6). Each phase must be independently testable. state.json schema changes must be backward-compatible (new fields with defaults, not changed fields). Add a `schema_version` field to state.json and validate on read.

### Risk 2: Deterministic Classification Misroutes (Blast Radius: MODERATE)

**What could go wrong:** The heuristic classifier (Learning 6) systematically misclassifies a category of tasks. For example, tasks described with short descriptions but touching many files get classified as TRIVIAL when they are actually COMPLEX. This causes underbudgeted execution (wrong model tier, too few iterations).

**Blast radius:** Per-phase. A misclassified phase gets a weaker model and fewer retry iterations. The phase may park or produce lower-quality output.

**Mitigation:** The `--complexity=LEVEL` override is the escape valve. Routing history provides adaptive correction over time. Per-phase re-classification (from plan data) is more precise than initial classification. Start with conservative thresholds that bias toward higher complexity (better to over-budget than under-budget).

### Risk 3: Structured Verification JSON Quality (Blast Radius: MODERATE)

**What could go wrong:** The verifier agent (an LLM) writes invalid JSON to verification-result.json. The orchestrator's `safeParse` fails, and the prose fallback path is exercised. But if the prose fallback is deprioritized or removed, the pipeline has no verification data.

**Blast radius:** Per-phase. Verification data is lost for one phase. Milestone validation falls back to LLM interpretation (current behavior). Convergence tracking for the outer loop (Learning 4) is unavailable.

**Mitigation:** Always maintain the prose fallback path. Use Zod `safeParse` with comprehensive defaults. Test the verifier prompt extensively to ensure JSON output reliability. Consider a post-agent JSON validation step that re-prompts the agent if JSON is malformed (a single retry, not a loop).

### Risk 4: Orchestrator Context Window Exhaustion Accelerated (Blast Radius: HIGH)

**What could go wrong:** The revised pipeline adds convergence tracking, drift detection, and context assembly to the orchestrator's responsibilities. These additions increase the orchestrator's context consumption. If the orchestrator hits the context limit earlier, more sessions crash, triggering crash recovery (which adds more context on restart).

**Blast radius:** Session-level. Context exhaustion kills the session. With crash recovery (Learning 10), the user can resume, but the resumed session starts with recovery briefing context overhead.

**Mitigation:** Aggressively minimize orchestrator context growth. CLI tools (classifier, convergence, recovery) run outside the LLM context. Agent output contracts are terse. Drift detection is inline bash (no LLM output to accumulate). The ceremony reduction (Learning 7) removes 3-6 agent calls per phase, each of which would have added output to the orchestrator's context. Net effect should be neutral or positive.

### Risk 5: Profile Misconfiguration Creates Silent Quality Degradation (Blast Radius: MODERATE)

**What could go wrong:** A user sets `budget` profile for work that needs `balanced` or `quality`. Code review is skipped, verification is harness-only, and a design flaw ships. The user does not realize the profile caused the quality drop because the pipeline "succeeded."

**Blast radius:** Per-session. Flawed code is committed and pushed. Requires manual review to catch.

**Mitigation:** Print the active profile at session start. Include profile in commit messages ("budget profile: review skipped"). Add a profile recommendation based on complexity: if heuristic classification returns COMPLEX or CRITICAL, warn the user if profile is `budget`. Do not auto-override -- the user chose budget deliberately.

---

## 6. Implementation Phases

### Phase I: Foundation (Highest value, lowest risk, enables everything else)

**Deliverables:**

1. **Structured state consolidation [L9]**
   - Add `pipeline_position`, `git_workflow`, `token_profile` to WorkflowContext schema
   - Migrate pipeline tracking from /tmp/lu-context.json to state.json
   - Stop regenerating STATE.md on every transition (session start/end only)
   - Add `schema_version` field to state.json

2. **Deterministic classification [L6]**
   - Create `src/complexity/__helpers/classify.ts` with scoring heuristic
   - Add CLI entry point for orchestrator invocation
   - Eliminate the classify Agent() calls (session-level + per-phase)
   - Add routing history schema and append path

3. **Lock file for crash recovery [L10 Phase 1]**
   - Create `.planning/.pipeline-lock.json` on `/lu` start
   - Update lock at each step transition
   - Stale lock detection + `--force` flag
   - Concurrent session prevention

4. **Token profile configuration [L8 Phase 1]**
   - Add `--profile=budget|balanced|quality` CLI flag
   - Add profile config to config.json
   - `balanced` matches current behavior exactly (no regression)
   - Profile-based skip logic for discussion, review, research

**Why first:** Learning 9 is the hard prerequisite for Learning 10 and enhances Learnings 5, 7, and 8. Learning 6 is independent with immediate latency and determinism benefits. The lock file is low-cost and prevents concurrent session corruption (a current failure mode). Token profiles are additive with no-regression default.

**Estimated scope:** 5-8 files changed. Schema additions, one new CLI tool, prompt modifications in lu.skill.ts.

### Phase II: Verification and Detection (Enables convergence-aware loops)

**Deliverables:**

1. **Structured verification output [L5]**
   - Define PhaseVerificationResultSchema and CriterionResultSchema
   - Update GOAL_VERIFY_PROMPT to write verification-result.json
   - Orchestrator reads JSON for verdict, falls back to prose
   - Planner assigns criterion IDs (SC-1, SC-2, ...) to success criteria
   - Deterministic milestone validation (replace LLM-based milestone agents for validation step)

2. **Stuck detection wiring [L4]**
   - Wire classifier + convergence CLI tools into harness fix loop
   - Update HARNESS_FIX_PROMPT to accept classified errors
   - Add convergence tracking to outer implementation loop (verification convergence)
   - Wire checkpoint module for rollback support
   - Convergence state in context file for crash recovery

3. **Ceremony audit merges [L7]**
   - Merge 1: Classification (already done in Phase I)
   - Merge 2: Discussion into planning (balanced profile)
   - Merge 3: Consolidate 4 reviewers to 2
   - Merge 4: Learning capture becomes mechanical per-phase
   - Merge 5: Process data becomes inline TypeScript
   - Merge 6: Configure becomes inline (already done in Phase I)
   - Merge 7: Backlog scan becomes deterministic

**Why second:** Structured verification (L5) enables verification-level convergence tracking (L4). Ceremony merges (L7) reduce the surface area for the remaining changes. Stuck detection (L4) improves loop behavior but requires structured verification data.

**Estimated scope:** 8-12 files changed. New schema file, prompt modifications, orchestrator loop restructuring.

### Phase III: Context Quality and Drift (Improves output quality)

**Deliverables:**

1. **Fresh context per unit [L1]**
   - Define PhaseContextPayload schema
   - Define context tiers (Full/Scoped/Minimal) per agent type
   - Update prompt templates to accept inlinedContext parameter
   - Update memoryProtocol() isolation levels per agent
   - Orchestrator assembles context before each Agent() call

2. **Task sizing constraint [L2]**
   - Add size metadata to PLAN.md format (file count, scope, estimated context)
   - Update planner prompt with sizing constraint instructions
   - Add 7th verification dimension to plan review
   - Change orchestrator to per-wave execution (one Agent() per wave)
   - Add overflow detection protocol to executor prompt

3. **Per-phase reassessment [L3]**
   - Implement mechanical drift check (inline bash in orchestrator)
   - Create reassessment agent prompt (conditional, LLM)
   - Drift detection decision logic in orchestrator
   - Infrastructure file ignore list (tsconfig.json, package.json)
   - Drift events recorded in session ledger

**Why third:** These learnings improve quality but are not foundational. Fresh context (L1) benefits from fewer agents (L7, done in Phase II). Task sizing (L2) benefits from deterministic classification (L6, done in Phase I). Reassessment (L3) benefits from structured verification (L5, done in Phase II).

**Estimated scope:** 6-10 files changed. Prompt template architecture changes, planner prompt additions, new drift check logic.

### Phase IV: Recovery and Polish (Completes the system)

**Deliverables:**

1. **Deterministic crash recovery [L10 Phases 2-3]**
   - Create `src/recovery/recover.ts` with deterministic recovery algorithm
   - Recovery reads: lock file, state.json, git status, filesystem
   - Returns: RecoveryAction JSON
   - Integration with lu.skill.ts Step 0 (recovery replaces LLM interpretation)
   - Recovery briefing generation for cognitive pre-flight
   - Add `luca-bridge recover` and `luca-bridge lock-status` commands

2. **Token profile full integration [L8 Phases 2-4]**
   - Wire profile modifiers into resolveModelForAgent()
   - Profile-based loop budget multipliers
   - Profile stored in state.json for crash recovery
   - Deprecate per-phase re-classification (already eliminated)

3. **STATE.md migration completion [L9 Phase 2]**
   - Add verification_results to state.json
   - Migrate remaining STATE.md grep fallbacks to bridge reads
   - STATE.md becomes on-demand derived view only
   - Remove dual-write guarantee from bridge

**Why last:** Crash recovery (L10) has a hard dependency on structured state (L9, done in Phase I) and benefits from structured verification (L5, done in Phase II). Full profile integration builds on the foundation from Phase I. STATE.md migration completion is low-risk cleanup that can be done after all skills are using the bridge.

**Estimated scope:** 4-6 files changed. Recovery module, bridge command additions, profile integration.

---

## Summary

The 10 GSD2 learnings are largely complementary and form a coherent redesign when synthesized. The key architectural shifts are:

1. **Deterministic over LLM for routing decisions.** Classification, verification aggregation, crash recovery, and backlog scanning become heuristic functions, reserving LLM tokens for creative work (planning, execution, research, review).

2. **Structured data over prose.** state.json replaces STATE.md as the sole source of truth. Verification output becomes JSON-first. Convergence tracking, drift detection, and milestone validation all read structured data mechanically.

3. **Profile-controlled ceremony.** Token profiles (budget/balanced/quality) replace complexity as the primary control axis for ceremony depth. Complexity remains the input signal for model tier selection. Users choose rigor level explicitly.

4. **Convergence-aware loops.** Implementation loops exit on convergence signals (stuck detection, error classification), not just iteration counts. This prevents wasted iterations and provides diagnostic context for parking decisions.

5. **Crash-resilient state.** Pipeline position tracking, lock files, and deterministic recovery eliminate LLM interpretation from crash recovery. The system resumes from structured state, not from inferred context.

The four implementation phases are ordered to maximize value delivery and minimize risk at each step, with each phase building on the foundation laid by previous phases.
