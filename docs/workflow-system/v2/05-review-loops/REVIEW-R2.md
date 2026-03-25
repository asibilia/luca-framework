# Review Round 2: 05-review-loops

## Reviewer: Review Loop Soundness Reviewer (Round 2)

## Date: 2026-03-23

## Iteration: 2

---

## Round 1 Fix Verification

### CRIT-RL-001: Convergence Model Conflict (gap-severity vs scored-dimensions)

**Status: FIXED in 05-review-loops/. PARTIALLY FIXED in 01-workflow-steps/08-review-plan.md.**

The `05-review-loops/` section now exclusively uses the gap-severity model (CRITICAL/IMPORTANT/MINOR for research; BLOCKING/ADVISORY for plan) per Decision 3. The convergence-criteria.md opening paragraph explicitly states: "There is no scored-dimension model (no 1-10 scores, no 7/10 thresholds)." This is correct and authoritative.

However, `01-workflow-steps/08-review-plan.md` was NOT revised by the Round 1 revision agent (the agent hit a rate limit at 57 tool uses). This file still contains the incompatible scored-dimension model:

- Section 8.1 still shows `TRIVIAL: 1 reviewer`, `SIMPLE: 1 reviewer`, `MODERATE: 2 reviewers`, `COMPLEX: 2-3 reviewers` with score thresholds like "All scores >= 7/10" and "All scores >= 8/10, no blockers, unanimous"
- Section 8.2 still spawns `lu-plan-checker` agents and instructs them to "Score each dimension 1-10"
- Section 8.3 shows per-dimension scores (requirement_coverage: 9, task_completeness: 8, etc.) with `overall: 8.3` weighted averages
- Section 8.4 evaluates convergence against "All dimension scores >= 7/10 across ALL reviewers" and "Weighted average >= 7.5"
- Section 8.6 shows a convergence table with per-dimension scores and thresholds
- The Agents Involved table still lists `lu-plan-checker` with `ORCHESTRATOR preset`
- The v1 Mapping section still says "Multi-reviewer evaluation (2-3 reviewers instead of single checker)" and "8 scoring dimensions"

This file directly contradicts Decisions 2, 3, 13, and 14. **This is the most significant remaining issue in the review-loops cross-reference surface.**

The `01-workflow-steps/05-review-research.md` file WAS successfully revised and now correctly references the canonical source, uses the 3-reviewer model with correct agent names, the gap-severity model, reviewer-prefixed gap IDs (Decision 8), and correct iteration budgets matching Decision 14.

**Severity: CRITICAL** -- `08-review-plan.md` must be revised to match `05-review-loops/plan-review-protocol.md`.

### CRIT-RL-002: Reviewer Agent Identities (Research Review)

**Status: FIXED.**

All documents in `05-review-loops/` consistently use `lu-completeness-reviewer`, `lu-accuracy-reviewer`, and `lu-actionability-reviewer` as the 3 NEW dedicated agents (Decision 2). The research-review-protocol.md explicitly states: "These are NEW dedicated agents (Decision 2), not reused v1 agents. They are not `lu-verifier` instances."

Cross-reference `01-workflow-steps/05-review-research.md` also correctly uses the same 3 agents with proper gap ID prefixes (G-COMP-, G-ACC-, G-ACT-) and explicitly states they are Decision 2 agents.

Cross-reference `02-research-system/review-loop-convergence.md` also correctly uses the same 3 agents, references Decision 13 for the 3-reviewer count, and references Decision 10 for the DEEP_ANALYSIS routing preset.

### CRIT-RL-003: Plan Review Agent Identities

**Status: FIXED in 05-review-loops/. NOT FIXED in 01-workflow-steps/08-review-plan.md.**

The `05-review-loops/plan-review-protocol.md` correctly uses `code-architect`, `dx-advocate`, and `security-auditor` as the 3 existing agents reused for plan review (Decision 2), with the DEEP_ANALYSIS routing preset (Decision 10).

