# Review Round 2: 08-open-questions

## Reviewer: External Research / Open Questions Reviewer (Cold Isolation)

## Date: 2026-03-23

## Iteration: 2

## Summary Assessment

The revised document is substantially improved. The three-tier structure (Resolved Decisions, Remaining Open Questions, New Questions) is clear and well-organized. Resolved questions correctly reference canonical decisions with full reasoning for why recommendations changed. The two new questions (Q15, Q16) address gaps identified in Round 1. Most Round 1 findings have been addressed, though one new issue has been introduced and a few minor items remain.

**Overall quality**: HIGH. Ready for approval with one factual correction needed.

---

## Round 1 Fix Verification

### CRIT-OQ-001 (Missing question: step numbering inconsistency) -- FIXED

The step numbering inconsistency is now documented as **RQ1: Canonical Step Numbering** (lines 34-41) in the Resolved Decisions section. It correctly references Decision 1, explains the original conflict (three different numbering schemes across sections), and clarifies the resolution: v2's 10-step list is user-facing; v1's 15-step list is the internal implementation checklist. This is accurate and complete.

### CRIT-OQ-002 (Missing question: TRIVIAL complexity invariant contradiction) -- FIXED

The TRIVIAL handling is now documented as **RQ3: TRIVIAL Complexity Handling** (lines 60-76) in the Resolved Decisions section. It correctly references Decision 17, explicitly acknowledges the contradiction between `agent-isolation-patterns.md` and `complexity-gating.md`, and resolves it: all 10 steps run at all complexity levels, v1 invariant is preserved, TRIVIAL uses fast tier and reduced budgets. The text at line 73 clearly states the v1 principle is NOT retired. This is well-handled.

### IMP-OQ-001 (Q1 trade-off analysis biased toward parameterized) -- FIXED

Q1 is now resolved as RQ2 (lines 44-57). The resolution is **separate named agents** (reversing the original recommendation). The justification explicitly addresses the specialization divergence that existed in `04-agent-orchestration/` specs, acknowledges the modest per-file cost (~50-80 lines), and notes that parameterization would require a "prompt composition engine (a non-trivial infrastructure investment)." This directly addresses the bias identified in Round 1. Well done.

### IMP-OQ-002 (Q5 fallback chain staleness gap) -- FIXED

The fallback chain (lines 298-319) now restricts level 3 to current-phase files only. The explicit note at lines 311-315 explains why prior-phase files are excluded: "Loading raw files from prior phases at this fallback level would bypass the staleness indicators that Q6 carefully adds to MuninnDB engrams." This directly addresses the gap identified in Round 1.

### IMP-OQ-003 (Q7 threshold justification) -- FIXED

The threshold rationale at lines 453 now includes: "The 'total >= 3' criterion is an initial default that should be validated against real review data. If early v2 runs show that legitimate IMPORTANT findings average higher or lower, adjust the threshold accordingly." The "2+ from one reviewer in one file" criterion also has principled justification (concentrated quality issues vs. scattered gaps). While the threshold is still somewhat arbitrary, it is now explicitly flagged as a tunable default rather than presented as a derived number. Acceptable.

### IMP-OQ-004 (Q10 unsourced hallucination data) -- FIXED

Line 645 now reads "Based on informal v1 observations, we estimate 3-8 hallucinations per COMPLEX session." This reframing from factual claim to estimate, combined with the reference to Decision 15 at line 638, addresses the concern. The economic justification is now framed as a design assumption, not an empirical finding.

### IMP-OQ-005 (Missing question: research synthesizer role) -- FIXED (but see NEW issue below)

Q15 (lines 1007-1033) captures the synthesizer question with four sub-questions and a recommended direction. However, the factual premise has a problem -- see IMP-OQ-R2-001 below.

### IMP-OQ-006 (Missing question: error handling for research agents) -- FIXED

Q16 (lines 1036-1071) captures the error handling question with a failure mode table, four sub-questions, and a pragmatic starting point. The integration with the review loop as a safety net is well-noted.

### IMP-OQ-007 (Dependency diagram incomplete) -- FIXED

The dependency diagram (lines 1078-1108) now includes:

- Q7 -> Q10 (reviewer disagreement impacts token budget): present at lines 1091-1095.
- Q15 -> Q16 (synthesizer role impacts error handling): present at lines 1105-1107.
- Resolved dependency chains documented separately at lines 1110-1113 (Q1->Q12, Q3->Q10).

The Round 1 finding also mentioned a missing Q1->Q8 edge (parameterized identity semantics). Since Q1 is now resolved (Decision 2: separate agents), this edge is no longer relevant -- parameterized identity semantics are moot. This is correctly handled by the resolved chains section.

### MIN-OQ-001 (Q6 staleness thresholds unjustified) -- FIXED

Lines 398 now include: "These thresholds are initial defaults intended for a moderately active project. They should be configurable in `.planning/config.json` under `research.staleness`..." with examples for different project velocities. Addresses the concern.

