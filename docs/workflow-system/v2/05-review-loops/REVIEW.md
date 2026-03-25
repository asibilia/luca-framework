# Review: 05-review-loops

## Reviewer: Review Loop Soundness Reviewer (Cold Isolation)

## Date: 2026-03-22

## Iteration: 1

## Summary Assessment

The 05-review-loops section is well-structured, internally consistent within its own four files, and provides enough detail for an orchestrator to implement both review protocols. However, there are significant contradictions between this section and the cross-referenced documents in 01-workflow-steps/ and 02-research-system/, particularly around reviewer counts, convergence models (scored dimensions vs. gap-severity), reviewer agent identities, and iteration budgets. These contradictions would cause implementation failures if an engineer tried to reconcile all documents into a single system.

## Critical Findings

- **CRIT-RL-001**: `05-review-loops/research-review-protocol.md` vs `01-workflow-steps/05-review-research.md` -- **Fundamentally incompatible convergence models.** The review-loops section uses a gap-severity model (CRITICAL/IMPORTANT/MINOR findings, convergence when blocking count = 0). The workflow-steps section uses a 7-dimension scoring model (scores 1-10, convergence when all scores >= 7/10 and overall >= 7.5). These are not two views of the same system -- they are two different systems. An implementer cannot satisfy both. **Resolution**: Choose one model and update the other document to match, or explicitly document that one supersedes the other.

- **CRIT-RL-002**: `05-review-loops/research-review-protocol.md` vs `01-workflow-steps/05-review-research.md` -- **Contradictory reviewer agent identities.** The review-loops section defines three purpose-built reviewer roles (Completeness Reviewer, Accuracy Reviewer, Actionability Reviewer). The workflow-steps section uses `lu-verifier` agent instances as reviewers. The 02-research-system document also uses the three-role model. **Resolution**: Settle on one set of agent identities. If using the three-role model, document that these are prompt-roles for `lu-verifier` instances, or define them as distinct agents in the registry.

- **CRIT-RL-003**: `05-review-loops/plan-review-protocol.md` vs `01-workflow-steps/08-review-plan.md` -- **Contradictory reviewer agents for plan review.** The review-loops section uses code-architect, dx-advocate, and security-auditor (existing general agents, DEEP_ANALYSIS preset). The workflow-steps section uses `lu-plan-checker` instances (ORCHESTRATOR preset). These are different agents with different model tier assignments (capable vs. balanced at MODERATE complexity). **Resolution**: Align on which agents perform plan review and which model routing preset applies.

- **CRIT-RL-004**: `01-workflow-steps/05-review-research.md` vs `05-review-loops/iteration-budgets.md` -- **Contradictory reviewer counts.** The review-loops README and research-review-protocol consistently state 3 reviewers at all complexity levels. The workflow-steps document states 1 reviewer at TRIVIAL, 2 at SIMPLE, 2-3 at MODERATE, 3 at COMPLEX, 3-4 at CRITICAL. **Resolution**: Align on one reviewer count table.

- **CRIT-RL-005**: `05-review-loops/iteration-budgets.md` vs `02-research-system/review-loop-convergence.md` -- **Contradictory iteration budgets for CRITICAL complexity.** The iteration-budgets document specifies: research review max = 3, plan review max = 3 for CRITICAL. The review-loop-convergence document in 02-research-system specifies: `researchReviewIterations: 4` for CRITICAL. The workflow-steps/05-review-research.md specifies: max iterations = 4 for CRITICAL. **Resolution**: Settle on one budget for CRITICAL research review (3 or 4) and propagate to all documents.

- **CRIT-RL-006**: `05-review-loops/plan-review-protocol.md` vs `01-workflow-steps/08-review-plan.md` -- **Contradictory plan review iteration budgets.** The plan-review-protocol states: TRIVIAL=1, SIMPLE=1, MODERATE=2, COMPLEX=2, CRITICAL=3. The workflow-steps document states: TRIVIAL=1, SIMPLE=1, MODERATE=2, COMPLEX=3, CRITICAL=4. **Resolution**: Align on one table. The discrepancy at COMPLEX (2 vs 3) and CRITICAL (3 vs 4) is material.

## Important Findings

- **IMP-RL-001**: `05-review-loops/convergence-criteria.md` -- **IMPORTANT gaps handling is asymmetric between the two loops without clear justification.** The convergence formula allows IMPORTANT gaps to persist if `iteration >= max_iterations` for research review, but for plan review, ADVISORY findings never block convergence at any iteration. This asymmetry is documented but the rationale could be stronger. A reader might question why IMPORTANT research gaps should ever trigger additional iterations if ADVISORY plan findings never do. **Resolution**: Add explicit rationale for this asymmetry (e.g., "research gaps propagate downstream; plan advisory findings can be addressed during execution").