However, `01-workflow-steps/08-review-plan.md` still uses `lu-plan-checker` agents with the ORCHESTRATOR preset. This contradicts Decision 2 and Decision 10. Same root cause as CRIT-RL-001 -- the revision agent did not reach this file.

**Severity: CRITICAL** -- covered by the same fix needed for CRIT-RL-001.

### CRIT-RL-004: Reviewer Count Consistency

**Status: FIXED in 05-review-loops/ and 01-workflow-steps/05-review-research.md. NOT FIXED in 01-workflow-steps/08-review-plan.md.**

All `05-review-loops/` files consistently state "3 reviewers at all complexity levels" and reference Decision 13. The README, research-review-protocol.md, plan-review-protocol.md, convergence-criteria.md, and iteration-budgets.md all agree.

`01-workflow-steps/05-review-research.md` correctly shows 3 reviewers at all levels.

`01-workflow-steps/08-review-plan.md` still shows variable reviewer counts (1 at TRIVIAL, 1 at SIMPLE, 2 at MODERATE, 2-3 at COMPLEX, 3 at CRITICAL).

`02-research-system/review-loop-convergence.md` correctly states "All three reviewers run at every complexity level" and references Decision 13.

**Severity: CRITICAL** -- same file, same fix needed.

### CRIT-RL-005: Research Review Iteration Budget for CRITICAL

**Status: FIXED.**

All documents now agree on the canonical iteration budgets from Decision 14:

| Complexity | Research Review Max | Plan Review Max |
| ---------- | ------------------- | --------------- |
| TRIVIAL    | 1                   | 1               |
| SIMPLE     | 2                   | 1               |
| MODERATE   | 2                   | 2               |
| COMPLEX    | 3                   | 2               |
| CRITICAL   | 3                   | 3               |

- `05-review-loops/iteration-budgets.md`: Matches Decision 14 exactly.
- `05-review-loops/research-review-protocol.md`: References iteration-budgets.md (does not redefine).
- `05-review-loops/plan-review-protocol.md`: Shows plan review max table matching Decision 14.
- `01-workflow-steps/05-review-research.md`: Shows correct table (3/3 for COMPLEX/CRITICAL research review).
- `02-research-system/review-loop-convergence.md`: Shows correct table matching Decision 14, with explicit note that `05-review-loops/` is canonical.

The prior conflict where `02-research-system/review-loop-convergence.md` showed `researchReviewIterations: 4` for CRITICAL has been resolved. The document now shows 3 for CRITICAL, matching the canonical source.

### CRIT-RL-006: Plan Review Iteration Budget for COMPLEX/CRITICAL

**Status: FIXED in 05-review-loops/. NOT FIXED in 01-workflow-steps/08-review-plan.md.**

`05-review-loops/plan-review-protocol.md` shows: COMPLEX=2, CRITICAL=3, matching Decision 14.

`01-workflow-steps/08-review-plan.md` section 8.1 still shows: COMPLEX=3, CRITICAL=4. This contradicts Decision 14.

**Severity: CRITICAL** -- same file, same fix needed.

---

### Round 1 IMPORTANT Fix Verification

### IMP-RL-001: Asymmetric IMPORTANT/ADVISORY Handling Rationale

**Status: FIXED.**

The convergence-criteria.md now includes a dedicated "Asymmetry Rationale (IMP-RL-001)" section that explains: "research gaps propagate downstream -- a gap in research becomes an assumption in the plan, which becomes a hallucination in execution, compounding at each stage. Plan advisory findings, by contrast, can be addressed during execution without compounding risk." The plan-review-protocol.md also includes this rationale inline in the Loop Decision section.

### IMP-RL-002: STALLED State Ambiguity

**Status: FIXED.**

The convergence-criteria.md state machine now clearly distinguishes:

- DIVERGING: `B(n) > B(n-1)` OR (`B(n) == B(n-1)` AND `F(n) > F(n-1)`)
- STALLED: `B(n) == B(n-1)` AND `F(n) <= F(n-1)`

