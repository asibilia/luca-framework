# Phase 230: v2 Enhanced Existing Agents — Plan

**Phase:** 230
**Wave:** 01
**Complexity:** COMPLEX
**Depends on:** Phase 229 (complete), v2 Phases 1-5 (shipped v6.0.0)

## Objective

Enhance 4 existing agents with v2 capabilities while preserving v1 backward compatibility. Each agent gets a new v2 mode that is conditionally activated based on config/flags, with v1 behavior unchanged when v2 is not enabled.

## Context

- The flat Agent() orchestrator pattern means agents are LEAF workers — they cannot spawn Agent() calls themselves
- Phase 231 will wire the v2 pipeline into lu.skill.ts; this phase only enhances agent definitions
- The 4 specialist researcher agents already exist (lu-architecture-researcher, lu-implementation-researcher, lu-ecosystem-researcher, lu-risk-researcher)
- ResearchConfigSchema already exists at `src/shared/__schemas/research-config.schemas.ts`

## Tasks

### Task 1: researcher-orchestrator — v2 Scope Mode for lu-phase-researcher

**Files:**

- `src/agents/general/lu-phase-researcher.agent.ts`

**Action:**
Add a new `v2_mode` section to the agent definition that describes an alternative execution flow when v2 is enabled. In v2 mode, instead of producing a full RESEARCH.md, the agent produces a RESEARCH-SCOPE.md that decomposes the research domain into 4 specialist areas (architecture, implementation, ecosystem, risks) with specific questions for each. The orchestrator (Phase 231) will use this scope to spawn the 4 specialists in parallel. v1 mode (default) is preserved unchanged — the existing execution_flow remains the primary path. Add a `v2_scope_output` section defining the RESEARCH-SCOPE.md format.

**Verify:**

- `bunx --bun tsc --noEmit` passes
- Agent file exports correctly
- v1 execution_flow section unchanged
- New v2_mode section present with scope output format

**Done:**

- lu-phase-researcher supports both v1 (full RESEARCH.md) and v2 (RESEARCH-SCOPE.md) modes
- RESEARCH-SCOPE.md format documented with specialist assignment sections

### Task 2: learner-graduation — research:\* Engram Promotion in lu-learner

**Files:**

- `src/agents/general/lu-learner.agent.ts`

**Action:**
Add a new `graduate_research` step between `extract_procedures` and `update_confidence` in the execution flow. This step:

1. Recalls `research:*` engrams from the repo vault
2. Scores each using the weighted formula: score = confidence _ 0.40 + actionability _ 0.35 + uniqueness \* 0.25
3. Filters by graduation.scoringThreshold and graduation.confidenceThreshold from ResearchConfigSchema
4. Promotes qualifying findings to permanent `pattern:*/pitfall:*/decision:*` in the default vault
5. Cleans up remaining `research:*` engrams via `muninn_forget` (only if graduation.autoCleanupAfterMilestone is true, or if explicitly invoked at milestone boundary)
6. Logs graduation metrics

This step only runs when invoked with `--v2` context or when research engrams exist. Otherwise, it silently skips (v1 compat).

**Verify:**

- `bunx --bun tsc --noEmit` passes
- Agent file exports correctly
- Existing extraction steps unchanged
- New graduate_research step documented with scoring formula and thresholds

**Done:**

- lu-learner can promote high-value research:\* engrams to permanent storage
- Graduation respects ResearchConfigSchema thresholds
- v1 behavior preserved (step skips when no research:\* engrams exist)

### Task 3: premortem-research — Research-Informed Risk Analysis in lu-premortem

**Files:**

- `src/agents/luca/lu-premortem.agent.ts`

**Action:**
Add a `research_integration` section between the existing `role` and `scenario_generation` sections. This section instructs the agent to:

1. Check if research files exist in the phase directory (RESEARCH.md, specialist outputs like 01-architecture-patterns.md through 04-pitfalls-and-risks.md)
2. If found, incorporate research findings as HIGH-PRIORITY inputs alongside MuninnDB recall and codebase context
3. Research-informed scenarios should reference specific findings from the research files
4. Add a new subsection to scenario output: "Research-Backed Evidence" that cites which research finding supports each scenario
5. If no research files exist, fall back to current behavior (codebase + MuninnDB only)

Update the `upstream_input` section in the role to list research files as optional inputs.

**Verify:**

- `bunx --bun tsc --noEmit` passes
- Agent file exports correctly
- Existing scenario_generation and output_tiers sections unchanged
- New research_integration section present

**Done:**

- lu-premortem incorporates research files when available
- Scenarios cite research findings as evidence
- Falls back gracefully when no research files exist (v1 compat)

### Task 4: plan-checker-review-loop — Convergence-Aware Multi-Pass Checking in lu-plan-checker

**Files:**

- `src/agents/general/lu-plan-checker.agent.ts`

**Action:**
Add a `review_loop` section after the existing `structured_returns` section. This section describes:

1. Multi-pass review support: after reporting issues, the agent can be re-invoked with the planner's revised plans
2. Convergence detection: track issue counts across iterations. If issues_found count is not decreasing between iterations, the agent should recommend escalation (either human review or abort)
3. The agent reports its iteration number and whether convergence was detected in its structured return
4. Add new fields to the structured return: `ITERATION: {N}`, `CONVERGING: {true/false}`, `RECOMMEND: {continue/escalate}`
5. The orchestrator (Phase 231) manages the loop; the agent itself is stateless between invocations but interprets iteration context passed to it

Update the structured_returns section to include the new fields. The planReviewLoop.maxIterations config controls when to stop (handled by orchestrator, but the agent documents the expected contract).

**Verify:**

- `bunx --bun tsc --noEmit` passes
- Agent file exports correctly
- Existing verification_dimensions and process unchanged
- New review_loop section with convergence detection documented
- Structured returns include iteration and convergence fields

**Done:**

- lu-plan-checker supports multi-pass review with convergence detection
- Reports iteration number and convergence status in structured returns
- Stateless between invocations (orchestrator manages the loop)

## Success Criteria

1. All 4 agent files modified with v2 enhancements
2. v1 behavior preserved in all agents (backward compatible)
3. `bunx --bun tsc --noEmit` passes
4. No changes to agent schemas or shared infrastructure (those are Phase 231 concerns)
5. Each agent's v2 mode is documented with clear input/output contracts
