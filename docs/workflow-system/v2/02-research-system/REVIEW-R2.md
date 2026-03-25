# Review Round 2: 02-research-system

## Reviewer: Research System Reviewer (Cold Isolation)

## Date: 2026-03-23

## Iteration: 2

---

## Round 1 Fix Verification

### CRIT-RS-001: Pipeline step numbering contradicts across sections

**Status: FIXED**

The README.md (lines 12-26) now shows the canonical 10-step pipeline exactly matching Decision 1 in CANONICAL-DECISIONS.md: Research is Step 2, Discuss is Step 3, Deep Expand is Step 4, Review Research is Step 5, Graduate is Step 6. The `05-review-loops/research-review-protocol.md` (lines 9-35) also uses the same numbering, placing research review at Step 5 with Steps 2 and 4 producing the research corpus. No ambiguity remains about whether research review is a top-level step or a sub-process.

### CRIT-RS-002: Research file directory layout inconsistency

**Status: FIXED**

`research-file-structure.md` (lines 7-22) uses the canonical `.planning/phases/NN-name/research/` layout with no `deep/` subdirectory, exactly matching Decision 7. `research-review-protocol.md` (lines 68-80, 362-373) now also uses `.planning/phases/{NN}-{name}/research/` with deep expand files numbered 05+ in the same flat directory. Both documents are now structurally consistent.

### CRIT-RS-003: Gap ID naming convention conflict

**Status: FIXED**

`research-file-structure.md` (lines 216-232) now contains an explicit canonical callout to Decision 8, documenting the reviewer-prefixed format (`G-COMP-NNN`, `G-ACC-NNN`, `G-ACT-NNN`) with severity as a mutable field. `research-review-protocol.md` (lines 145-157) uses the same format and explicitly states "Do NOT use the `GAP-C-001` / `GAP-I-001` format." Both sections are aligned.

### IMP-RS-001: Token budget numbers diverge between multi-agent-research.md and research-team.md

**Status: FIXED**

`multi-agent-research.md` (lines 275-288) now includes an explicit "Budget distinction" callout explaining that the numbers in this file are the **full context budget** (input + output + tool calls), while `research-team.md` specifies the **output-only** token budget. The example is clear: "MODERATE complexity has 20K context budget here, of which ~8K is the output-only budget in agent-orchestration." This resolves the 2.5x discrepancy by documenting it as two different measurement scopes.

### IMP-RS-002: IMPORTANT gap handling on loop continuation differs

**Status: FIXED**

`review-loop-convergence.md` (lines 233-260) documents the `continueForImportant` config toggle and the `maxIterations - 1` reservation. `research-review-protocol.md` (lines 218-222) now references the `continueForImportant` config flag and matches the configurable behavior. Both documents agree that IMPORTANT gaps continue the loop only when `continueForImportant` is true AND iteration budget allows.

### IMP-RS-003: Staleness threshold ambiguity for fast-degrading source types

**Status: FIXED**

`source-confidence-model.md` (lines 256-280) now includes a prefatory note (line 257) stating that generic thresholds are overridden by source-type-specific degradation rates, and explicitly instructs to "always use the more aggressive (shorter) threshold." The Staleness Exceptions table (lines 268-278) now includes an "Effective 'No Adjustment' Window" column that shows 0 months for download/popularity stats and 3 months for community practices, making the override relationship unambiguous. The worked example at line 280 further clarifies.

### IMP-RS-004: Custom researcher configuration lacks schema reference

**Status: FIXED**

`multi-agent-research.md` (lines 362) now includes an explicit schema reference: "The Zod schema for `research.customResearchers` will be defined in `src/agents/__schemas/research.schemas.ts` during implementation." It also references the schema-first-parsing rule and Decision 9 for config key casing (camelCase).

### IMP-RS-005: Agent output format in research-team.md differs from mandatory format in research-file-structure.md

**Status: FIXED**

`multi-agent-research.md` (line 247) now includes a callout: "The agent prompt templates in `04-agent-orchestration/research-team.md` use domain-specific section headers [...] These are the raw agent output structures. The orchestrator post-processes raw output into the mandatory format defined in `research-file-structure.md`." This documents the relationship as a raw-to-canonical transformation, not a conflict.

### MIN-RS-001: Division by zero in diminishing returns formula

**Status: FIXED**

`review-loop-convergence.md` (lines 384-387) now includes an explicit guard: "if gaps_previous == 0: Loop has already converged -- diminishing returns detection does not apply [...] gap_reduction_rate = 1.0 (treat as fully converged)."