A clarification paragraph explicitly addresses the ambiguous case: "DIVERGING is triggered when blocking count increases OR when blocking count stays flat but total findings increase... This prevents the ambiguous case where B(n) > B(n-1) but F(n) == F(n-1) from being classified as merely STALLED when it is objectively worse."

### IMP-RL-003: Overlapping Documents (02-research-system vs 05-review-loops)

**Status: FIXED.**

`02-research-system/review-loop-convergence.md` now opens with a canonical source callout: "The authoritative specification for convergence criteria, iteration budgets, and review protocols lives in `05-review-loops/`. This document describes the research-specific application of those general patterns. Where any conflict exists, `05-review-loops/` is canonical per Decision 19."

Iteration budget tables in the document include a note: "Authoritative source: The canonical iteration budget table lives in `05-review-loops/`. This table is a summary reference."

The convergence criteria section includes: "Canonical source: The authoritative convergence specification lives in `05-review-loops/convergence-criteria.md`."

This properly defers to the canonical source while retaining useful research-specific context.

### IMP-RL-004: Config Field Name Inconsistency

**Status: FIXED.**

Both `05-review-loops/iteration-budgets.md` and `02-research-system/review-loop-convergence.md` now use `researchReviewMaxIterations` as the complexity matrix field name and `research.reviewLoop.maxIterations` as the global default. The prior `researchReviewIterations` (without "Max") has been corrected.

### IMP-RL-005: `continueForImportant` Config Flag Not Referenced in Convergence Criteria

**Status: FIXED.**

The `convergence-criteria.md` formal convergence formula now explicitly includes `continueForImportant`:

```
CONVERGED(research_review, iteration) iff:
  for-all reviewer r in R:
    r.critical_count == 0 AND
    (r.important_count == 0 OR NOT continueForImportant OR iteration >= max_iterations)
```

The config key is explicitly documented: "continueForImportant is a config flag (default: true) controlling whether IMPORTANT findings trigger additional research review iterations (config key: research.reviewLoop.continueForImportant, Decision 9)."

### IMP-RL-006: Token Budget Input/Output Split

**Status: FIXED.**

`iteration-budgets.md` now breaks down estimates into separate Input Tokens and Output Tokens columns for both research and plan review tables. Per-reviewer estimates now show ~17,000 input + ~5,000 output = ~22,000 total for research reviewers, and ~13,000 input + ~4,000 output = ~17,000 total for plan reviewers. System prompt overhead (~2-4k tokens) is explicitly mentioned in the input breakdown.

### IMP-RL-007: Delta vs Full Re-Review Underspecified

**Status: FIXED.**

`plan-review-protocol.md` now includes a "Re-Review Strategy" section stating: "When the plan is revised and re-submitted for review, reviewers always perform a full re-evaluation of the entire plan (not just the changed sections). This ensures that revisions do not introduce regressions in previously-approved sections. Reviewers are fresh instances in cold isolation, so they cannot selectively review only the delta."

---

### Round 1 MINOR Fix Verification

### MIN-RL-001: CONTEXT.md Path Inconsistency

**Status: FIXED.** The research-review-protocol.md Cold Isolation section now consistently uses `.planning/phases/{NN}-{name}/CONTEXT.md` for the path format.

### MIN-RL-002: Step 3 Not Mentioned in README

**Status: FIXED.** The README's "Two Review Loops" section now states: "Both loops receive CONTEXT.md (the output of Step 3: Discuss + Pre-mortem), which contains locked decisions that constrain evaluation scope."

### MIN-RL-003: TRIVIAL/SIMPLE Token Estimates

**Status: NOT FIXED (but acceptable).** The Typical Case table still shows both TRIVIAL and SIMPLE at ~121k tokens. While SIMPLE has 2 max research iterations, the "typical" assumption is 1 iteration for SIMPLE (documented in the Assumption column: "Usually converges on first pass"). This is a reasonable assumption. No change needed.

### MIN-RL-004: FIRST_PASS_QUALITY Edge Case (Division by Zero)

