# Review Loops

> The adversarial review system that eliminates guesswork by ensuring no agent's output reaches the next pipeline stage without independent verification from fresh-context reviewers.

---

## The Problem Review Loops Solve

Luca v1 had a single-reviewer model: the agent that produced output was often the same agent (or an agent sharing the same context) that reviewed it. This created a confirmation bias loop -- the reviewer inherited the author's assumptions, blind spots, and hallucinations, making it structurally incapable of catching certain classes of errors.

Three specific failure modes:

| Failure Mode              | Symptom                                                    | Root Cause                                                                         |
| ------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Inherited blind spots** | Reviewer approves research that contains factual errors    | Reviewer loaded the researcher's session context, inheriting its assumptions       |
| **Confidence anchoring**  | Reviewer accepts LOW-confidence findings without challenge | The finding "looked right" because the reviewer saw the reasoning that produced it |
| **Gap invisibility**      | Reviewer does not notice missing research facets           | Both researcher and reviewer share the same mental model of scope                  |

Review loops attack all three failure modes through a single mechanism: **cold isolation**. Reviewers never see the author's reasoning -- only the output artifacts. They start with a clean context, evaluate the work on its own merits, and flag what is missing, wrong, or insufficient.

---

## Two Review Loops

V2 introduces two convergence-based review loops at critical pipeline boundaries. Both loops receive CONTEXT.md (the output of Step 3: Discuss + Pre-mortem), which contains locked decisions that constrain evaluation scope:

```
                           RESEARCH PHASE
                                |
Step 2: Initial Research -----> research/*.md
Step 3: Discuss + Pre-mortem -> CONTEXT.md (locks decisions)
Step 4: Deep Expand ----------> research/05-*.md (same dir)
                                |
                                v
                    +========================+
                    |  RESEARCH REVIEW LOOP  |  <-- Step 5
                    |  (3 cold reviewers)    |
                    |  Loop until converged  |
                    +========================+
                                |
                         Converged research
                                |
Step 6: Graduate to MuninnDB
Step 7: Plan -----------------> PLAN.md
                                |
                                v
                    +========================+
                    |   PLAN REVIEW LOOP     |  <-- Step 8
                    |  (3 cold reviewers)    |
                    |  Loop until converged  |
                    +========================+
                                |
                         Approved plan
                                |
Step 9: Execute
```

### Research Review Loop (Step 5)

**Purpose**: Verify that the research corpus is complete, accurate, and actionable before it feeds into planning.

**Reviewers**: 3 independent agents (`lu-completeness-reviewer`, `lu-accuracy-reviewer`, `lu-actionability-reviewer`) evaluating the research from different analytical lenses. Each reviewer receives the research files, CONTEXT.md (locked decisions from Step 3), and the original user intent -- nothing else. No researcher session context, no intermediate reasoning, no MuninnDB session engrams from the research phase. 3 reviewers run at all complexity levels (per Decision 13).

**Convergence**: Uses the **gap-severity model** (CRITICAL / IMPORTANT / MINOR). Loop continues while any CRITICAL findings exist. Loop MAY continue for IMPORTANT findings if iteration budget remains (configurable via `continueForImportant`, default: true). Loop stops when 0 CRITICAL + 0 IMPORTANT, or max iterations reached. Maximum iterations are capped by complexity level (see [iteration-budgets.md](iteration-budgets.md)).

See [research-review-protocol.md](research-review-protocol.md) for the full protocol.

### Plan Review Loop (Step 8)

**Purpose**: Verify that the plan is architecturally sound, well-documented, and security-aware before execution begins.

**Reviewers**: 3 existing review agents (`code-architect`, `dx-advocate`, `security-auditor`) evaluate the plan from their domain perspectives. Each receives PLAN.md, research files, and CONTEXT.md -- but not the planner's reasoning or session context. 3 reviewers run at all complexity levels (per Decision 13).

**Convergence**: Uses the **gap-severity model** with BLOCKING / ADVISORY severity levels. Loop continues until no reviewer has BLOCKING findings. ADVISORY findings never block convergence at any iteration. Maximum iterations are lower than research review because good research produces good plans.

See [plan-review-protocol.md](plan-review-protocol.md) for the full protocol.

---

## Theoretical Basis

Review loops rest on three established principles from software engineering, adversarial systems, and formal methods.

### 1. Adversarial Review

The core insight from adversarial testing: **a system's weaknesses are best found by an entity that did not build it.** In machine learning, this manifests as GANs (generator vs. discriminator). In software, this manifests as independent QA teams, penetration testing, and code review by non-authors.

V2 applies this principle structurally:

- **Researchers generate** findings. **Reviewers evaluate** them.
- **Planners generate** task breakdowns. **Reviewers evaluate** them.
- The generator and evaluator never share context.

