# Step 8: Review Plan

## Purpose

The Review Plan step subjects PLAN.md files to independent evaluation by fresh reviewer agents in cold isolation, using a convergence-based loop. This is the planning counterpart to Step 5 (Review Research). While Step 5 ensures research quality, Step 8 ensures plan quality -- verifying that plans will actually achieve the phase goal when executed.

In v1, plan review was handled by a single `lu-plan-checker` agent with a fixed iteration count (1-3 based on complexity). In v2, plan review uses the same 3 reviewer agents at all complexity levels (`code-architect`, `dx-advocate`, `security-auditor` per Decision 2) with a gap-severity convergence model (BLOCKING/ADVISORY findings per Decision 3) and iteration budgets from Decision 14. See [`05-review-loops/plan-review-protocol.md`](../05-review-loops/plan-review-protocol.md) for the canonical plan review specification.

## Inputs

| Input           | Source                                       | Description                                    |
| --------------- | -------------------------------------------- | ---------------------------------------------- |
| PLAN.md files   | Step 7                                       | Plans with tasks, @research refs, must_haves   |
| Research corpus | `.planning/phases/{NN}-{name}/research/*.md` | For cross-referencing @research annotations    |
| CONTEXT.md      | Step 3                                       | Locked decisions (plans must respect these)    |
| PREMORTEM.md    | Step 3 (if exists)                           | Risk scenarios (plans must mitigate these)     |
| ROADMAP.md      | Project state                                | Phase goal (plans must cover all requirements) |
| Complexity      | STATE.md                                     | Determines reviewer count and iteration budget |

## Process

### 8.1 Determine review configuration

Review configuration uses 3 reviewers at all complexity levels (Decision 13) with iteration budgets from Decision 14. The convergence model follows the gap-severity model from [`05-review-loops/convergence-criteria.md`](../05-review-loops/convergence-criteria.md) -- findings are classified as BLOCKING or ADVISORY, not scored numerically.

| Complexity | Reviewers | Max Iterations | Convergence Criteria                            |
| ---------- | --------- | -------------- | ----------------------------------------------- |
| TRIVIAL    | 3         | 1              | 0 BLOCKING findings                             |
| SIMPLE     | 3         | 1              | 0 BLOCKING findings                             |
| MODERATE   | 3         | 2              | 0 BLOCKING findings                             |
| COMPLEX    | 3         | 2              | 0 BLOCKING findings                             |
| CRITICAL   | 3         | 3              | 0 BLOCKING findings, unanimous across reviewers |

**Note:** The `planReviewLoop.maxIterations` value from `.planning/config.json` is the iteration cap (Decision 9, Decision 14). Complexity affects model tier and iteration budget, not reviewer count.

### 8.2 Spawn plan reviewer agents (cold isolation)

Three reviewer agents (`code-architect`, `dx-advocate`, `security-auditor` per Decision 2) evaluate plans using the gap-severity model. Each reviewer uses the DEEP_ANALYSIS preset (Decision 10). Reviewers produce findings classified as BLOCKING or ADVISORY, with reviewer-prefixed IDs (matching the gap ID format from Decision 8).

```python
# Spawn ALL 3 plan reviewers in PARALLEL (cold isolation)
Task(
  prompt="""
  <review_context>
  **Role:** Plan architecture reviewer
  **Isolation:** Cold (no session context, no planner notes)

  **Plans to review:**
  {content of all PLAN.md files in phase directory}

  **Research corpus:** {list of all research files -- available for cross-reference}
  **CONTEXT.md:** {locked decisions}
  **PREMORTEM.md:** {risk scenarios}
  **ROADMAP.md phase goal:** {phase goal}
  </review_context>

  <evaluation_focus>
  Evaluate plans for:
  1. **Requirement coverage**: Do plans cover ALL phase requirements from ROADMAP.md?
  2. **Dependency correctness**: Are wave assignments and dependencies valid and acyclic?
  3. **Key links planned**: Are artifacts wired together, not just created in isolation?
  4. **Scope sanity**: 2-3 tasks/plan ideal; 5+ is a BLOCKING finding
  5. **Research coverage**: Does every task have @research annotations pointing to correct files?
  </evaluation_focus>

  <output_format>
  Return findings as:
    G-ARCH-001: [severity: BLOCKING] Description of issue, plan, task, and fix
    G-ARCH-002: [severity: ADVISORY] Description of issue, plan, task, and fix
  Only report actual issues found. No numeric scores.
  </output_format>
  """,
  subagent_type="code-architect",
  description="Plan review: architecture (Reviewer 1)"
)

Task(
  prompt="""
  <review_context>
  **Role:** Plan DX reviewer
  **Isolation:** Cold (no session context, no planner notes)
  {same plan content, research corpus, CONTEXT.md, PREMORTEM.md, ROADMAP.md}
  </review_context>

  <evaluation_focus>
  Evaluate plans for:
  1. **Task completeness**: Does every task have files, action, verify, done?
  2. **Verification derivation**: Do must_haves trace back to phase goal?
  3. **Risk mitigation**: Does the plan address all PREMORTEM scenarios explicitly?
  4. **Convention compliance**: Do plans follow project conventions and patterns?
  </evaluation_focus>

  <output_format>
  Return findings as:
    G-DX-001: [severity: BLOCKING] Description...
    G-DX-002: [severity: ADVISORY] Description...
  </output_format>
  """,
  subagent_type="dx-advocate",
  description="Plan review: DX (Reviewer 2)"
)

Task(
  prompt="""
  <review_context>
  **Role:** Plan security reviewer
  **Isolation:** Cold (no session context, no planner notes)
  {same plan content, research corpus, CONTEXT.md, PREMORTEM.md, ROADMAP.md}
  </review_context>

  <evaluation_focus>
  Evaluate plans for:
  1. **Security risk mitigation**: Are PREMORTEM security scenarios addressed?
  2. **@research annotation accuracy**: Do annotations point to correct research files and sections?
  3. **Input validation**: Do tasks handling external data plan for validation?
  4. **Error handling**: Do tasks plan for failure modes identified in research?
  </evaluation_focus>

  <output_format>
  Return findings as:
    G-SEC-001: [severity: BLOCKING] Description...
    G-SEC-002: [severity: ADVISORY] Description...
  </output_format>
  """,
  subagent_type="security-auditor",
  description="Plan review: security (Reviewer 3)"
)
```