**Status: FIXED.** The convergence-criteria.md now includes: "Edge case: If total_reviewable_items == 0 (no research files or no plan tasks), FIRST_PASS_QUALITY is undefined. In this case, the metric is not computed and the review loop should not have been triggered."

### MIN-RL-005: Multiple Planner Disagreements

**Status: FIXED.** The plan-review-protocol.md "Planner Disagrees with a Finding" section now states: "Each disagreement is handled independently through the same escalation path. There is no threshold for batch escalation -- if the planner disagrees with multiple findings across multiple reviewers, each disagreement is documented individually and re-evaluated by fresh reviewers in the next iteration."

---

## New Issues Found

### NEW-R2-001: `reviewSkipComplexity` Config Field Referenced but Contradicts Decision 17

**Severity: MINOR**

`iteration-budgets.md` section "Relationship to Existing Complexity Matrix" lists a config field `reviewSkipComplexity` described as "Complexity level at which to skip review entirely" and marks it as "New (v2)". However, Decision 17 explicitly states: "All 10 steps run at all complexity levels. No steps are skipped based on complexity alone." The same file later states in the TRIVIAL section: "Review loops are NOT skipped for TRIVIAL tasks."

The `reviewSkipComplexity` field contradicts the "no-skip" invariant. It appears to be a leftover from an earlier design that was superseded by Decision 17. The config.json snippet in the same file does not include this field, which confirms it was removed from the schema but the reference in the table was not cleaned up.

The iteration-budgets.md Field Descriptions section correctly omits `reviewSkipComplexity`, and the config.json integration section line 279 states: "There is no reviewSkipComplexity config key -- review loops always run (Decision 17)." So the contradiction is localized to one row in the "Relationship to Existing Complexity Matrix" table.

**Fix**: Remove the `reviewSkipComplexity` row from the table in iteration-budgets.md, or add a note indicating the field was considered but rejected per Decision 17.

### NEW-R2-002: `02-research-system/review-loop-convergence.md` Has Secondary Convergence Detail Not in Canonical Source

**Severity: IMPORTANT**

The `02-research-system/review-loop-convergence.md` defines a `maxIterations - 1` reservation rule: "The last iteration is reserved for a final validation pass. If IMPORTANT gaps are found on the penultimate iteration, the loop proceeds to the final iteration to confirm no new CRITICAL gaps were introduced during fixes, but does NOT attempt further IMPORTANT gap fixes."

This reservation semantic is NOT present in the canonical `05-review-loops/convergence-criteria.md`. The canonical convergence formula treats `iteration >= max_iterations` as the budget exhaustion condition without distinguishing between the penultimate and final iterations.

This creates an implementable difference: under the canonical model, if IMPORTANT gaps exist at iteration N-1 and `continueForImportant` is true, the loop continues to iteration N and attempts to fix IMPORTANT gaps. Under the `02-research-system` model, iteration N would only verify no new CRITICAL gaps were introduced, not attempt IMPORTANT fixes.

Since `05-review-loops/` is canonical (Decision 19), the reservation rule in `02-research-system/` should either be:

1. Adopted into the canonical spec (if the design intent is to reserve the last iteration), or
2. Removed from `02-research-system/` (if the canonical formula is correct as-is).

**Fix**: Decide whether the reservation rule is intended. If yes, add it to `05-review-loops/convergence-criteria.md`. If no, remove it from `02-research-system/review-loop-convergence.md`.

### NEW-R2-003: `02-research-system/review-loop-convergence.md` Config Has Fields Not in Canonical Config Schema

**Severity: MINOR**

The Configuration Reference in `02-research-system/review-loop-convergence.md` includes two config fields not present in the canonical config.json in `05-review-loops/iteration-budgets.md`:

- `research.reviewLoop.diminishingReturnsThreshold` (default: 0.10)
- `research.reviewLoop.escalateOnMaxIterations` (default: true)
- `research.reviewerTokenBudget` (default: 15000)
- `research.deepExpandTokenBudget` (default: 20000)

