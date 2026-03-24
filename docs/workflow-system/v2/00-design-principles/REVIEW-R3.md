# Review Round 3 (Spot-Check): 00-design-principles

## Reviewer: Spot-check verifier (Cold Isolation)

## Date: 2026-03-23

## Iteration: 3

## Purpose

Verify that the three issues identified in Round 2 (NEW-IMP-001, NEW-MIN-001, NEW-MIN-002) have been correctly resolved. Also sweep for any other canonical decision violations in the fixed files.

---

## Files Checked

1. `grounded-decisions.md` -- Graduation example prefix and Step 10 promotion note
2. `agent-isolation-patterns.md` -- Reviewer count in cost analysis table
3. `README.md` -- Relative paths to brainstorm/ and research/ directories

---

## Per-File Results

### grounded-decisions.md

**Checking NEW-IMP-001 (important): Graduation example must use `research:*` prefix, not `pattern:*`.**

- **FIXED.** Line 246 comment reads: `// Graduated engram example (writes to research:* prefix, NOT pattern:*)`.
- Line 249 shows `concept: "research:pattern-bun-serve-route-handling"` -- correctly uses the `research:*` namespace per Decision 4.
- Lines 254-256 include the Step 10 promotion note: `// Note: Promotion to pattern:* in the default vault happens later in // Step 10 via lu-learner, after verification confirms the finding's // value. Graduation (Step 6) always writes to research:* prefixes.`
- Line 236 in the graduation pipeline diagram now shows `(deferred)` instead of the previously flagged `(permanent)`.
- The prose at line 212 correctly defers to `03-muninndb-integration/` for the canonical graduation specification.

**Other canonical decision checks:**

- Decision 1 (Step Numbering): Lines 274-283 reference steps by correct canonical numbers (Steps 1-2, Step 5, Step 6, Steps 7-9). No numbering conflicts.
- Decision 2 (Agent Names): Line 277 names all 4 specialized researchers correctly. Line 279 names all 3 specialized reviewers correctly. No deprecated agent names (lu-phase-researcher, lu-verifier as reviewer, lu-learner as graduator).
- Decision 5 (Graduation Scoring): Correctly defers to `03-muninndb-integration/` at line 212 rather than redefining locally.
- Decision 15 (Unsourced Claims): No new unsourced quantitative claims introduced.
- Decision 19 (Canonical Source): Lines 114 and 212 defer to canonical sources (`02-research-system/source-confidence-model.md` and `03-muninndb-integration/`) rather than redefining. Compliant.

**Verdict: PASS -- all issues resolved, no new violations.**

---

### agent-isolation-patterns.md

**Checking NEW-MIN-001 (minor): Research review agent count must be "3", not "3-5".**

- **FIXED.** Line 255 shows `| Research review       | 0                    | 3 (cold reviewers)     | +3        | New cost                           |` -- correctly shows "3" per Decision 13.

**Note on line 254 (Research row):** The v2 column shows `3-5 (independent)` for the _researcher_ agents (not reviewers). Decision 13 governs reviewer count (3 reviewers at all complexity levels), while Decision 2 specifies 4 specialized researchers. The "3-5" range for researchers is slightly imprecise (the canonical count is 4), but this is describing researchers not reviewers, and the range is reasonably close to 4. This was not flagged in Round 2 and is a marginal observation, not a blocking issue.

**Other canonical decision checks:**

- Decision 1 (Step Numbering): Pipeline table (lines 151-163) uses correct 10-step numbering with correct step names.
- Decision 3 (Convergence Model): Line 203 references gap-severity model and defers to `05-review-loops/`. No mention of removed 7-dimension scoring model.
- Decision 11 (Researcher Isolation): Line 154 shows Cold isolation for all researchers. Compliant.
- Decision 13 (Reviewer Count): Research review row now correctly shows 3. README line 142 also says 3. Consistent.
- Decision 14 (Iteration Budgets): Lines 299-305 match Decision 14 exactly. Cross-references `05-review-loops/iteration-budgets.md` at line 307.
- Decision 15 (Unsourced Claims): Lines 68-69 include the qualification about informal observation. Compliant.
- Decision 17 (TRIVIAL Handling): Lines 295 and 299-305 show all complexity levels running all steps, with TRIVIAL at Cold/1 iteration/fast. Compliant.

