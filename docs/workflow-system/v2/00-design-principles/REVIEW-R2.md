# Review Round 2: 00-design-principles

## Reviewer: Completeness/Accuracy/Consistency Reviewer (Cold Isolation)

## Date: 2026-03-23

## Iteration: 2

## Summary Assessment

The Round 1 revisions addressed the two critical findings and most of the important and minor findings effectively. The pipeline diagram now matches the 10-step canonical reference. Quantitative claims are reframed as design assumptions. The TRIVIAL complexity contradiction is resolved. Directory conventions now defer to canonical sources. The overall quality of the section is significantly improved.

Two new issues were introduced by the revisions (one important, one minor), and one pre-existing cross-reference problem was missed by Round 1.

---

## Round 1 Fix Verification

### Critical Findings

- **CRIT-DP-001**: **FIXED** -- The README pipeline diagram (lines 32-41) now shows exactly 10 steps matching the canonical list from Decision 1. Step 10 is labeled "Verify + UAT (includes implementation review)" which correctly folds review-impl into Step 10. The note "All 10 steps run at every complexity level" is present at line 44.

- **CRIT-DP-002**: **FIXED** -- context-rot-prevention.md line 30 now reads: "We model the degradation curve as the following design assumption, based on informal observation during Luca v1 development sessions. These zone boundaries are approximate heuristics, not empirically measured thresholds." The break-even analysis (lines 222-230) is reframed with "Our estimates, based on informal observation of Luca v1 sessions (not controlled measurements)" and uses order-of-magnitude language ("hundreds of tokens", "thousands of tokens") instead of precise ranges. The overhead tables (lines 201, 203, 214) are labeled "estimated" and "design projections." This fully satisfies Decision 15.

### Important Findings

- **IMP-DP-001**: **FIXED** -- agent-isolation-patterns.md lines 68-69 now reads: "The following ranges are approximate estimates from informal observation of Luca v1 sessions, not controlled experiments. Sample sizes are small and methodology was not rigorous. We present them as design assumptions that motivate cold isolation, not as precise measurements." This is a clear, honest qualification.

- **IMP-DP-002**: **FIXED** -- context-rot-prevention.md lines 225-228 now use order-of-magnitude language ("hundreds of tokens", "thousands of tokens", "thousands to tens of thousands of tokens") instead of precise ranges (500-1000, 2000-5000, 5000-15000). The framing sentence at line 223 explicitly labels these as estimates.

- **IMP-DP-003**: **FIXED** -- The agent-isolation-patterns.md complexity scaling table (lines 299-305) now shows cold isolation at all complexity levels, including TRIVIAL (Cold, 1 iteration, fast). The text at line 295 states "All 10 steps run at every complexity level" with a cross-reference to the complexity-gating rule. The old "None (no research phase)" entries are gone. This resolves the contradiction with the README's "all steps always run" invariant and satisfies Decision 17.

- **IMP-DP-004**: **FIXED** -- grounded-decisions.md lines 86-87 now include a fallback paragraph: "If Context7 is unreachable (network issues, rate limiting) or lacks coverage for a given library, the researcher falls back to Tier 2 (official documentation via WebFetch). In this case, Tier 2 becomes the practical top of the hierarchy for that finding. The researcher must note in the research file that Context7 was unavailable and why."

- **IMP-DP-005**: **FIXED** -- multi-file-architecture.md lines 140-158 now show the phase-scoped directory layout (`.planning/phases/NN-name/research/`) matching Decision 7. The text explicitly states: "The layout below is illustrative of the principles; the exact structure is defined in `01-workflow-steps/`" and cross-references `02-research-system/research-file-structure.md` for the canonical spec. This satisfies Decision 19 (canonical source designation).

- **IMP-DP-006**: **FIXED** -- README.md line 148 adds context about the v1/v2 cost comparison: "We assume, based on v1 session experience, that catching errors in the research/planning phase is significantly cheaper than catching them in code review or production -- this is a design assumption that motivates the front-loaded cost structure, not a precisely measured quantity." The v1 descriptions are now consistent across files.

- **IMP-DP-007**: **FIXED** -- agent-isolation-patterns.md lines 331 now includes a detailed explanation: "Each review iteration uses a completely fresh cold reviewer. The reviewer receives the revised artifact (not the original), plus a summary of what specific issues were flagged in the prior iteration. This allows the reviewer to verify that flagged issues were addressed while still evaluating the artifact with fresh eyes." The model is explicitly named as "re-review from scratch with targeted attention." This resolves the ambiguity about how subsequent review iterations work.

### Minor Findings