### 8.3 Collect review results

Each reviewer returns gap-severity findings with reviewer-prefixed IDs:

```yaml
code-architect:
  findings:
    - id: "G-ARCH-001"
      severity: ADVISORY
      plan: "08-03"
      task: 1
      issue: "Plan 03 Task 1 creates UI indicator component but no task wires it to the reconnection manager's state change events."
      fix: "Add action step: subscribe to reconnection manager state events and update indicator"

dx-advocate:
  findings:
    - id: "G-DX-001"
      severity: ADVISORY
      plan: "08-02"
      task: 2
      issue: "PREMORTEM Scenario 1 (heartbeat false positives) addressed but no explicit test for adaptive timeout. Task action mentions EWMA but does not specify threshold adjustment logic."
      fix: "Add explicit action step: implement EWMA calculation in heartbeat timer callback"

security-auditor:
  findings: [] # No issues found
```

### 8.4 Evaluate convergence

Convergence uses the gap-severity model from [`05-review-loops/convergence-criteria.md`](../05-review-loops/convergence-criteria.md):

- Loop continues while any **BLOCKING** findings remain
- Loop MAY continue for **ADVISORY** findings if iteration < max (configurable via `planReviewLoop.continueForImportant`, default: true)
- Loop stops when 0 BLOCKING + 0 ADVISORY, or max iterations reached

**Current state (MODERATE, max 2 iterations):**

- code-architect: 0 BLOCKING, 1 ADVISORY -- CONVERGED
- dx-advocate: 0 BLOCKING, 1 ADVISORY -- CONVERGED
- security-auditor: 0 BLOCKING, 0 ADVISORY -- CONVERGED

All reviewers converged (0 BLOCKING findings). ADVISORY findings are passed to the planner for optional improvement but do not block.

### 8.5 Handle warnings (optional revision)

If converged with warnings only, the orchestrator can:

1. **Accept with warnings**: Proceed to execution, warnings noted for executor
2. **Quick revision**: Spawn planner to address warnings before execution

At MODERATE complexity, warnings are typically accepted (fixes can be addressed during execution). At COMPLEX/CRITICAL, warnings trigger a revision cycle.

### 8.6 Convergence achieved

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca > PLAN REVIEW CONVERGED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Iteration: 1 of 2
Reviewers: 3 (code-architect, dx-advocate, security-auditor)

Findings:
  BLOCKING: 0
  ADVISORY: 2
    G-ARCH-001: Plan 03 Task 1 -- UI indicator not wired to state events
    G-DX-001:   Plan 02 Task 2 -- EWMA threshold adjustment not explicit

Status: CONVERGED (0 BLOCKING)

Plans:
  08-01-PLAN.md (Wave 1): Core state machine + backoff -- 3 tasks
  08-02-PLAN.md (Wave 1): Heartbeat mechanism -- 2 tasks
  08-03-PLAN.md (Wave 2): Server integration + UX -- 3 tasks

Proceed to Execute? [Y/n]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 8.7 Revision cycle (if needed)

If NOT converged, send blockers and revision requests back to `lu-planner`:

```python
Task(
  prompt="""
  <revision_context>
  **Plans:** {plan files}
  **Issues to fix:**
  {aggregated blockers and revision requests from all reviewers}

  Revise the plans to address these issues. Preserve @research annotations.
  Write updated PLAN.md files.
  </revision_context>
  """,
  subagent_type="lu-planner",
  description="Revise plans (iteration {N})"
)
```

