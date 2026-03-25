# phase-plan-review

Orchestrate convergence-based plan review loop with cold-isolated reviewer agents.

## main

<main>
# Plan Review Loop

**Arguments:** `<phase number> [--max-iterations=N]`

## Process

### Step 1: Load Plan Corpus

```
PADDED_PHASE=$(printf "%02d" $PHASE)
PHASE_DIR=$(ls -d .planning/phases/$PADDED_PHASE-* .planning/phases/$PHASE-* 2>/dev/null | head -1)

# Read all PLAN.md files in the phase directory
Read all files matching: $PHASE_DIR/*-PLAN.md

# Read phase intent from CONTEXT.md
Read $PHASE_DIR/*-CONTEXT.md for phase description

# Read ROADMAP.md for broader context
Read .planning/ROADMAP.md
```

### Step 2: Read Review Config

```
# Max iterations from arg or config (default by complexity):
# TRIVIAL=1, SIMPLE=1, MODERATE=2, COMPLEX=3, CRITICAL=3
MAX_ITERATIONS = --max-iterations flag OR config value OR 2
```

### Step 3: Initialize Review Loop

```
iteration = 1
status = "REVIEWING"
review_log = []
```

### Step 4: Spawn 3 Reviewers in Parallel (Cold Isolation)

For each iteration, spawn all 3 reviewers as parallel Task() calls.

Reviewers receive ONLY the plan files and phase context (cold isolation -- no session state, no MuninnDB context, no prior execution summaries).

```
Task(agent: "code-architect", prompt: "Review these PLAN.md files for architectural soundness.
Phase intent: {phase_description}
Plan files: {list of *-PLAN.md files with content}
Roadmap context: {roadmap_excerpt for this phase}
Iteration: {N} of {MAX}
{if iteration > 1: Prior review gaps that should be addressed: {prior_gaps}}

Evaluate:
- Are module boundaries and dependency tiers respected?
- Are tasks decomposed at the right granularity?
- Are there missing architectural concerns (error handling, state management, data flow)?
- Are the verification criteria sufficient to catch architectural regressions?

Output format:
Score: 0.0-1.0
Gaps:
G-ARCH-NNN: [severity: BLOCKING|ADVISORY] Description")

Task(agent: "dx-advocate", prompt: "Review these PLAN.md files for developer experience quality.
Phase intent: {phase_description}
Plan files: {list of *-PLAN.md files with content}
Roadmap context: {roadmap_excerpt for this phase}
Iteration: {N} of {MAX}
{if iteration > 1: Prior review gaps that should be addressed: {prior_gaps}}

Evaluate:
- Are tasks clear and unambiguous for the executor?
- Are context file references (@-refs) complete?
- Are success criteria measurable and verifiable?
- Is the plan self-contained or does it assume undocumented context?
- Are wave groupings and dependencies logical?

Output format:
Score: 0.0-1.0
Gaps:
G-DX-NNN: [severity: BLOCKING|ADVISORY] Description")

Task(agent: "security-auditor", prompt: "Review these PLAN.md files for security considerations.
Phase intent: {phase_description}
Plan files: {list of *-PLAN.md files with content}
Roadmap context: {roadmap_excerpt for this phase}
Iteration: {N} of {MAX}
{if iteration > 1: Prior review gaps that should be addressed: {prior_gaps}}

Evaluate:
- Do tasks that handle user input include validation/sanitization?
- Are authentication/authorization concerns addressed where relevant?
- Are there missing security tasks that should be added?
- Do verification criteria cover security-relevant edge cases?

Output format:
Score: 0.0-1.0
Gaps:
G-SEC-NNN: [severity: BLOCKING|ADVISORY] Description")
```

### Step 5: Collect and Parse Reviews

Parse each reviewer's structured output to extract:
- Score (0.0-1.0)
- Gap entries with IDs and severities
- Count BLOCKING and ADVISORY gaps

**Gap parsing format:**
```
Parse lines matching: G-{PREFIX}-NNN: [severity: LEVEL] Description
Where PREFIX is ARCH, DX, or SEC
Where LEVEL is BLOCKING or ADVISORY
```

### Step 6: Check Convergence

**Convergence state machine (uses BLOCKING count as signal):**