- **IMP-RL-002**: `05-review-loops/convergence-criteria.md` -- **The STALLED state definition is ambiguous.** The state description says `B(n) == B(n-1)` but the state transition diagram shows `B(n) >= B(n-1)` branching into DIVERGING (if `F(n) > F(n-1)`) or STALLED. If `B(n) > B(n-1)` but `F(n) == F(n-1)`, the diagram routes to STALLED, but this is arguably worse than divergence since the blocking count increased while total stayed flat. **Resolution**: Tighten the definitions. Consider: DIVERGING if `B(n) > B(n-1)`, STALLED if `B(n) == B(n-1)`, IMPROVING if `B(n) < B(n-1)`.

- **IMP-RL-003**: `05-review-loops/research-review-protocol.md` vs `02-research-system/review-loop-convergence.md` -- **Overlapping documents with divergent detail.** The `02-research-system/review-loop-convergence.md` is a nearly complete specification of the research review loop, including gap classification, severity assignment guidelines, diminishing returns detection, REVIEW-LOG format, configuration reference, and a full example. The `05-review-loops/research-review-protocol.md` covers much of the same ground but uses different terminology and a different config schema. Having two competing specifications for the same system is a documentation maintenance hazard. **Resolution**: Either (a) make review-loop-convergence.md a summary that defers to 05-review-loops for detail, or (b) consolidate into one canonical location and have the other cross-reference it.

- **IMP-RL-004**: `02-research-system/review-loop-convergence.md` -- **Config field name inconsistency.** This document uses `researchReviewIterations` as the config key; the iteration-budgets document uses `researchReviewMaxIterations`. Both appear in config.json snippets. Only one can be the real field name. **Resolution**: Settle on one field name across all documents.

- **IMP-RL-005**: `05-review-loops/convergence-criteria.md` -- **The `continue_for_important` config flag from 02-research-system is not referenced.** The review-loop-convergence document in 02-research-system has a `continue_for_important` boolean that controls whether IMPORTANT gaps trigger iterations. The convergence-criteria document has no equivalent -- it uses the formula `r.important_count == 0 OR iteration >= max_iterations`, which always loops for IMPORTANT gaps until budget is exhausted. These are different behaviors. **Resolution**: Decide whether IMPORTANT-gap looping is configurable or always-on, and document consistently.

- **IMP-RL-006**: `05-review-loops/iteration-budgets.md` -- **Token budget estimates mix input and output tokens without distinguishing pricing tiers.** The estimates say "~20,000 tokens per reviewer (input + output)" but current API pricing has a 5x difference between input and output token costs for capable-tier models. A more useful estimate would separate input from output tokens. **Resolution**: Break down estimates into input tokens and output tokens, then apply appropriate pricing.

- **IMP-RL-007**: `05-review-loops/plan-review-protocol.md` -- **Delta vs. full re-review is underspecified.** The document states lu-planner "updates only the specific tasks referenced in blocking findings (not a full rewrite)" but on re-review, fresh reviewers evaluate the entire plan. There is no guidance on whether reviewers should do a full re-evaluation or a targeted check of the changed sections. For large plans, a full re-review may be wasteful; for small plans, it is fine. **Resolution**: Specify the re-review strategy explicitly. At minimum, state that reviewers always do a full re-evaluation (to catch regressions introduced by revisions).

## Minor Findings

- **MIN-RL-001**: `05-review-loops/research-review-protocol.md` -- The CONTEXT.md path is given as `.planning/phases/{NN}-{name}/{NN}-CONTEXT.md` in the cold isolation section, but the README references it simply as "CONTEXT.md (locked decisions from discussion)". The path format should be consistent. The plan-review-protocol uses the same phase-directory path format, which is correct.

- **MIN-RL-002**: `05-review-loops/README.md` -- The pipeline diagram shows "Step 3: Discuss + Pre-mortem" as a separate step, but the README's "Two Review Loops" section does not mention Step 3 in the text description, even though CONTEXT.md (the Step 3 output) is a critical input to both review loops. A brief mention would improve clarity.

- **MIN-RL-003**: `05-review-loops/iteration-budgets.md` -- The "Typical Case" table shows TRIVIAL and SIMPLE both at ~109k tokens, but SIMPLE with 2 research review iterations should be higher (at minimum 124k + 40k re-expansion = 164k, minus the fact that typical might use only 1 iteration). The entry seems to assume 1 iteration is typical for both, which may be correct but is not stated.

- **MIN-RL-004**: `05-review-loops/convergence-criteria.md` -- The quality metric `FIRST_PASS_QUALITY = 1 - (B(1) / total_reviewable_items)` is undefined for the case where `B(1) = 0` and `total_reviewable_items = 0` (no research files or no plan tasks). Edge case, but worth noting.

- **MIN-RL-005**: `05-review-loops/plan-review-protocol.md` -- The "Planner Disagrees with a Finding" section is a good edge case but does not specify what happens if the planner disagrees with multiple findings across multiple reviewers. Is there a threshold for escalation, or does each disagreement go through the same escalation path independently?

## Convergence Soundness Analysis