### MIN-RS-002: Confidence breakdown lacks acceptable distribution guidance

**Status: FIXED**

`research-file-structure.md` (line 136) now includes guidance: "A research file where fewer than 50% of findings are at MEDIUM or higher confidence should be flagged by the Accuracy Reviewer for insufficient verification effort."

### MIN-RS-003: UNVERIFIED confidence level ambiguity

**Status: FIXED**

`source-confidence-model.md` (line 14) now annotates the UNVERIFIED level with "(internal only -- never in output)" inline in the table and includes expanded text explaining that UNVERIFIED is an internal classification. `research-file-structure.md` (line 283) mirrors this annotation. Both documents are consistent.

### MIN-RS-004: Convergence formal criteria do not map to CONVERGED_WITH_NOTES state

**Status: FIXED**

`review-loop-convergence.md` (lines 308-330) now provides an explicit formal criteria block that maps each convergence state to its conditions: CONVERGED, CONVERGED_WITH_NOTES, MAX_ITERATIONS, and ESCALATED. The criteria-to-state mapping is unambiguous. The convergence states table (lines 334-339) includes a "Criteria Mapping" column that connects each state to its formal condition.

### MIN-RS-005: Reference to lu-research-synthesizer unclear

**Status: FIXED**

`multi-agent-research.md` (line 378) now explicitly states that the graduation step is handled by `lu-research-graduator` (a NEW dedicated agent), references Decision 2 for the canonical agent name, and points to `04-agent-orchestration/research-team.md` for the full agent specification and `03-muninndb-integration/` for MuninnDB details. The prior ambiguity about `lu-research-synthesizer` is resolved.

---

## New Issues Found

### NEW-RS-001: GRADUATION-REPORT.md "Created By" inconsistency

**Severity: MINOR**

In `research-file-structure.md` (line 32), the GRADUATION-REPORT.md is listed as "Created By: Research synthesizer." However, per Decision 2 and multi-agent-research.md (line 378), the graduation agent is `lu-research-graduator`, not a "synthesizer." The file numbering table should say "Research graduator" (or `lu-research-graduator`) to match the canonical agent naming.

**Location:** `/Users/alecsibilia/Github/luca-framework/docs/workflow-system/v2/02-research-system/research-file-structure.md`, line 32

**Suggested fix:** Change "Research synthesizer" to "`lu-research-graduator`" in the Created By column.

### NEW-RS-002: research-team.md spawning pattern references lu-research-synthesizer

**Severity: MINOR**

In `04-agent-orchestration/research-team.md` (line 888), the spawning pattern diagram shows:

```
+---> spawn(lu-research-synthesizer, { research_dir })
```

This references `lu-research-synthesizer`, but per Decision 2, the graduation agent is `lu-research-graduator`. While this is in the `04-agent-orchestration` section (not `02-research-system`), it affects cross-section consistency when reading from `02-research-system`.

**Location:** `/Users/alecsibilia/Github/luca-framework/docs/workflow-system/v2/04-agent-orchestration/research-team.md`, line 888

**Suggested fix:** Change `lu-research-synthesizer` to `lu-research-graduator` in the spawning diagram.

### NEW-RS-003: Graduation report vault routing example may conflict with Decision 4

**Severity: MINOR**

In `research-file-structure.md` (lines 467-472), the Graduation Report example shows:

| Finding ID | Concept                            | Vault          | Confidence |
| ---------- | ---------------------------------- | -------------- | ---------- |
| F-ARCH-001 | pattern:websocket-state-machine    | luca-framework | HIGH       |
| F-IMPL-001 | pattern:exponential-backoff-params | default        | HIGH       |

Per Decision 4, graduation writes to `research:*` prefixes (e.g., `research:approach-*`, `research:pattern-*`), NOT directly to `pattern:*` or `pitfall:*`. The example shows concepts like `pattern:websocket-state-machine` and `pitfall:thundering-herd-reconnection`, which are the permanent prefixes that `lu-learner` promotes to in Step 10 -- not the `research:*` prefixes that `lu-research-graduator` writes in Step 6.

**Location:** `/Users/alecsibilia/Github/luca-framework/docs/workflow-system/v2/02-research-system/research-file-structure.md`, lines 467-472