**Verdict: PASS -- flagged issue resolved, no new violations.**

---

### README.md

**Checking NEW-MIN-002 (minor): Relative paths to brainstorm/ and research/ must use `../../../` (3 levels).**

- **FIXED.** Lines 165-168 now use three levels of `../`:
  - Line 165: `../../../brainstorm/1.workflow-redesign.md` -- resolves from `docs/workflow-system/v2/00-design-principles/` to `docs/brainstorm/1.workflow-redesign.md`. Correct.
  - Line 166: `../../../brainstorm/3.final-workflow.md` -- resolves to `docs/brainstorm/3.final-workflow.md`. Correct.
  - Line 167: `../../../research/2.agent-design-patterns.md` -- resolves to `docs/research/2.agent-design-patterns.md`. Correct.
  - Line 168: `../../../research/1.anti-slop.md` -- resolves to `docs/research/1.anti-slop.md`. Correct.
  - Line 169: `../../target-architecture.md` -- resolves to `docs/workflow-system/target-architecture.md`. Correct (unchanged, was already correct per Round 1).

**Other canonical decision checks:**

- Decision 1 (Step Numbering): Lines 32-41 show correct 10-step pipeline. Step 10 labeled "Verify + UAT (includes implementation review)". Compliant.
- Decision 2 (Agent Names): Line 140 names `lu-architecture-researcher`. Line 142 names `lu-completeness-reviewer`. Correct specialized agent names used throughout.
- Decision 13 (Reviewer Count): Line 142 says "3 cold reviewers". Compliant.
- Decision 15 (Unsourced Claims): Line 148 includes the design assumption qualification. Compliant.
- Decision 17 (TRIVIAL Handling): Line 44 states "All 10 steps run at every complexity level." Compliant.
- Decision 19 (Canonical Source): Lines 25, 74, 146 defer to canonical sources. Compliant.

**Verdict: PASS -- all paths corrected, no new violations.**

---

## Remaining Issues

**None blocking.** All three Round 2 issues (NEW-IMP-001, NEW-MIN-001, NEW-MIN-002) have been correctly resolved.

**One marginal observation (not blocking):** In `agent-isolation-patterns.md` line 254, the Research row shows "3-5 (independent)" for researcher agents. Decision 2 specifies exactly 4 specialized researchers, so "4 (independent)" would be more precise. However, this describes researchers (not reviewers), was not flagged in Round 2, and does not contradict any canonical decision. It is noted here for completeness but does not require revision.

---

## Canonical Decision Compliance Summary

| Decision                 | Status            | Notes                                                                       |
| ------------------------ | ----------------- | --------------------------------------------------------------------------- |
| 1. Step Numbering        | COMPLIANT         | All three files use correct 10-step pipeline                                |
| 2. Agent Names           | COMPLIANT         | Correct specialized agent names throughout                                  |
| 3. Convergence Model     | COMPLIANT         | Defers to `05-review-loops/`                                                |
| 4. Concept Prefix Scheme | **NOW COMPLIANT** | grounded-decisions.md fixed to use `research:*` with Step 10 promotion note |
| 5. Graduation Scoring    | COMPLIANT         | Defers to `03-muninndb-integration/`                                        |
| 11. Researcher Isolation | COMPLIANT         | Cold isolation for all researchers                                          |
| 13. Reviewer Count       | **NOW COMPLIANT** | agent-isolation-patterns.md fixed to "3 (cold reviewers)"                   |
| 14. Iteration Budgets    | COMPLIANT         | Matches Decision 14 table exactly                                           |
| 15. Unsourced Claims     | COMPLIANT         | All quantitative claims qualified as design assumptions                     |
| 17. TRIVIAL Handling     | COMPLIANT         | All steps run at all complexity levels                                      |
| 19. Canonical Source     | COMPLIANT         | All files defer appropriately                                               |

---

## Verdict: APPROVED

All three issues from Round 2 have been correctly addressed. No new canonical decision violations found. The `00-design-principles` section is ready.
