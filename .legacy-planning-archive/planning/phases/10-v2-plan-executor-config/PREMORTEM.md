# Pre-Mortem Risk Brief — Phase 10

**Phase:** 10 — v2 Plan/Executor Enhancement + Config Updates
**Complexity:** COMPLEX
**Generated:** 2026-03-24

## Risk Scenarios

### 1. research_refs Parsing & Task Injection Desynchronization

**Likelihood:** MEDIUM | **Impact:** HIGH

Regex extraction of `**Research refs:**` lines differs between planner output format and executor parsing implementation, causing executor to fail silently or inject stale/missing research context.

**Mitigation:**

- Define canonical regex in a shared helper (not duplicated across planner and executor)
- Validate round-trip: planner writes refs → executor extracts refs → recall returns expected engrams
- Test with both valid and malformed research_refs lines

### 2. Per-Task Recall Timeout & Context Budget Blowout

**Likelihood:** MEDIUM | **Impact:** MEDIUM

Executor spawns `muninn_recall` per task without rate-limiting or timeout, causing per-task context to exceed 500 tokens when multiple research refs are present, forcing cascade truncation and quality degradation.

**Mitigation:**

- Cap recall to max 5 engrams per task (per config `perTaskRecall.maxEngramsPerTask`)
- Implement graceful fallback: if recall times out or returns no results, log warning and continue
- Track cumulative token spend and warn at 60% context ceiling

### 3. Plan Review Loop Severity Mismatch & Unaddressed Blocking Findings

**Likelihood:** LOW | **Impact:** HIGH

Plan review loop uses BLOCKING/ADVISORY severity distinct from research review (CRITICAL/IMPORTANT). Planner may ignore BLOCKING findings in iteration 2+, allowing unresolved architecture issues to propagate to execution.

**Mitigation:**

- After each review iteration, explicitly check for unresolved BLOCKING findings
- Block plan advancement if any BLOCKING findings remain unresolved
- Require planner to respond to each BLOCKING finding before advancing

## Plan Constraints

1. Define `research_refs` regex in a shared location, not duplicated
2. Per-task recall budget: max 5 engrams/task, graceful fallback on timeout/empty
3. Plan review loop MUST block on unresolved BLOCKING findings
4. Validate research-config schema defaults match complexity matrix iteration budgets
