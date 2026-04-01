# Review: 00-design-principles

## Reviewer: Completeness/Accuracy/Consistency Reviewer (Cold Isolation)

## Date: 2026-03-22

## Iteration: 1

## Summary Assessment

The design principles section is well-structured, internally coherent, and substantially complete. The writing is clear, concrete, and avoids hand-waving -- real examples from the codebase (Bun APIs, Zod versions) ground abstract ideas effectively. The two most significant concerns are: (1) several quantitative claims lack cited evidence and could be mistaken for hallucinated numbers, and (2) the pipeline diagram in the README diverges from the 10-step reference in `01-workflow-steps/README.md`, creating confusion about the canonical step sequence.

## Critical Findings (blocks implementation)

- **CRIT-DP-001**: `README.md` -- **Pipeline diagram does not match the 10-step reference.** The ASCII pipeline in the README shows steps named `ideate`, `research`, `discuss/pre-mortem`, `deep-expand`, `review-research-loop`, `graduate-to-muninn`, `plan`, `review-plan-loop`, `execute`, `review-impl`, `verify + UAT`. But the canonical 10-step reference in `01-workflow-steps/README.md` has: Ideate, Research, Discuss + Pre-mortem, Deep Expand, Review Research, Graduate to MuninnDB, Plan, Review Plan, Execute, Verify + UAT. The README pipeline shows `review-impl` as a separate step after `execute`, but the 10-step reference folds implementation review into Step 10 (Verify + UAT) or does not show it as a distinct step. An implementer reading the design principles first would expect 12 pipeline stages; reading the workflow steps second, they see 10. This needs reconciliation. -- **Resolution**: Update the README pipeline diagram to exactly match the 10 canonical steps, or add a note explaining that `review-impl` is embedded within Step 10 and not a standalone step.

- **CRIT-DP-002**: `context-rot-prevention.md` -- **Unsourced quantitative claims treated as established fact.** The Quality Degradation Curve presents specific zone boundaries (0-30%, 30-50%, 50-70%, 70%+) and is introduced with "Observed across Claude, GPT-4, and comparable models during extended development sessions." These exact percentages are presented as empirical fact, but no source is cited. Similarly, the break-even analysis states "catching errors in the research/planning phase is 10-100x cheaper than catching them in code review or production" -- this is a reasonable heuristic but is stated as "the research suggests" without identifying which research. For a document that introduces a "grounded decisions" principle requiring cited sources, having its own foundational claims be ungrounded is a credibility risk. -- **Resolution**: Either (a) cite the specific v1 session data or external research that supports these numbers, or (b) reframe them explicitly as design assumptions ("We model the curve as..." / "We assume, based on v1 experience, that...") rather than presented as observed empirical data.

## Important Findings (should fix, improves quality)

- **IMP-DP-001**: `agent-isolation-patterns.md` -- **Error detection rates are unsourced.** The table at line 71 claims same-agent self-review catches ~20-30%, warm review ~40-50%, cold review ~65-80%. These are qualified with "From observations across Luca v1 sessions" but no methodology, sample size, or session IDs are provided. Since the entire cold-isolation argument rests on these numbers, they should be substantiated or qualified more clearly as rough estimates. -- **Resolution**: Add a caveat such as "These are approximate ranges from informal observation of N sessions, not controlled experiments" or link to specific v1 session data.

- **IMP-DP-002**: `context-rot-prevention.md` -- **Break-even analysis token costs are precise but unsubstantiated.** Lines 225-228 give specific ranges: "500-1000 tokens to fix in research phase", "2000-5000 in code review", "5000-15000 in verification." These feel reasonable but are presented as facts. If they come from v1 data, say so. If they are estimates, label them as such. -- **Resolution**: Prefix with "Based on v1 session analysis" or "Our estimates suggest" and consider adding a footnote about methodology.