After revision, spawn **fresh** reviewers (new instances) for re-evaluation.

## Outputs

| Output                      | Location                                    | Description                                         |
| --------------------------- | ------------------------------------------- | --------------------------------------------------- |
| Review findings             | In-memory (logged to session)               | Per-reviewer BLOCKING/ADVISORY findings             |
| Revised plans (if needed)   | `.planning/phases/{NN}-{name}/*-PLAN.md`    | Updated plan files                                  |
| Convergence record          | MuninnDB `session:plan-review` (repo vault) | Final findings summary, ADVISORY items for executor |
| ADVISORY items for executor | In-memory (passed to Step 9)                | Non-blocking issues for executor awareness          |

## Agents Involved

| Agent              | Count                    | Role                                     | Isolation                             | Model Tier (MODERATE)          |
| ------------------ | ------------------------ | ---------------------------------------- | ------------------------------------- | ------------------------------ |
| `code-architect`   | 1                        | Architecture, dependencies, scope review | **Cold** (no planner session context) | capable (DEEP_ANALYSIS preset) |
| `dx-advocate`      | 1                        | Completeness, conventions, risk review   | **Cold** (no planner session context) | capable (DEEP_ANALYSIS preset) |
| `security-auditor` | 1                        | Security, annotation accuracy review     | **Cold** (no planner session context) | capable (DEEP_ANALYSIS preset) |
| `lu-planner`       | 0-1 (reviser, if needed) | Fix specific BLOCKING revision requests  | None                                  | balanced (ORCHESTRATOR preset) |

## v1 Mapping

**v1 behavior**: `phase-plan` spawned a single `lu-plan-checker` agent that evaluated plans on 6 dimensions (requirement coverage, task completeness, dependency correctness, key links, scope, verification derivation). The checker returned PASSED or ISSUES_FOUND. If issues found, the planner was re-invoked up to `planVerificationIterations` times.

**v2 changes**:

- 3 specialized reviewers (`code-architect`, `dx-advocate`, `security-auditor`) instead of single `lu-plan-checker`
- 3 reviewers at all complexity levels (Decision 13); complexity affects model tier and iteration budget, not reviewer count
- Gap-severity convergence model (BLOCKING/ADVISORY findings, not numeric scores) per Decision 3
- Cold isolation (reviewers cannot see planner's session context)
- @research annotation verification (reviewers check that annotations point to correct research)
- PREMORTEM risk mitigation verification (plans must address identified risks)
- Fresh reviewers on each iteration (no anchoring bias)
- ADVISORY findings passed to executor for awareness even when plans converge
- See [`05-review-loops/plan-review-protocol.md`](../05-review-loops/plan-review-protocol.md) for the canonical plan review specification

## Failure Modes

| Failure                                            | Cause                                                             | Mitigation                                                                              |
| -------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Reviewers and planner loop indefinitely            | Reviewer requests contradictory changes                           | Max iteration cap from complexity matrix; escalate to user on exhaustion                |
| Plan revision breaks previously-passing dimensions | Planner fixes research coverage but breaks dependency correctness | Fresh reviewers evaluate all dimensions on each iteration, not just the requested fixes |
| @research annotations verified but wrong           | Reviewer accepts annotation pointing to wrong section             | Multiple reviewers cross-reference independently; disagreement surfaces the issue       |
| Warning ignored during execution                   | Executor does not see plan review warnings                        | Warnings stored in session context; executor recall surfaces them                       |
| Single plan blocks convergence                     | One plan has a blocker, others are fine                           | Reviewers report issues per-plan; planner can revise only the blocked plan              |

## Example

### Revision cycle for WebSocket reconnection plans

**Iteration 1 (converged with ADVISORY findings only):**

```yaml
convergence: true
blocking_count: 0
advisory_findings:
  - id: "G-ARCH-001"
    plan: "08-03"
    issue: "UI indicator not wired to state change events"
  - id: "G-DX-001"
    plan: "08-02"
    issue: "EWMA threshold adjustment not explicit in task action"
status: "CONVERGED"
```

Since all 3 reviewers converged (0 BLOCKING findings), the orchestrator accepts the plans and passes ADVISORY findings to the executor:

```
mcp__muninn__muninn_remember(
  vault: "luca-framework",
  concept: "session:plan-review-warnings",
  content: "Plan review ADVISORY findings: G-ARCH-001 Plan 03 Task 1: Wire UI indicator to reconnection manager state events. G-DX-001 Plan 02 Task 2: EWMA threshold adjustment logic needs explicit implementation."
)
```

**Handoff to Step 9**: Approved PLAN.md files with `@research` annotations are ready for execution. The executor will load targeted MuninnDB context before each task.