**Suggested fix:** Update the example to use `research:*` prefixes (e.g., `research:pattern-websocket-state-machine`, `research:pitfall-thundering-herd-reconnection`) or add a note clarifying that these are the final promoted prefixes shown for readability, with actual graduation using `research:*` prefixes per Decision 4.

### NEW-RS-004: Convergence criteria special case in 05-review-loops not mirrored in 02-research-system

**Severity: IMPORTANT**

`05-review-loops/convergence-criteria.md` (lines 352-365) specifies a special case for research review convergence:

```
AND NOT:
  any accuracy_concern on HIGH-confidence findings remains unverified
  (an accuracy concern on a HIGH-confidence finding is effectively CRITICAL --
   it could propagate a factual error into the plan)
```

This means that even if `critical_count == 0`, an unverified accuracy concern on a HIGH-confidence finding prevents convergence. `02-research-system/review-loop-convergence.md` (lines 308-330) specifies the formal convergence criteria but does NOT include this accuracy-concern special case. Since `05-review-loops/convergence-criteria.md` is the canonical source (per Decision 19), the `02-research-system` convergence criteria summary is missing a material condition.

**Location:** `/Users/alecsibilia/Github/luca-framework/docs/workflow-system/v2/02-research-system/review-loop-convergence.md`, lines 308-330

**Suggested fix:** Add the accuracy concern special case to the formal criteria block in `review-loop-convergence.md`, or add a note directing the reader to the canonical source for the complete formal model. The current canonical-source callout (line 306) says "The criteria below are a summary reference" but does not indicate that a material condition is omitted.

### NEW-RS-005: research-team.md Context7 tool discrepancy partially resolved

**Severity: MINOR**

Round 1 flagged (in the cross-section table) that `multi-agent-research.md` says all researchers share "the same tool set" including Context7, while `research-team.md` gives Context7 (`mcp__context7__*`) only to the implementation researcher. The revision in `multi-agent-research.md` (lines 234-245) still says "All four researchers share the same tool set" and lists Context7 in the shared table. Meanwhile, `research-team.md` agent specifications show:

- `lu-architecture-researcher` (line 83): tools list does NOT include Context7
- `lu-implementation-researcher` (line 267-275): tools list DOES include `mcp__context7__*`
- `lu-ecosystem-researcher` (line 452): tools list does NOT include Context7
- `lu-risk-researcher` (line 614): tools list does NOT include Context7

The tool access table in `multi-agent-research.md` claims all share Context7; the agent configs in `research-team.md` give it only to the implementation researcher. This is a factual inconsistency. The "Tool Usage Patterns by Specialization" section (lines 249-273) partially addresses this by saying the ecosystem researcher "Context7 for verifying library capabilities," which would require Context7 access that its agent config does not provide.

**Location:** `/Users/alecsibilia/Github/luca-framework/docs/workflow-system/v2/02-research-system/multi-agent-research.md`, lines 234-245; `/Users/alecsibilia/Github/luca-framework/docs/workflow-system/v2/04-agent-orchestration/research-team.md`, agent configs

**Suggested fix:** Either (a) update `research-team.md` to give all four researchers `mcp__context7__*`, or (b) update `multi-agent-research.md` to note that Context7 is available to the implementation researcher only, while other researchers can query library docs via WebFetch as a fallback. Option (b) is more consistent with the agent configs as written.

---

## Cross-Section Consistency Check

### 02-research-system vs 04-agent-orchestration/research-team.md

| Dimension             | 02-research-system                                        | 04-agent-orchestration/research-team.md                              | Consistent?                                   |
| --------------------- | --------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------- |
| Number of researchers | 4 (Architecture, Implementation, Ecosystem, Risk)         | 4 (same four)                                                        | Yes                                           |
| Agent names           | Named per Decision 2                                      | Same four names                                                      | Yes                                           |
| Output file names     | `01-04` matching Decision 12                              | Same four file names                                                 | Yes                                           |
| Tool access           | "All share the same tool set" including Context7          | Context7 only on implementation researcher                           | **No** (see NEW-RS-005)                       |
| Token budgets         | Full context budget (8K-50K) with explicit scope note     | Output-only budget (~2K-12K) with explicit scope note                | Yes (resolved with scope distinction)         |
| Cold isolation        | Fully specified                                           | Fully specified, consistent                                          | Yes                                           |
| Model routing         | References ROUTER preset per Decision 10                  | ROUTER preset for all four                                           | Yes                                           |
| Output format         | Mandatory format with F-PREFIX-NNN + post-processing note | Per-agent raw output templates with acknowledgment of transformation | Yes (resolved with raw/processed distinction) |
| Graduation agent name | `lu-research-graduator` per Decision 2                    | `lu-research-synthesizer` in spawning diagram                        | **No** (see NEW-RS-002)                       |