- **IMP-DP-003**: `agent-isolation-patterns.md` lines 326-332 -- **Complexity scaling table contradicts the README's "What v2 Does NOT Change" section.** The isolation patterns doc says TRIVIAL tasks have "None (no research phase)" and "None (no plan phase)." But the README at line 130 states "Mandatory verification at all complexity levels -- verification is never skipped, only scaled," and the complexity-gating rule explicitly states "ALL workflow steps run at every complexity level." The isolation patterns doc implies that research and planning phases are entirely skipped for TRIVIAL/SIMPLE tasks, which contradicts the "all steps always run" invariant. -- **Resolution**: Reconcile with the complexity-gating rule. If TRIVIAL tasks truly skip research and plan phases, update the README's "What v2 Does NOT Change" to clarify that "all steps run" applies to verification but not to research/plan. If all steps do run, update the isolation table to show what isolation level applies to the scaled-down versions of those steps.

- **IMP-DP-004**: `grounded-decisions.md` -- **Context7 MCP is presented as universally available but may not be.** The entire Tier 1 source hierarchy depends on Context7 MCP being available and having coverage for the relevant libraries. No fallback is discussed for when Context7 is unavailable (e.g., network issues, unsupported library, rate limiting). The document assumes Context7 always works. -- **Resolution**: Add a brief note about the fallback path when Context7 is unreachable or lacks coverage for a given library (which would promote Tier 2 to the practical top of the hierarchy).

- **IMP-DP-005**: `multi-file-architecture.md` -- **Directory structure conventions diverge from `01-workflow-steps/README.md`.** The multi-file doc at line 141 shows research files at `.planning/research/{topic-slug}.md` and plans at `.planning/plan/`. The workflow steps README at lines 120-127 shows research files at `.planning/research/{facet-name}.md` and plan files at `.planning/phases/{NN}-{name}/{NN}-{PP}-PLAN.md`. The naming convention is different (`topic-slug` vs `facet-name`), and the plan directory structure is entirely different (`.planning/plan/` vs `.planning/phases/{NN}-{name}/`). An implementer would not know which convention to follow. -- **Resolution**: Align the directory layouts between the two documents, or add a note in the design principles doc that the exact directory structure is specified in the workflow steps reference and the examples here are illustrative.

- **IMP-DP-006**: `README.md` -- **Cost model table says "0 research review" for v1 but context-rot-prevention.md describes v1 research review differently.** The README cost table at line 151 shows v1 has "0 research review." The context-rot-prevention doc's v1 pipeline description at line 68 shows `[Discussion + Research]` as a combined step. These are consistent, but the agent-isolation cost table at line 277 shows v1 has "0" research review agents but "1 (warm)" plan review. This raises the question: if v1 had warm plan review, why does the README say v1 had "1 plan review" and not clarify it was warm? Minor inconsistency in how v1 is described across files. -- **Resolution**: Use consistent terminology when describing v1 capabilities across all files. A brief "v1 baseline" sidebar that all files reference would eliminate drift.

- **IMP-DP-007**: `agent-isolation-patterns.md` -- **"Review feedback from prior iterations" is listed under DO NOT include for cold reviewers, but the review loop requires iteration.** Line 353 says cold reviewers should not receive "Review feedback from prior iterations (for fresh re-review)." But in practice, if a file failed review and was revised, a fresh cold reviewer evaluating the revised version presumably needs to know what was flagged so they can verify the fix. The doc seems to suggest each review iteration uses a completely fresh reviewer with zero knowledge of prior iterations, which means the reviewer cannot verify that specific flagged issues were addressed. -- **Resolution**: Clarify whether subsequent review iterations are "re-review from scratch" (reviewer checks everything, not just flagged items) or "targeted re-review" (reviewer verifies flagged items were fixed). If the former, note the cost implication. If the latter, explain what context the reviewer receives about the prior review.

## Minor Findings (nice to have)

- **MIN-DP-001**: `README.md` -- **The interconnection diagram is ASCII art but hard to parse.** The arrows suggest a cycle, but the text arrows (`v`, `+`, `<----------+`) do not clearly convey the bidirectional relationships described in the prose below. Consider a numbered list format or a table instead of ASCII art for the interconnection model.

- **MIN-DP-002**: `context-rot-prevention.md` -- **MuninnDB recall example uses `vault: "project"` instead of the actual vault name.** Line 189 shows `muninn_recall(vault: "project", ...)` but the project's vault name is `luca-framework` per `.planning/config.json`. This is a minor example inconsistency but could confuse an implementer checking vault routing rules. -- **Resolution**: Use `vault: "luca-framework"` or a clearly marked placeholder like `vault: "<repo-vault>"`.

