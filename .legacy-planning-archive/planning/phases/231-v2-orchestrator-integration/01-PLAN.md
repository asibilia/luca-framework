# Phase 231: v2 Orchestrator Integration — Plan

**Phase:** 231
**Wave:** 01
**Complexity:** COMPLEX
**Depends on:** Phase 230 (complete), Phase 232 (complete)

## Objective

Wire the v2 research pipeline into `lu.skill.ts` with conditional Agent() calls gated on `workflow.version: "v2"`. Each v2 step is independently toggleable and fails closed. v1 behavior is preserved unchanged.

## Pre-Existing (Already Shipped)

- `src/shared/__schemas/research-config.schemas.ts` — ResearchConfigSchema with all v2 config
- `src/shared/__schemas/workflow-version.schemas.ts` — WorkflowVersionSchema ("v1"/"v2")
- `src/complexity/__schemas/complexity.schemas.ts` — researchReviewIterations, planReviewIterations fields
- 4 specialist researchers, 3 reviewers, synthesizer, graduator agents — all exist
- Phase 230 v2 enhancements — lu-phase-researcher scope mode, lu-learner graduation, lu-premortem research input, lu-plan-checker review loop

## Tasks

### Task 1: Config Extensions (todos 2 + 4)

**Files:**

- `src/shared/__schemas/lu-config.schemas.ts` — extend with workflow_version field
- `.planning/config.json` — add workflow.version and research section

**Action:**

1. In lu-config.schemas.ts, add a `workflow_version` field using WorkflowVersionSchema (import from workflow-version.schemas). Default: "v1".
2. In config.json, add `"version": "v1"` to the existing `workflow` section.
3. In config.json, add a top-level `"research"` section with ResearchConfigSchema defaults (all features enabled with sensible defaults since this is a dev tool repo).

### Task 2: v2 Prompt Templates (part of todo 3)

**Files:**

- `src/skills/__helpers/agent-prompts.ts`

**Action:**
Add 6 new prompt template functions for the v2 research pipeline:

1. `RESEARCH_SCOPE_PROMPT` — Invoke lu-phase-researcher in v2 mode to produce RESEARCH-SCOPE.md
2. `PARALLEL_RESEARCH_PROMPT` — Invoke one of the 4 specialist researchers with scope context
3. `RESEARCH_SYNTHESIS_PROMPT` — Invoke lu-research-synthesizer to merge 4 specialist outputs
4. `RESEARCH_REVIEW_PROMPT` — Invoke one of the 3 reviewers (accuracy, completeness, actionability)
5. `RESEARCH_GRADUATION_PROMPT` — Invoke lu-research-graduator to filter and promote research engrams
6. `PLAN_REVIEW_PROMPT` — Invoke lu-plan-checker with iteration context for convergence-aware review

### Task 3: v2 Pipeline Branch in lu.skill.ts (todos 3 + 5)

**Files:**

- `src/skills/luca/lu.skill.ts`

**Action:**
Insert a v2 conditional block into the Step 7 phase loop, BEFORE step 7e (Discussion). The v2 block:

1. Reads `workflow.version` from config (already loaded at Step 4)
2. If version != "v2": SKIP entire v2 block (v1 behavior preserved)
3. If version == "v2", execute these Agent() steps in order:

   **7d-v2a. Research Scope** (conditional: skip if research files already exist)

   ```
   Agent(name: "research-scope-{NN}", prompt: RESEARCH_SCOPE_PROMPT({...}))
   ```

   **7d-v2b. Parallel Research** (spawn 4 specialists in parallel)

   ```
   Agent(name: "research-arch-{NN}", prompt: PARALLEL_RESEARCH_PROMPT("architecture", {...}))
   Agent(name: "research-impl-{NN}", prompt: PARALLEL_RESEARCH_PROMPT("implementation", {...}))
   Agent(name: "research-eco-{NN}", prompt: PARALLEL_RESEARCH_PROMPT("ecosystem", {...}))
   Agent(name: "research-risk-{NN}", prompt: PARALLEL_RESEARCH_PROMPT("risks", {...}))
   ```

   **7d-v2c. Research Synthesis**

   ```
   Agent(name: "research-synth-{NN}", prompt: RESEARCH_SYNTHESIS_PROMPT({...}))
   ```

   **7d-v2d. Research Review Loop** (spawn 3 reviewers in parallel, iterate)

   ```
   FOR iteration = 1 to researchReviewIterations:
     Agent(name: "review-accuracy-{NN}", prompt: RESEARCH_REVIEW_PROMPT("accuracy", {...}))
     Agent(name: "review-completeness-{NN}", prompt: RESEARCH_REVIEW_PROMPT("completeness", {...}))
     Agent(name: "review-actionability-{NN}", prompt: RESEARCH_REVIEW_PROMPT("actionability", {...}))
     IF all PASS or no CRITICAL gaps: BREAK
     ELSE: Agent(name: "research-expand-{NN}", prompt: expand research for gaps)
   ```

   **7d-v2e. Research Graduation**

   ```
   Agent(name: "research-graduate-{NN}", prompt: RESEARCH_GRADUATION_PROMPT({...}))
   ```

4. After v2 block, continue to 7e (Discussion) — which now has research context available
5. After 7g (Planning), add v2 plan review loop:

   **7g-v2. Plan Review Loop** (conditional: v2 only)

   ```
   FOR iteration = 1 to planReviewIterations:
     Agent(name: "plan-review-{NN}", prompt: PLAN_REVIEW_PROMPT({iteration, ...}))
     IF RECOMMEND == "approve": BREAK
     IF RECOMMEND == "escalate": prompt user, BREAK
     ELSE: Agent(name: "plan-revise-{NN}", prompt: revise plan based on issues)
   ```

6. **Graceful degradation:** If any v2 step fails (agent returns failure or error), log the failure and fall through to the next step. The v1 pipeline continues regardless. Add explicit error handling:
   ```
   IF v2_step_failed:
     Log: "v2 step {name} failed: {reason}. Falling through to v1 pipeline."
     CONTINUE (do not abort phase)
   ```

## Success Criteria

1. lu.skill.ts has v2 conditional block in Step 7 with all Agent() calls
2. agent-prompts.ts has 6 new v2 prompt templates
3. config.json has workflow.version: "v1" (v2 is opt-in)
4. lu-config.schemas.ts has workflow_version field
5. `bunx --bun tsc --noEmit` passes
6. v1 behavior unchanged (v2 block is entirely gated)
7. Each v2 step has explicit fail-closed gating and graceful degradation