### 02-research-system vs 05-review-loops/convergence-criteria.md

| Dimension                     | 02-research-system                                         | 05-review-loops/convergence-criteria.md                                      | Consistent?                            |
| ----------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------- |
| Convergence model             | Gap-severity model per Decision 3                          | Gap-severity model, no scored-dimension model                                | Yes                                    |
| Severity levels               | CRITICAL / IMPORTANT / MINOR                               | CRITICAL / IMPORTANT / MINOR (research), BLOCKING / ADVISORY (plan)          | Yes                                    |
| CRITICAL gap behavior         | Loop MUST continue                                         | B(n) must reach 0 for convergence                                            | Yes                                    |
| IMPORTANT gap behavior        | Configurable via `continueForImportant`                    | Configurable, documented with the same config flag                           | Yes                                    |
| Accuracy concern special case | NOT documented in formal criteria                          | Documented: unverified accuracy concern on HIGH finding prevents convergence | **No** (see NEW-RS-004)                |
| Convergence states            | CONVERGED, CONVERGED_WITH_NOTES, MAX_ITERATIONS, ESCALATED | Same four states with formal state machine                                   | Yes                                    |
| Diminishing returns           | Documented with formula and guard                          | Documented with increasing-finding and repeated-finding detection            | Yes (complementary, not contradictory) |
| Emergency exit protocol       | Max iterations: escalate critical, document important      | Same, with structured emergency exit summary format                          | Yes                                    |
| Canonical source callout      | Present (line 306): "05-review-loops/ is canonical"        | Present (line 3): "This is the canonical specification"                      | Yes                                    |

### 02-research-system vs 05-review-loops/research-review-protocol.md

| Dimension                     | 02-research-system                                          | 05-review-loops/research-review-protocol.md      | Consistent?                                                 |
| ----------------------------- | ----------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------- |
| Pipeline step numbering       | Step 5 (Review Research)                                    | Step 5, with Steps 2+4 as inputs                 | Yes                                                         |
| Directory layout              | `.planning/phases/NN-name/research/` flat                   | Same, with Decision 7 callout                    | Yes                                                         |
| Gap ID convention             | G-{REVIEWER}-NNN per Decision 8                             | Same, with Decision 8 callout                    | Yes                                                         |
| Reviewer count                | 3 at all complexity levels                                  | 3 at all complexity levels per Decision 13       | Yes                                                         |
| Reviewer agent names          | Named per Decision 2                                        | Same three names                                 | Yes                                                         |
| `continueForImportant` config | Documented with config key                                  | Documented with Decision 9 config key reference  | Yes                                                         |
| Re-expansion mechanism        | Targeted researchers, not full Step 4 re-run                | Targeted researchers with addendum format        | Yes                                                         |
| REVIEW-LOG format             | Detailed per-iteration format in research-file-structure.md | Alternative format with full review output dumps | Partial (different level of detail, but same data captured) |

### 02-research-system vs 05-review-loops/iteration-budgets.md

| Dimension                | 02-research-system                                     | 05-review-loops/iteration-budgets.md                    | Consistent? |
| ------------------------ | ------------------------------------------------------ | ------------------------------------------------------- | ----------- |
| Iteration budget values  | TRIVIAL:1, SIMPLE:2, MODERATE:2, COMPLEX:3, CRITICAL:3 | Same values per Decision 14                             | Yes         |
| Canonical source callout | Present: "05-review-loops/ is canonical"               | Present: "This is the canonical iteration budget table" | Yes         |
| TRIVIAL handling         | All steps run (Decision 17), 1-iteration cap           | Same: "Review loops are NOT skipped for TRIVIAL tasks"  | Yes         |

---

## Canonical Decision Compliance

