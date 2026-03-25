# Review Loop Convergence

How the research review loop works, when it stops, and how reviewers assess research quality. This document covers the reviewer agent specializations, the gap classification system, iteration budgets, convergence criteria, and diminishing returns detection.

> **Canonical source for convergence criteria:** The authoritative specification for convergence criteria, iteration budgets, and review protocols lives in [`05-review-loops/`](../05-review-loops/). This document describes the research-specific application of those general patterns. Where any conflict exists, `05-review-loops/` is canonical per [Decision 19](../CANONICAL-DECISIONS.md#decision-19-canonical-source-designation).

## Overview

After all four researchers complete their output, a fresh team of three reviewer agents evaluates the combined findings. Reviewers are structurally separated from researchers -- they are different agents with different specializations, and they did not participate in producing the research.

```
Research Phase                          Review Phase
┌─────────────────┐                     ┌─────────────────┐
│ Architecture    │──┐                  │ Completeness    │
│ Researcher      │  │                  │ Reviewer        │
├─────────────────┤  │  All files       ├─────────────────┤
│ Implementation  │──┼─────────────────▶│ Accuracy        │
│ Researcher      │  │  reviewed        │ Reviewer        │
├─────────────────┤  │  together        ├─────────────────┤
│ Ecosystem       │──┤                  │ Actionability   │
│ Researcher      │  │                  │ Reviewer        │
├─────────────────┤  │                  └────────┬────────┘
│ Risk            │──┘                           │
│ Researcher      │                     Gaps identified?
└─────────────────┘                              │
                                        ┌────────┴────────┐
                                        │                 │
                                   No CRITICAL       CRITICAL gaps
                                   gaps remain        remain
                                        │                 │
                                        ▼                 ▼
                                   CONVERGED        Fix + Re-review
                                                    (next iteration)
```

## The Three Reviewer Specializations

Reviewers examine research through three distinct lenses. Each reviewer has a focused mandate and produces a structured assessment. **All three reviewers run at every complexity level** ([Decision 13](../CANONICAL-DECISIONS.md#decision-13-reviewer-count)) -- complexity affects model tier and iteration budget, not reviewer count. Reviewers use the `DEEP_ANALYSIS` model routing preset ([Decision 10](../CANONICAL-DECISIONS.md#decision-10-model-routing-presets)).

For full reviewer agent specifications, see [`04-agent-orchestration/research-team.md`](../04-agent-orchestration/research-team.md).

### 1. Completeness Reviewer (`lu-completeness-reviewer`)

**Mandate:** Are there gaps in the research? Did the researchers miss important topics? Are there unexplored alternatives?

**What this reviewer checks:**

| Check                 | What It Catches                                             |
| --------------------- | ----------------------------------------------------------- |
| Topic coverage        | Did all four research domains produce meaningful findings?  |
| Missing alternatives  | Did the Ecosystem Researcher consider all viable options?   |
| Unexplored edge cases | Did the Risk Researcher cover all failure modes?            |
| Cross-domain gaps     | Are there topics that fall between two researchers' scopes? |
| Brief alignment       | Do the findings actually address the user's original brief? |

**What this reviewer does NOT check:**

- Source accuracy (that is the Accuracy Reviewer's job)
- Planning readiness (that is the Actionability Reviewer's job)
- Code correctness (research does not contain executable code)

**Output format:**

```markdown
### Completeness Review

**Files reviewed:** [list]
**Overall assessment:** [COMPLETE | GAPS_FOUND | INSUFFICIENT]

#### Gaps Identified

| Gap ID     | Severity  | Description                                                    | Missing From                    | Recommendation                               |
| ---------- | --------- | -------------------------------------------------------------- | ------------------------------- | -------------------------------------------- |
| G-COMP-001 | CRITICAL  | No analysis of browser-specific WebSocket behavior differences | 02-implementation-approaches.md | Deep expand: browser compatibility           |
| G-COMP-002 | IMPORTANT | Offline message queue strategies not explored                  | 01-architecture-patterns.md     | Researcher update: add queue pattern options |
| G-COMP-003 | MINOR     | No mention of WebSocket compression (zlib)                     | 03-existing-solutions.md        | Note: may be out of scope per brief          |

#### Coverage Matrix

| Topic                | Architecture | Implementation | Ecosystem | Risk       |
| -------------------- | ------------ | -------------- | --------- | ---------- | ----- |
| Connection lifecycle | F-ARCH-001   | F-IMPL-002     | --        | F-RISK-003 |
| Backoff algorithm    | --           | F-IMPL-001     | F-ECO-002 | F-RISK-001 |
| Library selection    | --           | --             | F-ECO-001 | --         |
| Message queuing      | F-ARCH-003   | --             | --        | F-RISK-002 |
| Health monitoring    | F-ARCH-002   | F-IMPL-003     | --        | --         |
| Browser differences  | --           | --             | --        | --         | ← GAP |

The coverage matrix visualizes which topics have findings from which researchers. Empty cells are not necessarily gaps (not every topic needs all four perspectives), but rows with no entries or columns with sparse entries deserve scrutiny.
```

### 2. Accuracy Reviewer (`lu-accuracy-reviewer`)

**Mandate:** Are sources valid? Do findings match their cited sources? Are confidence levels correctly assigned? Are there hallucinations?

**What this reviewer checks:**

| Check                   | What It Catches                                                            |
| ----------------------- | -------------------------------------------------------------------------- |
| Source existence        | Do cited URLs exist and return expected content?                           |
| Source-claim alignment  | Does the source actually say what the finding claims it says?              |
| Confidence calibration  | Is HIGH confidence justified by PRIMARY sources? Is LOW used for TERTIARY? |
| Contradiction detection | Do any findings contradict each other across files?                        |
| Staleness               | Are any sources past their staleness threshold?                            |
| Hallucination signals   | Claims that are suspiciously specific without adequate sourcing            |

**Hallucination detection heuristics:**

The Accuracy Reviewer watches for these hallucination signals:

- A finding cites a specific version number but the source does not mention versions
- A finding claims "most teams do X" without any survey or statistical source
- A finding describes a library feature that does not appear in the library's documentation
- A finding cites a URL that returns a 404 or unrelated content
- A finding provides specific performance numbers without benchmarking sources

**Output format:**

```markdown
### Accuracy Review

**Files reviewed:** [list]
**Overall assessment:** [ACCURATE | ISSUES_FOUND | UNRELIABLE]

#### Issues Identified

| Gap ID    | Severity  | Description                                                                                              | Affected Finding | Evidence                               |
| --------- | --------- | -------------------------------------------------------------------------------------------------------- | ---------------- | -------------------------------------- |
| G-ACC-001 | IMPORTANT | F-ECO-001 cites download stats from 2025-06; now 9 months old                                            | F-ECO-001        | npm shows different numbers today      |
| G-ACC-002 | CRITICAL  | F-IMPL-003 claims `reconnecting-websocket` supports custom protocols; Context7 docs show no such feature | F-IMPL-003       | Verified via mcp**context7**query-docs |

#### Confidence Audit

| Finding    | Assigned | Correct | Reason for Change                     |
| ---------- | -------- | ------- | ------------------------------------- |
| F-ARCH-001 | HIGH     | HIGH    | Correctly sourced from official spec  |
| F-ECO-001  | MEDIUM   | LOW     | Download stats are stale (9 months)   |
| F-IMPL-003 | HIGH     | REMOVE  | Hallucination: feature does not exist |
```

### 3. Actionability Reviewer (`lu-actionability-reviewer`)

**Mandate:** Can the planner build a concrete plan from these findings? Are findings specific enough to inform task creation? Do findings include enough context for an executor who has not read the research?

**What this reviewer checks:**

| Check                     | What It Catches                                                          |
| ------------------------- | ------------------------------------------------------------------------ |
| Specificity               | Are findings concrete enough to write plan tasks against?                |
| Completeness for planning | Does the planner have everything needed to create tasks?                 |
| Missing implications      | Do findings state what was found but not what it means for the plan?     |
| Ambiguity                 | Are there vague recommendations that could be interpreted multiple ways? |
| Missing code examples     | Would a code example make the finding actionable where prose is not?     |
| Decision readiness        | Are conflicting findings resolved enough for the planner to choose?      |

**Output format:**

```markdown
### Actionability Review

**Files reviewed:** [list]
**Overall assessment:** [ACTIONABLE | IMPROVEMENTS_NEEDED | NOT_ACTIONABLE]

#### Issues Identified

| Gap ID    | Severity  | Description                                                              | Affected Finding | Recommendation                                               |
| --------- | --------- | ------------------------------------------------------------------------ | ---------------- | ------------------------------------------------------------ |
| G-ACT-001 | MINOR     | F-ARCH-001 describes state machine but lacks TypeScript type definitions | F-ARCH-001       | Add concrete TypeScript enum for states                      |
| G-ACT-002 | IMPORTANT | F-ECO-001 lists three libraries but does not recommend one               | F-ECO-001        | Add recommendation with rationale based on brief constraints |

#### Planning Readiness Checklist

| Criterion                            | Status  | Notes                                                    |
| ------------------------------------ | ------- | -------------------------------------------------------- |
| Can tasks be defined?                | Yes     | Architecture and implementation patterns are clear       |
| Are dependencies identified?         | Partial | Library choice blocks implementation tasks               |
| Are verification criteria derivable? | Yes     | Risk findings provide testable conditions                |
| Are acceptance criteria clear?       | Yes     | Brief specifies reconnection, health check, queue replay |
```

## Gap Classification

Every gap identified by a reviewer receives a severity classification that determines whether the review loop continues.

### Severity Levels

| Severity      | Meaning                                                                                      | Impact on Loop                           | Examples                                                                                                       |
| ------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **CRITICAL**  | Missing information that would cause the plan to fail or be fundamentally wrong              | Loop MUST continue; gap MUST be resolved | Missing analysis of a core technology; hallucinated library feature; no risk analysis for a known failure mode |
| **IMPORTANT** | Missing information that would reduce plan quality or miss optimization opportunities        | Loop MAY continue (configurable)         | Stale statistics; missing code examples; unresolved library choice                                             |
| **MINOR**     | Nice-to-have information that would polish the research but does not affect plan correctness | Loop does NOT continue for these         | Missing compression analysis (out of scope); verbose prose that could use tightening                           |

### Severity Assignment Guidelines

Reviewers use these guidelines to distinguish between severity levels:

**CRITICAL if:**

- The gap, if unaddressed, would lead the planner to create incorrect tasks
- A hallucinated finding has been detected (factually wrong information)
- An entire research domain produced no findings (e.g., Risk Researcher returned empty)
- A finding the planner would depend on has no source (UNVERIFIED)

**IMPORTANT if:**

- The gap, if unaddressed, would lead to suboptimal but not incorrect tasks
- Source confidence is inflated (HIGH claimed, but only TERTIARY sources)
- A viable alternative was not explored (planner might miss a better option)
- A finding lacks specificity needed for task creation

**MINOR if:**

- The gap affects research polish but not planning outcomes
- Additional context would be nice but the planner can work without it
- The gap is outside the scope of the user's brief

## Loop Continuation Rules

The review loop operates on a simple set of rules:

### Primary Rule: CRITICAL Gaps

```
While ANY reviewer reports CRITICAL gaps:
    Fix the gaps (researcher update, deep expand, or finding removal)
    Re-run all three reviewers on updated research
    Continue loop
```

CRITICAL gaps always force another iteration. There is no override for this rule except the maximum iteration budget.

### Secondary Rule: IMPORTANT Gaps (Configurable)

```
If 0 CRITICAL gaps AND IMPORTANT gaps exist:
    Check config: research.reviewLoop.continueForImportant (default: true)

    If true AND iteration < maxIterations - 1:
        Fix IMPORTANT gaps
        Re-run reviewers

    If false OR iteration >= maxIterations - 1:
        Document remaining IMPORTANT gaps in REVIEW-LOG.md
        Proceed to graduation (converged with noted gaps)
```

> **Note on `maxIterations - 1` reservation:** The last iteration is reserved for a final validation pass. If IMPORTANT gaps are found on the penultimate iteration, the loop proceeds to the final iteration to confirm no new CRITICAL gaps were introduced during fixes, but does NOT attempt further IMPORTANT gap fixes.

The `continueForImportant` setting in `.planning/config.json` controls whether the loop continues for IMPORTANT gaps:

```json
{
  "research": {
    "reviewLoop": {
      "maxIterations": 3,
      "continueForImportant": true
    }
  }
}
```

### Tertiary Rule: MINOR Gaps

MINOR gaps never cause the loop to continue. They are documented in the REVIEW-LOG.md for reference but do not block graduation.

## Maximum Iteration Budget

The review loop has a hard maximum iteration count to prevent infinite loops:

| Configuration                         | Default | Description                                |
| ------------------------------------- | ------- | ------------------------------------------ |
| `research.reviewLoop.maxIterations`   | 3       | Maximum number of review-fix-review cycles |

### What Happens at Max Iterations

When the loop reaches the maximum iteration count:

1. All remaining CRITICAL gaps are escalated to the developer for human review
2. All remaining IMPORTANT gaps are documented in REVIEW-LOG.md
3. The REVIEW-LOG.md records the final status as `MAX_ITERATIONS` (not `CONVERGED`)
4. Research proceeds to graduation, but with a warning flag
5. The planner receives the research with an explicit note about unresolved gaps

### Iteration Budget by Complexity

The canonical iteration budgets per complexity level ([Decision 14](../CANONICAL-DECISIONS.md#decision-14-iteration-budgets)):

| Complexity | Research Review Max Iterations |
| ---------- | ------------------------------ |
| TRIVIAL    | 1                              |
| SIMPLE     | 2                              |
| MODERATE   | 2                              |
| COMPLEX    | 3                              |
| CRITICAL   | 3                              |

> **Authoritative source:** The canonical iteration budget table lives in [`05-review-loops/`](../05-review-loops/). This table is a summary reference. If values diverge, `05-review-loops/` is canonical.

For TRIVIAL tasks, a single review pass with no iteration is sufficient (all 10 steps still run per [Decision 17](../CANONICAL-DECISIONS.md#decision-17-trivial-complexity-handling), but loop budgets are minimal). For COMPLEX/CRITICAL tasks, 3 iterations provide a safety margin for resolving deep gaps.

## Convergence Signal

The loop converges when all reviewers return assessments with zero CRITICAL gaps and zero IMPORTANT gaps (or when IMPORTANT gaps are within tolerance per configuration).

### Formal Convergence Criteria

> **Canonical source:** The authoritative convergence specification lives in [`05-review-loops/convergence-criteria.md`](../05-review-loops/convergence-criteria.md). The criteria below are a summary reference for the research-specific application.

```
CONVERGED when:
    total_critical_gaps == 0
    AND total_important_gaps == 0

CONVERGED_WITH_NOTES when:
    total_critical_gaps == 0
    AND total_important_gaps > 0
    AND (
        config.continueForImportant == false
        OR iteration >= maxIterations - 1
        OR diminishing_returns_detected
    )

MAX_ITERATIONS when:
    iteration >= maxIterations
    AND total_critical_gaps == 0
    AND total_important_gaps > 0

ESCALATED when:
    iteration >= maxIterations
    AND total_critical_gaps > 0
```

### Convergence States

| State                    | Meaning                                                       | Criteria Mapping                                                       | REVIEW-LOG Status                    |
| ------------------------ | ------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------ |
| **CONVERGED**            | All reviewers satisfied, 0 CRITICAL + 0 IMPORTANT             | 0 critical, 0 important                                                | `Final status: CONVERGED`            |
| **CONVERGED_WITH_NOTES** | 0 CRITICAL, some IMPORTANT gaps accepted                      | 0 critical, >0 important, config/budget/diminishing-returns stops loop | `Final status: CONVERGED_WITH_NOTES` |
| **MAX_ITERATIONS**       | Budget exhausted, only IMPORTANT gaps remain                  | Max iterations reached, 0 critical, >0 important                       | `Final status: MAX_ITERATIONS`       |
| **ESCALATED**            | CRITICAL gaps remain at max iterations; human review required | Max iterations reached, >0 critical                                    | `Final status: ESCALATED`            |

## REVIEW-LOG.md Format

The review log captures the complete history of the review loop. See [research-file-structure.md](research-file-structure.md) for the full format specification. Key sections per iteration:

### Per-Iteration Structure

```markdown
## Iteration N

**Date:** [YYYY-MM-DD]
**Reviewed files:** [list of files reviewed this iteration]
**Actions taken since last iteration:** [list of fixes applied]

### Completeness Reviewer

[Gaps table]

### Accuracy Reviewer

[Gaps table]

### Actionability Reviewer

[Gaps table]

### Iteration Summary

- **CRITICAL gaps:** [count]
- **IMPORTANT gaps:** [count]
- **MINOR gaps:** [count]
- **Decision:** [Continue | Converged | Max iterations reached | Escalated]
- **Rationale:** [Why this decision was made]
```

## Diminishing Returns Detection

The review loop includes a heuristic for detecting diminishing returns -- when further iterations are unlikely to produce meaningful improvements.

### How It Works

After each iteration, the orchestrator compares the current gap count to the previous iteration's gap count:

```
if gaps_previous == 0:
    # Loop has already converged -- diminishing returns detection does not apply.
    # This occurs when Iteration 1 produces zero gaps (all reviewers approve).
    gap_reduction_rate = 1.0  (treat as fully converged)
else:
    gap_reduction_rate = (gaps_previous - gaps_current) / gaps_previous
```

| Rate           | Signal               | Action                                                         |
| -------------- | -------------------- | -------------------------------------------------------------- |
| > 50%          | Strong improvement   | Continue iterating; research is getting meaningfully better    |
| 25-50%         | Moderate improvement | Continue if CRITICAL gaps remain; otherwise consider stopping  |
| 10-25%         | Weak improvement     | Consider stopping even if IMPORTANT gaps remain                |
| < 10%          | Diminishing returns  | Stop the loop; further iterations unlikely to help             |
| 0% or negative | Stalled              | Stop immediately; further review is not producing new insights |

### Diminishing Returns Override

When diminishing returns are detected (gap_reduction_rate < 10%), the orchestrator may stop the loop even if IMPORTANT gaps remain, provided:

1. Zero CRITICAL gaps exist
2. The current iteration is at least iteration 2 (give the loop at least two chances)
3. The REVIEW-LOG documents the diminishing returns signal

This prevents the loop from burning token budget on iterations that produce nearly identical reviewer output.

### Example: Diminishing Returns in Practice

```
Iteration 1:
  CRITICAL: 2, IMPORTANT: 3, MINOR: 4
  Total actionable gaps: 5 (CRITICAL + IMPORTANT)

Iteration 2 (after fixes):
  CRITICAL: 0, IMPORTANT: 2, MINOR: 3
  Total actionable gaps: 2
  Gap reduction rate: (5 - 2) / 5 = 60% → Strong improvement

Iteration 3 (after fixes):
  CRITICAL: 0, IMPORTANT: 2, MINOR: 2
  Total actionable gaps: 2
  Gap reduction rate: (2 - 2) / 2 = 0% → Stalled

Decision: STOP. The same 2 IMPORTANT gaps persisted across iterations.
These gaps likely represent genuine limitations in available sources,
not fixable research oversights.
```

## How Gap Fixes Are Applied

When the review loop identifies gaps, three types of fixes can be applied:

### 1. Researcher Update

The original researcher's output file is updated to address the gap. This is the most common fix type.

**When to use:** The gap is within the original researcher's scope and the fix requires adding or correcting content in their file.

**Example:** G-ACT-001 says F-ARCH-001 lacks TypeScript types. The Architecture Researcher updates `01-architecture-patterns.md` to include a concrete TypeScript enum.

### 2. Deep Expand

A new researcher is spawned to investigate a topic that falls outside all four default researchers' scopes. The deep expand produces a new file (05+).

**When to use:** The gap identifies a topic that none of the four researchers covered, and the fix requires new research (not just updating existing findings).

**Example:** G-COMP-001 says no browser compatibility analysis was done. A deep expand researcher is spawned to produce `05-browser-compatibility.md`.

### 3. Finding Removal

A finding is removed entirely from the research output. This is used when the Accuracy Reviewer identifies a hallucination or a finding that cannot be supported by any source.

**When to use:** The finding is factually wrong, cites a non-existent source, or claims a feature that does not exist.

**Example:** G-ACC-002 says F-IMPL-003 claims a library feature that does not exist. The finding is removed from `02-implementation-approaches.md` and the removal is noted in REVIEW-LOG.md.

## WebSocket Reconnection: Complete Review Loop Example

Walking through the full review loop for the running example:

### Initial Research Output

```
01-architecture-patterns.md: 5 findings (F-ARCH-001 through F-ARCH-005)
02-implementation-approaches.md: 6 findings (F-IMPL-001 through F-IMPL-006)
03-existing-solutions.md: 4 findings (F-ECO-001 through F-ECO-004)
04-pitfalls-and-risks.md: 5 findings (F-RISK-001 through F-RISK-005)
Total: 20 findings across 4 files
```

### Iteration 1

**Completeness Reviewer:** 1 CRITICAL (no browser analysis), 1 IMPORTANT (missing queue strategies)
**Accuracy Reviewer:** 1 IMPORTANT (stale download stats), 1 CRITICAL (hallucinated library feature)
**Actionability Reviewer:** 1 MINOR (missing TypeScript types), 1 IMPORTANT (no library recommendation)

Summary: 2 CRITICAL, 3 IMPORTANT, 1 MINOR. Decision: Continue.

### Fixes Applied

- F-IMPL-003 removed (hallucination: G-ACC-002)
- Deep expand: `05-browser-compatibility.md` created (G-COMP-001)
- F-ECO-001 download stats updated (G-ACC-001)
- F-ARCH-001 TypeScript enum added (G-ACT-001)
- F-ECO-001 recommendation added (G-ACT-002)

### Iteration 2

**Completeness Reviewer:** 0 CRITICAL, 1 IMPORTANT (queue strategies still sparse)
**Accuracy Reviewer:** 0 CRITICAL, 0 IMPORTANT
**Actionability Reviewer:** 0 CRITICAL, 0 IMPORTANT

Summary: 0 CRITICAL, 1 IMPORTANT, 0 MINOR.
Gap reduction rate: (5-1)/5 = 80% (strong improvement).
Decision: CONVERGED_WITH_NOTES (0 CRITICAL; 1 IMPORTANT accepted as sufficient for planning).

### Final Research Corpus

```
00-brief.md
01-architecture-patterns.md  (updated: TypeScript enum added)
02-implementation-approaches.md  (updated: F-IMPL-003 removed)
03-existing-solutions.md  (updated: fresh stats, recommendation added)
04-pitfalls-and-risks.md  (unchanged)
05-browser-compatibility.md  (new: deep expand)
REVIEW-LOG.md  (2 iterations documented)
GRADUATION-REPORT.md  (HIGH and MEDIUM findings graduated to MuninnDB)
```

Total review loop cost: 2 iterations, 3 reviewer agents per iteration = 6 reviewer invocations + 1 deep expand researcher = 7 additional agent calls beyond the initial 4 researchers.

## Configuration Reference

All review loop settings in `.planning/config.json` (camelCase keys per [Decision 9](../CANONICAL-DECISIONS.md#decision-9-config-key-casing)):

```json
{
  "research": {
    "reviewLoop": {
      "maxIterations": 3,
      "continueForImportant": true,
      "diminishingReturnsThreshold": 0.1,
      "escalateOnMaxIterations": true
    },
    "reviewerTokenBudget": 15000,
    "deepExpandTokenBudget": 20000
  }
}
```

| Setting                                       | Default | Description                                                               |
| --------------------------------------------- | ------- | ------------------------------------------------------------------------- |
| `research.reviewLoop.maxIterations`            | 3       | Hard cap on review-fix-review cycles (overridden by complexity budget)    |
| `research.reviewLoop.continueForImportant`     | true    | Whether IMPORTANT gaps trigger another iteration                          |
| `research.reviewLoop.diminishingReturnsThreshold` | 0.10 | Gap reduction rate below which the loop stops                             |
| `research.reviewLoop.escalateOnMaxIterations`  | true    | Whether to flag for human review when budget exhausted with CRITICAL gaps |
| `research.reviewerTokenBudget`                 | 15000   | Per-reviewer token budget per iteration                                   |
| `research.deepExpandTokenBudget`               | 20000   | Token budget for each deep expand researcher                              |

> **Config schema canonical source:** The full config schema definition lives in [`06-implementation-plan/config-changes.md`](../06-implementation-plan/config-changes.md). This table is a summary reference for the research-specific settings.