This is stronger than human code review, where reviewers often skim the PR description (author's reasoning) before examining the code. V2 reviewers literally cannot access the author's reasoning -- it exists only in the author agent's expired context window.

### 2. Fresh-Eyes Principle

Cognitive psychology research on "curse of knowledge" demonstrates that once you know something, you cannot evaluate whether it is obvious to someone who does not know it. Applied to AI agents:

- A researcher who investigated Bun's WebSocket API knows that `ws.send()` queues messages when the socket is in CONNECTING state. They will not flag this as a finding because it is "obvious" (to them).
- A fresh reviewer, reading only the research output, will notice the finding is absent and flag it as a gap.

Cold isolation enforces the fresh-eyes principle mechanically. The reviewer's context contains only the artifacts, so anything not explicitly written down appears as a gap.

### 3. Convergence Theory

Review loops are not unbounded -- they follow a convergence model borrowed from iterative methods in numerical analysis:

- **Iteration 1**: High finding count (the initial review surfaces most issues)
- **Iteration 2**: Lower finding count (targeted fixes address the major issues)
- **Iteration 3**: Minimal or zero findings (convergence reached)

If finding count increases between iterations, the system is diverging -- either the fixes introduced new problems or the scope is fundamentally wrong. This is detected and escalated.

See [convergence-criteria.md](convergence-criteria.md) for the formal convergence model.

---

## How Review Loops Interact

The two review loops are sequential, not independent. Research review convergence is a prerequisite for planning, and plan review convergence is a prerequisite for execution:

```
Research quality ──determines──> Plan quality ──determines──> Execution quality

If research has gaps:
  Plan will contain tasks based on assumptions (not findings)
  Executor will hallucinate implementations
  Verification will catch errors too late (expensive)

If research is verified:
  Plan will contain tasks grounded in verified findings
  Executor will follow researched approaches
  Verification will confirm correctness (cheap)
```

This is why the research review loop has a higher iteration budget than the plan review loop. By the time planning begins, the research corpus should be solid -- meaning fewer plan revisions are needed.

---

## Cold Isolation in Practice

Cold isolation means the reviewer receives:

| Included                                      | Excluded                             |
| --------------------------------------------- | ------------------------------------ |
| Output artifacts (research files, PLAN.md)    | Author's session context             |
| CONTEXT.md (locked decisions from discussion) | Author's MuninnDB session engrams    |
| Original user intent (from Step 1)            | Intermediate drafts or reasoning     |
| Source confidence levels (for research)       | Tool call logs or web search history |

The reviewer must evaluate the work **as it exists on disk**, not as the author intended it. If a finding is missing from the research files, it does not matter that the researcher "investigated it but forgot to write it down." The reviewer flags it as a gap because the downstream planner will not have that information either.

---

## Resource Management

Review loops consume tokens. V2 manages this through:

- **Complexity-gated iteration budgets**: TRIVIAL tasks get 1 iteration; CRITICAL tasks get 3
- **Targeted re-expansion**: When looping, only the specific gaps are investigated (not full re-research)
- **All steps run at all complexity levels**: Review loops always run (per Decision 17). For TRIVIAL, reviewers use `fast` model tier and the 1-iteration cap keeps overhead minimal
- **Diminishing returns detection**: If reviews are not converging, escalate rather than burn tokens

See [iteration-budgets.md](iteration-budgets.md) for the full resource model.

---

## Running Example

Throughout this documentation, all examples use the same running task from the workflow overview:

> **Task:** "Add WebSocket reconnection logic with exponential backoff to a Bun HTTP server"

This task is classified as MODERATE complexity and exercises both review loops:

- Research review catches a gap in the backoff jitter strategy
- Plan review catches a missing error boundary in the reconnection state machine

---

## Documents in This Section

| Document                                                   | Purpose                                                                                                                      |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| [research-review-protocol.md](research-review-protocol.md) | Full protocol for the research review loop: trigger, reviewers, format, aggregation, loop decision, re-expansion, REVIEW-LOG |
| [plan-review-protocol.md](plan-review-protocol.md)         | Full protocol for the plan review loop: trigger, reviewers, criteria, format, loop decision, max iterations                  |
| [convergence-criteria.md](convergence-criteria.md)         | Formal convergence model: definition, metrics, diminishing returns detection, emergency exit, quality tracking               |
| [iteration-budgets.md](iteration-budgets.md)               | Resource management: token budgets, complexity-gated iteration caps, ROI analysis, config integration                        |

---

## Related Documentation

- [Workflow Steps Overview](../01-workflow-steps/) -- Full 10-step pipeline showing where review loops sit
- [Research System](../02-research-system/) -- How research is produced (reviewed by this system)
- [Agent Orchestration](../04-agent-orchestration/) -- How review agents are spawned and managed
- [Design Principles](../00-design-principles/) -- Agent isolation principle that review loops enforce
- [External Research: GSD 2](../07-external-research/gsd-2-framework.md) -- Sliding-window stuck detection pattern