**Can the loop run forever?** No. Both loops have hard maximum iteration caps gated by complexity level (1-3 for research, 1-3 for plan, per the 05-review-loops documents). The emergency exit protocol is well-specified: at max iterations with blocking findings, escalate to user. The state machine in convergence-criteria.md has no cycle that avoids the iteration counter. Every path through REVIEWING increments the iteration count and checks against max. The system is provably terminating.

**Can it terminate too early?** Potentially, in two scenarios:

1. **TRIVIAL/SIMPLE tasks with 1 max iteration**: If the single review pass finds critical issues, the loop cannot iterate -- it escalates immediately. This is by design but means TRIVIAL tasks with unexpected complexity get no self-healing opportunity. The skip-review optimization compounds this: if research has 1 file and plan has 2 tasks, review is skipped entirely.

2. **Diminishing returns override from 02-research-system**: The review-loop-convergence document has a diminishing returns heuristic that can stop the loop when gap_reduction_rate < 10%, even with IMPORTANT gaps remaining. This is not mentioned in the 05-review-loops convergence-criteria document. If implemented, this creates an additional early-termination path not captured in the formal convergence model.

**Is the convergence formula formally correct?** The formula `CONVERGED(loop, iteration) iff for-all r in R: r.critical_count == 0 AND (r.important_count == 0 OR iteration >= max_iterations)` is sound for the research loop. However, the second conjunct creates a subtle behavior: at the max iteration, the loop converges even with IMPORTANT findings. This means the convergence condition is weaker at higher iterations -- the bar lowers as you approach the budget. This is intentional (it prevents infinite loops) but should be explicitly called out as a design tradeoff.

**State machine soundness**: The DIVERGING state (F(n) > F(n-1)) routes to ESCALATE only if iteration >= max. If iteration < max, it continues to REVIEWING. This means a diverging system gets additional iterations, which could waste tokens. However, since the iteration cap is hard, this is bounded. The convergence-criteria document notes that the orchestrator logs a warning in DIVERGING state, which is the right behavior.

**Formal gap**: Neither the convergence formula nor the state machine account for the accuracy concern special case mentioned in research-review-protocol.md: "an accuracy concern on a HIGH-confidence finding is effectively CRITICAL." This elevation is described in prose but not captured in the formal model. An implementation that follows only the formal model would miss this rule.

## Budget Realism Check

**Are the token estimates grounded?** Partially. The per-reviewer estimate of ~20,000 tokens (research) and ~15,000 tokens (plan) is plausible for a MODERATE task:

- Input: Research corpus of 6 files at ~2,000 tokens each = ~12,000 + CONTEXT.md (~2,500) + user intent (~500) = ~15,000 input tokens. Reasonable.
- Output: Structured review with findings, ~3,000-5,000 tokens. Reasonable for the defined format.
- Total: ~18,000-20,000 per reviewer. The estimate is in range.

**However**: The estimates do not account for system prompt / agent definition overhead, which for agents like code-architect can be 2,000-4,000 tokens. This would push per-reviewer costs closer to ~22,000-24,000 tokens. The 62,000 per research iteration would be more like ~72,000-74,000.

**The targeted re-expansion estimate of ~16,000 per researcher seems low.** If the researcher uses Context7, WebFetch, or WebSearch tools, the tool call responses alone can be 5,000-15,000 tokens each. A researcher making 2-3 tool calls would consume 25,000-45,000 tokens, not 16,000. The 8,000 tokens budgeted for tool calls is likely an underestimate for any non-trivial research task.

**The ROI analysis is directionally correct but uses unverified base rates.** The claim that "unreviewed research in v1 caused rework in approximately 30-40% of MODERATE+ tasks" is stated without citation. The break-even analysis (62.5% prevention rate needed) is mathematically correct given the stated numbers, but the conclusion depends on the 30-40% rework rate being accurate.

**Cost comparison table uses round numbers.** The claim "$1.50 per 100k tokens at capable tier" is a rough approximation. Actual pricing depends on the specific model (Claude Opus vs Sonnet) and the input/output split. For Claude Opus, output tokens cost significantly more than input tokens. A more precise estimate would separate input and output costs.

## Verdict: NEEDS REVISION

The 05-review-loops section is well-written in isolation, but the critical contradictions with 01-workflow-steps and 02-research-system (CRIT-RL-001 through CRIT-RL-006) mean that an implementer would face unresolvable conflicts. The most urgent issues are:

1. **Two incompatible convergence models** (gap-severity vs. scored-dimensions) -- CRIT-RL-001
2. **Contradictory reviewer agent identities** for both loops -- CRIT-RL-002, CRIT-RL-003
3. **Contradictory iteration budgets** at CRITICAL/COMPLEX levels -- CRIT-RL-005, CRIT-RL-006
4. **Duplicate specification** of the research review loop in two locations -- IMP-RL-003

Recommended action: Designate 05-review-loops as the canonical specification for review loop mechanics, update 01-workflow-steps and 02-research-system to reference it (with brief summaries only), and resolve all numerical discrepancies in a single pass.