| Decision                          | Requirement                                                                                                         | 02-research-system Compliance                                                                                                    | Status                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| D1: Step Numbering                | 10-step pipeline, research at Step 2                                                                                | README.md uses canonical numbering                                                                                               | COMPLIANT                |
| D2: Agent Names                   | New specialized agents, not reused v1                                                                               | All agents named correctly; `lu-research-graduator` used                                                                         | COMPLIANT                |
| D3: Convergence Model             | Gap-severity model, no scored-dimension model                                                                       | Convergence criteria use gap-severity only                                                                                       | COMPLIANT                |
| D4: Concept Prefix Scheme         | `research:*` namespace with deferred promotion                                                                      | multi-agent-research.md references deferred promotion; graduation report example uses permanent prefixes instead of `research:*` | PARTIAL (see NEW-RS-003) |
| D5: Graduation Scoring Formula    | Weighted sum, threshold 0.55                                                                                        | Not redefined in 02 (correctly deferred to 03-muninndb-integration)                                                              | COMPLIANT                |
| D6: Actionability Scoring         | Observable signal criteria                                                                                          | Not redefined in 02 (correctly deferred to 03-muninndb-integration)                                                              | COMPLIANT                |
| D7: Research File Directory       | Phase-scoped flat, no deep/ subdir                                                                                  | research-file-structure.md matches exactly                                                                                       | COMPLIANT                |
| D8: Gap ID Format                 | Reviewer-prefixed IDs with severity as field                                                                        | research-file-structure.md and review-loop-convergence.md match                                                                  | COMPLIANT                |
| D9: Config Key Casing             | camelCase                                                                                                           | Config examples use camelCase throughout                                                                                         | COMPLIANT                |
| D10: Model Routing Presets        | Researchers: ROUTER, Reviewers: DEEP_ANALYSIS, Graduator: ORCHESTRATOR                                              | Correctly referenced (not redefined)                                                                                             | COMPLIANT                |
| D11: Researcher Isolation         | Cold isolation, non-negotiable                                                                                      | Fully documented with structural enforcement                                                                                     | COMPLIANT                |
| D12: Research File Naming         | Numbered filenames 01-04                                                                                            | Matches                                                                                                                          | COMPLIANT                |
| D13: Reviewer Count               | 3 at all complexity levels                                                                                          | Documented in review-loop-convergence.md                                                                                         | COMPLIANT                |
| D14: Iteration Budgets            | Complexity-gated table                                                                                              | Matches canonical table, with canonical-source callout                                                                           | COMPLIANT                |
| D15: Unsourced Claims             | Reframe as design assumptions                                                                                       | Not applicable to 02 (no quantitative claims)                                                                                    | N/A                      |
| D16: Revision Loop Targets        | Targeted researchers, not full Step 4 re-run                                                                        | review-loop-convergence.md documents targeted fixes                                                                              | COMPLIANT                |
| D17: TRIVIAL Handling             | All 10 steps run at all complexity levels                                                                           | README.md and review-loop-convergence.md confirm                                                                                 | COMPLIANT                |
| D19: Canonical Source Designation | 02 is canonical for research file format and confidence model; 05 is canonical for convergence and review protocols | Canonical source callouts present in review-loop-convergence.md                                                                  | COMPLIANT                |

---

## Summary of Findings

| Category                                | Count     | Details                                                                                                    |
| --------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------- |
| Round 1 Critical fixes verified         | 3/3       | All resolved                                                                                               |
| Round 1 Important fixes verified        | 5/5       | All resolved                                                                                               |
| Round 1 Minor fixes verified            | 5/5       | All resolved                                                                                               |
| New Important issues                    | 1         | NEW-RS-004 (accuracy concern special case missing from convergence summary)                                |
| New Minor issues                        | 4         | NEW-RS-001, NEW-RS-002, NEW-RS-003, NEW-RS-005                                                             |
| Cross-section inconsistencies remaining | 2         | Context7 tool access (NEW-RS-005), graduation agent name in research-team.md spawning diagram (NEW-RS-002) |
| Canonical decision violations           | 1 partial | D4 concept prefix in graduation report example (NEW-RS-003)                                                |

---

## Verdict: APPROVED

All three Round 1 critical findings and all five important findings have been properly resolved. The four documents in `02-research-system/` are internally consistent and well-aligned with the canonical decisions. The remaining issues are:

- One IMPORTANT issue (NEW-RS-004) where the convergence criteria summary omits a material special case from the canonical source, but the canonical source callout is present and directs readers to `05-review-loops/` for the complete specification. This is a documentation completeness issue, not a contradiction.
- Four MINOR issues involving naming inconsistencies and a graduation report example that uses promoted prefixes instead of `research:*` prefixes.

None of these issues would cause an implementer to build the wrong system. The canonical source callouts are correctly placed, the cross-references are accurate, and the section can proceed to implementation with the understanding that the minor issues should be cleaned up in a subsequent pass.
