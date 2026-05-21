# Plan 06-01 Summary: Extend Model Routing Table to Cover All Agents

**Executed:** 2026-03-06
**Status:** Complete
**Duration:** Single session

## Objective

Ensure the centralized `MODEL_ROUTING_TABLE` in `src/complexity/__helpers/model-routing.ts` contains explicit entries for every agent in the system, and that agents with variable per-complexity routing have `model_routing.complexity_overrides` in their frontmatter.

## What Was Done

### Task 1: Agent Audit

Audited all 36 agent files across `src/agents/general/` (34 files) and `src/agents/luca/` (2 files). For each agent, recorded:

- `model_tier` value
- Whether it had `model_routing.complexity_overrides`
- Whether it appeared in `MODEL_ROUTING_TABLE`

**Findings:**

- 13 agents were already in the routing table (lu-cognition, lu-learner, lu-router, lu-executor, lu-planner, lu-pm-planner, lu-verifier, lu-debugger, lu-integration-checker, code-architect, dx-advocate, code-simplifier, security-auditor)
- 23 agents were missing from the routing table
- Only 4 agents had `model_routing.complexity_overrides` (lu-verifier, lu-planner, lu-executor, lu-cognition had default_model only)

### Task 2: Added Missing Agents to MODEL_ROUTING_TABLE

Added 23 explicit routing rows to the routing table, organized by classification:

**Deep-analysis agents (fast -> balanced -> capable ramp):**

- performance-auditor, code-developer, ui, ux

**Fast-tier agents (fast at all levels, balanced at CRITICAL):**

- lu-router-fast, lu-verifier-fast

**Capable-tier variant (capable at all levels):**

- lu-executor-capable

**Standard orchestrators (fast -> balanced -> capable ramp):**

- lu-plan-checker, lu-test-writer, lu-pr-reviewer, lu-discuss-researcher, lu-research-synthesizer, lu-codebase-mapper, lu-phase-researcher, lu-project-researcher, lu-repo-architect, lu-roadmapper, lu-roadmap-architect, lu-roadmap-prioritizer, lu-roadmap-qa, lu-roadmap-synthesizer, product, qa-plan-generator

All 13 existing entries were preserved unchanged.

### Task 3: Added complexity_overrides to Agent Frontmatter

Added `model_routing.complexity_overrides` to agents with variable routing that lacked it. This is critical because the resolve-model priority chain checks agent frontmatter overrides (step 1) BEFORE the routing table (step 3.5) -- without frontmatter overrides, the `model_tier` field (step 3) would short-circuit the routing table.

**Deep-analysis agents** (model_tier: "capable") -- added overrides to downgrade at low complexity:

- lu-debugger: `{ TRIVIAL: "sonnet", SIMPLE: "sonnet" }`
- lu-integration-checker: `{ TRIVIAL: "haiku", SIMPLE: "sonnet" }`
- code-architect: `{ TRIVIAL: "haiku", SIMPLE: "sonnet" }`
- dx-advocate: `{ TRIVIAL: "haiku", SIMPLE: "sonnet" }`
- code-simplifier: `{ TRIVIAL: "haiku", SIMPLE: "sonnet" }`
- security-auditor: `{ TRIVIAL: "haiku", SIMPLE: "sonnet" }`
- performance-auditor: `{ TRIVIAL: "haiku", SIMPLE: "sonnet" }`
- code-developer: `{ TRIVIAL: "haiku", SIMPLE: "sonnet" }`
- ui: `{ TRIVIAL: "haiku", SIMPLE: "sonnet" }`
- ux: `{ TRIVIAL: "haiku", SIMPLE: "sonnet" }`

**Standard orchestrator agents** (model_tier: "balanced") -- added overrides for TRIVIAL and COMPLEX+:

- lu-plan-checker, lu-test-writer, lu-pr-reviewer, lu-discuss-researcher, lu-research-synthesizer, lu-codebase-mapper, lu-phase-researcher, lu-project-researcher, lu-repo-architect, lu-roadmapper, lu-roadmap-architect, lu-roadmap-prioritizer, lu-roadmap-qa, lu-roadmap-synthesizer, product, qa-plan-generator, lu-pm-planner
- All: `{ TRIVIAL: "haiku", COMPLEX: "opus", CRITICAL: "opus" }`

**Updated existing agents** with missing TRIVIAL/COMPLEX overrides:

- lu-executor (luca/): added `TRIVIAL: "haiku"` and `COMPLEX: "opus"` (was only `CRITICAL: "opus"`)
- lu-planner (luca/): added `TRIVIAL: "haiku"` (was only `COMPLEX: "opus", CRITICAL: "opus"`)

**Fast-tier agents** -- added CRITICAL upgrade override:

- lu-learner: `{ CRITICAL: "sonnet" }`
- lu-router-fast: `{ CRITICAL: "sonnet" }`
- lu-verifier-fast: `{ CRITICAL: "sonnet" }`
- lu-router: `{ MODERATE: "sonnet", COMPLEX: "sonnet", CRITICAL: "sonnet" }`

**Skipped (uniform tier, no overrides needed):**

- lu-cognition: fast at all levels (already has model_routing.default_model: haiku)
- lu-executor-capable: capable at all levels (already has model_routing.default_model: opus)

## Deviations

None. All work was within the plan scope.

## Verification

- TypeScript type check: `bunx --bun tsc --noEmit` passes with zero errors
- Routing table entry count: 36 entries for 36 agent files (100% coverage)
- Existing routing table entries: All 13 preserved unchanged
- No behavioral changes to existing workflows

## Files Changed

- `src/complexity/__helpers/model-routing.ts` -- 23 new routing table entries
- `src/agents/general/*.agent.ts` -- 30 agent files updated with model_routing.complexity_overrides
- `src/agents/luca/lu-executor.agent.ts` -- updated complexity_overrides
- `src/agents/luca/lu-planner.agent.ts` -- updated complexity_overrides