These appear in `02-research-system/` but not in the `05-review-loops/iteration-budgets.md` config.json snippet. Since Decision 19 designates `06-implementation-plan/config-changes.md` as the canonical source for config schema, neither document is the final authority on which fields exist. However, the discrepancy between the two config snippets could confuse an implementer.

**Fix**: Ensure `06-implementation-plan/config-changes.md` contains the superset of all config fields, and both `05-review-loops/` and `02-research-system/` reference it as canonical.

### NEW-R2-004: Total Overhead Calculation Arithmetic

**Severity: MINOR**

In `iteration-budgets.md`, the "Per-Complexity Worst Case" table shows COMPLEX total as `453k` but the re-expansion for COMPLEX is listed as `2 x 63k = 126k`. The re-expansion count of 2 implies iterations 2 and 3 each trigger re-expansion (iteration 1 is the initial review, no re-expansion). With 3 research review iterations, there are 2 re-expansion cycles -- this is correct.

However, the CRITICAL row also shows `2 x 63k = 126k` for re-expansion with 3 research review iterations. If CRITICAL has 3 iterations, there should also be 2 re-expansion cycles (after iteration 1 and after iteration 2). This is consistent -- 3 iterations means 2 re-expansion cycles. The math checks out.

For plan revision, COMPLEX shows `1 x 17k` (2 plan iterations = 1 revision) and CRITICAL shows `2 x 17k` (3 plan iterations = 2 revisions). This also checks out.

**No fix needed.** The arithmetic is correct upon closer inspection.

### NEW-R2-005: Accuracy Concern Elevation Not Fully Formalized

**Severity: IMPORTANT**

The Round 1 review noted that "an accuracy concern on a HIGH-confidence finding is effectively CRITICAL" was described in prose but not captured in the formal model. The revision agent addressed this by adding it to the formal convergence conditions in `convergence-criteria.md`:

```
AND NOT:
    any accuracy_concern on HIGH-confidence findings remains unverified
    (an accuracy concern on a HIGH-confidence finding is effectively CRITICAL --
     it could propagate a factual error into the plan)
```

However, this addition is expressed as a prose clarification appended to the formal formula, not as a machine-interpretable condition. The main formula `r.critical_count == 0` would still evaluate to true if an accuracy concern exists but is not classified as CRITICAL by the reviewer. The elevation rule depends on the orchestrator interpreting the prose annotation and performing the reclassification before evaluating the formula.

For implementation clarity, the elevation should be an explicit pre-processing step: "Before evaluating the convergence formula, the orchestrator reclassifies any accuracy concern on a HIGH-confidence finding as CRITICAL, incrementing the relevant reviewer's critical_count."

**Fix**: Add an explicit pre-processing step to the convergence criteria that formalizes the accuracy concern elevation as a reclassification before formula evaluation.

---

## Canonical Source Authority Check

Decision 19 designates `05-review-loops/` as the canonical source for:

- **Convergence criteria** (`convergence-criteria.md`)
- **Review protocols** (research-review-protocol.md, plan-review-protocol.md)
- **Iteration budgets** (`iteration-budgets.md`)

### Authority Assessment

| Requirement                       | Status  | Notes                                                                                                                                                                                                                             |
| --------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Convergence model fully specified | PASS    | Gap-severity model is complete with formal formula, state machine, diminishing returns, emergency exit                                                                                                                            |
| Iteration budgets authoritative   | PASS    | Decision 14 table reproduced with "canonical" label; config integration documented                                                                                                                                                |
| Reviewer identities authoritative | PASS    | Decision 2 agents consistently used; model routing presets match Decision 10                                                                                                                                                      |
| Reviewer count authoritative      | PASS    | "3 at all complexity levels" stated in all 4 files with Decision 13 reference                                                                                                                                                     |
| Other sections defer properly     | PARTIAL | `01-workflow-steps/05-review-research.md` defers correctly. `02-research-system/review-loop-convergence.md` defers correctly. `01-workflow-steps/08-review-plan.md` does NOT defer -- it still contains a competing specification |
| Config schema consistency         | PARTIAL | Config field names are consistent within `05-review-loops/`, but `02-research-system/` has additional fields not reflected here (NEW-R2-003)                                                                                      |
| Edge cases documented             | PASS    | Division-by-zero in quality metrics, max iterations emergency exit, planner disagreement escalation, all three addressed                                                                                                          |
| `continueForImportant` integrated | PASS    | Present in formal formula, config reference, and loop decision logic                                                                                                                                                              |
| Accuracy concern elevation        | PARTIAL | Documented in formal conditions section but not as a machine-interpretable pre-processing step (NEW-R2-005)                                                                                                                       |
| Diminishing returns formalized    | PASS    | Formula defined (`gap_reduction_rate`), thresholds documented, override conditions specified                                                                                                                                      |

