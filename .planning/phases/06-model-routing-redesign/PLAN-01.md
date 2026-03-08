---
phase: 06
plan: 01
type: improvement
autonomous: true
wave: 1
depends_on: []
---

# Phase 06 Plan 01: Extend Model Routing Table to Cover All Agents

## Objective

Ensure the centralized `MODEL_ROUTING_TABLE` in `src/complexity/__helpers/model-routing.ts` contains explicit entries for every agent in the system, and that all agents have well-reasoned `model_routing.complexity_overrides` in their frontmatter. This establishes the complete routing foundation before skills migrate away from step-skipping.

Currently, the routing table covers 13 of 36 agents. Agents not in the table fall through to `DEFAULT_COMPLEXITY_TIERS`, which is correct but loses the nuance of per-agent tuning. After this plan, every agent will have an explicit routing row, making the system fully deterministic and auditable.

## Context

@src/complexity/**helpers/model-routing.ts
@src/complexity/**schemas/complexity.schemas.ts
@src/agents/**schemas/agent.schemas.ts
@src/agents/**helpers/resolve-model.ts

## Tasks

### 1. Audit All Agents and Classify by Routing Needs

**Type:** auto
**TDD:** false
**Depends on:** none

Read every `*.agent.ts` file in `src/agents/general/` and `src/agents/luca/`. For each agent, record:

- Current `model_tier` value
- Whether it has `model_routing.complexity_overrides`
- Whether it appears in `MODEL_ROUTING_TABLE`
- Its `purpose` category

Produce a mapping of all 36 agents to their appropriate per-complexity model tiers.

**Classification guideline:**

- Classifiers, routers, memory agents (lu-cognition, lu-learner, lu-router-fast, lu-verifier-fast): fast at all levels, possibly balanced at CRITICAL
- Standard orchestrators (lu-executor, lu-planner, lu-pm-planner, lu-router, lu-plan-checker, lu-test-writer, lu-pr-reviewer, lu-discuss-researcher, lu-research-synthesizer, lu-codebase-mapper, product, qa-plan-generator, lu-roadmap-\*): fast at TRIVIAL, balanced at SIMPLE-MODERATE, capable at COMPLEX+
- Deep-analysis agents (lu-verifier, lu-debugger, lu-integration-checker, code-architect, dx-advocate, code-simplifier, security-auditor, performance-auditor, code-developer, ui, ux): fast at TRIVIAL, balanced at SIMPLE, capable at MODERATE+

**Files to create/edit:**

- (none yet -- analysis task)

**Verification:**

- All 36 agents have been categorized
- Categories align with the agent's purpose and model_tier

### 2. Add Missing Agents to MODEL_ROUTING_TABLE

**Type:** auto
**TDD:** false
**Depends on:** 1

Add explicit routing rows to `MODEL_ROUTING_TABLE` for the ~23 agents currently missing. Keep the existing 13 entries unchanged (they were already reviewed).

**Files to create/edit:**

- `src/complexity/__helpers/model-routing.ts`

**Verification:**

- `MODEL_ROUTING_TABLE` has an entry for every agent in `src/agents/general/` and `src/agents/luca/`
- Existing entries are unchanged
- `bunx --bun tsc --noEmit` passes

### 3. Add complexity_overrides to Agent Frontmatter Where Missing

**Type:** auto
**TDD:** false
**Depends on:** 2

For agents that currently only have `model_tier` but no `model_routing.complexity_overrides`, add overrides that match their routing table row. This gives agent definitions self-contained routing info (the resolve-model priority chain checks agent frontmatter overrides first, before the routing table).

Focus on agents where the routing table assigns a different model at different complexity levels (not needed for agents that are the same tier at all levels, like lu-cognition which is always "fast").

**Files to create/edit:**

- Agent files in `src/agents/general/` and `src/agents/luca/` that need complexity_overrides added

**Verification:**

- For agents with variable routing across complexity levels, `model_routing.complexity_overrides` in frontmatter matches their `MODEL_ROUTING_TABLE` entry
- Agents with uniform routing (same tier at all levels) do not need overrides
- `bunx --bun tsc --noEmit` passes
- `bun run build:all` completes and `bun run check:drift` passes

## Verification

- All 36 agents appear in `MODEL_ROUTING_TABLE`
- Agent frontmatter `model_routing.complexity_overrides` are consistent with the routing table
- `bunx --bun tsc --noEmit` passes
- `bun run build:all` completes successfully
- `bun run check:drift` shows no drift

## Success Criteria

- Every agent in the system has a deterministic model routing path for all 5 complexity levels
- The routing table is the single source of truth for system-level defaults
- Agent frontmatter overrides are present where per-complexity variation exists
- No behavioral change to existing workflows (this is additive infrastructure)

## Output Specification

- Updated `src/complexity/__helpers/model-routing.ts` with complete routing table
- Updated agent files with `model_routing.complexity_overrides` where appropriate