```
B(n) = total BLOCKING gaps across all reviewers
A(n) = total ADVISORY gaps across all reviewers

if B(n) == 0:
    status = "CONVERGED" -> APPROVED
elif B(n) > 0 AND iteration < MAX_ITERATIONS:
    if iteration > 1 AND B(n) < B(n-1):
        status = "IMPROVING" -> continue
    elif iteration > 1 AND B(n) == B(n-1):
        status = "STALLED" -> continue with enhanced request
    elif iteration > 1 AND B(n) > B(n-1):
        status = "DIVERGING" -> continue with warning
    else:
        status = "REVIEWING" -> continue
elif B(n) > 0 AND iteration >= MAX_ITERATIONS:
    status = "ESCALATE" -> present BLOCKING gaps to user
```

**On convergence (APPROVED):** Plans are ready for execution. Proceed to phase-execute.

**ADVISORY gaps:** Logged but do not block approval. Included in PLAN-REVIEW-LOG.md for executor awareness.

### Step 7: If NEEDS_REVISION

When convergence check indicates BLOCKING gaps remain:

```
# Extract BLOCKING gaps as revision targets
revision_targets = [gap.description for gap in gaps if gap.severity == "BLOCKING"]

# Present revision targets to next iteration reviewers as prior_gaps
iteration += 1
# Loop back to Step 4
```

**Note:** Unlike research review, plan review does NOT invoke an expansion skill. Instead, BLOCKING gaps are fed back to reviewers who re-evaluate whether revised understanding resolves them. If gaps persist after MAX_ITERATIONS, they ESCALATE to the user.

### Step 8: Write PLAN-REVIEW-LOG.md

Write to `$PHASE_DIR/PLAN-REVIEW-LOG.md` with all iterations:

```markdown
# Plan Review Log

**Phase:** {N} - {name}
**Status:** APPROVED | ESCALATED
**Iterations:** {current}/{max}
**Plans reviewed:** {list of plan file names}

## Iteration 1

### Architecture Review
**Reviewer:** code-architect
**Score:** {score}/1.0
**Gaps:**
- G-ARCH-001: [severity: LEVEL] Description

### Developer Experience Review
**Reviewer:** dx-advocate
**Score:** {score}/1.0
**Gaps:**
- G-DX-001: [severity: LEVEL] Description

### Security Review
**Reviewer:** security-auditor
**Score:** {score}/1.0
**Gaps:**
- G-SEC-001: [severity: LEVEL] Description

### Iteration Decision
**State:** CONVERGED | IMPROVING | STALLED | DIVERGING
**B(n):** {blocking count} | **A(n):** {advisory count}
**Action:** APPROVED | NEEDS_REVISION | ESCALATE

## Final Decision
**Status:** APPROVED | ESCALATED
**Remaining BLOCKING gaps:** {list or "none"}
**ADVISORY notes for executor:** {list or "none"}
```

### Step 9: Return Structured Result

```
## PLAN REVIEW COMPLETE
**Status:** APPROVED | ESCALATED
**Iterations:** {N}/{MAX}
**Final scores:** architecture={X}, dx={Y}, security={Z}
**BLOCKING gaps remaining:** {count}
**ADVISORY notes:** {count}
```

## Convergence Quick Reference

| Condition | State | Action |
|-----------|-------|--------|
| 0 BLOCKING | CONVERGED | APPROVED |
| N BLOCKING (iter < max, decreasing) | IMPROVING | Re-review |
| N BLOCKING (iter < max, flat) | STALLED | Re-review with enhanced request |
| N BLOCKING (iter < max, increasing) | DIVERGING | Re-review with warning |
| N BLOCKING (iter = max) | -- | ESCALATE to user |

## Success Criteria

- [ ] All 3 reviewers spawned in cold isolation
- [ ] Reviews collected with parseable gap IDs (G-ARCH-/G-DX-/G-SEC-)
- [ ] BLOCKING/ADVISORY counts extracted correctly
- [ ] Convergence evaluated using BLOCKING count (not scores)
- [ ] PLAN-REVIEW-LOG.md written with all iterations
- [ ] Loop terminates: approval, budget exhaustion, or escalation
</main>