- **MIN-DP-001**: **NOT FIXED** -- The README interconnection diagram is unchanged (still ASCII art). However, the table format at lines 108-113 provides a clear alternative representation alongside it. The ASCII art is still present but the table makes the relationships parseable. This is acceptable as-is given that the table compensates.

- **MIN-DP-002**: **FIXED** -- context-rot-prevention.md lines 189-192 now use `vault: "<repo-vault>"` as a clearly marked placeholder instead of the incorrect `vault: "project"`.

- **MIN-DP-003**: **FIXED** -- multi-file-architecture.md lines 336-337 now reads: "Research files are iteratively revised during the review loop before being committed as a batch... Git commits happen after the review loop completes... This does not mean git is avoided during research; it means files are treated as working drafts until the review loop closes." This clarifies the versioning intent.

- **MIN-DP-004**: **FIXED** -- grounded-decisions.md line 108 now includes the linking sentence: "Findings that rely solely on Tier 5 sources are automatically assigned UNVERIFIED confidence (see confidence model below) and are rejected from both research files and graduation." This connects the Tier 5 / UNVERIFIED terminology.

- **MIN-DP-005**: **FIXED** -- agent-isolation-patterns.md line 153 now addresses ideation with prior context: "If the user provides extensive prior context, the ideation agent inherits it -- this is acceptable because ideation is scoping, not review."

- **MIN-DP-006**: **FIXED** -- multi-file-architecture.md line 467 now includes: "This document focuses on research files. Implementation tracking files (per-task notes, implementation review logs) follow similar principles but are specified in `01-workflow-steps/` under the Execute and Verify steps." This explicitly scopes the document and directs the reader to the canonical source.

- **MIN-DP-007**: **NOT FIXED** -- Relative path fragility noted but acknowledged as inherent to the format. See NEW-002 below for paths that are actually broken.

### Cross-Reference Issues

- **XREF-001**: **FIXED** -- README.md line 169 now shows `../../target-architecture.md` which correctly resolves from `docs/workflow-system/v2/00-design-principles/` up to `docs/workflow-system/target-architecture.md`.

---

## New Issues Found

### Important

- **NEW-IMP-001**: `grounded-decisions.md` line 249 -- **Graduation example uses wrong concept prefix.** The code example shows `concept: "pattern:bun-serve-route-handling"`, but Decision 4 specifies that graduation (Step 6) writes to `research:*` prefixes (e.g., `research:api-bun-serve-route-handling`). Promotion to `pattern:*` only happens later via lu-learner in Step 10 after verification. The prose at line 212 correctly references "deferred promotion" and points to `03-muninndb-integration/` for the canonical spec, so the prose is right but the code example contradicts it. Additionally, the graduation pipeline diagram at line 236 labels graduates as "(permanent)" which is misleading -- `research:*` engrams are not permanent; they are candidates for later promotion. -- **Resolution**: Change the example concept to `research:api-bun-serve-route-handling` (or similar `research:*` prefix). Change "(permanent)" in the diagram to "(deferred)" or remove the parenthetical. Add a note that lu-learner may later promote high-value `research:*` engrams to `pattern:*` in the default vault.

### Minor

- **NEW-MIN-001**: `agent-isolation-patterns.md` line 255 -- **Research review agent count shows "3-5" but Decision 13 says "3 reviewers at all complexity levels."** The cost analysis table shows "3-5 (cold reviewers)" for v2 research review. This range is inconsistent with Decision 13 which canonically sets 3 reviewers. The README at line 142 correctly says "3 cold reviewers." The "3-5" in the agent-isolation doc likely represents "3 reviewers, but across multiple files some might spawn additional instances," but this is not explained and creates ambiguity. -- **Resolution**: Change "3-5 (cold reviewers)" to "3 (cold reviewers)" to match Decision 13, or add a note explaining the range (e.g., "3 reviewers per file, total 3-5 spawn instances depending on file count").

- **NEW-MIN-002**: `README.md` lines 165-168 -- **Broken relative paths to brainstorm/ and research/ directories.** Four links use `../../brainstorm/` and `../../research/` paths. From `docs/workflow-system/v2/00-design-principles/`, `../../` resolves to `docs/workflow-system/`, but the brainstorm and research directories are at `docs/brainstorm/` and `docs/research/` (one level higher). The correct relative paths are `../../../brainstorm/` and `../../../research/`. Note: Round 1 XREF-003 incorrectly reported these as valid. The `../../target-architecture.md` link IS correct (target-architecture.md is inside `docs/workflow-system/`), but the brainstorm and research links are not. -- **Resolution**: Change `../../brainstorm/` to `../../../brainstorm/` and `../../research/` to `../../../research/` in all four links.