### MIN-OQ-002 (Q14 commit convention chore vs. docs) -- FIXED

Lines 976-987 now suggest `docs(research)` with explicit reasoning: "research files are documentation artifacts, not code changes." The grep-friendly pattern `git log --grep="docs(research)"` is included.

### MIN-OQ-003 (Resolution timeline not mapped to implementation plan phases) -- FIXED

The Resolution Timeline (lines 1117-1171) now includes explicit mappings: "Maps to: Implementation Plan Phase 1 (Foundation)", "Maps to: Implementation Plan Phase 2 (Research Agents) and Phase 3 (Review System)", etc. Each resolution phase references the corresponding implementation plan phase.

### MIN-OQ-004 (Q11 time estimates don't account for MCP latency) -- FIXED

Lines 685-692 now include a note: "Assumes fast MCP response times (< 3s per call)" and a dedicated paragraph at lines 692: "Context7 MCP calls, WebSearch, and WebFetch all have network latency... Real-world timing could be significantly longer, especially with WebFetch of large pages."

### MIN-OQ-005 (Q12 task type determination unaddressed) -- FIXED

Lines 769 now include a dedicated note: "How task type is determined (inferred by the router, specified by the user, determined by the ideation step) is a secondary design question. The current assumption is that the router infers task type during complexity classification... If the task type classifier is unreliable, the default code-implementation specializations serve as a safe fallback."

---

## New Issues Found

### IMP-OQ-R2-001: Q15 premise is factually outdated after 04-agent-orchestration revision

**Finding**: Q15 (line 1009) states: "But the agent catalog in `04-agent-orchestration/` lists 4 researchers, 3 reviewers, and 1 graduator -- no synthesizer."

This is no longer accurate. The revised `04-agent-orchestration/README.md` (line 27) explicitly lists `lu-research-synthesizer` as an **Enhanced Agent** with the description: "Unchanged from v1 -- still combines research outputs into SUMMARY.md. Now processes 4 researcher files instead of 1, and re-runs after deep expand (Step 4)." The pipeline diagram at line 53 of that file also shows the synthesizer between research and the discuss step.

The synthesizer IS in the agent catalog, it IS documented with its role, and it is classified as an existing enhanced agent (not a new agent). This means Q15's core premise ("no synthesizer in the agent catalog") is wrong, and several sub-questions are already answered:

- Sub-question 1 (Is synthesis a separate step or folded into review?): **Already answered** -- synthesis is a separate step between research output and review, handled by `lu-research-synthesizer`.
- Sub-question 2 (Who performs synthesis?): **Already answered** -- `lu-research-synthesizer`, an existing v1 agent.
- Sub-question 3 (What isolation level?): Partially answered -- the agent is warm (reads all 4 files by design), which is consistent with its role.
- Sub-question 4 (Error propagation): Still genuinely open.