### Completeness as Canonical Source

The `05-review-loops/` section is comprehensive and functions well as the canonical source. The convergence model is formally specified with a state machine, the iteration budgets are clearly tabulated, the review protocols are detailed with examples, and the config integration is documented.

The one significant gap in authority is that `01-workflow-steps/08-review-plan.md` has not been updated to defer to this section. Until that file is revised, an implementer reading the workflow steps sequentially will encounter a fundamentally different plan review system (scored dimensions, variable reviewer counts, different agents, different budgets) before reaching the canonical source.

---

## Verdict: NEEDS REVISION

The `05-review-loops/` section itself is well-written, internally consistent, and functions effectively as the canonical source for convergence criteria, review protocols, and iteration budgets. All 6 CRITICAL findings and 7 IMPORTANT findings from Round 1 were addressed within this section.

However, **one critical cross-reference failure remains**: `01-workflow-steps/08-review-plan.md` was not revised by the Round 1 revision agent (rate limit at 57 tool uses) and still contains an entirely incompatible plan review specification (scored-dimension model, `lu-plan-checker` agents, variable reviewer counts, different iteration budgets). This single file contradicts Decisions 2, 3, 10, 13, and 14.

### Required Actions (blocking)

1. **Revise `01-workflow-steps/08-review-plan.md`** to match `05-review-loops/plan-review-protocol.md`:
   - Replace `lu-plan-checker` with `code-architect`, `dx-advocate`, `security-auditor`
   - Replace scored-dimension model with BLOCKING/ADVISORY gap-severity model
   - Change reviewer count to 3 at all complexity levels
   - Update iteration budgets to match Decision 14 (COMPLEX=2, CRITICAL=3)
   - Update model routing to DEEP_ANALYSIS preset
   - Add canonical source reference to `05-review-loops/`

### Recommended Actions (non-blocking)

2. **Remove `reviewSkipComplexity` row** from `iteration-budgets.md` table (NEW-R2-001)
3. **Resolve `maxIterations - 1` reservation rule** between `02-research-system/review-loop-convergence.md` and canonical spec (NEW-R2-002)
4. **Ensure `06-implementation-plan/config-changes.md`** contains superset of config fields from both sections (NEW-R2-003)
5. **Formalize accuracy concern elevation** as an explicit pre-processing step in `convergence-criteria.md` (NEW-R2-005)

### Summary

| Category                                    | Count | Details                                                                                       |
| ------------------------------------------- | ----- | --------------------------------------------------------------------------------------------- |
| Round 1 CRITICALs fixed in this section     | 6/6   | All addressed within `05-review-loops/`                                                       |
| Round 1 CRITICALs fixed in cross-references | 3/6   | `05-review-research.md` and `review-loop-convergence.md` fixed; `08-review-plan.md` NOT fixed |
| Round 1 IMPORTANTs fixed                    | 7/7   | All addressed                                                                                 |
| Round 1 MINORs fixed                        | 4/5   | MIN-RL-003 acceptable as-is                                                                   |
| New issues (CRITICAL)                       | 0     | --                                                                                            |
| New issues (IMPORTANT)                      | 2     | NEW-R2-002, NEW-R2-005                                                                        |
| New issues (MINOR)                          | 2     | NEW-R2-001, NEW-R2-003                                                                        |