---

## Canonical Decision Compliance

| Decision | Status | Notes |
| -------- | ------ | ----- |
| 1. Canonical Step Numbering | COMPLIANT | README pipeline shows all 10 steps with correct names. Step 10 labeled with "(includes implementation review)". context-rot-prevention.md budget table matches. agent-isolation pipeline table matches. |
| 2. Canonical Agent Names | COMPLIANT | README line 140 names `lu-architecture-researcher`, line 142 names `lu-completeness-reviewer`. grounded-decisions.md line 274 names all 4 researchers and line 276 names all 3 reviewers. No use of deprecated agent names (lu-phase-researcher, lu-verifier as reviewer, lu-learner as graduator). |
| 3. Convergence Model | COMPLIANT | agent-isolation-patterns.md line 203 references gap-severity model and defers to `05-review-loops/` for canonical convergence criteria. No mention of the removed 7-dimension scoring model. |
| 4. Concept Prefix Scheme | **NON-COMPLIANT** | grounded-decisions.md line 249 shows graduation writing to `pattern:*` instead of `research:*`. See NEW-IMP-001. |
| 5. Graduation Scoring Formula | COMPLIANT (by reference) | grounded-decisions.md defers to `03-muninndb-integration/` for the scoring formula (line 212). Does not redefine it locally. |
| 6. Actionability Scoring Criteria | NOT APPLICABLE | Design principles do not define actionability scoring; correctly deferred to other sections. |
| 7. Research File Directory Layout | COMPLIANT | multi-file-architecture.md lines 143-151 show phase-scoped flat layout matching Decision 7 exactly (including 05+ for deep expand, REVIEW-LOG.md, GRADUATION-REPORT.md). |
| 8. Gap ID Format | NOT APPLICABLE | Design principles do not define gap ID format; correctly deferred to review-loops section. |
| 9. Config Key Casing | NOT APPLICABLE | No config keys defined in this section. |
| 10. Model Routing Presets | NOT APPLICABLE | Correctly defers to `04-agent-orchestration/` (README line 146). |
| 11. Researcher Isolation | COMPLIANT | agent-isolation-patterns.md line 154 shows Cold isolation for all researchers. No exceptions mentioned. |
| 12. Research File Naming | COMPLIANT | multi-file-architecture.md lines 145-148 use numbered filenames matching Decision 12. |
| 13. Reviewer Count | **MINOR NON-COMPLIANCE** | README correctly says "3 cold reviewers" (line 142). agent-isolation-patterns.md says "3-5" (line 255). See NEW-MIN-001. |
| 14. Iteration Budgets | COMPLIANT | agent-isolation-patterns.md lines 301-305 match Decision 14 exactly. Correctly defers to `05-review-loops/iteration-budgets.md` for canonical table (line 307). |
| 15. Unsourced Quantitative Claims | COMPLIANT | All quantitative claims reframed as design assumptions throughout all four files. |
| 16. Revision Loop Targets | NOT APPLICABLE | Design principles do not specify revision loop mechanics; deferred to workflow-steps and review-loops sections. |
| 17. TRIVIAL Complexity Handling | COMPLIANT | All mentions of TRIVIAL now show steps running (not skipped). agent-isolation-patterns.md line 295 explicitly states the invariant. multi-file-architecture.md line 428 notes TRIVIAL/SIMPLE tasks "still run the research phase (all steps run at all complexity levels)". |
| 18. Missing Implementation Items | NOT APPLICABLE | No implementation plan in this section. |
| 19. Canonical Source Designation | COMPLIANT | All four principle documents defer to canonical sources for details. multi-file-architecture.md references `02-research-system/research-file-structure.md` and `01-workflow-steps/`. grounded-decisions.md references `02-research-system/source-confidence-model.md` and `03-muninndb-integration/`. agent-isolation-patterns.md references `05-review-loops/` and `05-review-loops/iteration-budgets.md`. No section redefines what belongs to another canonical source. |

---

## Verdict: NEEDS REVISION

The revisions from Round 1 are thorough and well-executed. The section is close to approval. Three items remain:

1. **NEW-IMP-001** (important): Fix the graduation example in grounded-decisions.md to use `research:*` concept prefix per Decision 4. This is a factual error that contradicts the canonical decision and the document's own prose.

2. **NEW-MIN-001** (minor): Align the reviewer count in agent-isolation-patterns.md cost table with Decision 13 (3, not 3-5).

3. **NEW-MIN-002** (minor): Fix the four broken relative paths to brainstorm/ and research/ directories in README.md.

Once these three items are addressed, this section is approved.