**Resolution**: Rewrite Q15 to acknowledge that `lu-research-synthesizer` IS documented in the agent catalog. The remaining open questions should be narrowed to: (a) what isolation level the synthesizer uses (warm is implied but not explicitly stated in the agent catalog's isolation summary table), (b) how synthesizer errors (simplification, nuance loss) are detected by downstream reviewers, and (c) whether the synthesizer should re-run after deep expand revisions triggered by the review loop (not just the initial deep expand). Alternatively, if Q15 is now substantially resolved by the 04-agent-orchestration revision, demote it to a resolved question or a sub-item of another question.

**Severity**: IMPORTANT -- the factual inaccuracy undermines Q15's credibility and creates confusion when cross-referencing with 04-agent-orchestration.

---

## Resolved Questions Accuracy Check

### RQ1 (Canonical Step Numbering)

- References Decision 1: **Correct**. Decision 1 defines the 10-step pipeline starting with Ideate.
- Description of the conflict: **Correct**. Three different numbering schemes existed.
- Resolution summary: **Correct**. v2's 10-step is user-facing; v1's 15-step is internal.

### RQ2 (Separate Agents vs. Parameterized)

- References Decision 2: **Correct**. Decision 2 specifies new specialized agent names.
- Notes recommendation changed from original: **Correct and well-documented**. The rationale for the change (specialization divergence, modest file cost, prompt composition engine overhead) is sound.
- Downstream impact on Q12 noted: **Correct**. Separate agents means new files per task-type specialization.

### RQ3 (TRIVIAL Complexity Handling)

- References Decision 17: **Correct**. Decision 17 preserves the "all steps always run" invariant.
- Acknowledges the contradiction: **Correct**. Both the isolation patterns doc and the complexity-gating rule are cited.
- Explicitly preserves v1 invariant: **Correct**. Line 73: "The v1 principle 'all steps always run' is NOT retired."
- User override flags documented: **Correct**. `--skip-research`, `--deep-research`, `--quick` as explicit overrides.
- Cross-reference with `00-design-principles/README.md`: **Consistent**. Line 44 of design principles states "All 10 steps run at every complexity level."
- Cross-reference with `05-review-loops/README.md`: **Consistent**. Line 162 states "All steps run at all complexity levels: Review loops always run (per Decision 17)."

All three resolved questions are accurate and consistent with their canonical decisions and with other sections.

---

## Remaining Questions Validity Check

### Q2 (Orchestrator location) -- VALID OPEN QUESTION

Genuinely unresolved. Decision 2 (agent names) and Decision 17 (TRIVIAL handling) do not constrain where the orchestrator code lives. The three options (feature flag, separate skill, shared core) are well-analyzed. No canonical decision addresses this.

### Q4 (Research engram lifecycle) -- VALID OPEN QUESTION

Genuinely unresolved. Decision 4 (concept prefix scheme) specifies that graduation writes to `research:*` and lu-learner may promote, but does not mandate a cleanup policy. The four options are well-analyzed.

### Q5 (Files vs. MuninnDB source selection) -- VALID OPEN QUESTION

Genuinely unresolved. The fallback chain is a recommendation, not a decision. No canonical decision specifies which consumer reads which source.

### Q6 (Cross-phase research reuse) -- VALID OPEN QUESTION

Genuinely unresolved. No canonical decision addresses staleness thresholds or cross-phase recall semantics.

### Q7 (Reviewer disagreement) -- VALID OPEN QUESTION

Genuinely unresolved. Decision 3 (convergence model) defines the gap-severity model and iteration semantics, but does not specify inter-reviewer disagreement resolution. Q7 correctly notes the convergence model as context and focuses on the inter-reviewer dimension.

### Q8 (Reviewer freshness across iterations) -- VALID OPEN QUESTION

Genuinely unresolved. No canonical decision addresses whether the same or different reviewer agents handle subsequent iterations.

### Q9 (Review scope on re-expansion) -- VALID OPEN QUESTION

Genuinely unresolved. Decision 16 (revision loop targets) specifies that revisions spawn targeted researchers, but does not specify what reviewers see when evaluating the output. Q9 correctly references Decision 16 as context.

### Q10 (Token budget) -- VALID OPEN QUESTION (partially constrained)

Correctly marked as "partially resolved." Decision 17 constrains it (all steps run at all levels), but the actual budget numbers and break-even analysis remain recommendations, not decisions.

### Q11-Q14 -- VALID OPEN QUESTIONS

All are genuinely unresolved practical questions. No canonical decisions address user experience, non-code tasks, deep expand skip conditions, or file retention policy.

### Q15 (Synthesizer role) -- NEEDS REVISION (see IMP-OQ-R2-001)

The premise is outdated. The synthesizer is documented in the agent catalog. The question needs reframing.

### Q16 (Error handling) -- VALID OPEN QUESTION

Genuinely unresolved. No canonical decision addresses research agent failure modes or retry semantics.

---

## Cross-Section Consistency Check

### With 00-design-principles/README.md

- Open questions document references "all 10 steps run at all complexity levels" (RQ3, Q10): **Consistent** with design principles line 44.
- Cost model references "design assumption" framing for break-even analysis (Q10 line 638): **Consistent** with design principles line 148: "this is a design assumption that motivates the front-loaded cost structure, not a precisely measured quantity."
- Agent names in Q12 and Q15: **Consistent** with design principles references to `04-agent-orchestration/`.

### With 04-agent-orchestration/README.md

- Q15 factual claim about synthesizer missing from catalog: **INCONSISTENT** (see IMP-OQ-R2-001).
- RQ2 agent names (researchers, reviewers, graduator): **Consistent** with the agent ecosystem table at lines 11-21 of 04-agent-orchestration.
- Model routing presets (ROUTER for researchers, DEEP_ANALYSIS for reviewers, ORCHESTRATOR for graduator): **Consistent** with the model routing table at lines 102-106 of 04-agent-orchestration.

### With 05-review-loops/README.md

- Q7 convergence model reference: **Consistent**. Q7 line 422 correctly notes that the canonical convergence model is in 05-review-loops and that Q7 addresses inter-reviewer disagreement within that model.
- Iteration budgets in Q10: **Consistent** with the complexity-gated caps described in 05-review-loops line 64.
- Decision 16 reference in Q9: **Consistent** with the review loop protocol.

---

## Verdict: NEEDS REVISION

The document is very close to approval. 14 of 15 Round 1 findings are fully addressed. The one remaining issue is:

- **IMP-OQ-R2-001**: Q15's premise that `lu-research-synthesizer` is absent from the agent catalog is factually incorrect after the 04-agent-orchestration revision. Q15 needs to be rewritten to reflect that the synthesizer is an existing enhanced agent with a documented role, and the remaining open sub-questions need to be narrowed accordingly.

**Revision scope**: Rewrite Q15 only. The rest of the document is approved. After Q15 is corrected, the document is ready for final approval.