- **MIN-DP-003**: `multi-file-architecture.md` -- **File versioning comment may confuse.** Line 330 says "Files are not versioned with git during the research phase (they change rapidly)." This could be misread as "do not commit during research." Clarify that this means files are iteratively revised before being committed as a batch, not that git is avoided entirely.

- **MIN-DP-004**: `grounded-decisions.md` -- **Tier 5 "Unacceptable" label may cause confusion with confidence level "UNVERIFIED".** The source tier hierarchy uses "Tier 5 (Unacceptable)" for pre-training-only knowledge. The confidence model uses "UNVERIFIED" for the same concept. These are two different dimensions (source tier vs confidence level) but the terminology overlap ("unacceptable" vs "UNVERIFIED") is not explicitly connected. A brief sentence linking them (e.g., "Findings that rely solely on Tier 5 sources are automatically assigned UNVERIFIED confidence") would help.

- **MIN-DP-005**: `agent-isolation-patterns.md` -- **Missing discussion of isolation for the Ideate step.** The pipeline isolation table shows Ideate has "None" isolation with rationale "Single agent, no prior context to isolate from." This is correct for a session-starting step, but does not address what happens when the user provides extensive context at ideation time (e.g., a long conversation before invoking the workflow). If the ideation agent inherits a large user conversation, it starts with significant context already loaded.

- **MIN-DP-006**: `multi-file-architecture.md` -- **The `impl/` directory structure at line 151 is not elaborated.** The directory layout shows `.planning/impl/task-{n}-{slug}.md` and `REVIEW-LOG.md`, but the rest of the document focuses exclusively on research files. Implementation tracking files are not discussed in the file lifecycle, template, or practical considerations sections. This leaves a gap for implementers building the execution phase.

- **MIN-DP-007**: `README.md` -- **"Related Documentation" links use relative paths that assume a specific directory depth.** Links like `../../brainstorm/1.workflow-redesign.md` are correct relative to the current location but fragile if files are reorganized. This is an inherent limitation of relative links and not worth fixing, but worth noting.

## Cross-Reference Issues

- **XREF-001**: `README.md` line 176 references `../target-architecture.md`. File exists at `/Users/alecsibilia/Github/luca-framework/docs/workflow-system/target-architecture.md`. The relative path from `00-design-principles/README.md` to `target-architecture.md` is `../../target-architecture.md`, not `../target-architecture.md`. The path is off by one directory level. -- **Fix**: Change `../target-architecture.md` to `../../target-architecture.md`.

- **XREF-002**: Internal cross-references between the four principle docs and the README are all valid. Each file references all three sibling files and the README via relative paths, and all targets exist.

- **XREF-003**: The README references external research docs at `../../brainstorm/1.workflow-redesign.md`, `../../brainstorm/3.final-workflow.md`, `../../research/2.agent-design-patterns.md`, and `../../research/1.anti-slop.md`. All four files exist at the expected locations.

- **XREF-004**: `multi-file-architecture.md` describes a directory structure (`.planning/research/`, `.planning/plan/`, `.planning/impl/`) that does not match the directory conventions in `01-workflow-steps/README.md` (`.planning/phases/{NN}-{name}/`). See IMP-DP-005 for details.

## Verdict: NEEDS REVISION

Minimum changes required before approval:

1. **CRIT-DP-001**: Reconcile the README pipeline diagram with the 10-step reference. The pipeline diagram is the first thing a reader sees and it must match the canonical step list.

2. **CRIT-DP-002**: Reframe or source the quantitative claims in context-rot-prevention.md. A document family whose central thesis is "every claim must trace to a verified source" cannot have its own foundational claims be unsourced. Either cite v1 data or explicitly label them as design assumptions.

3. **IMP-DP-003**: Resolve the contradiction between "all steps run at every complexity level" (README, complexity-gating rule) and "None (no research phase)" for TRIVIAL tasks (agent-isolation-patterns.md). This is a factual conflict that would block an implementer.

4. **IMP-DP-005**: Align directory structure conventions between multi-file-architecture.md and 01-workflow-steps/README.md, or clearly mark the design principles examples as illustrative rather than canonical.

5. **XREF-001**: Fix the broken relative path to target-architecture.md.
