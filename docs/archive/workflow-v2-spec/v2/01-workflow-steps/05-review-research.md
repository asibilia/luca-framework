# Step 5: Review Research

## Purpose

The Review Research step subjects the entire research corpus (initial facets + deep expansions) to independent evaluation by fresh reviewer agents operating in **cold isolation**. This is a convergence-based loop: reviewers evaluate, request revisions, researchers revise, and reviewers re-evaluate until the research meets quality thresholds or the iteration budget is exhausted.

This step is entirely NEW in v2. It exists because:

1. **Author bias**: Researchers naturally believe their own findings. A fresh reviewer with no access to the researcher's session context can catch hallucinations, missed edge cases, and overconfident claims.
2. **Contradiction detection**: With multiple facet files and deep-dives, contradictions between files can emerge. Only a cross-corpus review catches these.
3. **Quality gate**: Without this step, planning proceeds on potentially flawed research. A bad plan built on bad research wastes the entire execution budget.

## Inputs

| Input                  | Source                                                         | Description                                                     |
| ---------------------- | -------------------------------------------------------------- | --------------------------------------------------------------- |
| Initial research files | `.planning/phases/{NN}-{name}/research/01-04-*.md` from Step 2 | Broad facet research                                            |
| Deep expansion files   | `.planning/phases/{NN}-{name}/research/05+*.md` from Step 4    | Specialist deep-dives (same directory, numbered 05+)            |
| Research SUMMARY.md    | `.planning/phases/{NN}-{name}/research/SUMMARY.md`             | Synthesized findings                                            |
| CONTEXT.md             | Step 3                                                         | Locked decisions (reviewers verify research supports decisions) |
| PREMORTEM.md           | Step 3 (if exists)                                             | Risk scenarios (reviewers verify research addresses risks)      |
| Complexity             | STATE.md                                                       | Determines reviewer count and iteration budget                  |

## Process

### 5.1 Determine review configuration

**3 reviewers at all complexity levels** (Decision 13). Complexity affects model tier and iteration budget, not reviewer count. For the full convergence specification, see [`05-review-loops/convergence-criteria.md`](../05-review-loops/convergence-criteria.md). For iteration budgets, see [`05-review-loops/iteration-budgets.md`](../05-review-loops/iteration-budgets.md).

| Complexity | Reviewers | Max Iterations |
| ---------- | --------- | -------------- |
| TRIVIAL    | 3         | 1              |
| SIMPLE     | 3         | 2              |
| MODERATE   | 3         | 2              |
| COMPLEX    | 3         | 3              |
| CRITICAL   | 3         | 3              |

### 5.2 Spawn reviewer agents (cold isolation)

Reviewers operate in **cold isolation**: they receive only the research files and CONTEXT.md. They do NOT receive:

- Session context from MuninnDB (the researcher's notes, hypotheses, thought process)
- The researcher's prompts or reasoning
- Prior review feedback (each review round is independent)

This ensures the reviewer evaluates the research on its own merits, not through the lens of the researcher's intent.

The 3 canonical research reviewer agents each evaluate a different dimension (Decision 2):

| Agent                       | Focus                                                       | Gap ID Prefix |
| --------------------------- | ----------------------------------------------------------- | ------------- |
| `lu-completeness-reviewer`  | Coverage of all facets, no gaps, risk scenario coverage     | `G-COMP-`     |
| `lu-accuracy-reviewer`      | Verified sources, no hallucinations, confidence calibration | `G-ACC-`      |
| `lu-actionability-reviewer` | Implementation readiness, code examples, decision support   | `G-ACT-`      |

```python
# Spawn ALL 3 reviewers in PARALLEL (cold isolation)
RESEARCH_DIR = ".planning/phases/{NN}-websocket-reconnection/research"

Task(
  prompt="""
  <review_context>
  **Role:** Completeness reviewer
  **Isolation:** Cold (no session context, no researcher notes)
  **Research corpus:** {all files in RESEARCH_DIR}
  **Locked decisions (from CONTEXT.md):** {decisions}
  **Risk scenarios (from PREMORTEM.md):** {scenarios}
  </review_context>

  <evaluation_focus>
  Evaluate COMPLETENESS: Are all facets covered? Any gaps in coverage?
  Does research address all PREMORTEM scenarios? Any missing topics?

  For each finding, classify severity and assign a stable ID:
  - G-COMP-001: [severity: CRITICAL] Description...
  - G-COMP-002: [severity: IMPORTANT] Description...
  - G-COMP-003: [severity: MINOR] Description...
  </evaluation_focus>
  """,
  subagent_type="lu-completeness-reviewer",
  description="Review research: Completeness"
)

Task(
  prompt="""
  <review_context>
  **Role:** Accuracy reviewer
  **Isolation:** Cold (no session context, no researcher notes)
  **Research corpus:** {all files in RESEARCH_DIR}
  </review_context>

  <evaluation_focus>
  Evaluate ACCURACY: Are claims verified with authoritative sources?
  Any hallucinations? Are confidence levels honest?

  For each finding, classify severity and assign a stable ID:
  - G-ACC-001: [severity: CRITICAL] Description...
  - G-ACC-002: [severity: IMPORTANT] Description...
  </evaluation_focus>
  """,
  subagent_type="lu-accuracy-reviewer",
  description="Review research: Accuracy"
)

Task(
  prompt="""
  <review_context>
  **Role:** Actionability reviewer
  **Isolation:** Cold (no session context, no researcher notes)
  **Research corpus:** {all files in RESEARCH_DIR}
  **Locked decisions (from CONTEXT.md):** {decisions}
  </review_context>

  <evaluation_focus>
  Evaluate ACTIONABILITY: Could a developer implement from this research alone?
  Does research support the locked decisions? Are code examples provided?

  For each finding, classify severity and assign a stable ID:
  - G-ACT-001: [severity: CRITICAL] Description...
  - G-ACT-002: [severity: IMPORTANT] Description...
  </evaluation_focus>
  """,
  subagent_type="lu-actionability-reviewer",
  description="Review research: Actionability"
)
```

### 5.3 Collect review results

Each reviewer returns findings classified by severity with reviewer-prefixed gap IDs (Decision 8):

```yaml
completeness_reviewer:
  findings:
    - id: "G-COMP-001"
      severity: CRITICAL
      file: "08-state-machine.md"
      section: "State transition table"
      description: "Missing transition: CONNECTING -> RECONNECTING (what if connection attempt times out before open event?)"
      fix: "Add CONNECTING timeout and transition to RECONNECTING with backoff."
    - id: "G-COMP-002"
      severity: IMPORTANT
      file: "04-pitfalls-and-risks.md"
      section: "TLS errors"
      description: "Missing: What happens when Bun WebSocket encounters a certificate error?"
      fix: "Add close code and reconnection behavior for TLS errors."

accuracy_reviewer:
  findings:
    - id: "G-ACC-001"
      severity: IMPORTANT
      file: "03-existing-solutions.md"
      section: "Timer mocking"
      description: "Bun.sleep override claim is unverified (MEDIUM confidence)."
      fix: "Verify with Context7 or downgrade to LOW confidence."

actionability_reviewer:
  findings:
    - id: "G-ACT-001"
      severity: IMPORTANT
      file: "06-heartbeat-implementation.md"
      section: "Adaptive timeout algorithm"
      description: "EWMA formula referenced but not shown. Developer cannot implement from this."
      fix: "Add the actual EWMA formula with parameter values."
```

### 5.4 Evaluate convergence

Convergence uses the **gap-severity model** (Decision 3). For the full specification, see [`05-review-loops/convergence-criteria.md`](../05-review-loops/convergence-criteria.md).

**Stop conditions:**

- Loop continues while any CRITICAL findings exist
- Loop MAY continue for IMPORTANT findings (configurable, default: continue if iteration < max)
- Loop stops when 0 CRITICAL + 0 IMPORTANT, or max iterations reached

**Current state:**

- G-COMP-001: CRITICAL (missing state transition) -- **must fix**
- G-COMP-002, G-ACC-001, G-ACT-001: IMPORTANT -- should fix if iterations remain

**Decision: Revision required.** 1 CRITICAL finding blocks convergence.

### 5.5 Revision cycle

Collect all CRITICAL and IMPORTANT findings, then spawn **targeted researcher agents** to fix them. Per Decision 16: when findings target deep expansion files (from Step 4), the revision spawns targeted researcher agents for those specific gaps. The revision does NOT re-enter Step 4 as a whole -- it is a focused re-expansion within the Step 5 review loop.

The appropriate researcher agent type is chosen based on the gap's domain (e.g., `lu-architecture-researcher` for state machine gaps, `lu-implementation-researcher` for API detail gaps).

```python
# Fix CRITICAL: missing state transition (targets deep expansion file 08-state-machine.md)
Task(
  prompt="""
  <revision_request>
  **Gap ID:** G-COMP-001
  **Severity:** CRITICAL
  **File:** .planning/phases/{NN}-websocket-reconnection/research/08-state-machine.md
  **Section:** State transition table
  **Issue:** Missing transition: CONNECTING -> RECONNECTING (connection attempt timeout)
  **Fix required:** Add CONNECTING timeout mechanism. When connect() does not produce
  an 'open' event within N seconds, transition to RECONNECTING with backoff.

  Read the current file, apply the fix, and write the updated file.
  </revision_request>
  """,
  subagent_type="lu-architecture-researcher",
  description="Revise: State machine (G-COMP-001)"
)

# Fix IMPORTANT: missing EWMA formula (targets deep expansion file 06-heartbeat-implementation.md)
Task(
  prompt="""
  <revision_request>
  **Gap ID:** G-ACT-001
  **Severity:** IMPORTANT
  **File:** .planning/phases/{NN}-websocket-reconnection/research/06-heartbeat-implementation.md
  **Section:** Adaptive timeout algorithm
  **Issue:** EWMA formula referenced but not shown
  **Fix required:** Add the actual Exponential Weighted Moving Average formula
  with recommended alpha parameter and initial value.
  </revision_request>
  """,
  subagent_type="lu-implementation-researcher",
  description="Revise: Heartbeat (G-ACT-001)"
)
```

### 5.6 Re-review (iteration 2)

After revisions, spawn **fresh** reviewer agents (not the same instances) to re-evaluate. Fresh reviewers ensure no anchoring bias from the first review round.

The re-review focuses on:

1. Were the specific revision requests addressed?
2. Did the revisions introduce new issues?
3. Has the overall quality improved?

If converged: proceed to Step 6. If not converged and iteration budget exhausted: escalate to user.

### 5.7 Convergence achieved

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca > RESEARCH REVIEW CONVERGED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Iteration: 2 of 2
Reviewers: 3

| Gap ID     | Severity  | Status   | Resolution                          |
|------------|-----------|----------|-------------------------------------|
| G-COMP-001 | CRITICAL  | RESOLVED | CONNECTING timeout added            |
| G-COMP-002 | IMPORTANT | RESOLVED | TLS error handling added            |
| G-ACC-001  | IMPORTANT | RESOLVED | Bun.sleep claim verified (HIGH)     |
| G-ACT-001  | IMPORTANT | RESOLVED | EWMA formula added                  |

CRITICAL remaining: 0
IMPORTANT remaining: 0
Status: CONVERGED

Proceed to Graduate? [Y/n]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Review results are also written to `.planning/phases/{NN}-{name}/research/REVIEW-LOG.md` for auditability.

## Outputs

| Output                 | Location                                               | Description                                           |
| ---------------------- | ------------------------------------------------------ | ----------------------------------------------------- |
| Review log             | `.planning/phases/{NN}-{name}/research/REVIEW-LOG.md`  | Per-iteration findings, gap IDs, resolutions          |
| Revised research files | `.planning/phases/{NN}-{name}/research/*.md` (updated) | Files fixed based on revision requests                |
| Convergence record     | MuninnDB `session:research-review` (repo vault)        | Final gap counts, iteration count, convergence status |

## Agents Involved

For full agent specifications, see [`04-agent-orchestration/`](../04-agent-orchestration/).

| Agent                       | Count          | Role                                 | Isolation                     | Model Tier (MODERATE)          |
| --------------------------- | -------------- | ------------------------------------ | ----------------------------- | ------------------------------ |
| `lu-completeness-reviewer`  | 1              | Evaluate coverage and gap detection  | **Cold** (no session context) | capable (DEEP_ANALYSIS preset) |
| `lu-accuracy-reviewer`      | 1              | Evaluate accuracy and source quality | **Cold** (no session context) | capable (DEEP_ANALYSIS preset) |
| `lu-actionability-reviewer` | 1              | Evaluate implementation readiness    | **Cold** (no session context) | capable (DEEP_ANALYSIS preset) |
| `lu-{specialty}-researcher` | 1-4 (revisers) | Fix specific revision requests       | None                          | balanced (ROUTER preset)       |

## v1 Mapping

**v1 behavior**: Research was never reviewed. Whatever `lu-phase-researcher` produced was accepted and passed directly to the planner.

**v2 changes**:

- Entirely new step
- 3 specialized reviewers (`lu-completeness-reviewer`, `lu-accuracy-reviewer`, `lu-actionability-reviewer`) with cold isolation
- Gap-severity convergence model (CRITICAL/IMPORTANT/MINOR findings, not numeric scores)
- Reviewer-prefixed gap IDs (G-COMP-001, G-ACC-001, G-ACT-001) for stable tracking across iterations
- Revision requests are specific (file, section, what to fix) and target the appropriate researcher agent
- Fresh reviewers on each iteration (no anchoring bias)
- Review results persisted to REVIEW-LOG.md for auditability

## Failure Modes

| Failure                          | Cause                                                  | Mitigation                                                                                                                                             |
| -------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Reviewers disagree fundamentally | One reviewer flags CRITICAL, others find no issue      | A finding flagged CRITICAL by any single reviewer is treated as CRITICAL. Safety-first: the most cautious reviewer determines convergence.             |
| Revision creates new issues      | Fixing one section breaks consistency with another     | Fresh reviewers on re-review catch downstream breakage.                                                                                                |
| Max iterations exhausted         | Research quality cannot converge within budget         | Escalate to user: "Research review did not converge after N iterations. Remaining CRITICALs: [list]. Proceed anyway or investigate?"                   |
| Reviewer hallucinates issue      | Reviewer flags non-existent problem                    | Multiple reviewers provide cross-validation. A finding flagged by only one reviewer may be downgraded to MINOR on re-review.                          |
| TRIVIAL budget concern           | 3 reviewers on minimal research seems expensive       | At TRIVIAL, reviewers use `fast` tier and max 1 iteration, keeping cost proportional.                                                                  |

## Example

### Review cycle for WebSocket reconnection research

**Iteration 1 result:**

```yaml
convergence: false
reason: "1 CRITICAL finding remaining"
findings:
  - id: "G-COMP-001"
    severity: CRITICAL
    target: "08-state-machine.md"
    request: "Add CONNECTING timeout transition"
  - id: "G-ACT-001"
    severity: IMPORTANT
    target: "06-heartbeat-implementation.md"
    request: "Add EWMA formula"
  - id: "G-COMP-002"
    severity: IMPORTANT
    target: "04-pitfalls-and-risks.md"
    request: "Add TLS certificate error handling"
  - id: "G-ACC-001"
    severity: IMPORTANT
    target: "03-existing-solutions.md"
    request: "Verify Bun.sleep timer mocking claim"
```

**Revisions applied:**

1. `08-state-machine.md` updated with CONNECTING timeout (5s default, configurable) -- fixes G-COMP-001
2. `06-heartbeat-implementation.md` updated with EWMA formula: `timeout_n = alpha * latest_rtt + (1 - alpha) * timeout_{n-1}`, alpha = 0.2 -- fixes G-ACT-001
3. `04-pitfalls-and-risks.md` updated with TLS certificate error close codes -- fixes G-COMP-002
4. `03-existing-solutions.md`: Bun.sleep claim verified via Context7, upgraded to HIGH confidence -- fixes G-ACC-001

**Iteration 2 result:**

```yaml
convergence: true
critical_remaining: 0
important_remaining: 0
status: "CONVERGED"
```

**Handoff to Step 6**: The research corpus is now reviewer-approved and ready for graduation to MuninnDB persistent memory.
